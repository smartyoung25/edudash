/**
 * Notion 출장비 품의서 → 첨부 영수증 자동 수집 + OCR
 * 환경변수:
 *   NOTION_TOKEN          — Internal Integration Secret (secret_xxx)
 *   NOTION_TRAVEL_DB_ID   — 출장비 품의서 데이터베이스 ID
 *                           예: 1b595c65-f6f9-81c8-9676-fa372b7ab2d1
 */

import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import { ocrReceipt, isTaxiReceipt, isRideHailVendor } from "./ocr";
import fs from "fs";
import path from "path";

const RECEIPTS_DIR = "data/receipts";
const NOTION_VERSION = "2022-06-28";

export function isNotionEnabled(): boolean {
  return !!(process.env.NOTION_TOKEN && process.env.NOTION_TRAVEL_DB_ID);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, any>;
  last_edited_time: string;
}

async function queryDatabase(dbId: string, since?: string, tripDateOnOrAfter?: string): Promise<NotionPage[]> {
  const url = `https://api.notion.com/v1/databases/${dbId}/query`;
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    if (tripDateOnOrAfter) {
      // 출장일자 2026-03 이후 + 페이지 이름에 "성장농" 포함된 건만 (성장농 사업 한정)
      body.filter = {
        and: [
          { property: "출장일자", date: { on_or_after: tripDateOnOrAfter } },
          { property: "이름", title: { contains: "성장농" } },
        ],
      };
    } else if (since) {
      body.filter = {
        timestamp: "last_edited_time",
        last_edited_time: { on_or_after: since },
      };
    }
    const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Notion query ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    pages.push(...(data.results as NotionPage[]));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return pages;
}

interface NotionFile {
  name: string;
  url: string; // 임시 서명된 다운로드 URL (1시간 유효)
}

async function listBlockChildren(blockId: string): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Notion blocks ${res.status}`);
    const data: any = await res.json();
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function collectAttachments(pageId: string): Promise<NotionFile[]> {
  const files: NotionFile[] = [];
  const walk = async (blockId: string) => {
    const blocks = await listBlockChildren(blockId);
    for (const b of blocks) {
      if ((b.type === "file" || b.type === "image" || b.type === "pdf") && b[b.type]) {
        const obj = b[b.type];
        const url: string | undefined = obj?.file?.url ?? obj?.external?.url;
        if (!url) continue;
        const name = obj?.name || obj?.caption?.[0]?.plain_text || url.split("?")[0].split("/").pop() || `${b.id}.bin`;
        files.push({ name, url });
      }
      if (b.has_children) await walk(b.id);
    }
  };
  await walk(pageId);
  return files;
}

function pickExt(name: string): string {
  const m = name.toLowerCase().match(/\.(pdf|png|jpe?g|bmp)$/);
  return m ? `.${m[1]}` : ".bin";
}

function guessMime(name: string): string {
  const lo = name.toLowerCase();
  if (lo.endsWith(".pdf")) return "application/pdf";
  if (lo.endsWith(".png")) return "image/png";
  if (lo.endsWith(".jpg") || lo.endsWith(".jpeg")) return "image/jpeg";
  if (lo.endsWith(".bmp")) return "image/bmp";
  return "application/octet-stream";
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function propTitle(p: any): string | null {
  const arr = p?.title ?? p?.rich_text ?? [];
  return arr.map((t: any) => t.plain_text).join("") || null;
}
function propDate(p: any): string | null {
  return p?.date?.start ?? null;
}
function propText(p: any): string | null {
  const arr = p?.rich_text ?? [];
  return arr.map((t: any) => t.plain_text).join("") || null;
}

export interface NotionImportSummary {
  ok: boolean;
  message: string;
  pagesScanned: number;
  attachmentsProcessed: number;
  expensesCreated: number;
  skippedDuplicate: number;
  errors: string[];
}

/** 노션 출장비 품의서 → agency_expenses(출장비) 자동 등록 */
/** 성장농 사업 기준 출장일자 floor (이 이전 건은 import 대상에서 제외) */
const TRAVEL_DATE_FLOOR = "2026-03-01";

export async function importTravelReceiptsFromNotion(opts?: { since?: string; tripDateOnOrAfter?: string }): Promise<NotionImportSummary> {
  const summary: NotionImportSummary = {
    ok: false, message: "", pagesScanned: 0, attachmentsProcessed: 0,
    expensesCreated: 0, skippedDuplicate: 0, errors: [],
  };
  if (!isNotionEnabled()) {
    summary.message = "NOTION_TOKEN 또는 NOTION_TRAVEL_DB_ID 미설정";
    return summary;
  }
  const dbId = process.env.NOTION_TRAVEL_DB_ID!;
  const tripFloor = opts?.tripDateOnOrAfter ?? TRAVEL_DATE_FLOOR;
  try {
    const pages = await queryDatabase(dbId, opts?.since, tripFloor);
    summary.pagesScanned = pages.length;

    for (const page of pages) {
      try {
        const tripName = propTitle(page.properties["이름"]) || propTitle(page.properties["제목"]) || page.id;
        const tripDate = propDate(page.properties["출장일자"]) || propDate(page.properties["기안일자"]) || null;
        const drafter = propText(page.properties["기안자"]) || null;

        const attachments = await collectAttachments(page.id);
        for (const att of attachments) {
          summary.attachmentsProcessed++;
          try {
            // dedup: same Notion page + filename (사용자 화면 비노출 — dedup_key 컬럼 사용)
            const dedupKey = `notion:${page.id}:${att.name}`;
            const dup = await db.select({ id: schema.agencyExpenses.id })
              .from(schema.agencyExpenses)
              .where(eq(schema.agencyExpenses.dedupKey, dedupKey))
              .limit(1);
            if (dup.length) { summary.skippedDuplicate++; continue; }

            const buf = Buffer.from(await (await fetch(att.url)).arrayBuffer());
            const ocr = await ocrReceipt(buf, guessMime(att.name));

            const subDir = "agency-travel";
            ensureDir(path.join(RECEIPTS_DIR, subDir));
            const safeId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const relPath = path.join(RECEIPTS_DIR, subDir, `${safeId}${pickExt(att.name)}`);
            fs.writeFileSync(relPath, buf);

            // 택시 판정 (택시 영수증 + 호출택시 가맹점)
            const taxi = isTaxiReceipt(ocr.rawText) || isRideHailVendor(ocr.vendorName);
            // OCR 결과 검증 — 카드번호 등을 날짜·금액으로 오인식한 경우 노션 페이지값으로 fallback
            const validDate = (d: string | null): boolean => {
              if (!d) return false;
              const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              if (!m) return false;
              const y = +m[1], mo = +m[2], dd = +m[3];
              return y >= 2024 && y <= 2030 && mo >= 1 && mo <= 12 && dd >= 1 && dd <= 31;
            };
            const ocrDate = validDate(ocr.spentDate) ? ocr.spentDate : null;
            // OCR 카드번호/사업자번호를 금액으로 오인식하는 케이스 차단.
            // 출장비 단일 영수증은 사실상 1천만원 미만. 그 이상이면 OCR 오류로 간주.
            const AMT_CAP = 10_000_000;
            const rawTotal = ocr.totalAmount ?? 0;
            const total = rawTotal > 0 && rawTotal < AMT_CAP ? rawTotal : 0;
            // 택시: 요금 전액 = 공급가, 부가세 0
            const supply = taxi
              ? total
              : (ocr.supplyAmount && ocr.supplyAmount < AMT_CAP ? ocr.supplyAmount : Math.round(total / 1.1));
            const vat = taxi
              ? 0
              : (ocr.vatAmount && ocr.vatAmount < AMT_CAP ? ocr.vatAmount : (total - supply));

            await db.insert(schema.agencyExpenses).values({
              kind: "출장비",
              tripName,
              spentDate: ocrDate || tripDate || new Date().toISOString().slice(0, 10),
              supplyAmount: supply,
              vatAmount: vat,
              totalAmount: total,
              vendorType: ocr.vendorType,
              vendorBizNo: ocr.vendorBizNo,
              vendorName: ocr.vendorName,
              vendorCeo: ocr.vendorCeo,
              cardType: ocr.cardType,
              cardLast4: ocr.cardLast4,
              payerName: drafter,
              memo: null,
              dedupKey,
              receiptFilePath: relPath.replace(/\\/g, "/"),
              receiptMimeType: guessMime(att.name),
            });
            summary.expensesCreated++;
          } catch (e: any) {
            summary.errors.push(`${page.id}/${att.name}: ${e?.message || e}`);
          }
        }
      } catch (e: any) {
        summary.errors.push(`page ${page.id}: ${e?.message || e}`);
      }
    }
    summary.ok = true;
    summary.message = `노션 페이지 ${summary.pagesScanned}건, 첨부 ${summary.attachmentsProcessed}건 처리, 신규 출장비 ${summary.expensesCreated}건 (중복 ${summary.skippedDuplicate}건)`;
    return summary;
  } catch (err: any) {
    summary.message = err?.message || "Notion 오류";
    return summary;
  }
}
