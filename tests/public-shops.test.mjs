import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  fixture,
  login,
  mutate,
  addUser,
  addProduct,
  orderInput,
} from "./helpers.mjs";
import { id, now, openDb, wallet } from "../server/db.mjs";
import { createOrder, quote } from "../server/commerce.mjs";
import { backupBeforeMigration } from "../server/pre-migration-backup.mjs";

function addShop(db, user, status = "approved") {
  db.prepare(
    "INSERT INTO consignors(user_id,shop_name,status,fee_bps,image,logo,service_area,note,created_at,updated_at) VALUES(?,?,?,725,?,?,?,'PRIVATE NOTE',?,?)",
  ).run(
    user.id,
    "ร้านพาสเทล " + user.id.slice(0, 5),
    status,
    "/assets/bag.svg",
    "",
    "กรุงเทพฯ\nจัดส่งทั่วประเทศ",
    now(),
    now(),
  );
  return db.prepare("SELECT * FROM consignors WHERE user_id=?").get(user.id);
}
function item(
  db,
  user,
  {
    status = "approved",
    active = 1,
    category = "กระเป๋า",
    price = 10000,
    stock = 2,
    name = "ของร้านนี้",
  } = {},
) {
  const product = addProduct(db, stock, price);
  db.prepare(
    "UPDATE products SET consignor_id=?,consignment_status=?,active=?,category=?,name=? WHERE id=?",
  ).run(user.id, status, active, category, name, product.id);
  return product;
}

test("public shop identities are stable and distinct from account IDs; metadata and product links expose only public fields", async () => {
  const f = fixture();
  try {
    const shop = addShop(f.db, f.customer),
      mine = item(f.db, f.customer);
    item(f.db, f.customer, {
      status: "pending",
      active: 0,
      category: "หมวดส่วนตัว",
    });
    assert.match(shop.public_id, /^[a-f0-9]{32}$/);
    assert.notEqual(shop.public_id, f.customer.id);
    const r = await request(f.app).get("/api/shops/" + shop.public_id);
    assert.equal(r.status, 200);
    assert.deepEqual(
      Object.keys(r.body).sort(),
      [
        "categories",
        "id",
        "image",
        "logo",
        "name",
        "productCount",
        "serviceArea",
      ].sort(),
    );
    assert.equal(r.body.productCount, 1);
    assert.deepEqual(r.body.categories, ["กระเป๋า"]);
    assert.equal(JSON.stringify(r.body).includes(f.customer.id), false);
    assert.equal(JSON.stringify(r.body).includes(f.customer.email), false);
    assert.equal(JSON.stringify(r.body).includes("PRIVATE NOTE"), false);
    assert.equal(
      (await request(f.app).get("/api/shops/" + f.customer.id)).status,
      404,
    );
    const publicProduct = (
      await request(f.app).get("/api/products?ids=" + mine.id)
    ).body.items[0];
    assert.equal(publicProduct.shop.id, shop.public_id);
    const c = await login(f.app, f.customer);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/profile",
          { image: "", serviceArea: "นนทบุรี", version: 1 },
          "put",
        )
      ).status,
      200,
    );
    f.db
      .prepare("UPDATE consignors SET shop_name=? WHERE user_id=?")
      .run("ชื่อร้านใหม่", f.customer.id);
    const renamed = (await request(f.app).get("/api/shops/" + shop.public_id))
      .body;
    assert.equal(renamed.id, shop.public_id);
    assert.equal(renamed.name, "ชื่อร้านใหม่");
    assert.equal(renamed.serviceArea, "นนทบุรี");
  } finally {
    f.db.close();
  }
});

test("shop products remain scoped through search, filters, sorting, pagination, IDs and malformed queries", async () => {
  const f = fixture();
  try {
    const shop = addShop(f.db, f.customer);
    addShop(f.db, f.other);
    const a = item(f.db, f.customer, { price: 10000, name: "กระเป๋า A" }),
      b = item(f.db, f.customer, {
        price: 30000,
        category: "น้ำหอม",
        stock: 0,
      }),
      c = item(f.db, f.customer, { price: 20000, name: "กระเป๋า C" });
    const foreign = item(f.db, f.other, { name: "ของร้านอื่น" });
    item(f.db, f.customer, {
      status: "pending",
      active: 1,
      category: "หมวดร่าง",
    });
    item(f.db, f.customer, { status: "rejected", active: 1 });
    item(f.db, f.customer, { status: "approved", active: 0 });
    const url = "/api/products?shop=" + shop.public_id;
    const all = await request(f.app).get(url + "&sort=price-asc&size=2");
    assert.equal(all.status, 200);
    assert.equal(all.body.total, 3);
    assert.deepEqual(
      all.body.items.map((p) => p.id),
      [a.id, c.id],
    );
    const page = (
      await request(f.app).get(url + "&sort=price-asc&size=2&page=999")
    ).body;
    assert.equal(page.page, 2);
    assert.deepEqual(
      page.items.map((p) => p.id),
      [b.id],
    );
    assert.deepEqual(
      (
        await request(f.app).get(
          url +
            "&category=" +
            encodeURIComponent("กระเป๋า") +
            "&q=C&minPrice=15000&maxPrice=25000&inStock=1",
        )
      ).body.items.map((p) => p.id),
      [c.id],
    );
    assert.equal(
      (await request(f.app).get(url + "&ids=" + foreign.id)).body.total,
      0,
    );
    assert.equal(
      (
        await request(f.app).get(
          url + "&category=" + encodeURIComponent("หมวดร่าง"),
        )
      ).body.total,
      0,
    );
    assert.equal(
      (await request(f.app).get(url + "&shop=" + shop.public_id)).status,
      400,
    );
    assert.equal(
      (await request(f.app).get("/api/products?shop[]=" + shop.public_id))
        .status,
      400,
    );
    assert.equal(
      (await request(f.app).get(url + "&minPrice=500&maxPrice=100")).status,
      400,
    );
    const meta = (await request(f.app).get("/api/shops/" + shop.public_id))
      .body;
    assert.equal(meta.productCount, 3);
    assert.deepEqual(meta.categories.sort(), ["กระเป๋า", "น้ำหอม"].sort());
  } finally {
    f.db.close();
  }
});

test("unapproved, suspended, rejected, inactive and unknown shops are unavailable rather than falling back to all products; empty shops are valid", async () => {
  const f = fixture();
  try {
    const shop = addShop(f.db, f.customer);
    const empty = (await request(f.app).get("/api/shops/" + shop.public_id))
      .body;
    assert.equal(empty.productCount, 0);
    assert.deepEqual(empty.categories, []);
    assert.equal(
      (await request(f.app).get("/api/products?shop=" + shop.public_id)).body
        .total,
      0,
    );
    for (const status of ["pending", "suspended", "rejected"]) {
      f.db
        .prepare("UPDATE consignors SET status=? WHERE user_id=?")
        .run(status, f.customer.id);
      assert.equal(
        (await request(f.app).get("/api/shops/" + shop.public_id)).status,
        404,
      );
      assert.equal(
        (await request(f.app).get("/api/products?shop=" + shop.public_id))
          .status,
        404,
      );
    }
    f.db
      .prepare("UPDATE consignors SET status='approved' WHERE user_id=?")
      .run(f.customer.id);
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
    assert.equal(
      (await request(f.app).get("/api/shops/" + shop.public_id)).status,
      404,
    );
    assert.equal(
      (await request(f.app).get("/api/products?shop=" + shop.public_id)).status,
      404,
    );
    for (const invalid of [id(), "not-a-shop", "' OR 1=1 --"]) {
      assert.equal(
        (await request(f.app).get("/api/shops/" + encodeURIComponent(invalid)))
          .status,
        404,
      );
      assert.equal(
        (
          await request(f.app).get(
            "/api/products?shop=" + encodeURIComponent(invalid),
          )
        ).status,
        404,
      );
    }
  } finally {
    f.db.close();
  }
});

test("v15 migration generates unique durable public aliases and backs up v14 without changing money, orders or existing fee snapshots", async () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-public-shops-")),
    file = join(folder, "fixture.sqlite");
  let db;
  try {
    db = openDb(file);
    const seller = addUser(db),
      buyer = addUser(db),
      second = addUser(db);
    addShop(db, seller);
    addShop(db, second);
    wallet(db, buyer.id, 50000, "fixture", id());
    const p = item(db, seller),
      input = orderInput(p, { payment: "deposit" });
    input.expectedQuote = quote(db, buyer.id, input).fingerprint;
    const order = createOrder(db, buyer.id, input, id());
    const before = {
      ...db
        .prepare("SELECT * FROM consignment_sales WHERE order_id=?")
        .get(order.id),
    };
    db.exec(
      "DROP TRIGGER consignors_public_id_insert;DROP INDEX consignors_public_id;ALTER TABLE consignors DROP COLUMN public_id;PRAGMA user_version=14;",
    );
    db.close();
    db = null;
    assert.match(await backupBeforeMigration(file), /before-schema-14-to-15/);
    db = openDb(file);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 15);
    const aliases = db
      .prepare("SELECT user_id,public_id FROM consignors ORDER BY user_id")
      .all();
    assert.equal(new Set(aliases.map((s) => s.public_id)).size, 2);
    for (const s of aliases) {
      assert.match(s.public_id, /^[a-f0-9]{32}$/);
      assert.notEqual(s.public_id, s.user_id);
    }
    assert.equal(
      db.prepare("SELECT balance FROM users WHERE id=?").get(buyer.id).balance,
      50000,
    );
    assert.deepEqual(
      {
        ...db
          .prepare("SELECT * FROM consignment_sales WHERE order_id=?")
          .get(order.id),
      },
      before,
    );
    db.close();
    db = openDb(file);
    assert.deepEqual(
      db
        .prepare("SELECT user_id,public_id FROM consignors ORDER BY user_id")
        .all(),
      aliases,
    );
    const later = addUser(db);
    const inserted = addShop(db, later);
    assert.match(inserted.public_id, /^[a-f0-9]{32}$/);
    assert.ok(!aliases.some((s) => s.public_id === inserted.public_id));
  } finally {
    db?.close();
    for (const name of readdirSync(join(folder, "backups")))
      rmSync(join(folder, "backups", name), { force: true });
    rmdirSync(join(folder, "backups"));
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(file + suffix, { force: true });
    rmdirSync(folder);
  }
});
