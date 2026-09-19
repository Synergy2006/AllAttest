// Production boot (used by `npm start` on Azure App Service).
// A fresh deployment ships without data/db.json (it's gitignored),
// so seed a database on first boot, then start the API.
// SEED_MODE=prod (set on the prod App Service) seeds a clean platform
// with one root operator; anything else seeds the demo data.
import fs from "fs";
import { DB_PATH } from "./store.js";

const prodMode = process.env.SEED_MODE === "prod";
let needsSeed = !fs.existsSync(DB_PATH);
if (!needsSeed && prodMode) {
  // Deploys retain files already on the server, so a demo/dev db.json can
  // survive into production. Never serve one: reseed unless the database
  // carries the prod marker written by seed-prod.js.
  try {
    needsSeed = JSON.parse(fs.readFileSync(DB_PATH, "utf8"))?.meta?.seedMode !== "prod";
  } catch {
    needsSeed = true;
  }
  if (needsSeed) console.log("Existing database is not a production database — reinitializing...");
}
if (needsSeed) {
  if (prodMode) {
    console.log("Initializing clean production database...");
    await import("./seed-prod.js");
  } else {
    console.log("No database found — seeding demo data...");
    await import("./seed.js");
  }
}
await import("./index.js");
