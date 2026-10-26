import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, login, mutate, addUser, addProduct } from "./helpers.mjs";
import { openDb, now, id, wallet } from "../server/db.mjs";

const picture = () =>
  sharp({
    create: { width: 640, height: 320, channels: 3, background: "#f6c2c2" },
  })
    .jpeg()
    .withExif({ IFD0: { Artist: "Private profile metadata" } })
    .toBuffer();
const upload = (c, kind, bytes, filename = "photo.jpg", mime = "image/jpeg") =>
  c.agent
    .post("/api/profile/media/" + kind)
    .set("x-csrf-token", c.csrf)
    .attach("image", bytes, { filename, contentType: mime });
function shop(db, user, status = "pending") {
  db.prepare(
    "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at,fee_bps) VALUES(?,?,?,?,?,?)",
  ).run(user.id, "ร้านทดสอบรูป", status, now(), now(), 725);
}

test("profile uploads sanitize and bound real images; drafts and avatars are private; photo writes preserve identities and wallets", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer),
      other = await login(f.app, f.other),
      admin = await login(f.app, f.admin);
    const file = await picture(),
      draft = await upload(c, "avatar", file);
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    assert.equal(draft.body.width, 512);
    assert.equal(draft.body.height, 512);
    const path = draft.body.url;
    assert.equal((await request(f.app).get(path)).status, 404);
    assert.equal((await other.agent.get(path)).status, 404);
    assert.equal((await admin.agent.get(path)).status, 404);
    const read = await c.agent.get(path);
    assert.equal(read.status, 200);
    assert.match(read.headers["cache-control"], /private.*no-store/);
    const meta = await sharp(read.body).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.exif, undefined);
    const identity = f.db
      .prepare("SELECT member_version,balance,role_id FROM users WHERE id=?")
      .get(f.customer.id);
    assert.equal(
      (
        await mutate(
          c,
          "/api/account/photo",
          { image: path, version: 1 },
          "put",
        )
      ).status,
      200,
    );
    const me = (await c.agent.get("/api/me")).body.user;
    assert.equal(me.avatar, path);
    assert.equal(me.avatarVersion, 2);
    assert.deepEqual(
      f.db
        .prepare("SELECT member_version,balance,role_id FROM users WHERE id=?")
        .get(f.customer.id),
      identity,
    );
    assert.equal((await admin.agent.get(path)).status, 200);
    assert.equal((await other.agent.get(path)).status, 404);
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("photo-reviewer", "ตรวจสมาชิก", '["members"]');
    f.db
      .prepare("UPDATE users SET role_id='photo-reviewer' WHERE id=?")
      .run(f.other.id);
    assert.equal((await other.agent.get(path)).status, 200);
    f.db
      .prepare("UPDATE roles SET permissions='[]' WHERE id='photo-reviewer'")
      .run();
    assert.equal((await other.agent.get(path)).status, 404);
    assert.equal(
      (
        await mutate(
          other,
          "/api/account/photo",
          { image: path, version: 1 },
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
          { image: path, version: 1 },
          "put",
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/account/photo",
          { image: "", version: 2, userId: f.other.id },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (await mutate(c, "/api/account/photo", { image: "", version: 2 }, "put"))
        .status,
      200,
    );
    assert.equal((await c.agent.get("/api/me")).body.user.avatar, "");
    assert.equal((await admin.agent.get(path)).status, 404);
  } finally {
    f.db.close();
  }
});

test("profile APIs enforce authentication, CSRF, origin, password reset, image bytes, size and quota", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer),
      bytes = await picture();
    assert.equal(
      (await request(f.app).post("/api/profile/media/avatar")).status,
      401,
    );
    assert.equal(
      (
        await c.agent
          .post("/api/profile/media/avatar")
          .attach("image", bytes, "photo.jpg")
      ).status,
      403,
    );
    assert.equal(
      (await c.agent.put("/api/account/photo").send({ image: "", version: 1 }))
        .status,
      403,
    );
    assert.equal(
      (
        await c.agent
          .put("/api/account/photo")
          .set("x-csrf-token", c.csrf)
          .set("Origin", "https://foreign.test")
          .send({ image: "", version: 1 })
      ).status,
      403,
    );
    assert.equal((await upload(c, "product", bytes)).status, 400);
    assert.equal(
      (
        await upload(
          c,
          "avatar",
          Buffer.from("<svg/>"),
          "photo.png",
          "image/png",
        )
      ).status,
      400,
    );
    assert.equal(
      (await upload(c, "avatar", bytes, "photo.png", "image/png")).status,
      400,
    );
    assert.equal(
      (await upload(c, "avatar", bytes, "photo.png", "image/jpeg")).status,
      400,
    );
    assert.equal(
      (await upload(c, "avatar", Buffer.alloc(5 * 1024 * 1024 + 1))).status,
      400,
    );
    const small = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    assert.equal(
      (await upload(c, "avatar", small, "small.png", "image/png")).status,
      400,
    );
    f.db
      .prepare("UPDATE users SET must_change_password=1 WHERE id=?")
      .run(f.customer.id);
    assert.equal((await upload(c, "avatar", bytes)).status, 403);
    assert.equal(
      (await mutate(c, "/api/account/photo", { image: "", version: 1 }, "put"))
        .status,
      403,
    );
    f.db
      .prepare("UPDATE users SET must_change_password=0 WHERE id=?")
      .run(f.customer.id);
    for (let i = 0; i < 20; i++)
      f.db
        .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          id(),
          "shop",
          "image/png",
          32,
          32,
          1,
          Buffer.from("x"),
          f.customer.id,
          now(),
        );
    assert.equal((await upload(c, "avatar", bytes)).status, 429);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM media").get().n, 20);
  } finally {
    f.db.close();
  }
  const limited = fixture({ mediaMaxBytes: 1 });
  try {
    const c = await login(limited.app, limited.customer);
    assert.equal((await upload(c, "shop", await picture())).status, 409);
    assert.equal(limited.db.prepare("SELECT COUNT(*) n FROM media").get().n, 0);
  } finally {
    limited.db.close();
  }
});

test("shops publish only their current approved photo and service area; ownership, stale edits and status/fees stay protected", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer),
      other = await login(f.app, f.other),
      admin = await login(f.app, f.admin);
    const img = (await upload(c, "shop", await picture())).body.url,
      area = "กรุงเทพฯ เขตบางรัก\nนนทบุรี / จัดส่งทั่วประเทศ";
    assert.equal(
      (
        await mutate(c, "/api/consignment/apply", {
          shopName: "ร้านทดสอบรูป",
          acceptTerms: true,
          image: img,
          serviceArea: " " + area + " ",
        })
      ).status,
      201,
    );
    f.db
      .prepare(
        "UPDATE products SET consignor_id=?,consignment_status='approved' WHERE id=?",
      )
      .run(f.customer.id, f.product.id);
    assert.equal((await request(f.app).get(img)).status, 404);
    assert.equal((await admin.agent.get(img)).status, 200);
    assert.equal((await other.agent.get(img)).status, 404);
    assert.equal(
      (await request(f.app).get("/api/products")).body.items[0].shop,
      undefined,
    );
    const update = { image: img, serviceArea: area, version: 1 };
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/profile",
          { serviceArea: area, version: 1 },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (await mutate(other, "/api/consignment/profile", update, "put")).status,
      403,
    );
    for (const extra of [
      { status: "approved" },
      { feePercent: 0 },
      { userId: f.other.id },
    ])
      assert.equal(
        (
          await mutate(
            c,
            "/api/consignment/profile",
            { ...update, ...extra },
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
          { ...update, serviceArea: "x".repeat(1001) },
          "put",
        )
      ).status,
      400,
    );
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
    assert.equal(
      (await mutate(c, "/api/consignment/profile", update, "put")).status,
      409,
    );
    const pub = (await request(f.app).get("/api/products")).body.items.find(
      (p) => p.id === f.product.id,
    );
    assert.deepEqual(pub.shop, {
      name: "ร้านทดสอบรูป",
      image: img,
      logo: "",
      id: f.db
        .prepare("SELECT public_id FROM consignors WHERE user_id=?")
        .get(f.customer.id).public_id,
      serviceArea: area,
    });
    for (const field of [
      "consignor_id",
      "fee_bps",
      "email",
      "phone",
      "user_id",
      "cost",
    ])
      assert.equal(pub[field], undefined);
    assert.equal((await request(f.app).get(img)).status, 200);
    f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
    assert.equal((await request(f.app).get(img)).status, 404);
    f.db.prepare("UPDATE users SET active=1 WHERE id=?").run(f.customer.id);
    const replacement = (await upload(c, "shop", await picture())).body.url;
    assert.equal((await request(f.app).get(replacement)).status, 404);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/profile",
          {
            image: replacement,
            serviceArea: area + "\nรับส่งตามนัด",
            version: 2,
          },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await request(f.app).get(img)).status, 404);
    assert.equal((await request(f.app).get(replacement)).status, 200);
    assert.equal(
      (await c.agent.get("/api/consignment")).body.membership.fee_bps,
      725,
    );
    f.db
      .prepare("UPDATE consignors SET status='suspended' WHERE user_id=?")
      .run(f.customer.id);
    assert.equal((await request(f.app).get(replacement)).status, 404);
    assert.equal(
      (await request(f.app).get("/api/products")).body.items.find(
        (p) => p.id === f.product.id,
      )?.shop,
      undefined,
    );
  } finally {
    f.db.close();
  }
});

test("shop pictures cannot be borrowed from another owner or from avatar/product uploads", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer),
      other = await login(f.app, f.other);
    const img = (await upload(c, "shop", await picture())).body.url;
    assert.equal(
      (
        await mutate(other, "/api/consignment/apply", {
          shopName: "ยืมรูป",
          acceptTerms: true,
          image: img,
        })
      ).status,
      400,
    );
    shop(f.db, f.other, "approved");
    assert.equal(
      (
        await mutate(
          other,
          "/api/consignment/profile",
          { image: img, serviceArea: "", version: 1 },
          "put",
        )
      ).status,
      400,
    );
    const avatar = (await upload(other, "avatar", await picture())).body.url;
    assert.equal(
      (
        await mutate(
          other,
          "/api/consignment/profile",
          { image: avatar, serviceArea: "", version: 1 },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (await mutate(c, "/api/account/photo", { image: img, version: 1 }, "put"))
        .status,
      400,
    );
  } finally {
    f.db.close();
  }
});

test("profile changes and uploaded files roll back when auditing fails", async () => {
  const f = fixture();
  try {
    const c = await login(f.app, f.customer);
    shop(f.db, f.customer, "approved");
    const img = (await upload(c, "shop", await picture())).body.url;
    const avatar = (await upload(c, "avatar", await picture())).body.url;
    f.db.exec(
      "CREATE TRIGGER reject_profile_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit disabled'); END;",
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/profile",
          { image: img, serviceArea: "กรุงเทพฯ", version: 1 },
          "put",
        )
      ).status,
      500,
    );
    assert.equal(
      f.db
        .prepare("SELECT image FROM consignors WHERE user_id=?")
        .get(f.customer.id).image,
      "",
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/account/photo",
          { image: avatar, version: 1 },
          "put",
        )
      ).status,
      500,
    );
    assert.equal(
      f.db
        .prepare("SELECT avatar_version FROM users WHERE id=?")
        .get(f.customer.id).avatar_version,
      1,
    );
    assert.equal((await upload(c, "avatar", await picture())).status, 500);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM media").get().n, 2);
  } finally {
    f.db.close();
  }
});

test("v13 migration preserves customer funds, products, per-shop fees and read notices across reopening", () => {
  const folder = mkdtempSync(join(tmpdir(), "iya-profile-")),
    file = join(folder, "fixture.sqlite");
  let db;
  try {
    db = openDb(file);
    const user = addUser(db),
      product = addProduct(db);
    wallet(db, user.id, 50000, "fixture", id());
    shop(db, user, "approved");
    db.prepare(
      "INSERT INTO notifications(event_key,recipient_id,topic,entity_id,kind,title,body,href,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      "fixture",
      user.id,
      "consignment.membership",
      user.id,
      "approved",
      "ทดสอบ",
      "ทดสอบ",
      "/consignment",
      now(),
    );
    const notice = db
      .prepare("SELECT id FROM notifications WHERE event_key='fixture'")
      .get();
    db.prepare("INSERT INTO notification_reads VALUES(?,?,?)").run(
      notice.id,
      user.id,
      now(),
    );
    db.exec(
      "ALTER TABLE users DROP COLUMN avatar;ALTER TABLE users DROP COLUMN avatar_version;ALTER TABLE consignors DROP COLUMN image;ALTER TABLE consignors DROP COLUMN service_area;PRAGMA user_version=12;",
    );
    db.close();
    db = openDb(file);
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 16);
    assert.equal(
      db.prepare("SELECT balance FROM users WHERE id=?").get(user.id).balance,
      50000,
    );
    assert.deepEqual(
      {
        ...db
          .prepare("SELECT avatar,avatar_version FROM users WHERE id=?")
          .get(user.id),
      },
      { avatar: "", avatar_version: 1 },
    );
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT image,service_area,fee_bps FROM consignors WHERE user_id=?",
          )
          .get(user.id),
      },
      { image: "", service_area: "", fee_bps: 725 },
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM products WHERE id=?").get(product.id)
        .n,
      1,
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM notification_reads WHERE user_id=?")
        .get(user.id).n,
      1,
    );
    const count = db
      .prepare("SELECT COUNT(*) n FROM audit WHERE action='profiles.enabled'")
      .get().n;
    db.close();
    db = openDb(file);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM audit WHERE action='profiles.enabled'")
        .get().n,
      count,
    );
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(file + suffix, { force: true });
    rmdirSync(folder);
  }
});
