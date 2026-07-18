// Production boot (used by `npm start` on Azure App Service).
// A fresh deployment ships without data/db.json (it's gitignored),
// so seed a demo database on first boot, then start the API.
import fs from "fs";
import { DB_PATH } from "./store.js";

if (!fs.existsSync(DB_PATH)) {
  console.log("No database found — seeding demo data...");
  await import("./seed.js");
}
await import("./index.js");
