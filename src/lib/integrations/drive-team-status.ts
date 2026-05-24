/**
 * Drive 전체 팀 운영 현황 xlsx 동기화
 * 매일 17:00 — 최신 파일을 data/drive-team-status.xlsx 로 덮어쓰기.
 * 주간보고 생성 시 이 파일을 참조한다.
 */
import fs from "fs";
import path from "path";
import { downloadDriveFile } from "./drive";

const DEFAULT_FILE_ID = "1ad9_7mr_pWVoXk3dBIR0Ht6_PDC9QVT8"; // 전체_팀_운영_현황_260508_3.xlsx
const OUT_PATH = "data/drive-team-status.xlsx";

export interface SyncResult {
  ok: boolean;
  message: string;
  bytes?: number;
  fileName?: string;
}

export async function syncDriveTeamStatus(): Promise<SyncResult> {
  const fileId = process.env.DRIVE_TEAM_STATUS_FILE_ID || DEFAULT_FILE_ID;
  const r = await downloadDriveFile(fileId);
  if (!r.ok) return { ok: false, message: r.message };

  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_PATH, r.buf);

  return { ok: true, message: `${r.name} 저장 (${r.buf.length.toLocaleString()} bytes)`, bytes: r.buf.length, fileName: r.name };
}
