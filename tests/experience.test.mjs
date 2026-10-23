import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import request from "supertest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixture, login, mutate, orderInput, addUser } from "./helpers.mjs";
import {
  id,
  wallet,
  setSetting,
  getSettings,
  transaction,
  openDb,
  verifyAudit,
} from "../server/db.mjs";
import {
  quote,
  createOrder,
  cancelOrder,
  settleCommission,
  payOrder,
} from "../server/commerce.mjs";

const dates = {
  starts_at: "2020-01-01T00:00:00.000Z",
  ends_at: "2099-01-01T00:00:00.000Z",
};
const png = () =>
  sharp({
    create: { width: 64, height: 64, channels: 4, background: "#b8a5e6" },
  })
    .png()
    .toBuffer();
const upload = (c, kind, body, name = "picture.png", type = "image/png") =>
  c.agent
    .post("/api/admin/media/" + kind)
    .set("x-csrf-token", c.csrf)
    .attach("image", body, { filename: name, contentType: type });
test("PNG uploads are decoded, sanitized and served; bogus content, SVG and dimension errors rejected", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    bytes = await png();
  let r = await upload(a, "banner", bytes);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.width, 64);
  const image = await request(f.app).get(r.body.url);
  assert.equal(image.status, 200);
  assert.match(image.headers["content-type"], /image\/png/);
  assert.match(image.headers["cache-control"], /immutable/);
  assert.equal(
    (await upload(a, "banner", Buffer.from("<svg/>"), "bad.png")).status,
    400,
  );
  assert.equal(
    (
      await upload(
        a,
        "banner",
        Buffer.from("<svg/>"),
        "bad.svg",
        "image/svg+xml",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await upload(
        a,
        "favicon",
        await sharp({
          create: { width: 64, height: 32, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      )
    ).status,
    400,
  );
  const fav = await upload(a, "favicon", bytes);
  assert.equal(fav.body.width, 256);
  assert.equal(fav.body.height, 256);
  assert.equal(
    (await upload(a, "banner", Buffer.alloc(5 * 1024 * 1024 + 1))).status,
    400,
  );
  f.db.close();
});
test("JPEG and JPG accepted, permissions/CSRF enforced and media usage is bounded", async () => {
  const f = fixture({ mediaMaxBytes: 1000000 }),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer);
  const jpeg = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "pink" },
  })
    .jpeg()
    .toBuffer();
  for (const ext of ["jpg", "jpeg"])
    assert.equal(
      (await upload(a, "promotion", jpeg, "image." + ext, "image/jpeg")).status,
      201,
    );
  assert.equal(
    (await upload(c, "logo", jpeg, "x.jpg", "image/jpeg")).status,
    403,
  );
  assert.equal(
    (
      await a.agent
        .post("/api/admin/media/logo")
        .attach("image", await png(), "x.png")
    ).status,
    403,
  );
  assert.equal(
    (await upload(a, "unknown", jpeg, "x.jpg", "image/jpeg")).status,
    400,
  );
  const small = fixture({ mediaMaxBytes: 1 }),
    s = await login(small.app, small.admin);
  assert.equal((await upload(s, "logo", await png())).status, 409);
  assert.equal(small.db.prepare("SELECT COUNT(*) n FROM media").get().n, 0);
  small.db.close();
  f.db.close();
});
test("appearance persists all six colors, logo/favicon, slide time and commission settings; validates injection", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  const initial = (await a.agent.get("/api/admin/appearance")).body,
    logo = (await upload(a, "logo", await png())).body.url,
    favicon = (await upload(a, "favicon", await png())).body.url;
  const settings = {
    ...initial,
    theme: {
      primary: "#c4b5ed",
      ink: "#302840",
      muted: "#71677d",
      background: "#f8f6fc",
      surface: "#ffffff",
      positive: "#277257",
    },
    logo,
    favicon,
    commissionPercent: 7.25,
    slideSeconds: 4,
  };
  assert.equal(
    (await mutate(a, "/api/admin/appearance", settings, "put")).status,
    200,
  );
  const pub = (await request(f.app).get("/api/public")).body;
  assert.deepEqual(pub.theme, settings.theme);
  assert.equal(pub.logo, logo);
  assert.equal(pub.favicon, favicon);
  assert.equal(pub.commissionPercent, 7.25);
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/appearance",
        {
          ...settings,
          theme: {
            ...settings.theme,
            primary: "red;background:url(https://evil)",
          },
        },
        "put",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/appearance",
        { ...settings, commissionPercent: 101 },
        "put",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/appearance",
        { ...settings, logo: favicon },
        "put",
      )
    ).status,
    400,
  );
  assert.ok(verifyAudit(f.db).valid);
  f.db.close();
});
test("multiple banners have scheduling, sort order, safe links and conflict control", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    image = (await upload(a, "banner", await png())).body.url;
  for (const [title, position] of [
    ["second", 2],
    ["first", 1],
  ])
    assert.equal(
      (
        await mutate(a, "/api/admin/banners", {
          title,
          image,
          position,
          link: "/promotions",
          active: true,
          ...dates,
        })
      ).status,
      201,
    );
  let pub = (await request(f.app).get("/api/public")).body;
  assert.deepEqual(
    pub.banners.map((b) => b.title),
    ["first", "second"],
  );
  const row = (await a.agent.get("/api/admin/banners")).body.items[0];
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/banners/" + row.id,
        { ...row, active: false },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/banners/" + row.id,
        { ...row, active: false },
        "put",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await mutate(a, "/api/admin/banners", {
        title: "bad",
        image,
        position: 0,
        link: "//evil.com",
        active: true,
        ...dates,
      })
    ).status,
    400,
  );
  pub = (await request(f.app).get("/api/public")).body;
  assert.equal(pub.banners.length, 1);
  f.db.close();
});
test("announcements and promotions accept only validated images of matching purpose", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    image = (await upload(a, "announcement", await png())).body.url;
  const body = {
    title: "ข่าวหนึ่ง",
    body: "ประกาศทดสอบ",
    image,
    position: 2,
    active: true,
    ...dates,
  };
  let r = await mutate(a, "/api/admin/announcements", body);
  assert.equal(r.status, 201);
  r = await mutate(a, "/api/admin/announcements", {
    ...body,
    title: "ข่าวสอง",
    position: 1,
  });
  assert.equal(r.status, 201);
  const pub = (await request(f.app).get("/api/public")).body;
  assert.deepEqual(
    pub.announcements.map((a) => a.title),
    ["ข่าวสอง", "ข่าวหนึ่ง"],
  );
  assert.equal(pub.announcements[0].image, image);
  assert.equal(
    (
      await mutate(a, "/api/admin/announcements", {
        ...body,
        image: "https://evil.test/image.png",
      })
    ).status,
    400,
  );
  f.db.close();
});
test("claim-required coupons reject direct use, claim once, discount on server and respect use limits", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer),
    image = (await upload(a, "promotion", await png())).body.url;
  const p = await mutate(a, "/api/admin/promotions", {
    code: "COLLECT10",
    title: "ส่วนลดใหม่",
    description: "เก็บก่อนใช้",
    image,
    claim_required: true,
    type: "percent",
    value: 10,
    minimum: 0,
    limit_count: 20,
    per_user: 1,
    active: true,
    ...dates,
  });
  assert.equal(p.status, 201);
  assert.equal(
    (await request(f.app).get("/api/promotions")).body.items[0].title,
    "ส่วนลดใหม่",
  );
  const input = orderInput(f.product, {
    payment: "deposit",
    coupon: "COLLECT10",
  });
  assert.equal((await mutate(c, "/api/orders/quote", input)).status, 400);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await mutate(c, "/api/coupons/" + p.body.id + "/claim")).status,
      200,
    );
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM coupon_claims").get().n, 1);
  const q = await mutate(c, "/api/orders/quote", input);
  assert.equal(q.body.discount, 1000);
  assert.equal(
    (
      await mutate(
        c,
        "/api/orders",
        { ...input, expectedQuote: q.body.fingerprint },
        "post",
        id(),
      )
    ).status,
    201,
  );
  assert.equal((await mutate(c, "/api/orders/quote", input)).status, 409);
  assert.equal((await c.agent.get("/api/coupons")).body.items[0].used_count, 1);
  f.db.close();
});
test("referral commission snapshots rate and discounted bill, credits exactly once only on completion", async () => {
  const f = fixture();
  f.db
    .prepare("UPDATE users SET referred_by=? WHERE id=?")
    .run(f.other.id, f.customer.id);
  setSetting(f.db, "commissionPercent", 7.25);
  f.db
    .prepare(
      "INSERT INTO promotions(id,code,type,value,starts_at,ends_at) VALUES(?,?,?,?,?,?)",
    )
    .run(id(), "LESS", "fixed", 1000, dates.starts_at, dates.ends_at);
  wallet(f.db, f.customer.id, 30000, "opening-test", id());
  const input = orderInput(f.product, { coupon: "LESS" });
  input.expectedQuote = quote(f.db, f.customer.id, input).fingerprint;
  const o = createOrder(f.db, f.customer.id, input, id());
  assert.equal(o.commission_bps, 725);
  assert.equal(o.commission_amount, 652);
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
      .balance,
    0,
  );
  setSetting(f.db, "commissionPercent", 50);
  assert.throws(() => settleCommission(f.db, o.id), /สำเร็จ/);
  transaction(f.db, () => {
    f.db.prepare("UPDATE orders SET status='completed' WHERE id=?").run(o.id);
    settleCommission(f.db, o.id);
  });
  transaction(f.db, () => settleCommission(f.db, o.id));
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
      .balance,
    652,
  );
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM ledger WHERE kind='commission'").get()
      .n,
    1,
  );
  assert.equal(
    f.db.prepare("SELECT status FROM commissions WHERE order_id=?").get(o.id)
      .status,
    "credited",
  );
  assert.ok(verifyAudit(f.db).valid);
  f.db.close();
});
test("cancelled reservations never receive commission; old orders and 0% do not retroactively pay", () => {
  const f = fixture();
  f.db
    .prepare("UPDATE users SET referred_by=? WHERE id=?")
    .run(f.other.id, f.customer.id);
  setSetting(f.db, "commissionPercent", 10);
  let input = orderInput(f.product, { payment: "deposit" });
  input.expectedQuote = quote(f.db, f.customer.id, input).fingerprint;
  const o = createOrder(f.db, f.customer.id, input, id());
  cancelOrder(f.db, f.customer.id, o.id);
  assert.equal(
    f.db.prepare("SELECT status FROM commissions WHERE order_id=?").get(o.id)
      .status,
    "void",
  );
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
      .balance,
    0,
  );
  setSetting(f.db, "commissionPercent", 0);
  const next = createOrder(f.db, f.customer.id, input, id());
  setSetting(f.db, "commissionPercent", 10);
  assert.equal(next.commission_amount, 0);
  assert.equal(
    f.db
      .prepare("SELECT COUNT(*) n FROM commissions WHERE order_id=?")
      .get(next.id).n,
    0,
  );
  f.db.close();
});
test("completion endpoint pays commission atomically and reports it as expense, never store revenue", async () => {
  const f = fixture();
  f.db
    .prepare("UPDATE users SET referred_by=? WHERE id=?")
    .run(f.other.id, f.customer.id);
  setSetting(f.db, "commissionPercent", 10);
  wallet(f.db, f.customer.id, 10000, "opening-test", id());
  const a = await login(f.app, f.admin),
    c = await login(f.app, f.customer),
    ref = await login(f.app, f.other);
  const r = await mutate(c, "/api/orders", orderInput(f.product), "post", id());
  for (const status of ["processing", "shipped", "completed"])
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/orders/" + r.body.id,
          { status, tracking: "TH123" },
          "put",
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/orders/" + r.body.id,
        { status: "completed" },
        "put",
      )
    ).status,
    409,
  );
  const d = (await a.agent.get("/api/admin/dashboard")).body;
  assert.equal(d.net, 9000);
  assert.equal(d.commissionExpense, 1000);
  assert.equal(d.bar.at(-1).expense, 1000);
  const refs = (await ref.agent.get("/api/referrals")).body;
  assert.equal(refs.commissionTotals.credited, 1000);
  assert.equal(refs.commissions.items.length, 1);
  assert.equal((await c.agent.get("/api/referrals")).body.commissions.total, 0);
  assert.equal((await c.agent.get("/api/admin/commissions")).status, 403);
  f.db.close();
});
test("additive migration preserves legacy announcement data and can run twice", () => {
  const dir = mkdtempSync(join(tmpdir(), "hiewly-migration-")),
    file = join(dir, "db.sqlite");
  const old = new DatabaseSync(file);
  old.exec(
    "CREATE TABLE announcements(id TEXT PRIMARY KEY,title TEXT,body TEXT,active INTEGER,starts_at TEXT,ends_at TEXT,version INTEGER); INSERT INTO announcements VALUES('old','ข่าวเก่า','ข้อมูลเก่า',1,'2020','2099',1)",
  );
  old.close();
  let db = openDb(file);
  let row = db.prepare("SELECT * FROM announcements WHERE id=?").get("old");
  assert.equal(row.body, "ข้อมูลเก่า");
  assert.equal(row.image, "");
  db.close();
  db = openDb(file);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM announcements").get().n, 1);
  db.close();
  rmSync(file);
  rmdirSync(dir);
});
