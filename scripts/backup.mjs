import "dotenv/config";
import { backup, DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
const directory = "data/backups";
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(process.env.DATABASE_PATH || "data/hiewly.sqlite", {
  readOnly: true,
});
const target = `${directory}/hiewly-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
await backup(db, target);
db.close();
console.log(`Backup written: ${target}`);
