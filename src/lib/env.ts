// In Workers (OpenNext), Cloudflare vars/secrets are copied onto process.env at
// request-time. In local node (next dev / CLI scripts), process.env comes from .env / .dev.vars.
// Getters defer reads to call-time so the right value is used in each environment.
function read(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

// 서비스 계정 JSON을 환경변수 또는 파일 경로에서 읽어옴
function readServiceAccountJson(): string {
  const direct = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (direct) return direct;
  // GOOGLE_VISION_KEY_PATH 또는 GOOGLE_APPLICATION_CREDENTIALS 에 파일 경로가 있으면 읽어서 반환
  const path = process.env.GOOGLE_VISION_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && typeof window === "undefined") {
    try {
      const fs = require("fs") as typeof import("fs");
      if (fs.existsSync(path)) return fs.readFileSync(path, "utf-8");
    } catch {}
  }
  return "";
}

export const env = {
  get SESSION_PASSWORD() { return read("SESSION_PASSWORD"); },
  get GOOGLE_SERVICE_ACCOUNT_JSON() { return readServiceAccountJson(); },
  get GOOGLE_DELEGATED_USER() { return read("GOOGLE_DELEGATED_USER"); },
  get DAILY_SHEETS_SPREADSHEET_ID() { return read("DAILY_SHEETS_SPREADSHEET_ID"); },
  get EXPENSE_SHEETS_SPREADSHEET_ID() { return read("EXPENSE_SHEETS_SPREADSHEET_ID"); },
  get DRIVE_ROOT_FOLDER_ID() { return read("DRIVE_ROOT_FOLDER_ID"); },
  get GMAIL_USER() { return read("GMAIL_USER"); },
  get PROGRESS_ALERT_TO() { return read("PROGRESS_ALERT_TO", "bsy@iiam.co.kr"); },
};

export function isSheetsEnabled() {
  return !!env.GOOGLE_SERVICE_ACCOUNT_JSON && !!env.DAILY_SHEETS_SPREADSHEET_ID;
}

export function isDriveEnabled() {
  return !!env.GOOGLE_SERVICE_ACCOUNT_JSON && !!env.DRIVE_ROOT_FOLDER_ID;
}

export function isMailEnabled() {
  return !!env.GOOGLE_SERVICE_ACCOUNT_JSON && !!env.GMAIL_USER;
}

export function isOcrEnabled() {
  // 로컬: 키파일 경로 / 운영(서버리스): 서비스계정 JSON
  return !!process.env.GOOGLE_VISION_KEY_PATH || !!env.GOOGLE_SERVICE_ACCOUNT_JSON;
}
