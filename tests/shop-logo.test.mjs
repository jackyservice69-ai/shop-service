import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
import { mkdtempSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixture, login, mutate, addUser, addProduct } from "./helpers.mjs";
import { id, now, openDb, wallet } from "../server/db.mjs";
import { backupBeforeMigration } from "../server/pre-migration-backup.mjs";

const picture = () =>
  sharp({
    create: {
      width: 1024,
      height: 512,
      channels: 4,
      background: { r: 246, g: 194, b: 194, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();
async function upload(client, kind = "shopLogo") {
  const r = await client.agent
    .post("/api/profile/media/" + kind)
    .set("x-csrf-token", client.csrf)
    .attach("image", await picture(), {
      filename: "logo.png",
      contentType: "image/png",
    });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

test("shop logos preserve transparency/aspect, stay private until approval, publish separately and survive older profile edits", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer),
      admin = await login(f.app, f.admin),
      other = await login(f.app, f.other);
    const logo = await upload(c),
      photo = await upload(c, "shop");
    assert.equal(logo.width, 512);
    assert.equal(logo.height, 256);
    const stored = await c.agent.get(logo.url);
    assert.equal((await sharp(stored.body).stats()).isOpaque, false);
    assert.match(stored.headers["cache-control"], /private.*no-store/);
    assert.equal((await request(f.app).get(logo.url)).status, 404);
    assert.equal((await admin.agent.get(logo.url)).status, 404);
    assert.equal(
      (
        await mutate(c, "/api/consignment/apply", {
          shopName: "ร้านโลโก้",
          acceptTerms: true,
          image: photo.url,
          logo: logo.url,
          serviceArea: "กรุงเทพฯ",
        })
      ).status,
      201,
    );
    assert.equal((await admin.agent.get(logo.url)).status, 200);
    assert.equal((await other.agent.get(logo.url)).status, 404);
    assert.equal((await request(f.app).get(logo.url)).status, 404);
    assert.equal(
      (
        await mutate(
          admin,
          "/api/admin/consignments/" + f.customer.id,
          { status: "approved", note: "", version: 1, feePercent: 7.25 },
          "put",
        )
      ).status,
      200,
    );
    f.db
      .prepare(
        "UPDATE products SET consignor_id=?,consignment_status='approved' WHERE id=?",
      )
      .run(f.customer.id, f.product.id);
    const shop = (await request(f.app).get("/api/products")).body.items.find(
      (p) => p.id === f.product.id,
    ).shop;
    assert.equal(shop.logo, logo.url);
    assert.equal(shop.image, photo.url);
    assert.equal((await request(f.app).get(logo.url)).status, 200);
    const legacy = { image: photo.url, serviceArea: "นนทบุรี", version: 2 };
    assert.equal(
      (await mutate(c, "/api/consignment/profile", legacy, "put")).status,
      200,
    );
    const membership = (await c.agent.get("/api/consignment")).body.membership;
    assert.equal(membership.logo, logo.url);
    assert.equal(membership.image, photo.url);
    assert.equal(membership.fee_bps, 725);
    f.db
      .prepare("UPDATE consignors SET status='suspended' WHERE user_id=?")
      .run(f.customer.id);
    assert.equal((await request(f.app).get(logo.url)).status, 404);
    f.db
      .prepare("UPDATE consignors SET status='approved' WHERE user_id=?")
      .run(f.customer.id);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/profile",
          { ...legacy, logo: "", version: 3 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await request(f.app).get(logo.url)).status, 404);
    assert.equal(
      (await c.agent.get("/api/consignment")).body.membership.image,
      photo.url,
    );
  } finally {
    f.db.close();
  }
});

test("logo ownership, media kind, version, CSRF, forced reset, combined quota and audit rollback are enforced", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer),
      other = await login(f.app, f.other);
    const logo = await upload(c),
      foreign = await upload(other),
      wrong = await upload(c, "shop");
    assert.equal(
      (await request(f.app).post("/api/profile/media/shopLogo")).status,
      401,
    );
    assert.equal(
      (await c.agent.post("/api/profile/media/shopLogo")).status,
      403,
    );
    assert.equal(
      (
        await mutate(other, "/api/consignment/apply", {
          shopName: "ยืมโลโก้",
          acceptTerms: true,
          logo: logo.url,
        })
      ).status,
      400,
    );
    await mutate(c, "/api/consignment/apply", {
      shopName: "เจ้าของโลโก้",
      acceptTerms: true,
    });
    const body = { image: "", serviceArea: "", logo: logo.url, version: 1 };
    for (const image of [
      foreign.url,
      wrong.url,
      "https://foreign.test/logo.png",
    ])
      assert.equal(
        (
          await mutate(
            c,
            "/api/consignment/profile",
            { ...body, logo: image },
            "put",
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await mutate(
          c,
          "/api/account/photo",
          { image: logo.url, version: 1 },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/profile",
          { ...body, version: 99 },
          "put",
        )
      ).status,
      409,
    );
    f.db
      .prepare("UPDATE users SET must_change_password=1 WHERE id=?")
      .run(f.customer.id);
    assert.equal(
      (await mutate(c, "/api/consignment/profile", body, "put")).status,
      403,
    );
    f.db
      .prepare("UPDATE users SET must_change_password=0 WHERE id=?")
      .run(f.customer.id);
    f.db.exec(
      "CREATE TRIGGER reject_logo_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit disabled'); END;",
    );
    assert.equal(
      (await mutate(c, "/api/consignment/profile", body, "put")).status,
      500,
    );
    assert.equal(
      (await c.agent.get("/api/consignment")).body.membership.logo,
      "",
    );
    f.db.exec("DROP TRIGGER reject_logo_audit;");
    for (let i = 0; i < 20; i++)
      f.db
        .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          id(),
          "shopLogo",
          "image/png",
          32,
          32,
          1,
          Buffer.from("x"),
          f.customer.id,
          now(),
        );
    assert.equal(
      (
        await c.agent
          .post("/api/profile/media/avatar")
          .set("x-csrf-token", c.csrf)
      ).status,
      429,
    );
  } finally {
    f.db.close();
  }
});

test("v14 migration snapshots a v13 database and adds an empty logo without altering balances, fees, shop photographs or products", async () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-logo-migration-")),
    file = join(folder, "fixture.sqlite");
  let db;
  try {
    db = openDb(file);
    const user = addUser(db),
      product = addProduct(db);
    wallet(db, user.id, 50000, "fixture", id());
    db.prepare(
      "INSERT INTO consignors(user_id,shop_name,status,fee_bps,image,service_area,created_at,updated_at) VALUES(?,?,'approved',725,?,?,?,?)",
    ).run(user.id, "ร้านเดิม", "/assets/bag.svg", "กรุงเทพฯ", now(), now());
    db.exec("ALTER TABLE consignors DROP COLUMN logo;PRAGMA user_version=13;");
    db.close();
    db = null;
    const snapshotPath = await backupBeforeMigration(file, 14);
    assert.match(snapshotPath, /before-schema-13-to-14/);
    const before = openDb(file);
    db = before;
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 15);
    assert.equal(
      db.prepare("SELECT balance FROM users WHERE id=?").get(user.id).balance,
      50000,
    );
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT logo,image,service_area,fee_bps FROM consignors WHERE user_id=?",
          )
          .get(user.id),
      },
      {
        logo: "",
        image: "/assets/bag.svg",
        service_area: "กรุงเทพฯ",
        fee_bps: 725,
      },
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM products WHERE id=?").get(product.id)
        .n,
      1,
    );
    const count = db
      .prepare(
        "SELECT COUNT(*) n FROM audit WHERE action='consignment.shop_logo_enabled'",
      )
      .get().n;
    db.close();
    db = openDb(file);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='consignment.shop_logo_enabled'",
        )
        .get().n,
      count,
    );
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
