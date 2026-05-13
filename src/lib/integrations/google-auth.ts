import fs from "fs";
import { google } from "googleapis";
import { env } from "../env";

export function getGoogleAuth() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH) return null;
  if (!fs.existsSync(env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH)) {
    throw new Error(`서비스 계정 JSON 파일을 찾을 수 없습니다: ${env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH}`);
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
    clientOptions: env.GOOGLE_DELEGATED_USER ? { subject: env.GOOGLE_DELEGATED_USER } : undefined,
  });
  return auth;
}

export function getSheetsClient() {
  const auth = getGoogleAuth();
  if (!auth) return null;
  return google.sheets({ version: "v4", auth });
}

export function getDriveClient() {
  const auth = getGoogleAuth();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}
