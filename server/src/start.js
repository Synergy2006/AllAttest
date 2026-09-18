// Production boot (used by `npm start` on Azure App Service).
// A fresh deployment ships without data/db.json (it's gitignored),
// so seed a database on first boot, then start the API.
// SEED_MODE=prod (set on the prod App Service) seeds a clean platform
// with one root operator; anything else seeds the demo data.
import fs from "fs";
import { DB_PATH } from "./store.js";

if (!fs.existsSync(DB_PATH)) {
  if (process.env.SEED_MODE === "prod") {
    console.log("No database found — initializing clean production database...");
    await import("./seed-prod.js");
  } else {
    console.log("No database found — seeding demo data...");
    await import("./seed.js");
  }
}
await import("./index.js");
