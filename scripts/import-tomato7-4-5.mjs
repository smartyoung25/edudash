/**
 * 토마토 7기(team 31) 4·5월 수당청구서 + 경비영수증 → 팀별정산(expenses) 반영
 * + 출석부 PDF 2건 → documents(출석부) 등록
 *
 * - 자료: HWP 내장 영수증 5건(JPG) + 수당청구서 페이지분리 6건(PDF) + 출석부 2건(PDF)
 *   (ASSETS_DIR 에 ASCII 파일명으로 사전 준비됨)
 * - 영수증/문서 파일은 Google Drive 업로드 후
 *     expenses.receipt_file_path = `drive:<fileId>` (운영 화면 호환)
 *     documents.file_path        = webViewLink
 * - 금액은 OCR 대신 사람이 판독한 검증값을 고정 입력(OCR 금액 오인식 방지)
 * - 재실행 안전: expenses 는 (team_id, spent_date, category, total_amount, vendor_name),
 *   documents 는 (team_id, file_name) 으로 중복 스킵
 *
 * 실행: npx tsx scripts/import-tomato7-4-5.mjs
 * (운영 DB/Drive 자격증명은 .env.vercel.prod 에서 로드)
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

// `vercel env pull` 은 GOOGLE_SERVICE_ACCOUNT_JSON 의 모든 줄바꿈을 리터럴 \n 으로,
// 내부 따옴표는 이스케이프 없이 기록해 dotenv 가 값을 잘라먹는다.
// 문자열 상태머신으로 구조적 \n 만 공백으로 바꿔 유효 JSON 으로 복원한다.
function sanitizeServiceAccount() {
  const cur = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  try { JSON.parse(cur); return; } catch {}
  const envText = fs.readFileSync(".env.vercel.prod", "utf-8");
  const m = envText.match(/^GOOGLE_SERVICE_ACCOUNT_JSON=(.*)$/m);
  if (!m) throw new Error(".env.vercel.prod 에서 GOOGLE_SERVICE_ACCOUNT_JSON 라인을 찾지 못함");
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  let out = "", inStr = false;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (ch === "\\" && v[i + 1] === "n") { out += inStr ? "\\n" : "\n"; i++; continue; }
    out += ch;
  }
  JSON.parse(out); // 검증 (실패 시 throw)
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = out;
  console.log("• GOOGLE_SERVICE_ACCOUNT_JSON 복원 완료");
}
sanitizeServiceAccount();

const { uploadDocumentToDrive } = await import("../src/lib/integrations/drive.ts");

const TEAM_ID = 31;
const TEAM_NAME = "토마토7기";
const ASSETS_DIR = "C:/Users/IIamHub2/AppData/Local/Temp/t7import/assets2";

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const monthOf = (d) => Number(d.slice(5, 7)) || null;

// ── 11건 경비(팀별정산) ────────────────────────────────────────────────
// 수당청구서(강사비/퍼실리테이터비용): 면세 → supply=total, vat=0
// 식대/다과 영수증: 판독한 공급가/부가세 고정
const EXPENSES = [
  // 4월 수당 (사용일 2026-04-23 → 4회차)
  { file: "a4_1.pdf", mime: "application/pdf", category: "강사비",            spentDate: "2026-04-23", sessionNo: 4, supply: 2100000, vat: 0, vendorName: "정규환", memo: "수당지급확인서 · 써브스트라투스" },
  { file: "a4_2.pdf", mime: "application/pdf", category: "강사비",            spentDate: "2026-04-23", sessionNo: 4, supply: 300000,  vat: 0, vendorName: "문성욱", memo: "수당지급확인서 · 더하우스 딸기앤토마토" },
  { file: "a4_3.pdf", mime: "application/pdf", category: "퍼실리테이터비용",  spentDate: "2026-04-23", sessionNo: 4, supply: 400000,  vat: 0, vendorName: "문유빈", memo: "퍼실리테이터 수당지급확인서 · 더하우스" },
  // 5월 수당 (사용일 2026-05-21 → 6회차)
  { file: "a5_1.pdf", mime: "application/pdf", category: "강사비",            spentDate: "2026-05-21", sessionNo: 6, supply: 2100000, vat: 0, vendorName: "정규환", memo: "수당지급확인서 · 써브스트라투스" },
  { file: "a5_2.pdf", mime: "application/pdf", category: "강사비",            spentDate: "2026-05-21", sessionNo: 6, supply: 300000,  vat: 0, vendorName: "문성욱", memo: "수당지급확인서 · 더하우스 딸기앤토마토" },
  { file: "a5_3.pdf", mime: "application/pdf", category: "퍼실리테이터비용",  spentDate: "2026-05-21", sessionNo: 6, supply: 400000,  vat: 0, vendorName: "문유빈", memo: "퍼실리테이터 수당지급확인서 · 더하우스" },
  // 식대/다과 영수증
  { file: "r07.jpg", mime: "image/jpeg", category: "식대", spentDate: "2026-04-08", sessionNo: 3, supply: 112728, vat: 11272, vendorName: "김제용지순대국밥",            vendorType: "개인사업자", vendorBizNo: "152-03-03143", vendorCeo: "이금주", cardType: "기업카드", memo: "3회차 식대 (IBK비씨카드)" },
  { file: "r08.jpg", mime: "image/jpeg", category: "다과", spentDate: "2026-04-07", sessionNo: 3, supply: 92419,  vat: 9241,  vendorName: "유한회사 슈퍼와",              vendorType: "법인사업자", vendorBizNo: "859-86-00359", vendorCeo: "강사태", cardType: "기업카드", memo: "다과 (신한카드)" },
  { file: "r09.jpg", mime: "image/jpeg", category: "식대", spentDate: "2026-05-07", sessionNo: 5, supply: 110910, vat: 11090, vendorName: "김제용지순대국밥",            vendorType: "개인사업자", vendorBizNo: "152-03-03143", vendorCeo: "이금주", cardType: "기업카드", memo: "식대 (IBK비씨카드)" },
  { file: "r10.jpg", mime: "image/jpeg", category: "다과", spentDate: "2026-05-07", sessionNo: 5, supply: 24546,  vat: 2454,  vendorName: "공덕뉵카페",                    vendorType: "개인사업자", vendorBizNo: "251-47-00485", vendorCeo: "문성주", cardType: "기업카드", memo: "다과 (IBK비씨카드)" },
  { file: "r11.jpg", mime: "image/jpeg", category: "식대", spentDate: "2026-05-21", sessionNo: 6, supply: 93637,  vat: 9363,  vendorName: "가마솥순대국밥(김제지평선산단점)", vendorType: "개인사업자", vendorBizNo: "258-12-02541", vendorCeo: "김지혜", cardType: "기업카드", memo: "식대 (IBK비씨카드)" },
];

// ── 출석부 2건(documents) ─────────────────────────────────────────────
const DOCS = [
  { file: "att4.pdf", month: 4, fileName: "출석부_토마토7기_4월_20260408-0423.pdf" },
  { file: "att5.pdf", month: 5, fileName: "출석부_토마토7기_5월_20260507-0521.pdf" },
];

function driveName(rec) {
  // 보기 좋은 한글 파일명
  if (rec.file.startsWith("a")) {
    const who = rec.vendorName;
    const kind = rec.category === "퍼실리테이터비용" ? "퍼실수당" : "강사수당";
    return `${kind}_${who}_${rec.spentDate}.pdf`;
  }
  return `${rec.category}_${rec.vendorName}_${rec.spentDate}.jpg`.replace(/[\\/:*?"<>|]/g, "");
}

let created = 0, skipped = 0;
const errors = [];

console.log(`\n=== 토마토7기(team ${TEAM_ID}) 4·5월 경비 ${EXPENSES.length}건 등록 ===`);
for (const r of EXPENSES) {
  const total = r.supply + r.vat;
  try {
    // dedup
    const dup = await c.execute({
      sql: "SELECT id FROM expenses WHERE team_id=? AND spent_date=? AND category=? AND total_amount=? AND vendor_name=? LIMIT 1",
      args: [TEAM_ID, r.spentDate, r.category, total, r.vendorName],
    });
    if (dup.rows.length) { console.log(`✓ 이미 등록됨: ${r.spentDate} ${r.category} ${r.vendorName} ${total.toLocaleString()}원`); skipped++; continue; }

    const bytes = fs.readFileSync(path.join(ASSETS_DIR, r.file));
    const up = await uploadDocumentToDrive({
      teamName: TEAM_NAME, docType: "경비영수증", month: monthOf(r.spentDate),
      fileName: driveName(r), bytes,
    });
    if (!up.ok || !up.fileId) throw new Error(`Drive 업로드 실패: ${up.message}`);

    await c.execute({
      sql: `INSERT INTO expenses
        (team_id, session_no, spent_date, category, supply_amount, vat_amount, total_amount,
         vendor_type, vendor_biz_no, vendor_name, vendor_ceo, card_type, card_last4, payer_name,
         memo, doc_type, source, receipt_file_path, receipt_mime_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        TEAM_ID, r.sessionNo, r.spentDate, r.category, r.supply, r.vat, total,
        r.vendorType ?? null, r.vendorBizNo ?? null, r.vendorName, r.vendorCeo ?? null,
        r.cardType ?? null, null, null,
        r.memo ?? null, "영수증", "manual", `drive:${up.fileId}`, r.mime,
      ],
    });
    console.log(`+ ${r.spentDate} / ${r.sessionNo}회차 / ${r.category} / ${r.vendorName} / ${total.toLocaleString()}원`);
    created++;
  } catch (e) {
    errors.push(`${r.file}: ${e.message}`);
    console.log(`! ${r.file}: ${e.message}`);
  }
}

console.log(`\n=== 출석부 ${DOCS.length}건 문서 등록 ===`);
let docCreated = 0, docSkipped = 0;
for (const d of DOCS) {
  try {
    const dup = await c.execute({
      sql: "SELECT id FROM documents WHERE team_id=? AND file_name=? LIMIT 1",
      args: [TEAM_ID, d.fileName],
    });
    if (dup.rows.length) { console.log(`✓ 이미 등록됨: ${d.fileName}`); docSkipped++; continue; }

    const bytes = fs.readFileSync(path.join(ASSETS_DIR, d.file));
    const up = await uploadDocumentToDrive({
      teamName: TEAM_NAME, docType: "출석부", month: d.month, fileName: d.fileName, bytes,
    });
    if (!up.ok || !up.fileId) throw new Error(`Drive 업로드 실패: ${up.message}`);

    await c.execute({
      sql: `INSERT INTO documents (team_id, doc_type, month, file_name, file_path, source, status)
            VALUES (?,?,?,?,?,?,?)`,
      args: [TEAM_ID, "출석부", d.month, d.fileName, up.webViewLink ?? up.fileId, "manual", "submitted"],
    });
    console.log(`+ 출석부 ${d.month}월 / ${d.fileName}`);
    docCreated++;
  } catch (e) {
    errors.push(`${d.file}: ${e.message}`);
    console.log(`! ${d.file}: ${e.message}`);
  }
}

console.log(`\n경비 신규 ${created} / 스킵 ${skipped} · 출석부 신규 ${docCreated} / 스킵 ${docSkipped} · 오류 ${errors.length}`);
if (errors.length) errors.forEach((e) => console.log(" -", e));
process.exit(errors.length ? 1 : 0);
