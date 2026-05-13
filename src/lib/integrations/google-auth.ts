import { google } from "googleapis";
import { env } from "../env";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

let cachedJwt: InstanceType<typeof google.auth.JWT> | null = null;
let cachedFor: string | null = null;

function getJwt() {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  // Cache per JSON value so changing the secret invalidates the cache automatically.
  if (cachedJwt && cachedFor === raw) return cachedJwt;

  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(raw) as ServiceAccountKey;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 파싱 실패: 올바른 JSON 문자열이어야 합니다");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("서비스 계정 JSON에 client_email/private_key 누락");
  }

  cachedJwt = new google.auth.JWT({
    email: parsed.client_email,
    key: parsed.private_key.replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    subject: env.GOOGLE_DELEGATED_USER || undefined,
  });
  cachedFor = raw;
  return cachedJwt;
}

export function getGoogleAuth() {
  return getJwt();
}

export function getSheetsClient() {
  const auth = getJwt();
  if (!auth) return null;
  return google.sheets({ version: "v4", auth });
}

export function getDriveClient() {
  const auth = getJwt();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

export function getGmailClient() {
  const auth = getJwt();
  if (!auth) return null;
  return google.gmail({ version: "v1", auth });
}

export async function getAccessToken(): Promise<string | null> {
  const auth = getJwt();
  if (!auth) return null;
  const res = await auth.getAccessToken();
  return res.token ?? null;
}
