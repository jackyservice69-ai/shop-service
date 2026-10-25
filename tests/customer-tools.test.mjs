import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import QRCode from "qrcode";
import { fixture, login, mutate, orderInput, bank } from "./helpers.mjs";
import { id, verifyAudit } from "../server/db.mjs";
import { parsePaymentPayload } from "../server/payment-qr.mjs";
import {
  paymentPayload,
  branchAccounts,
  accountResponse,
} from "./payment-data.mjs";
const address = {
  label: "บ้าน",
  name: "ผู้รับ ทดสอบ",
  phone: "0812345678",
  address: "123 ถนนทดสอบ กรุงเทพฯ 10110",
  latitude: 13.75,
  longitude: 100.5,
  isDefault: false,
};
const upload = async (a, payload) =>
  a.agent
    .post("/api/admin/media/paymentQr")
    .set("x-csrf-token", a.csrf)
    .attach(
      "image",
      await QRCode.toBuffer(payload, { width: 400, margin: 4 }),
      { filename: "qr.png", contentType: "image/png" },
    );

test("addresses enforce ownership and CSRF; default is unique, stale edits fail and deletion picks a replacement", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    other = await login(f.app, f.other);
  try {
    assert.equal((await request(f.app).get("/api/addresses")).status, 401);
    assert.equal(
      (await c.agent.post("/api/addresses").send(address)).status,
      403,
    );
    const a = await mutate(c, "/api/addresses", address),
      b = await mutate(c, "/api/addresses", { ...address, label: "ที่ทำงาน" });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    let items = (await c.agent.get("/api/addresses")).body.items;
    assert.equal(items.filter((a) => a.is_default).length, 1);
    assert.equal(
      (await other.agent.get("/api/addresses")).body.items.length,
      0,
    );
    for (const method of ["put", "delete"])
      assert.equal(
        (
          await mutate(
            other,
            "/api/addresses/" + a.body.id,
            { ...address, version: 1 },
            method,
          )
        ).status,
        404,
      );
    const second = items.find((x) => x.id === b.body.id);
    assert.equal(
      (
        await mutate(
          c,
          "/api/addresses/" + second.id,
          { ...second, isDefault: true },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/addresses/" + a.body.id,
          { ...address, version: 1 },
          "put",
        )
      ).status,
      409,
    );
    items = (await c.agent.get("/api/addresses")).body.items;
    assert.equal(items[0].id, b.body.id);
    assert.equal(items[0].is_default, 1);
    assert.equal(
      (
        await mutate(
          c,
          "/api/addresses/" + items[0].id,
          { version: items[0].version },
          "delete",
        )
      ).status,
      200,
    );
    items = (await c.agent.get("/api/addresses")).body.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].is_default, 1);
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});
test("addresses validate coordinate pairs, ranges, recipient fields and 20-address limit without partial writes", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer);
  try {
    for (const patch of [
      { latitude: 91 },
      { longitude: -181 },
      { latitude: null },
      { name: "x" },
      { phone: "abc" },
      { address: "short" },
    ])
      assert.equal(
        (await mutate(c, "/api/addresses", { ...address, ...patch })).status,
        400,
      );
    assert.equal((await c.agent.get("/api/addresses")).body.items.length, 0);
    for (let i = 0; i < 20; i++)
      assert.equal(
        (await mutate(c, "/api/addresses", { ...address, label: "บ้าน " + i }))
          .status,
        201,
      );
    assert.equal((await mutate(c, "/api/addresses", address)).status, 409);
  } finally {
    f.db.close();
  }
});
test("order shipping stores a coordinate snapshot independently from later address edits and deletion", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer);
  try {
    const a = await mutate(c, "/api/addresses", address);
    const order = await mutate(
      c,
      "/api/orders",
      orderInput(f.product, { payment: "deposit", shipping: { ...address } }),
      "post",
      id(),
    );
    assert.equal(order.status, 201);
    await mutate(
      c,
      "/api/addresses/" + a.body.id,
      { ...address, latitude: 14, version: 1 },
      "put",
    );
    const row = (await c.agent.get("/api/addresses")).body.items[0];
    await mutate(
      c,
      "/api/addresses/" + row.id,
      { version: row.version },
      "delete",
    );
    const saved = JSON.parse(
      f.db.prepare("SELECT shipping FROM orders WHERE id=?").get(order.body.id)
        .shipping,
    );
    assert.equal(saved.latitude, 13.75);
    assert.equal(saved.longitude, 100.5);
    assert.equal(saved.address, address.address);
    assert.equal(
      (
        await mutate(
          c,
          "/api/orders",
          orderInput(f.product, {
            payment: "deposit",
            shipping: { ...address, longitude: 999 },
          }),
          "post",
          id(),
        )
      ).status,
      400,
    );
  } finally {
    f.db.close();
  }
});
test("payment QR rejects nonpayment data, modified checksum, fixed amounts and mismatched or unlinked Branch accounts", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  try {
    for (const payload of [
      "not-a-payment",
      paymentPayload().slice(0, -1) + "X",
      paymentPayload(undefined, { 54: "100.00" }),
      paymentPayload("9876543210123"),
    ])
      assert.equal((await upload(a, payload)).status, 422);
    const accounts = branchAccounts(bank);
    for (const rows of [
      [],
      accounts.slice(0, 1),
      accounts.slice(1),
      accounts.map((x) => ({ ...x, nameTh: "คนอื่น" })),
    ]) {
      f.config.fetch = async () => accountResponse(rows);
      assert.equal((await upload(a, paymentPayload())).status, 422);
    }
    f.config.fetch = async () =>
      Response.json(
        { success: false, error: { code: "OUTAGE" } },
        { status: 503 },
      );
    assert.equal((await upload(a, paymentPayload())).status, 502);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM media WHERE kind='paymentQr'").get()
        .n,
      0,
    );
  } finally {
    f.db.close();
  }
});
test("saving QR rechecks Branch linkage and clearing API credentials invalidates the QR", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  try {
    const uploaded = await upload(a, paymentPayload());
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.verified, true);
    let s = (await a.agent.get("/api/admin/settings")).body;
    f.config.fetch = async () => accountResponse([]);
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/settings",
          { ...s, paymentQr: uploaded.body.url },
          "put",
        )
      ).status,
      422,
    );
    f.config.fetch = async () => accountResponse(branchAccounts(bank));
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/settings",
          { ...s, paymentQr: uploaded.body.url },
          "put",
        )
      ).status,
      200,
    );
    s = (await a.agent.get("/api/admin/settings")).body;
    const result = await mutate(
      a,
      "/api/admin/settings",
      { ...s, easyslipApiKey: "replacement-test-key" },
      "put",
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.paymentQrCleared, true);
    assert.equal((await request(f.app).get("/api/public")).body.paymentQr, "");
  } finally {
    f.db.close();
  }
});
test("QR parser supports phone format and refuses duplicate TLV tags and unknown recipient schemes", () => {
  assert.equal(
    parsePaymentPayload(paymentPayload("0812345678")).identifier,
    "0812345678",
  );
  assert.throws(
    () => parsePaymentPayload(paymentPayload(undefined, { "01": "12" })),
    /ไม่ระบุยอด/,
  );
  assert.throws(
    () =>
      parsePaymentPayload(
        paymentPayload(undefined, {
          29: "0016A00000067701011202131234567890123",
        }),
      ),
    /รองรับ/,
  );
});

test("production authentication still limits attempts to 20 despite a test-only override", async () => {
  const f = fixture({ production: true, authRateLimit: 100 });
  try {
    for (let i = 0; i < 20; i++)
      assert.equal(
        (
          await request(f.app)
            .post("/api/auth/login")
            .send({ email: "no-such@example.test", password: "wrong-password" })
        ).status,
        401,
      );
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: "no-such@example.test", password: "wrong-password" })
      ).status,
      429,
    );
  } finally {
    f.db.close();
  }
});
test("social settings accept only exact platform HTTPS hosts and publish configured links without secrets", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer);
  try {
    const s = (await a.agent.get("/api/admin/settings")).body;
    for (const link of [
      "javascript:alert(1)",
      "http://line.me/a",
      "https://line.me.evil.test/a",
      "https://user:pass@line.me/a",
      "https://evil.test/",
    ])
      assert.equal(
        (
          await mutate(
            a,
            "/api/admin/settings",
            { ...s, socials: { line: link } },
            "put",
          )
        ).status,
        400,
      );
    const socials = {
      line: "https://lin.ee/example",
      facebook: "https://www.facebook.com/example",
      telegram: "https://t.me/example",
      tiktok: "https://www.tiktok.com/@example",
      instagram: "https://www.instagram.com/example",
      shopee: "https://shopee.co.th/iya-test",
    };
    for (const link of [
      "http://shopee.co.th/iya",
      "https://shopee.co.th.evil.test/iya",
      "https://user:pass@shopee.co.th/iya",
    ]) {
      assert.equal(
        (
          await mutate(
            a,
            "/api/admin/settings",
            { ...s, socials: { shopee: link } },
            "put",
          )
        ).status,
        400,
      );
    }
    assert.equal(
      (await mutate(c, "/api/admin/settings", { ...s, socials }, "put")).status,
      403,
    );
    assert.equal(
      (await mutate(a, "/api/admin/settings", { ...s, socials }, "put")).status,
      200,
    );
    const pub = (await request(f.app).get("/api/public")).body;
    assert.deepEqual(pub.socials, socials);
    assert.equal(pub.easyslipApiKey, undefined);
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/settings",
          {
            ...s,
            socials,
            socialVisibility: { line: false, facebook: false, shopee: false },
          },
          "put",
        )
      ).status,
      200,
    );
    const hidden = (await request(f.app).get("/api/public")).body;
    assert.equal(hidden.socials.line, undefined);
    assert.equal(hidden.socials.facebook, undefined);
    assert.equal(hidden.socials.shopee, undefined);
    assert.equal(hidden.socials.telegram, socials.telegram);
    const saved = (await a.agent.get("/api/admin/settings")).body;
    assert.deepEqual(saved.socials, socials);
    assert.equal(saved.botEnabled, s.botEnabled);
    assert.equal(saved.lineLoginEnabled, s.lineLoginEnabled);
    const { socialVisibility, ...legacy } = saved;
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/settings",
          { ...legacy, socialVisibility: { line: true } },
          "put",
        )
      ).status,
      200,
    );
    let current = (await a.agent.get("/api/admin/settings")).body;
    assert.equal(current.socialVisibility.line, true);
    assert.equal(current.socialVisibility.facebook, false);
    assert.equal(
      (await mutate(a, "/api/admin/settings", legacy, "put")).status,
      200,
    );
    assert.equal(
      (await a.agent.get("/api/admin/settings")).body.socialVisibility.facebook,
      false,
    );
    for (const value of [{ line: "false" }, { unknown: true }, { line: 0 }]) {
      assert.equal(
        (
          await mutate(
            a,
            "/api/admin/settings",
            { ...legacy, socialVisibility: value },
            "put",
          )
        ).status,
        400,
      );
    }
    current = (await a.agent.get("/api/admin/settings")).body;
    assert.deepEqual(current.socials, socials);
    assert.equal(current.socialVisibility.facebook, false);
    assert.equal(
      (
        await mutate(
          c,
          "/api/admin/settings",
          { ...legacy, socialVisibility: { line: false } },
          "put",
        )
      ).status,
      403,
    );
  } finally {
    f.db.close();
  }
});
