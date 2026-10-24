import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { verifyAudit } from "../server/db.mjs";

if (!process.argv[2])
  throw new Error("Usage: node scripts/verify-db-snapshot.mjs <database>");
const db = new DatabaseSync(process.argv[2], { readOnly: true });
try {
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok")
    throw new Error("SQLite integrity check failed");
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("SQLite foreign key check failed");
  const audit = verifyAudit(db);
  if (!audit.valid) throw new Error("Audit chain check failed");
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  const hashes = {};
  for (const { name } of tables) {
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    const rows = db.prepare(`SELECT * FROM ${quoted}`).all();
    // Sort row digests so this manifest survives changes in physical row order.
    const digests = rows
      .map((row) =>
        createHash("sha256")
          .update(
            JSON.stringify(row, (_, value) =>
              typeof value === "bigint" ? value.toString() : value,
            ),
          )
          .digest("hex"),
      )
      .sort();
    hashes[name] = {
      count: rows.length,
      sha256: createHash("sha256").update(digests.join("\n")).digest("hex"),
    };
  }
  // Contains only aggregate counts and hashes, no customer records or secrets.
  console.log(
    JSON.stringify({ integrity: "ok", audit, tables: hashes }, null, 2),
  );
} finally {
  db.close();
}
