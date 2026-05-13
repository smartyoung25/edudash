// Local-only DB client used by CLI scripts (migrate / seed / reset) running via `tsx`.
// NEVER imported by Next.js routes or components — those use ./client.ts (D1).
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/app.db";
const client = createClient({ url });

export const db = drizzle(client, { schema });
export { schema };
