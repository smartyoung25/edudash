import type { Config } from "drizzle-kit";

// Generates SQLite-compatible SQL in ./drizzle suitable for BOTH
//   - local libsql (next dev)              → `npm run db:migrate`
//   - Cloudflare D1 (production / preview) → `wrangler d1 migrations apply DB`
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./data/app.db",
  },
} satisfies Config;
