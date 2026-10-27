import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  openDb,
  id,
  now,
  wallet,
  verifyAudit,
  transaction,
} from "../server/db.mjs";
import { addUser, addProduct, orderInput, fixture } from "./helpers.mjs";
import { createOrder, quote } from "../server/commerce.mjs";
import { backupBeforeMigration } from "../server/pre-migration-backup.mjs";
import { retireDemoCatalog } from "../server/retire-demo-catalog.mjs";

function demo(db, name = "กระเป๋าสะพาย Everyday mini", asset = "bag") {
  const p = addProduct(db);
  db.prepare("UPDATE products SET name=?,image=? WHERE id=?").run(
    name,
    `/assets/${asset}.svg`,
    p.id,
  );
  return { ...p, name };
}

test("v17 removes all eight seed listings, preserves referenced orders, real uploads, consignors, money and a verified pre-cleanup backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "iya-demo-retirement-"));
  const file = join(dir, "fixture.sqlite");
  let db;
  try {
    db = openDb(file);
    const originals = [
      demo(db),
      demo(db, "รองเท้า Retro everyday", "shoe"),
      demo(db, "แก้วเก็บอุณหภูมิ Daily tumbler", "cup"),
      demo(db, "หูฟังไร้สาย Pocket sound", "headphone"),
      demo(db, "กล้องดิจิทัล Weekend snap", "camera"),
      demo(db, "หมวกแก๊ป Little getaway", "cap"),
      demo(db, "กระเป๋าผ้า Soft carry", "tote"),
      demo(db, "น้ำหอม Sunday mood", "perfume"),
    ];
    const buyer = addUser(db),
      seller = addUser(db);
    const real = demo(db),
      consigned = demo(db),
      mixed = demo(db),
      renamed = addProduct(db);
    db.prepare("UPDATE products SET image=? WHERE id=?").run(
      "/api/media/" + id(),
      real.id,
    );
    db.prepare("UPDATE products SET consignor_id=? WHERE id=?").run(
      seller.id,
      consigned.id,
    );
    db.prepare("UPDATE products SET images=? WHERE id=?").run(
      JSON.stringify(["/assets/bag.svg", "/api/media/" + id()]),
      mixed.id,
    );
    wallet(db, buyer.id, 50000, "fixture", id());
    const input = orderInput(originals[0]);
    input.expectedQuote = quote(db, buyer.id, input).fingerprint;
    const order = createOrder(db, buyer.id, input, id());
    const balances = db
      .prepare("SELECT id,balance FROM users ORDER BY id")
      .all();
    const ledger = db.prepare("SELECT * FROM ledger ORDER BY rowid").all();
    const items = db
      .prepare("SELECT * FROM order_items WHERE order_id=?")
      .all(order.id);
    db.exec("PRAGMA user_version=16");
    db.close();
    db = null;
    const snapshot = await backupBeforeMigration(file);
    assert.match(snapshot, /before-schema-16-to-17/);
    const before = new DatabaseSync(snapshot, { readOnly: true });
    assert.equal(before.prepare("SELECT COUNT(*) n FROM products").get().n, 12);
    assert.equal(before.prepare("PRAGMA quick_check").get().quick_check, "ok");
    before.close();
    db = openDb(file);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 17);
    assert.equal(
      db.prepare("SELECT active FROM products WHERE id=?").get(originals[0].id)
        .active,
      0,
    );
    for (const p of originals.slice(1))
      assert.equal(
        db.prepare("SELECT id FROM products WHERE id=?").get(p.id),
        undefined,
      );
    for (const p of [real, consigned, mixed, renamed])
      assert.equal(
        db.prepare("SELECT active FROM products WHERE id=?").get(p.id).active,
        1,
      );
    assert.deepEqual(
      db.prepare("SELECT id,balance FROM users ORDER BY id").all(),
      balances,
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM ledger ORDER BY rowid").all(),
      ledger,
    );
    assert.deepEqual(
      db.prepare("SELECT * FROM order_items WHERE order_id=?").all(order.id),
      items,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(verifyAudit(db).valid, true);
    const log = db
      .prepare(
        "SELECT details FROM audit WHERE action='catalog.demo_retired' ORDER BY id DESC LIMIT 1",
      )
      .get();
    assert.equal(JSON.parse(log.details).deleted.length, 7);
    assert.deepEqual(JSON.parse(log.details).archived, [originals[0].id]);
    const count = db.prepare("SELECT COUNT(*) n FROM audit").get().n;
    db.close();
    db = openDb(file);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit").get().n, count);
    assert.equal(await backupBeforeMigration(file), null);
  } finally {
    db?.close();
    for (const name of readdirSync(join(dir, "backups")))
      rmSync(join(dir, "backups", name));
    rmdirSync(join(dir, "backups"));
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(file + suffix, { force: true });
    rmdirSync(dir);
  }
});

test("a cleanup failure rolls back every deletion", () => {
  const f = fixture();
  try {
    const a = demo(f.db),
      b = demo(f.db, "รองเท้า Retro everyday", "shoe");
    f.db.exec(
      `CREATE TRIGGER fail_demo BEFORE DELETE ON products WHEN OLD.id='${b.id}' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;`,
    );
    assert.throws(() => transaction(f.db, () => retireDemoCatalog(f.db)));
    for (const p of [a, b])
      assert.ok(f.db.prepare("SELECT id FROM products WHERE id=?").get(p.id));
  } finally {
    f.db.close();
  }
});
