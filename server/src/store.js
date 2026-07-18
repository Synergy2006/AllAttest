// Simple file-backed JSON store. Swap for Postgres/Prisma in production —
// every consumer goes through this module, so the swap is contained here.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "data", "db.json");

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error("Database not found. Run `npm run seed` first.");
  }
  cache = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  return cache;
}

function persist() {
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
}

export const db = {
  get(collection) {
    return load()[collection] ?? [];
  },
  find(collection, id) {
    return this.get(collection).find((x) => x.id === id) ?? null;
  },
  update(collection, id, patch) {
    const items = this.get(collection);
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return null;
    items[idx] = { ...items[idx], ...patch };
    persist();
    return items[idx];
  },
  insert(collection, item) {
    load();
    if (!cache[collection]) cache[collection] = [];
    cache[collection].push(item);
    persist();
    return item;
  },
  remove(collection, id) {
    load();
    const items = cache[collection] ?? [];
    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    items.splice(idx, 1);
    persist();
    return true;
  },
  replaceAll(data) {
    cache = data;
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    persist();
  },
};

export { DB_PATH };
