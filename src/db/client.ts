import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const url = process.env.DATABASE_URL ?? `file:${path.join(DATA_DIR, "app.db")}`;

const client = createClient({ url });

export const db = drizzle(client, { schema });
export { schema };
