import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
import { createHmac } from "node:crypto";
import { fixture, bank } from "./helpers.mjs";
import {
  getSettings,
  setSetting,
  hash,
  id,
  verifyAudit,
} from "../server/db.mjs";
import { receivingAccountKey } from "../server/receiving-policy.mjs";
import { startBotWorker } from "../server/integrations.mjs";
import {
  bankAccountMessages,
  currentBankCard,
  getBankCard,
  isBankAccountRequest,
} from "../server/line-bank-card.mjs";

const original = await sharp({
  create: { width: 1080, height: 720, channels: 3, background: "white" },
})
  .png()
  .toBuffer();
const preview = await sharp(original).resize(540).png().toBuffer();
function setup(extra = {}) {
  const f = fixture({
    origin: "https://shop.example.test",
    bankCardRenderer: async () => ({ original, preview }),
    ...extra,
  });
  return f;
}

test("bank-account requests recognize Thai/English phrases without capturing normal shopping or slip messages", () => {
  for (const phrase of [
    "ขอบัญชีค่ะ",
    "ขอเลขบัญชีหน่อยครับ",
    "ขอเลขที่บัญชีหน่อยครับ",
    "ขอชื่อบัญชี",
    "ขอ บช",
    "บัญชีร้านอะไร",
    "โอนเงินที่ไหน",
    "ขอ QR",
    "ขอรูปคิวอาร์",
    "Bank details please",
    "bank account",
  ])
    assert.ok(isBankAccountRequest(phrase), phrase);
  for (const phrase of [
    "สวัสดีค่ะ",
    "สินค้านี้มีไหม",
    "ส่งสลิปแล้วค่ะ",
    "ตรวจสอบยอดเงิน",
    "ขอเปลี่ยนที่อยู่",
  ])
    assert.equal(isBankAccountRequest(phrase), false, phrase);
});

test("anonymous LINE image URLs return only PNGs and share one concurrent render; bank edits invalidate old URLs", async () => {
  let renders = 0;
  const f = setup({
    bankCardRenderer: async () => {
      renders++;
      return { original, preview };
    },
  });
  try {
    const [a, b] = await Promise.all([
      bankAccountMessages(f.db, f.config),
      bankAccountMessages(f.db, f.config),
    ]);
    assert.equal(renders, 1);
    assert.deepEqual(a, b);
    assert.equal(a[1].type, "image");
    for (const [key, expected] of [
      ["originalContentUrl", original],
      ["previewImageUrl", preview],
    ]) {
      const url = new URL(a[1][key]);
      assert.equal(url.origin, f.config.origin);
      const res = await request(f.app).get(url.pathname);
      assert.equal(res.status, 200);
      assert.match(res.headers["content-type"], /image\/png/);
      assert.equal(res.headers["cache-control"], "no-store");
      assert.deepEqual(res.body, expected);
    }
    const invalid = await request(f.app).get(
      new URL(a[1].originalContentUrl).pathname.replace(
        "original.png",
        "secret.json",
      ),
    );
    assert.equal(invalid.status, 404);
    setSetting(f.db, "bankNumber", "9876543210");
    assert.equal(
      (await request(f.app).get(new URL(a[1].originalContentUrl).pathname))
        .status,
      404,
    );
    const next = await bankAccountMessages(f.db, f.config);
    assert.notEqual(next[1].originalContentUrl, a[1].originalContentUrl);
    assert.equal(renders, 2);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
  } finally {
    f.db.close();
  }
});

test("only current verified QR enters the bank image; replacing QR or EasySlip credentials invalidates it", () => {
  const f = setup();
  try {
    setSetting(f.db, "paymentQr", "/api/media/test-qr");
    assert.equal(currentBankCard(f.db, f.config).data.paymentQr, "");
    setSetting(
      f.db,
      "paymentQrReceiver",
      receivingAccountKey(getSettings(f.db)),
    );
    setSetting(f.db, "paymentQrVerification", {
      version: 1,
      url: "/api/media/test-qr",
      credentialHash: hash("test-slip"),
      frame: { x: 1, y: 2, width: 20, height: 20 },
    });
    const current = currentBankCard(f.db, f.config);
    assert.equal(current.data.paymentQr, "/api/media/test-qr");
    assert.equal(
      JSON.stringify(current.data).includes(f.customer.email),
      false,
    );
    assert.equal(JSON.stringify(current.data).includes("test-slip"), false);
    f.config.secrets.easyslipApiKey = "changed-credential";
    assert.equal(currentBankCard(f.db, f.config).data.paymentQr, "");
    assert.notEqual(
      currentBankCard(f.db, f.config).fingerprint,
      current.fingerprint,
    );
    f.config.secrets.easyslipApiKey = "test-slip";
    setSetting(f.db, "paymentQr", "/api/media/new-qr");
    assert.equal(currentBankCard(f.db, f.config).data.paymentQr, "");
  } finally {
    f.db.close();
  }
});

test("settings changed during capture are rejected and the next attempt regenerates fresh data", async () => {
  const f = setup();
  try {
    f.config.bankCardRenderer = async () => {
      setSetting(f.db, "accountName", "ชื่อผู้รับใหม่");
      return { original, preview };
    };
    await assert.rejects(getBankCard(f.db, f.config), { status: 409 });
    f.config.bankCardRenderer = async () => ({ original, preview });
    const next = await getBankCard(f.db, f.config);
    assert.equal(next.data.accountName, "ชื่อผู้รับใหม่");
  } finally {
    f.db.close();
  }
});

test("capture failure falls back to current account text, audits failure and can recover", async () => {
  const f = setup({
    bankCardRenderer: async () => {
      throw new Error("browser unavailable");
    },
  });
  try {
    const messages = await bankAccountMessages(f.db, f.config);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].text.includes(bank.bankNumber));
    assert.equal(
      f.db
        .prepare(
          "SELECT COUNT(*) n FROM audit WHERE action='bot.bank_card_failed'",
        )
        .get().n,
      1,
    );
    f.config.bankCardRenderer = async () => ({ original, preview });
    assert.equal((await bankAccountMessages(f.db, f.config))[1].type, "image");
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});

test("unconfigured bank and local HTTP development return text instead of invalid LINE images", async () => {
  const f = setup();
  try {
    setSetting(f.db, "bankNumber", "");
    assert.match(
      (await bankAccountMessages(f.db, f.config))[0].text,
      /ติดต่อเจ้าหน้าที่/,
    );
    setSetting(f.db, "bankNumber", bank.bankNumber);
    f.config.origin = "http://127.0.0.1:4319";
    f.config.bankCardRenderer = async () => {
      throw new Error("must not render on HTTP");
    };
    const messages = await bankAccountMessages(f.db, f.config);
    assert.equal(messages.length, 1);
    assert.ok(messages[0].text.includes(bank.bankNumber));
  } finally {
    f.db.close();
  }
});

test("signed account requests send text plus image through LINE before AI, deduplicate webhooks and never change funds", async () => {
  const replies = [];
  const f = setup({
    fetch: async (url, options) => {
      assert.equal(
        String(url),
        "https://api.line.me/v2/bot/message/reply",
        "bank requests must not call OpenAI or EasySlip",
      );
      replies.push(JSON.parse(options.body));
      return Response.json({});
    },
  });
  const worker = startBotWorker(f.db, f.config);
  worker.stop();
  try {
    setSetting(f.db, "botEnabled", true);
    setSetting(f.db, "aiEnabled", true);
    setSetting(f.db, "lineLoginEnabled", true);
    setSetting(f.db, "lineTopupEnabled", true);
    f.config.secrets.openaiApiKey = "fake-ai-key";
    const event = {
      type: "message",
      webhookEventId: id(),
      replyToken: "fake-reply-token",
      source: { type: "user", userId: "unlinked-test-customer" },
      message: { type: "text", text: "ขอเลขบัญชีค่ะ" },
    };
    const raw = JSON.stringify({ events: [event] });
    const signature = createHmac("sha256", "test-line-secret")
      .update(raw)
      .digest("base64");
    const webhook = () =>
      request(f.app)
        .post("/api/line/webhook")
        .set("Content-Type", "application/json")
        .set("x-line-signature", signature)
        .send(raw);
    assert.equal((await webhook()).status, 200);
    f.db.prepare("UPDATE webhook_events SET updated_at='2000-01-01'").run();
    await worker.tick();
    assert.equal(replies.length, 1);
    assert.match(replies[0].messages[0].text, /เชื่อมต่อ LINE/);
    assert.equal(replies[0].messages[1].type, "image");
    assert.equal((await webhook()).status, 200);
    await worker.tick();
    assert.equal(replies.length, 1);
    assert.equal(
      f.db.prepare("SELECT payload FROM webhook_events").get().payload,
      "{}",
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});

test("failed LINE transport retries the bank image without repeating rendering or exposing secrets", async () => {
  let attempts = 0,
    renders = 0;
  const f = setup({
    bankCardRenderer: async () => {
      renders++;
      return { original, preview };
    },
    fetch: async () =>
      Response.json({}, { status: ++attempts === 1 ? 500 : 200 }),
  });
  const worker = startBotWorker(f.db, f.config);
  worker.stop();
  try {
    setSetting(f.db, "botEnabled", true);
    const { queueWebhook } = await import("../server/integrations.mjs");
    queueWebhook(f.db, {
      events: [
        {
          type: "message",
          webhookEventId: id(),
          replyToken: "fake",
          message: { type: "text", text: "ขอบัญชี" },
        },
      ],
    });
    for (let i = 0; i < 2; i++) {
      f.db.prepare("UPDATE webhook_events SET updated_at='2000-01-01'").run();
      await worker.tick();
    }
    assert.equal(attempts, 2);
    assert.equal(renders, 1);
    assert.equal(
      f.db.prepare("SELECT status FROM webhook_events").get().status,
      "done",
    );
    assert.equal(
      JSON.stringify(f.db.prepare("SELECT details FROM audit").all()).includes(
        "test-line-token",
      ),
      false,
    );
  } finally {
    f.db.close();
  }
});
