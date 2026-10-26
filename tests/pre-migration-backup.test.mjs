import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backupBeforeMigration } from "../server/pre-migration-backup.mjs";

test("pre-migration backup includes committed WAL data, preserves source, verifies integrity and skips current or absent databases", async () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-pre-migration-")),
    file = join(folder, "fixture.sqlite");
  let db;
  try {
    db = new DatabaseSync(file);
    db.exec(
      "PRAGMA journal_mode=WAL;CREATE TABLE balances(id INTEGER PRIMARY KEY,amount INTEGER);PRAGMA user_version=10;INSERT INTO balances VALUES(1,12500);",
    );
    const snapshotPath = await backupBeforeMigration(file);
    const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
    try {
      assert.equal(
        snapshot.prepare("PRAGMA user_version").get().user_version,
        10,
      );
      assert.equal(
        snapshot.prepare("SELECT amount FROM balances WHERE id=1").get().amount,
        12500,
      );
    } finally {
      snapshot.close();
    }
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 10);
    db.exec("UPDATE balances SET amount=13000;PRAGMA user_version=14;");
    assert.equal(await backupBeforeMigration(file), null);
    assert.equal(
      await backupBeforeMigration(join(folder, "missing.sqlite")),
      null,
    );
    assert.equal(await backupBeforeMigration(":memory:"), null);
    assert.equal(readdirSync(join(folder, "backups")).length, 1);
  } finally {
    db?.close();
    const backups = join(folder, "backups");
    for (const name of readdirSync(backups))
      rmSync(join(backups, name), { force: true });
    rmdirSync(backups);
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(file + suffix, { force: true });
    rmdirSync(folder);
  }
});

test("a blocked backup directory fails before migration and leaves the source version and funds untouched", async () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-backup-blocked-")),
    file = join(folder, "fixture.sqlite");
  let db;
  try {
    db = new DatabaseSync(file);
    db.exec(
      "CREATE TABLE balances(amount INTEGER);INSERT INTO balances VALUES(99999);PRAGMA user_version=10;",
    );
    writeFileSync(join(folder, "backups"), "blocked");
    await assert.rejects(backupBeforeMigration(file));
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 10);
    assert.equal(db.prepare("SELECT amount FROM balances").get().amount, 99999);
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(file + suffix, { force: true });
    rmSync(join(folder, "backups"), { force: true });
    rmdirSync(folder);
  }
});
