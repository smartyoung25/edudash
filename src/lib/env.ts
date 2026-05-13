// In Workers (OpenNext), Cloudflare vars/secrets are copied onto process.env at
// request-time. In local node (next dev / CLI scripts), process.env comes from .env / .dev.vars.
// Getters defer reads to call-time so the right value is used in each environment.
function read(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  get SESSION_PASSWORD() { return read("SESSION_PASSWORD"); },
  get GOOGLE_SERVICE_ACCOUNT_JSON() { return read("GOOGLE_SERVICE_ACCOUNT_JSON"); },
  get GOOGLE_DELEGATED_USER() { return read("GOOGLE_DELEGATED_USER"); },
  get DAILY_SHEETS_SPREADSHEET_ID() { return read("DAILY_SHEETS_SPREADSHEET_ID"); },
  get EXPENSE_SHEETS_SPREADSHEET_ID() { return read("EXPENSE_SHEETS_SPREADSHEET_ID"); },
  get DRIVE_ROOT_FOLDER_ID() { return read("DRIVE_ROOT_FOLDER_ID"); },
  get GMAIL_USER() { return read("GMAIL_USER"); },
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
  return false;
}
