export const env = {
  SESSION_PASSWORD: process.env.SESSION_PASSWORD ?? "",
  GOOGLE_SERVICE_ACCOUNT_JSON_PATH: process.env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH ?? "",
  GOOGLE_DELEGATED_USER: process.env.GOOGLE_DELEGATED_USER ?? "",
  DAILY_SHEETS_SPREADSHEET_ID: process.env.DAILY_SHEETS_SPREADSHEET_ID ?? "",
  EXPENSE_SHEETS_SPREADSHEET_ID: process.env.EXPENSE_SHEETS_SPREADSHEET_ID ?? "",
  DRIVE_ROOT_FOLDER_ID: process.env.DRIVE_ROOT_FOLDER_ID ?? "",
  IMAP_HOST: process.env.IMAP_HOST ?? "imap.gmail.com",
  IMAP_PORT: Number(process.env.IMAP_PORT ?? "993"),
  IMAP_USER: process.env.IMAP_USER ?? "",
  IMAP_PASSWORD: process.env.IMAP_PASSWORD ?? "",
  GOOGLE_VISION_KEY_PATH: process.env.GOOGLE_VISION_KEY_PATH ?? "",
  ENABLE_SCHEDULER: process.env.ENABLE_SCHEDULER === "true",
};

export function isSheetsEnabled() {
  return !!env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && !!env.DAILY_SHEETS_SPREADSHEET_ID;
}

export function isDriveEnabled() {
  return !!env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH && !!env.DRIVE_ROOT_FOLDER_ID;
}

export function isMailEnabled() {
  return !!env.IMAP_HOST && !!env.IMAP_USER && !!env.IMAP_PASSWORD;
}

export function isOcrEnabled() {
  return !!env.GOOGLE_VISION_KEY_PATH;
}
