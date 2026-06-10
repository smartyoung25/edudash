/**
 * 로컬 디스크 경로(data/receipts/...)로만 저장된 영수증을 Google Drive 로 이전.
 * - expenses + agency_expenses 모두 대상
 * - 업로드 후 receipt_file_path 를 "drive:<fileId>" 로 갱신, mime 없으면 확장자로 보정
 * - 멱등: 이미 drive: 이면 스킵, 디스크에 파일 없으면 로그 후 스킵(원본 경로 유지)
 *
 * 운영(Turso+Drive) 대상. 실행: npx tsx scripts/migrate-local-receipts-to-drive.mjs
 */
import { config } from "dotenv";
config({ path: ".env.vercel.prod" });

import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

// vercel env pull 이 GOOGLE_SERVICE_ACCOUNT_JSON 을 깨뜨리는 문제 복원 (import-tomato7-4-5.mjs 와 동일)
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
  JSON.parse(out);
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = out;
  console.log("• GOOGLE_SERVICE_ACCOUNT_JSON 복원 완료");
}
sanitizeServiceAccount();

const { uploadDocumentToDrive } = await import("../src/lib/integrations/drive.ts");

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const monthOf = (d) => Number(String(d || "").slice(5, 7)) || null;
function mimeOf(p) {
  const e = p.toLowerCase().slice(p.lastIndexOf("."));
  if (e === ".pdf") return "application/pdf";
  if (e === ".png") return "image/png";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".bmp") return "image/bmp";
  return "application/octet-stream";
}

async function migrate({ table, rows, teamNameOf, docTypeOf }) {
  let done = 0, skipDrive = 0, gone = 0, fail = 0;
  for (const r of rows) {
    const fp = r.receipt_file_path;
    if (!fp || fp.startsWith("drive:")) { skipDrive++; continue; }
    const full = path.join(process.cwd(), fp);
    if (!fs.existsSync(full)) { gone++; console.log(`  · 디스크에 없음(스킵) [${table}#${r.id}] ${fp}`); continue; }
    try {
      const bytes = fs.readFileSync(full);
      const fileName = path.basename(fp);
      const up = await uploadDocumentToDrive({
        teamName: teamNameOf(r),
        docType: docTypeOf(r),
        month: monthOf(r.spent_date),
        fileName,
        bytes,
      });
      if (!up.ok || !up.fileId) throw new Error(up.message || "업로드 실패");
      const mime = r.receipt_mime_type || mimeOf(fp);
      await c.execute({
        sql: `UPDATE ${table} SET receipt_file_path=?, receipt_mime_type=? WHERE id=?`,
        args: [`drive:${up.fileId}`, mime, r.id],
      });
      done++;
      if (done % 20 === 0) console.log(`  ... ${table} ${done}건 완료`);
    } catch (e) {
      fail++; console.log(`  ! [${table}#${r.id}] ${e.message}`);
    }
  }
  console.log(`[${table}] 이전 ${done} / 이미drive ${skipDrive} / 파일없음 ${gone} / 실패 ${fail}`);
  return { done, fail, gone };
}

// 팀명 캐시
const teamRows = (await c.execute("select id, name from teams")).rows;
const teamName = new Map(teamRows.map((t) => [Number(t.id), t.name]));

console.log("=== expenses 로컬경로 영수증 → Drive ===");
const ex = (await c.execute(
  "select id, team_id, spent_date, receipt_file_path, receipt_mime_type from expenses where receipt_file_path like 'data/%' order by id",
)).rows;
const exRes = await migrate({
  table: "expenses",
  rows: ex,
  teamNameOf: (r) => teamName.get(Number(r.team_id)) ?? null,
  docTypeOf: () => "경비영수증",
});

console.log("\n=== agency_expenses 로컬경로 영수증 → Drive ===");
const ag = (await c.execute(
  "select id, kind, spent_date, receipt_file_path, receipt_mime_type from agency_expenses where receipt_file_path like 'data/%' order by id",
)).rows;
const agRes = await migrate({
  table: "agency_expenses",
  rows: ag,
  teamNameOf: () => "기관경비",
  docTypeOf: (r) => r.kind || "기타경비",
});

const totFail = exRes.fail + agRes.fail;
console.log(`\n총 이전 ${exRes.done + agRes.done}건 · 파일없음 ${exRes.gone + agRes.gone} · 실패 ${totFail}`);
process.exit(totFail ? 1 : 0);
