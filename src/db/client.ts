import { drizzle as drizzleD1, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export { schema };

type DB = DrizzleD1Database<typeof schema>;

let cached: DB | undefined;

function buildDb(): DB {
  const ctx = getCloudflareContext();
  const d1 = (ctx.env as { DB?: unknown }).DB;
  if (!d1) {
    throw new Error(
      "D1 binding 'DB' is not available. " +
      "Use `npm run preview` (opennextjs-cloudflare preview) for local development, " +
      "or set up the binding in wrangler.jsonc for deployment.",
    );
  }
  return drizzleD1(d1 as Parameters<typeof drizzleD1>[0], { schema });
}

export const db: DB = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    if (!cached) cached = buildDb();
    return Reflect.get(cached as object, prop, receiver);
  },
}) as DB;
