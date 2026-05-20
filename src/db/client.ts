import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Vercel/운영: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (libsql://...)
// 로컬 개발: DATABASE_URL=file:./data/app.db 또는 미설정 시 file:./data/app.db
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let url: string;
let authToken: string | undefined;

if (tursoUrl) {
  url = tursoUrl;
  authToken = tursoToken;
} else {
  // 로컬 SQLite 파일. Vercel(/var/task 읽기전용)에서는 도달하면 안 됨.
  const fallback = process.env.DATABASE_URL ?? "file:./data/app.db";
  url = fallback;
  if (fallback.startsWith("file:") && process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    // 디렉터리 생성은 로컬 노드 환경에서만 수행
    // (Vercel 등 serverless 에서는 절대 진입하지 않음)
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  }
}

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
export { schema };
