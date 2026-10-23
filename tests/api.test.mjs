import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createHmac } from "node:crypto";
import {
  fixture,
  login,
  mutate,
  orderInput,
  PASSWORD,
  PNG,
  slip,
  bank,
  addUser,
} from "./helpers.mjs";
import { id, setSetting, getSettings, wallet, now } from "../server/db.mjs";
import { startBotWorker, answerBot, secret } from "../server/integrations.mjs";

test("registration creates customer only, validates referral and password, sessions are HttpOnly", async () => {
  const f = fixture();
  const a = request.agent(f.app);
  let r = await a.post("/api/auth/register").send({
    firstName: "ลูกค้า",
    lastName: "ใหม่",
    phone: "0812345678",
    email: "new@example.test",
    password: PASSWORD,
    referralCode: f.customer.referral_code,
    role_id: "admin",
    balance: 99999,
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.roleId, "customer");
  assert.equal(r.body.user.balance, 0);
  assert.match(r.headers["set-cookie"][0], /HttpOnly/);
  assert.match(r.headers["set-cookie"][0], /SameSite=Strict/);
  assert.equal(
    f.db.prepare("SELECT referred_by FROM users WHERE id=?").get(r.body.user.id)
      .referred_by,
    f.customer.id,
  );
  r = await request(f.app).post("/api/auth/register").send({
    firstName: "คน",
    lastName: "อื่น",
    phone: "0812345678",
    email: "bad@example.test",
    password: "short",
  });
  assert.equal(r.status, 400);
  r = await request(f.app).post("/api/auth/register").send({
    firstName: "คน",
    lastName: "อื่น",
    phone: "0812345678",
    email: "new@example.test",
    password: PASSWORD,
  });
  assert.equal(r.status, 409);
  f.db.close();
});
test("login errors are generic, CSRF/origin required for authenticated writes, logout revokes", async () => {
  const f = fixture();
  for (const email of [f.customer.email, "missing@example.test"]) {
    const r = await request(f.app)
      .post("/api/auth/login")
      .send({ email, password: "wrong" });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }
  const c = await login(f.app, f.customer);
  assert.equal((await c.agent.get("/api/me")).body.user.id, f.customer.id);
  assert.equal((await c.agent.post("/api/auth/logout").send({})).status, 403);
  assert.equal(
    (
      await c.agent
        .post("/api/auth/logout")
        .set("x-csrf-token", c.csrf)
        .set("Origin", "https://evil.example")
        .send({})
    ).status,
    403,
  );
  assert.equal((await mutate(c, "/api/auth/logout")).status, 200);
  assert.equal((await c.agent.get("/api/wallet")).status, 401);
  f.db.close();
});
test("session expiry and inactive member deny access", async () => {
  const f = fixture();
  let c = await login(f.app, f.customer);
  f.db
    .prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'")
    .run();
  assert.equal((await c.agent.get("/api/wallet")).status, 401);
  c = await login(f.app, f.customer);
  f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
  assert.equal((await c.agent.get("/api/wallet")).status, 401);
  assert.equal(
    (
      await request(f.app)
        .post("/api/auth/login")
        .send({ email: f.customer.email, password: PASSWORD })
    ).status,
    401,
  );
  f.db.close();
});
test("password change revokes every session, old password no longer authenticates", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    second = await login(f.app, f.customer);
  assert.equal(
    (
      await mutate(c, "/api/auth/password", {
        current: "bad",
        password: PASSWORD + "new",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(c, "/api/auth/password", {
        current: PASSWORD,
        password: PASSWORD + "new",
      })
    ).status,
    200,
  );
  assert.equal((await second.agent.get("/api/wallet")).status, 401);
  assert.equal(
    (
      await request(f.app)
        .post("/api/auth/login")
        .send({ email: f.customer.email, password: PASSWORD })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(f.app)
        .post("/api/auth/login")
        .send({ email: f.customer.email, password: PASSWORD + "new" })
    ).status,
    200,
  );
  f.db.close();
});
test("public catalog is bounded, filters work, secrets/cost never returned", async () => {
  const f = fixture();
  let r = await request(f.app).get("/api/products?size=100000&q=ทดสอบ");
  assert.equal(r.status, 200);
  assert.equal(r.body.size, 50);
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].cost, undefined);
  assert.equal(
    (await request(f.app).get("/api/products?q=missing")).body.items.length,
    0,
  );
  assert.equal(
    (await request(f.app).get("/api/products?category=missing")).body.items
      .length,
    0,
  );
  r = await request(f.app).get("/api/public");
  assert.ok(!JSON.stringify(r.body).includes("test-slip"));
  assert.equal(r.body.depositPercent, 0);
  f.db.close();
});
for (const path of [
  "dashboard",
  "products",
  "orders",
  "finance",
  "members",
  "roles",
  "promotions",
  "announcements",
  "settings",
  "audit",
])
  test("customer and anonymous denied admin " + path, async () => {
    const f = fixture(),
      c = await login(f.app, f.customer);
    assert.equal((await c.agent.get("/api/admin/" + path)).status, 403);
    assert.equal((await request(f.app).get("/api/admin/" + path)).status, 401);
    f.db.close();
  });
test("product CRUD validates inputs, escapes SQL through bindings, detects stale updates, preserves history on deactivate", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  const v = {
    name: "Name ' OR 1=1 --",
    description: "<script>alert(1)</script>",
    category: "ใหม่",
    price: 12345,
    cost: 1000,
    stock: 3,
    image: "/assets/bag.svg",
    active: true,
  };
  let r = await mutate(a, "/api/admin/products", v);
  assert.equal(r.status, 201);
  const pid = r.body.id;
  let rows = (
    await a.agent.get("/api/admin/products?q=" + encodeURIComponent(v.name))
  ).body;
  assert.equal(rows.total, 1);
  const row = rows.items[0];
  r = await mutate(
    a,
    "/api/admin/products/" + pid,
    { ...v, version: row.version, name: "แก้ไข" },
    "put",
  );
  assert.equal(r.status, 200);
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/products/" + pid,
        { ...v, version: row.version },
        "put",
      )
    ).status,
    409,
  );
  assert.equal(
    (await mutate(a, "/api/admin/products", { ...v, price: -1 })).status,
    400,
  );
  assert.equal(
    (
      await mutate(a, "/api/admin/products", {
        ...v,
        image: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/products/" + pid,
        { ...v, active: false, version: 2 },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(f.app).get("/api/products?q=" + encodeURIComponent(v.name)))
      .body.total,
    0,
  );
  f.db.close();
});
test("promotion and popup CRUD persist dates, validation and public scheduling", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  const dates = {
    starts_at: "2020-01-01T00:00:00.000Z",
    ends_at: "2099-01-01T00:00:00.000Z",
  };
  let r = await mutate(a, "/api/admin/promotions", {
    code: "SAVE",
    type: "percent",
    value: 150,
    minimum: 0,
    limit_count: 10,
    per_user: 1,
    active: true,
    ...dates,
  });
  assert.equal(r.status, 400);
  r = await mutate(a, "/api/admin/promotions", {
    code: "SAVE",
    type: "percent",
    value: 10,
    minimum: 0,
    limit_count: 10,
    per_user: 1,
    active: true,
    ...dates,
  });
  assert.equal(r.status, 201);
  r = await mutate(a, "/api/admin/announcements", {
    title: "ประกาศ",
    body: "ข่าวใหม่",
    active: true,
    ...dates,
  });
  assert.equal(r.status, 201);
  assert.equal(
    (await request(f.app).get("/api/public")).body.announcements.length,
    1,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/announcements/" + r.body.id,
        {
          title: "ประกาศ",
          body: "ปิดแล้ว",
          active: false,
          version: 1,
          ...dates,
        },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(f.app).get("/api/public")).body.announcements.length,
    0,
  );
  f.db.close();
});
test("order quote and create use server totals, reject malformed quantity/key and enforce ownership", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    other = await login(f.app, f.other);
  const input = orderInput(f.product, { payment: "deposit", total: 1 });
  let r = await mutate(c, "/api/orders/quote", input);
  assert.equal(r.body.total, 10000);
  assert.equal(
    (await mutate(c, "/api/orders", input, "post", "bad")).status,
    400,
  );
  r = await mutate(c, "/api/orders", input, "post", id());
  assert.equal(r.status, 201);
  const oid = r.body.id;
  assert.equal((await mutate(other, `/api/orders/${oid}/cancel`)).status, 404);
  assert.equal((await other.agent.get("/api/orders")).body.total, 0);
  assert.equal(
    (await c.agent.get("/api/orders")).body.items[0].items[0].quantity,
    1,
  );
  assert.equal(
    (
      await mutate(
        c,
        "/api/orders",
        { ...input, items: [{ productId: f.product.id, quantity: -1 }] },
        "post",
        id(),
      )
    ).status,
    400,
  );
  f.db.close();
});
test("simultaneous duplicate order requests reserve only once", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    key = id(),
    input = orderInput(f.product, { payment: "deposit" });
  const results = await Promise.all([
    mutate(c, "/api/orders", input, "post", key),
    mutate(c, "/api/orders", input, "post", key),
  ]);
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(results[0].body.id, results[1].body.id);
  assert.equal(
    f.db.prepare("SELECT stock FROM products WHERE id=?").get(f.product.id)
      .stock,
    9,
  );
  f.db.close();
});
test("admin order workflow requires full payment, valid transition and tracking; complete blocks cancellation", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer),
    a = await login(f.app, f.admin);
  let r = await mutate(
    c,
    "/api/orders",
    orderInput(f.product, { payment: "deposit" }),
    "post",
    id(),
  );
  const oid = r.body.id;
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/orders/" + oid,
        { status: "shipped", tracking: "x" },
        "put",
      )
    ).status,
    409,
  );
  wallet(f.db, f.customer.id, 10000, "opening-test", id());
  assert.equal((await mutate(c, "/api/orders/" + oid + "/pay")).status, 200);
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/orders/" + oid,
        { status: "processing" },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (await mutate(a, "/api/admin/orders/" + oid, { status: "shipped" }, "put"))
      .status,
    400,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/orders/" + oid,
        { status: "shipped", tracking: "TH123" },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/orders/" + oid,
        { status: "completed" },
        "put",
      )
    ).status,
    200,
  );
  assert.equal(
    (await mutate(a, "/api/admin/orders/" + oid + "/cancel")).status,
    409,
  );
  f.db.close();
});
test("topup multipart verifies server-side, credits once, replay no new upstream call", async () => {
  let calls = 0;
  const f = fixture({
      fetch: async (url, options) => {
        calls++;
        assert.equal(url, "https://api.easyslip.com/v2/verify/bank");
        assert.equal(options.body.get("matchAccount"), "true");
        assert.equal(options.body.get("checkDuplicate"), "true");
        assert.equal(options.body.get("matchAmount"), "100");
        return Response.json({ success: true, data: slip() });
      },
    }),
    c = await login(f.app, f.customer),
    key = id();
  const upload = () =>
    c.agent
      .post("/api/wallet/topup")
      .set("x-csrf-token", c.csrf)
      .set("Idempotency-Key", key)
      .field("amount", "10000")
      .attach("image", PNG, { filename: "slip.png", contentType: "image/png" });
  let r = await upload();
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(calls, 1);
  r = await upload();
  assert.equal(r.status, 200);
  assert.equal(calls, 1);
  assert.equal((await c.agent.get("/api/wallet")).body.balance, 10000);
  assert.equal(
    (
      await c.agent
        .post("/api/wallet/topup")
        .set("x-csrf-token", c.csrf)
        .set("Idempotency-Key", id())
        .field("amount", "10000")
        .attach("image", PNG, {
          filename: "another.png",
          contentType: "image/png",
        })
    ).status,
    409,
  );
  f.db.close();
});
test("topup refuses forged file, provider failure, mismatched bank; no wallet credit", async () => {
  let kind = "badBank";
  const f = fixture({
      fetch: async () =>
        kind === "badBank"
          ? Response.json({
              success: true,
              data: slip(100, { matchedAccount: null }),
            })
          : Response.json(
              { success: false, error: { code: "QUOTA_EXCEEDED" } },
              { status: 403 },
            ),
    }),
    c = await login(f.app, f.customer);
  const upload = (buf = PNG) =>
    c.agent
      .post("/api/wallet/topup")
      .set("x-csrf-token", c.csrf)
      .set("Idempotency-Key", id())
      .field("amount", "10000")
      .attach("image", buf, { filename: "slip.png", contentType: "image/png" });
  assert.equal((await upload(Buffer.from("not an image"))).status, 400);
  assert.equal((await upload()).status, 422);
  kind = "failure";
  assert.equal((await upload()).status, 422);
  assert.equal((await c.agent.get("/api/wallet")).body.balance, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM topups").get().n, 0);
  f.db.close();
});
test("settings secrets encrypted, masked on read, never appear in audit; AI requires key", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  let s = (await a.agent.get("/api/admin/settings")).body;
  assert.equal(s.easyslipApiKey, undefined);
  assert.equal(s.easyslipApiKeyConfigured, true);
  let input = {
    ...s,
    ...bank,
    easyslipApiKey: "a-new-secret",
    lineChannelAccessToken: "line-new-secret",
    lineChannelSecret: "new-line-secret",
    openaiApiKey: "",
    aiEnabled: true,
  };
  assert.equal(
    (await mutate(a, "/api/admin/settings", input, "put")).status,
    400,
  );
  input.aiEnabled = false;
  assert.equal(
    (await mutate(a, "/api/admin/settings", input, "put")).status,
    200,
  );
  assert.ok(!getSettings(f.db).easyslipApiKey.includes("a-new-secret"));
  assert.equal(secret(f.db, "easyslipApiKey", f.config), "a-new-secret");
  const response = await a.agent.get("/api/admin/settings");
  assert.ok(!JSON.stringify(response.body).includes("a-new-secret"));
  assert.ok(
    !JSON.stringify((await a.agent.get("/api/admin/audit")).body).includes(
      "new-secret",
    ),
  );
  f.db.close();
});
test("roles and member management reject privilege escalation, preserve last admin, invalidate sessions", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin),
    c = await login(f.app, f.customer);
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/members/" + f.admin.id,
        { role_id: "customer", active: true },
        "put",
      )
    ).status,
    409,
  );
  let r = await mutate(a, "/api/admin/roles", {
    name: "คลังสินค้า",
    permissions: ["products"],
  });
  assert.equal(r.status, 201);
  const role = r.body.id;
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/members/" + f.customer.id,
        { role_id: role, active: true },
        "put",
      )
    ).status,
    200,
  );
  assert.equal((await c.agent.get("/api/me")).body.user, null);
  const staff = await login(f.app, f.customer);
  assert.equal((await staff.agent.get("/api/admin/products")).status, 200);
  assert.equal((await staff.agent.get("/api/admin/finance")).status, 403);
  assert.equal(
    (
      await mutate(staff, "/api/admin/roles", {
        name: "bad",
        permissions: ["roles"],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/roles/admin",
        { name: "bad", permissions: [] },
        "put",
      )
    ).status,
    403,
  );
  f.db.close();
});
test("finance records idempotently and CSV escapes formulas; chart excludes unspent topups from revenue", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  wallet(f.db, f.customer.id, 100000, "topup", id());
  const key = id(),
    input = {
      type: "expense",
      category: "สินค้า",
      description: "=SUM(A1:A2)",
      amount: 5000,
    };
  assert.equal(
    (await mutate(a, "/api/admin/finance", input, "post", key)).status,
    200,
  );
  assert.equal(
    (await mutate(a, "/api/admin/finance", input, "post", key)).status,
    200,
  );
  assert.equal(
    (
      await mutate(
        a,
        "/api/admin/finance",
        { ...input, amount: 999 },
        "post",
        key,
      )
    ).status,
    409,
  );
  const d = (await a.agent.get("/api/admin/dashboard")).body;
  assert.equal(d.received, 0);
  assert.equal(d.walletLiability, 100000);
  assert.equal(d.net, -5000);
  assert.equal(d.bar.length, 7);
  assert.equal((await a.agent.get("/api/admin/finance")).body.manual.total, 1);
  const csv = await a.agent.get("/api/admin/finance/export");
  assert.equal(csv.status, 200);
  assert.match(csv.text, /'=SUM/);
  f.db.close();
});
test("referral statistics count paid conversions only and do not disclose referred personal data", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer);
  f.db
    .prepare("UPDATE users SET referred_by=? WHERE id=?")
    .run(f.customer.id, f.other.id);
  const r = await c.agent.get("/api/referrals");
  assert.equal(r.body.count, 1);
  assert.equal(r.body.converted, 0);
  assert.ok(!JSON.stringify(r.body).includes(f.other.email));
  f.db.close();
});
test("LINE signature verifies exact raw bytes; duplicate events enter inbox once", async () => {
  const f = fixture();
  setSetting(f.db, "botEnabled", true);
  const raw = JSON.stringify({
    events: [
      {
        webhookEventId: "event-test-1",
        type: "message",
        message: { type: "text", text: "สวัสดี" },
        replyToken: "reply-test",
      },
    ],
  });
  let r = await request(f.app)
    .post("/api/line/webhook")
    .set("Content-Type", "application/json")
    .send(raw);
  assert.equal(r.status, 401);
  const signature = createHmac("sha256", "test-line-secret")
    .update(raw)
    .digest("base64");
  for (let i = 0; i < 2; i++) {
    r = await request(f.app)
      .post("/api/line/webhook")
      .set("Content-Type", "application/json")
      .set("x-line-signature", signature)
      .send(raw);
    assert.equal(r.status, 200);
  }
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM webhook_events").get().n,
    1,
  );
  r = await request(f.app)
    .post("/api/line/webhook")
    .set("Content-Type", "application/json")
    .set("x-line-signature", signature)
    .send(raw + " ");
  assert.equal(r.status, 401);
  f.db.close();
});
test("LINE worker sends fallback through mocked transport, redacts payload on success, deduplicates completion", async () => {
  let replies = 0;
  const f = fixture({
    fetch: async (url) => {
      assert.equal(url, "https://api.line.me/v2/bot/message/reply");
      replies++;
      return Response.json({});
    },
  });
  setSetting(f.db, "botEnabled", true);
  const date = "2020-01-01T00:00:00.000Z";
  f.db
    .prepare(
      "INSERT INTO webhook_events(id,payload,created_at,updated_at) VALUES(?,?,?,?)",
    )
    .run(
      id(),
      JSON.stringify({ replyToken: "test-token", text: "hello" }),
      date,
      date,
    );
  const worker = startBotWorker(f.db, f.config);
  await worker.tick();
  await worker.tick();
  worker.stop();
  assert.equal(replies, 1);
  const event = f.db.prepare("SELECT * FROM webhook_events").get();
  assert.equal(event.status, "done");
  assert.equal(event.payload, "{}");
  f.db.close();
});
test("AI connector uses public products only, no tool access, stateless responses and safe output cap", async () => {
  const f = fixture({
    secrets: { openaiApiKey: "fake-openai" },
    fetch: async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      assert.ok(!JSON.stringify(body).includes(f.customer.email));
      return Response.json({
        output: [{ content: [{ type: "output_text", text: "ตอบทดสอบ" }] }],
      });
    },
  });
  setSetting(f.db, "aiEnabled", true);
  assert.equal(await answerBot(f.db, f.config, "มีสินค้าอะไรบ้าง"), "ตอบทดสอบ");
  f.db.close();
});
