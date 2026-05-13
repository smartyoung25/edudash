import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "app.db");
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log("✓ Removed", dbPath);
} else {
  console.log("DB not present, nothing to remove");
}
process.exit(0);
