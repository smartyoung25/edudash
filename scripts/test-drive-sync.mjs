import { config } from "dotenv";
config({ path: ".env.local" });
const { syncDriveTeamStatus } = await import("../src/lib/integrations/drive-team-status.ts");
const r = await syncDriveTeamStatus();
console.log(JSON.stringify(r, null, 2));
