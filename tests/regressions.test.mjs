import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  login,
  mutate,
  orderInput,
  addUser,
  slip,
  PNG,
} from "./helpers.mjs";
import { id, wallet, setSetting } from "../server/db.mjs";
import { startBotWorker } from "../server/integrations.mjs";

test("interrupted final LINE attempt becomes failed and is cleared on recovery", () => {
  const f = fixture();
  const event = id();
  f.db
    .prepare(
      "INSERT INTO webhook_events(id,payload,status,attempts,created_at,updated_at) VALUES(?,?,'processing',3,?,?)",
    )
    .run(
      event,
      JSON.stringify({ replyToken: "sensitive", text: "hello" }),
      "2020-01-01T00:00:00.000Z",
      "2020-01-01T00:00:00.000Z",
    );
  const worker = startBotWorker(f.db, f.config);
  worker.stop();
  const row = f.db
    .prepare("SELECT * FROM webhook_events WHERE id=?")
    .get(event);
  assert.equal(row.status, "failed");
  assert.equal(row.payload, "{}");
  assert.equal(
    f.db
      .prepare(
        "SELECT COUNT(*) n FROM audit WHERE action='bot.recovery_failed'",
      )
      .get().n,
    1,
  );
  f.db.close();
});
test("LINE retry budget is bounded, final failure clears message and token", async () => {
  const f = fixture({ fetch: async () => Response.json({}, { status: 500 }) });
  setSetting(f.db, "botEnabled", true);
  const event = id();
  f.db
    .prepare(
      "INSERT INTO webhook_events(id,payload,created_at,updated_at) VALUES(?,?,?,?)",
    )
    .run(
      event,
      JSON.stringify({ replyToken: "private-token", text: "hello" }),
      "2020-01-01T00:00:00.000Z",
      "2020-01-01T00:00:00.000Z",
    );
  const worker = startBotWorker(f.db, f.config);
  for (let i = 0; i < 3; i++) {
    f.db
      .prepare(
        "UPDATE webhook_events SET updated_at='2020-01-01T00:00:00.000Z' WHERE id=?",
      )
      .run(event);
    await worker.tick();
  }
  worker.stop();
  const row = f.db
    .prepare("SELECT * FROM webhook_events WHERE id=?")
    .get(event);
  assert.equal(row.attempts, 3);
  assert.equal(row.status, "failed");
  assert.equal(row.payload, "{}");
  f.db.close();
});

test("changed quote requires new confirmation, cannot silently debit a higher amount", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer);
  wallet(f.db, f.customer.id, 100000, "opening-test", id());
  const input = orderInput(f.product);
  const q = (await mutate(c, "/api/orders/quote", input)).body;
  assert.equal(q.items[0].cost, undefined);
  input.expectedQuote = q.fingerprint;
  f.db.prepare("UPDATE products SET price=20000 WHERE id=?").run(f.product.id);
  let r = await mutate(c, "/api/orders", input, "post", id());
  assert.equal(r.status, 409);
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    100000,
  );
  assert.equal(
    f.db.prepare("SELECT stock FROM products WHERE id=?").get(f.product.id)
      .stock,
    10,
  );
  const updated = (await mutate(c, "/api/orders/quote", input)).body;
  input.expectedQuote = updated.fingerprint;
  r = await mutate(c, "/api/orders", input, "post", id());
  assert.equal(r.status, 201);
  assert.equal(r.body.paid, 20000);
  const orders = (await c.agent.get("/api/orders")).body;
  assert.equal(orders.items[0].items[0].cost, undefined);
  f.db.close();
});
test("changed deposit setting requires reconfirmation before charging even a small amount", async () => {
  const f = fixture(),
    c = await login(f.app, f.customer);
  const input = orderInput(f.product, { payment: "deposit" });
  input.expectedQuote = (
    await mutate(c, "/api/orders/quote", input)
  ).body.fingerprint;
  setSetting(f.db, "depositPercent", 20);
  assert.equal(
    (await mutate(c, "/api/orders", input, "post", id())).status,
    409,
  );
  f.db.close();
});
test("roles-only staff can read roles but cannot change them", async () => {
  const f = fixture();
  const role = id();
  f.db
    .prepare("INSERT INTO roles VALUES(?,?,?)")
    .run(role, "ดูบทบาท", '["roles"]');
  f.db
    .prepare("UPDATE users SET role_id=? WHERE id=?")
    .run(role, f.customer.id);
  const c = await login(f.app, f.customer);
  assert.equal((await c.agent.get("/api/admin/roles")).status, 200);
  assert.equal(
    (
      await mutate(c, "/api/admin/roles", {
        name: "เพิ่มสิทธิ์",
        permissions: ["settings"],
      })
    ).status,
    403,
  );
  f.db.close();
});
test("finance lists paginate independently, out-of-range pages clamp to real data", async () => {
  const f = fixture(),
    a = await login(f.app, f.admin);
  await mutate(
    a,
    "/api/admin/finance",
    {
      type: "expense",
      category: "ทดสอบ",
      description: "หนึ่งรายการ",
      amount: 100,
    },
    "post",
    id(),
  );
  for (let i = 0; i < 14; i++)
    wallet(f.db, f.customer.id, 10, "opening-test", id());
  const r = await a.agent.get("/api/admin/finance?ledgerPage=2&manualPage=1");
  assert.equal(r.body.manual.page, 1);
  assert.equal(r.body.manual.items.length, 1);
  assert.equal(r.body.ledger.page, 2);
  assert.equal(r.body.ledger.items.length, 2);
  const out = await a.agent.get("/api/admin/finance?manualPage=999");
  assert.equal(out.body.manual.page, 1);
  assert.equal(out.body.manual.items.length, 1);
  f.db.close();
});
test("simultaneous slip requests never double credit even with two valid upstream responses", async () => {
  const valid = slip();
  let calls = 0;
  const f = fixture({
      fetch: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 5));
        return Response.json({ success: true, data: valid });
      },
    }),
    c = await login(f.app, f.customer);
  const upload = () =>
    c.agent
      .post("/api/wallet/topup")
      .set("x-csrf-token", c.csrf)
      .set("Idempotency-Key", id())
      .field("amount", "10000")
      .attach("image", PNG, { filename: "slip.png", contentType: "image/png" });
  const rows = await Promise.all([upload(), upload()]);
  assert.ok(rows.some((r) => r.status === 200));
  assert.ok(rows.some((r) => r.status === 409));
  assert.equal(
    f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
      .balance,
    10000,
  );
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM topups").get().n, 1);
  assert.equal(calls, 2);
  f.db.close();
});
