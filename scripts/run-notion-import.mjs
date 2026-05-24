// .env.local 로드 후 importTravelReceiptsFromNotion 직접 호출
import { config } from "dotenv";
config({ path: ".env.local" });

const { importTravelReceiptsFromNotion } = await import("../src/lib/integrations/notion.ts");
const r = await importTravelReceiptsFromNotion({});
console.log(JSON.stringify(r, null, 2));
