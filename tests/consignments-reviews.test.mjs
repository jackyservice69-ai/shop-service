import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  fixture,
  login,
  mutate,
  orderInput,
  addProduct,
  addUser,
} from "./helpers.mjs";
import {
  id,
  now,
  wallet,
  setSetting,
  transaction,
  verifyAudit,
} from "../server/db.mjs";
import { quote, createOrder, cancelOrder } from "../server/commerce.mjs";
import { settleConsignments } from "../server/consignment-ledger.mjs";
import { videoTools } from "../server/review-video.mjs";
const run = promisify(execFile);
const approve = (f, seller) =>
  f.db
    .prepare(
      "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at) VALUES(?,?,'approved',?,?)",
    )
    .run(seller.id, "ร้าน " + seller.id.slice(0, 4), now(), now());
const owned = (f, p, seller) =>
  f.db
    .prepare(
      "UPDATE products SET consignor_id=?,consignment_status='approved' WHERE id=?",
    )
    .run(seller.id, p.id);
const completed = (f, user = f.customer, p = f.product) => {
  const input = orderInput(p, { payment: "deposit" });
  input.expectedQuote = quote(f.db, user.id, input).fingerprint;
  const o = createOrder(f.db, user.id, input, id());
  f.db
    .prepare("UPDATE orders SET status='completed',paid=total WHERE id=?")
    .run(o.id);
  return o;
};
const png = () =>
  sharp({
    create: { width: 120, height: 120, channels: 3, background: "pink" },
  })
    .png()
    .toBuffer();
const reviewFile = (c, p, body, name = "photo.png", type = "image/png") =>
  c.agent
    .post(`/api/products/${p.id}/review-media`)
    .set("x-csrf-token", c.csrf)
    .attach("file", body, { filename: name, contentType: type });

test("new admin scopes reject anonymous/customer access and separate consignment, reviews and fee-setting privileges", async () => {
  const f = fixture();
  try {
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("seller-staff", "ทีมฝากขาย", JSON.stringify(["consignments"]));
    const staffUser = addUser(f.db, "seller-staff"),
      staff = await login(f.app, staffUser),
      customer = await login(f.app, f.customer);
    for (const path of [
      "consignments",
      "consignment-products",
      "consignment-sales",
      "consignment-settings",
      "reviews",
    ]) {
      assert.equal(
        (await request(f.app).get("/api/admin/" + path)).status,
        401,
      );
      assert.equal(
        (await customer.agent.get("/api/admin/" + path)).status,
        403,
      );
      assert.equal(
        (await staff.agent.get("/api/admin/" + path)).status,
        ["reviews", "consignment-settings"].includes(path) ? 403 : 200,
      );
    }
    assert.equal(
      (
        await mutate(
          staff,
          "/api/admin/consignment-settings",
          { feePercent: 20 },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          staff,
          "/api/admin/reviews/missing",
          { visible: false, reason: "ทดสอบ", version: 1 },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await staff.agent
          .put("/api/admin/consignments/" + f.other.id)
          .send({ status: "approved", note: "", version: 1 })
      ).status,
      403,
    );
    assert.equal(
      (
        await customer.agent
          .post("/api/consignment/apply")
          .send({ shopName: "ร้านทดสอบ", acceptTerms: true })
      ).status,
      403,
    );
  } finally {
    f.db.close();
  }
});

test("consignor applies, admin approves, seller uploads own product, publication requires approval and ownership is enforced", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    v = await login(f.app, f.other),
    c = await login(f.app, f.customer);
  try {
    assert.equal(
      (await mutate(v, "/api/consignment/products", {})).status,
      400,
    );
    assert.equal(
      (
        await mutate(v, "/api/consignment/apply", {
          shopName: "ร้านตัวแทน",
          acceptTerms: true,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await mutate(v, "/api/consignment/apply", {
          shopName: "ซ้ำ",
          acceptTerms: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await mutate(
          v,
          "/api/admin/consignments/" + f.other.id,
          { status: "approved", note: "", version: 1 },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/consignments/" + f.other.id,
          { status: "approved", note: "ผ่าน", version: 1 },
          "put",
        )
      ).status,
      200,
    );
    const image = await v.agent
      .post("/api/consignment/media")
      .set("x-csrf-token", v.csrf)
      .attach("image", await png(), {
        filename: "product.png",
        contentType: "image/png",
      });
    assert.equal(image.status, 201);
    const body = {
      name: "ฝากขายทดสอบ",
      description: "สินค้าของตัวแทน",
      category: "ฝากขาย",
      price: 10001,
      stock: 2,
      image: image.body.url,
      active: true,
      consignor_id: f.customer.id,
    };
    assert.equal(
      (await mutate(v, "/api/consignment/products", body)).status,
      201,
    );
    let p = f.db.prepare("SELECT * FROM products WHERE name=?").get(body.name);
    assert.equal(p.consignor_id, f.other.id);
    assert.equal(p.active, 0);
    f.db
      .prepare("UPDATE products SET image=?,images=? WHERE id=?")
      .run(
        "/assets/bag.svg",
        JSON.stringify(["/assets/bag.svg", "/assets/perfume.svg"]),
        p.id,
      );
    assert.equal(
      (
        await mutate(
          v,
          "/api/consignment/products/" + p.id,
          { ...body, version: p.version },
          "put",
        )
      ).status,
      200,
    );
    p = f.db.prepare("SELECT * FROM products WHERE id=?").get(p.id);
    assert.equal(p.images, "[]");
    assert.equal(p.image, body.image);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + p.id,
          { ...body, version: p.version },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/consignment-products/" + p.id,
          { approved: true, version: p.version },
          "put",
        )
      ).status,
      200,
    );
    p = f.db.prepare("SELECT * FROM products WHERE id=?").get(p.id);
    assert.equal(p.active, 1);
    assert.equal(
      (await mutate(v, "/api/orders/quote", orderInput(p))).status,
      409,
    );
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/consignments/" + f.other.id,
          { status: "suspended", note: "พัก", version: 2 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT active FROM products WHERE id=?").get(p.id).active,
      0,
    );
    assert.equal(
      (
        await mutate(
          v,
          "/api/consignment/products/" + p.id,
          { ...body, version: p.version },
          "put",
        )
      ).status,
      403,
    );
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});
test("discount allocation, fee snapshots and completion credit are exact across vendors and included once in finance", async () => {
  const f = fixture(),
    second = addUser(f.db),
    store = addProduct(f.db, 5, 300);
  approve(f, f.other);
  approve(f, second);
  owned(f, f.product, f.other);
  const p2 = addProduct(f.db, 5, 202);
  owned(f, p2, second);
  f.db.prepare("UPDATE products SET price=101 WHERE id=?").run(f.product.id);
  setSetting(f.db, "consignmentFeePercent", 7.25);
  wallet(f.db, f.customer.id, 1000, "opening-test", id());
  f.db
    .prepare(
      "INSERT INTO promotions(id,code,type,value,starts_at,ends_at) VALUES(?,?,'fixed',5,'2020','2099')",
    )
    .run(id(), "LESS");
  const c = await login(f.app, f.customer),
    a = await login(f.app, f.admin);
  try {
    const input = orderInput(f.product, {
      coupon: "LESS",
      items: [
        { productId: f.product.id, quantity: 1 },
        { productId: p2.id, quantity: 1 },
        { productId: store.id, quantity: 1 },
      ],
    });
    const result = await mutate(c, "/api/orders", input, "post", id());
    assert.equal(result.status, 201);
    let sales = f.db
      .prepare("SELECT * FROM consignment_sales ORDER BY base")
      .all();
    assert.deepEqual(
      sales.map((s) => [s.base, s.fee, s.net]),
      [
        [100, 7, 93],
        [200, 14, 186],
      ],
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
        .balance,
      0,
    );
    setSetting(f.db, "consignmentFeePercent", 90);
    for (const state of ["processing", "shipped", "completed"])
      assert.equal(
        (
          await mutate(
            a,
            "/api/admin/orders/" + result.body.id,
            { status: state, tracking: "TH123" },
            "put",
          )
        ).status,
        200,
      );
    transaction(f.db, () => settleConsignments(f.db, result.body.id));
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.other.id)
        .balance,
      93,
    );
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM ledger WHERE kind='consignment'")
        .get().n,
      2,
    );
    sales = f.db.prepare("SELECT * FROM consignment_sales").all();
    assert.ok(sales.every((s) => s.status === "credited" && s.fee_bps === 725));
    const dashboard = (await a.agent.get("/api/admin/dashboard")).body;
    assert.equal(dashboard.expense, 279);
    assert.equal(dashboard.net, 319);
    assert.equal((await c.agent.get("/api/consignment/sales")).body.total, 0);
  } finally {
    f.db.close();
  }
});
test("zero and 100% fees, cancelled deposits, failed payment and self purchases never create unintended seller credits", () => {
  const f = fixture();
  approve(f, f.other);
  owned(f, f.product, f.other);
  try {
    const input = orderInput(f.product, { payment: "deposit" });
    input.expectedQuote = quote(f.db, f.customer.id, input).fingerprint;
    for (const rate of [0, 100]) {
      setSetting(f.db, "consignmentFeePercent", rate);
      const o = createOrder(f.db, f.customer.id, input, id()),
        s = f.db
          .prepare("SELECT * FROM consignment_sales WHERE order_id=?")
          .get(o.id);
      assert.equal(s.fee, rate === 0 ? 0 : s.base);
      cancelOrder(f.db, f.customer.id, o.id);
      assert.equal(
        f.db
          .prepare("SELECT status FROM consignment_sales WHERE order_id=?")
          .get(o.id).status,
        "void",
      );
    }
    const full = orderInput(f.product);
    full.expectedQuote = quote(f.db, f.customer.id, full).fingerprint;
    assert.throws(() => createOrder(f.db, f.customer.id, full, id()), /เงิน/);
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM consignment_sales WHERE status='pending'",
        )
        .get().n,
      0,
    );
    assert.throws(() => quote(f.db, f.other.id, input), /ตนเอง/);
  } finally {
    f.db.close();
  }
});
test("reviews require completed purchases, 1-5 stars, own versioned edits, one review per product and private author data", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    other = await login(f.app, f.other);
  try {
    const path = `/api/products/${f.product.id}/review`;
    assert.equal(
      (await mutate(c, path, { rating: 5, comment: "ดีมาก" }, "put")).status,
      403,
    );
    completed(f);
    for (const rating of [0, 6, 1.5])
      assert.equal(
        (await mutate(c, path, { rating, comment: "ทดสอบ" }, "put")).status,
        400,
      );
    assert.equal(
      (await c.agent.put(path).send({ rating: 5, comment: "test" })).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          c,
          path,
          { rating: 5, comment: "<script>text only</script>" },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (await mutate(c, path, { rating: 4, comment: "แก้ไข" }, "put")).status,
      409,
    );
    assert.equal(
      (
        await mutate(
          c,
          path,
          { rating: 4, comment: "แก้ไข", version: 1 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(
          other,
          path,
          { rating: 1, comment: "ปลอม", version: 2 },
          "put",
        )
      ).status,
      403,
    );
    const pub = (
      await request(f.app).get(`/api/products/${f.product.id}/reviews`)
    ).body;
    assert.equal(pub.summary.count, 1);
    assert.equal(pub.summary.average, 4);
    assert.equal(pub.items[0].email, undefined);
    assert.equal(pub.items[0].user_id, undefined);
    assert.equal((await mutate(c, path, { version: 2 }, "delete")).status, 200);
  } finally {
    f.db.close();
  }
});
test("review images are sanitized and owner-bound; private drafts and hidden media cannot be read publicly; ranges work", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    a = await login(f.app, f.admin),
    other = await login(f.app, f.other);
  completed(f);
  completed(f, f.other);
  try {
    const uploaded = await reviewFile(c, f.product, await png());
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
    const m = uploaded.body;
    assert.equal((await request(f.app).get(m.url)).status, 404);
    assert.equal((await c.agent.get(m.url)).status, 200);
    assert.equal(
      (await reviewFile(c, f.product, Buffer.from("<script/>"))).status,
      422,
    );
    assert.equal(
      (
        await mutate(
          other,
          `/api/products/${f.product.id}/review`,
          { rating: 5, comment: "ผู้อื่น", mediaIds: [m.id] },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          c,
          `/api/products/${f.product.id}/review`,
          { rating: 5, comment: "ดี", mediaIds: [m.id] },
          "put",
        )
      ).status,
      200,
    );
    const publicFile = await request(f.app)
      .get(m.url)
      .set("Range", "bytes=0-9");
    assert.equal(publicFile.status, 206);
    assert.equal(publicFile.body.length, 10);
    assert.match(publicFile.headers["content-range"], /^bytes 0-9\//);
    assert.equal(
      (await request(f.app).get(m.url).set("Range", "bytes=9999999-")).status,
      416,
    );
    const r = f.db.prepare("SELECT * FROM reviews").get();
    assert.equal(
      (
        await mutate(
          c,
          "/api/admin/reviews/" + r.id,
          { visible: false, reason: "spam", version: 1 },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/reviews/" + r.id,
          { visible: false, reason: "ตรวจสอบ", version: 1 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await request(f.app).get(m.url)).status, 404);
    assert.equal((await c.agent.get(m.url)).status, 200);
    assert.equal(
      (await request(f.app).get(`/api/products/${f.product.id}/reviews`)).body
        .summary.count,
      0,
    );
    assert.equal(
      (
        await mutate(
          c,
          `/api/products/${f.product.id}/review`,
          { rating: 4, comment: "แก้ไข", mediaIds: [m.id], version: 2 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(f.db.prepare("SELECT visible FROM reviews").get().visible, 0);
  } finally {
    f.db.close();
  }
});
test("real video transcoding strips metadata, supports playback ranges and rejects forged and overlong videos", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer);
  completed(f);
  const dir = mkdtempSync(join(tmpdir(), "hiewly-video-test-")),
    short = join(dir, "short.mp4"),
    long = join(dir, "long.mp4"),
    tool = videoTools().ffmpeg;
  try {
    await run(
      tool,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=pink:s=160x120:r=24:d=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-metadata",
        "comment=private-metadata",
        "-y",
        short,
      ],
      { windowsHide: true },
    );
    const r = await reviewFile(
      c,
      f.product,
      readFileSync(short),
      "video.mp4",
      "video/mp4",
    );
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.mime, "video/mp4");
    assert.ok(r.body.duration <= 1.1);
    assert.equal(
      (await c.agent.get(r.body.url).set("Range", "bytes=0-63")).status,
      206,
    );
    assert.equal(
      (
        await reviewFile(
          c,
          f.product,
          Buffer.from("0000ftypbroken"),
          "bad.mp4",
          "video/mp4",
        )
      ).status,
      422,
    );
    await run(
      tool,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=white:s=32x32:r=1:d=61",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-y",
        long,
      ],
      { windowsHide: true },
    );
    assert.equal(
      (
        await reviewFile(
          c,
          f.product,
          readFileSync(long),
          "long.mp4",
          "video/mp4",
        )
      ).status,
      422,
    );
    const second = await reviewFile(
      c,
      f.product,
      readFileSync(short),
      "second.mp4",
      "video/mp4",
    );
    assert.equal(
      (
        await mutate(
          c,
          `/api/products/${f.product.id}/review`,
          { rating: 5, comment: "คลิป", mediaIds: [r.body.id, second.body.id] },
          "put",
        )
      ).status,
      400,
    );
  } finally {
    for (const file of [short, long])
      try {
        unlinkSync(file);
      } catch {}
    rmdirSync(dir);
    f.db.close();
  }
});
