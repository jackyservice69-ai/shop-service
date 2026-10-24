import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createHmac } from "node:crypto";
import { fixture, slip, PNG, bank, login, mutate } from "./helpers.mjs";
import { id, now, hash, setSetting, verifyAudit } from "../server/db.mjs";
import { startBotWorker, queueWebhook } from "../server/integrations.mjs";
import { creditTopup } from "../server/commerce.mjs";
import { LINE_ID, LINE_CHANNEL } from "./line-provider.mjs";
function setup() {
  const calls = [],
    replies = [];
  const f = fixture();
  let verified = slip(125.5),
    responseStatus = 200,
    image = PNG,
    beforeVerify = () => {},
    oversized = false;
  f.config.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes("api-data.line.me/"))
      return new Response(image, {
        headers: {
          "content-type": "image/png",
          ...(oversized ? { "content-length": String(5 * 1024 * 1024) } : {}),
        },
      });
    if (String(url).includes("api.easyslip.com")) {
      assert.equal(options.body.has("matchAmount"), false);
      assert.equal(options.body.get("matchAccount"), "true");
      assert.equal(options.body.get("checkDuplicate"), "true");
      beforeVerify();
      return Response.json({ success: true, data: verified });
    }
    if (String(url).includes("api.line.me/v2/bot/message/reply")) {
      replies.push(JSON.parse(options.body));
      return Response.json({}, { status: responseStatus });
    }
    throw new Error(
      "External transport forbidden; image must never reach OpenAI",
    );
  };
  for (const [key, value] of Object.entries({
    botEnabled: true,
    lineLoginEnabled: true,
    lineLoginChannelId: LINE_CHANNEL,
    lineTopupEnabled: true,
    aiEnabled: true,
  }))
    setSetting(f.db, key, value);
  f.config.secrets.lineLoginChannelSecret = "test-login";
  f.db
    .prepare("INSERT INTO line_identities VALUES(?,?,?,?,?,?)")
    .run(LINE_ID, f.customer.id, LINE_CHANNEL, "สมาชิกทดสอบ", id(), now());
  const worker = startBotWorker(f.db, f.config);
  worker.stop();
  return {
    ...f,
    worker,
    calls,
    replies,
    setSlip(value) {
      verified = value;
    },
    setReplyStatus(value) {
      responseStatus = value;
    },
    setImage(value) {
      image = value;
    },
    setBeforeVerify(value) {
      beforeVerify = value;
    },
    oversize() {
      oversized = true;
    },
  };
}
const event = (extra = {}) => ({
  type: "message",
  webhookEventId: id(),
  replyToken: "test-reply",
  source: { type: "user", userId: LINE_ID },
  message: { type: "image", id: "12345", contentProvider: { type: "line" } },
  ...extra,
});
async function process(f, e = event()) {
  queueWebhook(f.db, { events: [e] });
  f.db
    .prepare("UPDATE webhook_events SET updated_at='2000-01-01' WHERE id=?")
    .run(e.webhookEventId);
  await f.worker.tick();
  return e;
}
const balance = (f) =>
  f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
    .balance;

test("signed LINE slip credits only linked customer from verified amount and records atomic provenance/audit", async () => {
  const f = setup();
  try {
    const e = event(),
      raw = JSON.stringify({ events: [e] });
    const send = (signature) =>
      request(f.app)
        .post("/api/line/webhook")
        .set("Content-Type", "application/json")
        .set("x-line-signature", signature)
        .send(raw);
    assert.equal((await send("invalid")).status, 401);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM webhook_events").get().n,
      0,
    );
    assert.equal(
      (
        await send(
          createHmac("sha256", "test-line-secret").update(raw).digest("base64"),
        )
      ).status,
      200,
    );
    f.setSlip({ ...slip(125.5), isAmountMatched: undefined });
    f.db.prepare("UPDATE webhook_events SET updated_at='2000-01-01'").run();
    await f.worker.tick();
    assert.equal(balance(f), 12550);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM line_topups").get().n, 1);
    assert.equal(f.db.prepare("SELECT kind FROM ledger").get().kind, "topup");
    const row = f.db.prepare("SELECT * FROM webhook_events").get();
    assert.equal(row.status, "done");
    assert.equal(row.payload, "{}");
    assert.match(f.replies[0].messages[0].text, /125.50/);
    assert.ok(verifyAudit(f.db).valid);
    assert.ok(
      !JSON.stringify(f.db.prepare("SELECT details FROM audit").all()).includes(
        LINE_ID,
      ),
    );
  } finally {
    f.db.close();
  }
});

test("unlinked, typed LINE ID, group chats and noncustomer accounts cannot trigger content fetch or credit", async () => {
  for (const mode of ["unlinked", "group", "disabled", "staff", "forced"]) {
    const f = setup();
    try {
      let e = event();
      if (mode === "unlinked") {
        f.db.prepare("DELETE FROM line_identities").run();
        f.db
          .prepare("UPDATE users SET line_id=? WHERE id=?")
          .run(LINE_ID, f.customer.id);
      }
      if (mode === "group")
        e.source = { type: "group", userId: LINE_ID, groupId: "private-group" };
      if (mode === "disabled")
        f.db.prepare("UPDATE users SET active=0 WHERE id=?").run(f.customer.id);
      if (mode === "staff")
        f.db
          .prepare("UPDATE users SET role_id='admin' WHERE id=?")
          .run(f.customer.id);
      if (mode === "forced")
        f.db
          .prepare("UPDATE users SET must_change_password=1 WHERE id=?")
          .run(f.customer.id);
      await process(f, e);
      assert.equal(balance(f), 0);
      assert.equal(
        f.calls.filter(
          (url) => url.includes("api-data") || url.includes("easyslip"),
        ).length,
        0,
      );
    } finally {
      f.db.close();
    }
  }
});

test("LINE invalid receiver/name/currency/date/amount/duplicate and oversized/nonimage content never credit", async () => {
  const base = slip(125.5);
  const cases = [
    { ...base, isDuplicate: true },
    {
      ...base,
      matchedAccount: { ...base.matchedAccount, bankNumber: "wrong" },
    },
    {
      ...base,
      matchedAccount: {
        ...base.matchedAccount,
        nameTh: "other",
        nameEn: "other",
      },
    },
    { ...base, isAmountMatched: false },
    { ...base, amountInSlip: 126 },
    { ...base, amountInSlip: 0 },
    { ...base, amountInSlip: 1000001 },
    { ...base, rawSlip: { ...base.rawSlip, date: "2000-01-01" } },
    {
      ...base,
      rawSlip: {
        ...base.rawSlip,
        amount: { ...base.rawSlip.amount, local: { currency: "USD" } },
      },
    },
  ];
  for (const verified of cases) {
    const f = setup();
    try {
      f.setSlip(verified);
      await process(f);
      assert.equal(balance(f), 0);
      assert.equal(
        f.db.prepare("SELECT COUNT(*) n FROM funding_receipts").get().n,
        0,
      );
    } finally {
      f.db.close();
    }
  }
  for (const mode of ["large", "text"]) {
    const f = setup();
    try {
      if (mode === "large") f.oversize();
      else f.setImage(Buffer.from("not a picture"));
      await process(f);
      assert.equal(balance(f), 0);
      assert.equal(f.calls.filter((url) => url.includes("easyslip")).length, 0);
    } finally {
      f.db.close();
    }
  }
});

test("reply retries and worker restart do not reverify or credit twice; inbox replay is ignored", async () => {
  const f = setup();
  try {
    f.setReplyStatus(500);
    const e = await process(f);
    assert.equal(balance(f), 12550);
    queueWebhook(f.db, { events: [e] });
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM webhook_events").get().n,
      1,
    );
    const restarted = startBotWorker(f.db, f.config);
    restarted.stop();
    f.setReplyStatus(200);
    f.db.prepare("UPDATE webhook_events SET updated_at='2000-01-01'").run();
    await restarted.tick();
    assert.equal(balance(f), 12550);
    assert.equal(f.calls.filter((url) => url.includes("easyslip")).length, 1);
    assert.equal(
      f.db.prepare("SELECT status FROM webhook_events").get().status,
      "done",
    );
  } finally {
    f.db.close();
  }
});

test("same slip across LINE/web/manual shares one funding receipt; duplicate image never reaches provider", async () => {
  const f = setup();
  try {
    const data = slip(125.5);
    f.setSlip(data);
    await process(f);
    assert.throws(
      () =>
        creditTopup(
          f.db,
          f.other.id,
          id(),
          hash("different crop"),
          12550,
          data,
          bank,
        ),
      /เติมเงินแล้ว|เติมเงิน/,
    );
    await process(f);
    assert.equal(balance(f), 12550);
    assert.equal(f.calls.filter((url) => url.includes("easyslip")).length, 1);
    const admin = await login(f.app, f.admin);
    const denied = await mutate(
      admin,
      "/api/admin/wallet/topups",
      {
        userId: f.other.id,
        amount: 12550,
        expectedBalance: 0,
        source: "bank_transfer",
        reference: data.rawSlip.transRef,
        senderBankCode: data.rawSlip.sender.bank.id,
        reason: "ตรวจสลิปเข้าร้าน",
        actorPassword: "Test-strong-password-2026!",
      },
      "post",
      id(),
    );
    assert.equal(denied.status, 409);
  } finally {
    f.db.close();
  }
});

test("binding/config changes during verification roll back; queue cannot gain identity after receipt; per-user slip rate bounded", async () => {
  for (const mode of ["binding", "bank", "disabled"]) {
    const f = setup();
    try {
      f.setBeforeVerify(() => {
        if (mode === "binding")
          f.db.prepare("UPDATE line_identities SET binding_id=?").run(id());
        if (mode === "bank") setSetting(f.db, "bankNumber", "9999999999");
        if (mode === "disabled") setSetting(f.db, "lineTopupEnabled", false);
      });
      await process(f);
      assert.equal(balance(f), 0);
      assert.equal(
        f.db.prepare("SELECT COUNT(*) n FROM line_topups").get().n,
        0,
      );
    } finally {
      f.db.close();
    }
  }
  const f = setup();
  try {
    for (let i = 0; i < 7; i++) queueWebhook(f.db, { events: [event()] });
    const last = f.db
      .prepare("SELECT payload FROM webhook_events ORDER BY rowid DESC LIMIT 1")
      .get();
    assert.equal(JSON.parse(last.payload).rateLimited, true);
    const snap = f.db.prepare("SELECT * FROM line_identities").get();
    f.db.prepare("DELETE FROM line_identities").run();
    const unlinked = event();
    queueWebhook(f.db, { events: [unlinked] });
    f.db
      .prepare("INSERT INTO line_identities VALUES(?,?,?,?,?,?)")
      .run(
        snap.subject,
        snap.user_id,
        snap.channel_id,
        snap.display_name,
        snap.binding_id,
        snap.created_at,
      );
    f.db
      .prepare("UPDATE webhook_events SET status='done' WHERE id!=?")
      .run(unlinked.webhookEventId);
    f.db
      .prepare("UPDATE webhook_events SET updated_at='2000-01-01' WHERE id=?")
      .run(unlinked.webhookEventId);
    await f.worker.tick();
    assert.equal(balance(f), 0);
    assert.equal(f.calls.filter((url) => url.includes("easyslip")).length, 0);
  } finally {
    f.db.close();
  }
});
