/**
 * 법인카드 매입내역(CSV) ↔ 영수증 자동대사
 *
 * 카드사 CSV 포맷이 회사마다 다르므로 헤더 키워드 기반 컬럼 매핑.
 * 인식 가능한 컬럼: 거래일자(필수), 가맹점명, 승인금액(필수), 카드번호, 승인번호.
 */

import { db, schema } from "@/db/client";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

export interface CsvRow {
  txDate: string;       // YYYY-MM-DD
  vendorName: string | null;
  amount: number;
  cardLast4: string | null;
  approvalNo: string | null;
  raw: Record<string, string>;
}

const HEADER_DATE = /(거래\s*일자?|이용\s*일자?|승인\s*일자?|일자|날짜|date)/i;
const HEADER_VENDOR = /(가맹점\s*명?|이용\s*가맹점|상호|매장|vendor|merchant)/i;
const HEADER_AMOUNT = /(승인\s*금액|이용\s*금액|결제\s*금액|금액|amount)/i;
const HEADER_CARD = /(카드\s*번호|카드\s*no|card\s*number)/i;
const HEADER_APPROVAL = /(승인\s*번호|approval)/i;

function parseAmount(s: string): number | null {
  if (!s) return null;
  const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
  return isFinite(n) ? Math.abs(n) : null;
}

function parseDate(s: string): string | null {
  if (!s) return null;
  // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, YYYYMMDD
  const m = s.match(/(\d{4})[.\-\/]?(\d{1,2})[.\-\/]?(\d{1,2})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractLast4(s: string): string | null {
  if (!s) return null;
  // **-**-XXXX 또는 끝 4자리
  const m = s.match(/(\d{4})\s*$/) ?? s.match(/[*x×#]+[\s-]?(\d{4})/i);
  return m ? m[1] : null;
}

/** 간단 CSV 파서 — RFC 4180 부분 지원 (쌍따옴표 안의 쉼표/개행 처리) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((v) => v.trim() !== "")) rows.push(row);
        row = [];
      } else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((v) => v.trim() !== "")) rows.push(row); }
  return rows;
}

export interface CsvParseResult {
  headers: string[];
  rows: CsvRow[];
  errors: string[];
  mapping: { date: number; vendor: number; amount: number; card: number; approval: number };
}

export function parseCardCsv(text: string): CsvParseResult {
  const raw = parseCsv(text);
  const errors: string[] = [];
  if (raw.length < 2) {
    return { headers: [], rows: [], errors: ["CSV에 데이터가 없습니다"], mapping: { date: -1, vendor: -1, amount: -1, card: -1, approval: -1 } };
  }

  // 헤더 행 탐지 — 첫 5행 중 HEADER_DATE/HEADER_AMOUNT 모두 매칭되는 행
  let headerIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const hasDate = raw[i].some((c) => HEADER_DATE.test(c));
    const hasAmount = raw[i].some((c) => HEADER_AMOUNT.test(c));
    if (hasDate && hasAmount) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    return { headers: raw[0], rows: [], errors: ["거래일자·승인금액 컬럼을 찾지 못했습니다"], mapping: { date: -1, vendor: -1, amount: -1, card: -1, approval: -1 } };
  }

  const headers = raw[headerIdx].map((h) => h.trim());
  const mapping = {
    date: headers.findIndex((h) => HEADER_DATE.test(h)),
    vendor: headers.findIndex((h) => HEADER_VENDOR.test(h)),
    amount: headers.findIndex((h) => HEADER_AMOUNT.test(h)),
    card: headers.findIndex((h) => HEADER_CARD.test(h)),
    approval: headers.findIndex((h) => HEADER_APPROVAL.test(h)),
  };

  const rows: CsvRow[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    const dateStr = mapping.date >= 0 ? r[mapping.date] : "";
    const txDate = parseDate(dateStr);
    const amountStr = mapping.amount >= 0 ? r[mapping.amount] : "";
    const amount = parseAmount(amountStr);
    if (!txDate || !amount) {
      // 합계 행/공백 행은 조용히 무시. 명백한 오류만 보고.
      if (dateStr.trim() && !txDate) errors.push(`${i + 1}행: 날짜 인식 실패 '${dateStr}'`);
      continue;
    }
    const vendorName = mapping.vendor >= 0 ? r[mapping.vendor]?.trim() || null : null;
    const cardLast4 = mapping.card >= 0 ? extractLast4(r[mapping.card] ?? "") : null;
    const approvalNo = mapping.approval >= 0 ? (r[mapping.approval]?.trim() || null) : null;
    const rawObj: Record<string, string> = {};
    headers.forEach((h, j) => { if (h) rawObj[h] = r[j] ?? ""; });
    rows.push({ txDate, vendorName, amount, cardLast4, approvalNo, raw: rawObj });
  }
  return { headers, rows, errors, mapping };
}

export interface MatchResult {
  cardStatementId: number;
  matched: "expense" | "agency_expense" | null;
  matchedId: number | null;
  confidence: number;
}

/**
 * 카드 매입 1행 → 영수증 매칭.
 * 우선순위:
 *  1. 같은 날짜 + 금액 동일 + cardLast4 일치 → 1.0
 *  2. 같은 날짜 + 금액 동일 → 0.85
 *  3. ±1일 + 금액 동일 → 0.7
 */
async function findMatchFor(stmt: { txDate: string; amount: number; cardLast4: string | null }): Promise<{
  table: "expense" | "agency_expense"; id: number; confidence: number;
} | null> {
  const dPrev = new Date(stmt.txDate); dPrev.setDate(dPrev.getDate() - 1);
  const dNext = new Date(stmt.txDate); dNext.setDate(dNext.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const dateRange = [fmt(dPrev), stmt.txDate, fmt(dNext)];

  // expenses 후보
  const expCandidates = await db.select().from(schema.expenses).where(
    and(
      eq(schema.expenses.totalAmount, stmt.amount),
      gte(schema.expenses.spentDate, dateRange[0]),
      lte(schema.expenses.spentDate, dateRange[2]),
    )
  );
  const exact = expCandidates.find((e) =>
    e.spentDate === stmt.txDate && (!stmt.cardLast4 || e.cardLast4 === stmt.cardLast4)
  );
  if (exact) return { table: "expense", id: exact.id, confidence: stmt.cardLast4 && exact.cardLast4 === stmt.cardLast4 ? 1.0 : 0.85 };

  // agency_expenses 후보
  const agCandidates = await db.select().from(schema.agencyExpenses).where(
    and(
      eq(schema.agencyExpenses.totalAmount, stmt.amount),
      gte(schema.agencyExpenses.spentDate, dateRange[0]),
      lte(schema.agencyExpenses.spentDate, dateRange[2]),
    )
  );
  const agExact = agCandidates.find((e) =>
    e.spentDate === stmt.txDate && (!stmt.cardLast4 || e.cardLast4 === stmt.cardLast4)
  );
  if (agExact) return { table: "agency_expense", id: agExact.id, confidence: stmt.cardLast4 && agExact.cardLast4 === stmt.cardLast4 ? 1.0 : 0.85 };

  // ±1일 + 같은 금액 → fuzzy
  const fuzzyExp = expCandidates[0];
  if (fuzzyExp) return { table: "expense", id: fuzzyExp.id, confidence: 0.7 };
  const fuzzyAg = agCandidates[0];
  if (fuzzyAg) return { table: "agency_expense", id: fuzzyAg.id, confidence: 0.7 };

  return null;
}

/** CSV rows → DB insert + 자동 매칭. 중복 승인번호는 건너뜀. */
export async function ingestCardCsv(rows: CsvRow[], batchId: string): Promise<{
  inserted: number; skippedDuplicate: number; matched: number; unmatched: number; errors: string[];
}> {
  const errors: string[] = [];
  let inserted = 0, skippedDuplicate = 0, matched = 0, unmatched = 0;

  for (const r of rows) {
    try {
      const insertResult = await db.insert(schema.cardStatements).values({
        txDate: r.txDate,
        vendorName: r.vendorName,
        amount: r.amount,
        cardLast4: r.cardLast4,
        approvalNo: r.approvalNo,
        rawRow: JSON.stringify(r.raw),
        uploadBatch: batchId,
      }).onConflictDoNothing().returning({ id: schema.cardStatements.id });
      if (insertResult.length === 0) { skippedDuplicate++; continue; }
      const newId = insertResult[0].id;
      inserted++;

      const match = await findMatchFor(r);
      if (match) {
        await db.update(schema.cardStatements).set({
          matchedExpenseId: match.table === "expense" ? match.id : null,
          matchedAgencyExpenseId: match.table === "agency_expense" ? match.id : null,
          matchConfidence: match.confidence,
        }).where(eq(schema.cardStatements.id, newId));
        matched++;
      } else {
        unmatched++;
      }
    } catch (e: any) {
      errors.push(`${r.txDate} ${r.amount}: ${e?.message ?? String(e)}`);
    }
  }
  return { inserted, skippedDuplicate, matched, unmatched, errors };
}

/** 대사 현황 요약 — 화면 3분할용 */
export async function reconcileSummary() {
  const allStmts = await db.select().from(schema.cardStatements);
  const matchedStmts = allStmts.filter((s) => s.matchedExpenseId || s.matchedAgencyExpenseId);
  const unmatchedStmts = allStmts.filter((s) => !s.matchedExpenseId && !s.matchedAgencyExpenseId);

  // 영수증만 있고 카드 매입에는 없는 케이스 (현금/계좌이체 가능성)
  const matchedExpenseIds = new Set(matchedStmts.map((s) => s.matchedExpenseId).filter(Boolean) as number[]);
  const matchedAgencyIds = new Set(matchedStmts.map((s) => s.matchedAgencyExpenseId).filter(Boolean) as number[]);

  // 법인카드 결제 영수증 중 매칭 안 된 것
  const cardExpenses = await db.select().from(schema.expenses).where(
    or(
      eq(schema.expenses.cardType, "기업카드"),
      eq(schema.expenses.cardType, "기업법인카드"),
      eq(schema.expenses.cardType, "NH법인카드"),
    )!
  );
  const orphanExpenses = cardExpenses.filter((e) => !matchedExpenseIds.has(e.id));

  const cardAgency = await db.select().from(schema.agencyExpenses).where(
    or(
      eq(schema.agencyExpenses.cardType, "기업카드"),
      eq(schema.agencyExpenses.cardType, "기업법인카드"),
      eq(schema.agencyExpenses.cardType, "NH법인카드"),
    )!
  );
  const orphanAgency = cardAgency.filter((e) => !matchedAgencyIds.has(e.id));

  return {
    matched: matchedStmts,
    cardOnly: unmatchedStmts,           // 카드 매입은 있는데 영수증 없음
    receiptOnly: { expenses: orphanExpenses, agency: orphanAgency },  // 영수증은 있는데 카드 매입 없음
    totals: {
      matched: matchedStmts.length,
      cardOnly: unmatchedStmts.length,
      receiptOnly: orphanExpenses.length + orphanAgency.length,
    },
  };
}
