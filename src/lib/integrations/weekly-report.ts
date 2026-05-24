/**
 * 주간보고서 자동 생성 — 매주 목요일 20:00
 * fill-weekly-with-drive.py 를 spawn 하여 양식 채움 → report_history 등록 → (옵션) Drive 업로드
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, schema } from "@/db/client";
import { syncDriveTeamStatus } from "./drive-team-status";
import { uploadDocumentToDrive } from "./drive";

const execFileP = promisify(execFile);

const REPORTS_DIR = "data/reports";

function getMonday(d = new Date()): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const m = new Date(d);
  m.setDate(diff);
  return m.toISOString().slice(0, 10);
}

export interface WeeklyResult {
  ok: boolean;
  message: string;
  filePath?: string;
  weekStart?: string;
}

export async function runWeeklyStudentReport(): Promise<WeeklyResult> {
  // 1) Drive 운영현황 최신화 (안전망)
  const sync = await syncDriveTeamStatus();
  if (!sync.ok) {
    return { ok: false, message: `Drive 동기화 실패: ${sync.message}` };
  }

  // 2) Python 스크립트 실행
  const pythonPath = process.env.PYTHON_PATH || "C:/Users/IIamHub2/AppData/Local/Python/bin/python.exe";
  if (!fs.existsSync(pythonPath)) {
    return { ok: false, message: `python 실행파일 없음: ${pythonPath}` };
  }

  try {
    const { stdout } = await execFileP(pythonPath, ["scripts/fill-weekly-with-drive.py"], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      timeout: 120_000,
    });

    // 출력에서 산출 파일 경로 추출: "✓ 출력: data/2026년_..._YYYYMMDD.xlsx"
    const match = stdout.match(/✓ 출력:\s*(\S+\.xlsx)/);
    if (!match) return { ok: false, message: `python 출력 파싱 실패: ${stdout.slice(0, 200)}` };
    const generatedPath = match[1];
    if (!fs.existsSync(generatedPath)) return { ok: false, message: `생성된 파일 없음: ${generatedPath}` };

    // 3) data/reports/weekly_YYYY-MM-DD.xlsx 로 복사
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const weekStart = getMonday();
    const finalPath = path.join(REPORTS_DIR, `weekly_${weekStart}.xlsx`).replace(/\\/g, "/");
    fs.copyFileSync(generatedPath, finalPath);

    // 4) report_history 신규 row
    await db.insert(schema.reportHistory).values({
      weekStart,
      filePath: finalPath,
      generatedBy: null,
    });

    // 5) Drive 업로드 (DRIVE_ROOT_FOLDER_ID 있을 때만)
    let driveMsg = "Drive 업로드 스킵";
    if (process.env.DRIVE_ROOT_FOLDER_ID) {
      try {
        const buf = fs.readFileSync(finalPath);
        const up = await uploadDocumentToDrive({
          teamName: "주간보고",
          docType: "주간보고",
          month: new Date().getMonth() + 1,
          bytes: buf,
          fileName: path.basename(finalPath),
        });
        driveMsg = up.ok ? `Drive 업로드 OK (${up.webViewLink ?? ""})` : `Drive 업로드 실패: ${up.message}`;
      } catch (e: any) {
        driveMsg = `Drive 업로드 오류: ${e?.message || e}`;
      }
    }

    return {
      ok: true,
      message: `주간보고 생성 완료 — ${finalPath} · ${driveMsg}`,
      filePath: finalPath,
      weekStart,
    };
  } catch (err: any) {
    return { ok: false, message: `python 실행 오류: ${err?.message || err}` };
  }
}
