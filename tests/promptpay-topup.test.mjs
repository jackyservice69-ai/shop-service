import { test } from "node:test";
import assert from "node:assert/strict";
import QRCode from "qrcode";
import { fixture, bank, slip, PNG, login } from "./helpers.mjs";
import {
  id,
  now,
  hash,
  setSetting,
  getSettings,
  verifyAudit,
} from "../server/db.mjs";
import {
  branchAccounts,
  accountResponse,
  paymentPayload,
  promptpayNumber,
} from "./payment-data.mjs";
import { verifyPaymentQr } from "../server/payment-qr.mjs";
import { receivingAccountKey } from "../server/receiving-policy.mjs";
import { easySlip } from "../server/integrations.mjs";
import { creditTopup, validateSlip } from "../server/commerce.mjs";
import { queueWebhook, startBotWorker } from "../server/integrations.mjs";
import { LINE_ID, LINE_CHANNEL } from "./line-provider.mjs";

async function setup() {
  const f = fixture();
  let accounts = branchAccounts(bank),
    verified = slip(100),
    requests = 0;
  verified.matchedAccount = {
    ...verified.matchedAccount,
    bank: { code: "PROMPTPAY" },
    bankNumber: promptpayNumber,
  };
  f.config.fetch = async (url, options) => {
    if (url.includes("bank-accounts?")) return accountResponse(accounts);
    if (url.includes("verify/bank")) {
      requests++;
      assert.equal(options.body.get("checkDuplicate"), "true");
      return Response.json({ success: true, data: verified });
    }
    throw new Error("External traffic forbidden in PromptPay tests");
  };
  const image = await QRCode.toBuffer(paymentPayload());
  const mediaId = id(),
    url = "/api/media/" + mediaId;
  f.db
    .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      mediaId,
      "paymentQr",
      "image/png",
      300,
      300,
      image.length,
      image,
      f.admin.id,
      now(),
    );
  const proof = await verifyPaymentQr(f.db, f.config, image, bank);
  // The existing store QR predates this fix and has no identifier metadata.
  delete proof.promptpayIdentifier;
  setSetting(f.db, "paymentQr", url);
  setSetting(f.db, "paymentQrReceiver", receivingAccountKey(bank));
  setSetting(f.db, "paymentQrVerification", { ...proof, url });
  return {
    ...f,
    get requests() {
      return requests;
    },
    setAccounts(value) {
      accounts = value;
    },
    setVerified(value) {
      verified = value;
    },
    verified,
  };
}
function upload(client, key = id()) {
  return client.agent
    .post("/api/wallet/topup")
    .set("x-csrf-token", client.csrf)
    .set("Idempotency-Key", key)
    .field("amount", "10000")
    .attach("image", PNG, { filename: "slip.png", contentType: "image/png" });
}

test("PromptPay slip to the approved shop QR credits through the real web endpoint; replay and cross-customer reuse never double credit", async () => {
  const f = await setup();
  try {
    const c = await login(f.app, f.customer),
      key = id();
    const response = await upload(c, key);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      10000,
    );
    assert.equal((await upload(c, key)).status, 200);
    assert.equal(f.requests, 1);
    const other = await login(f.app, f.other);
    assert.equal((await upload(other)).status, 409);
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM funding_receipts").get().n,
      1,
    );
    assert.ok(verifyAudit(f.db).valid);
  } finally {
    f.db.close();
  }
});

test("PromptPay remains exact: another identifier in the same Branch, missing registration, changed names, absent/invalid QR and stale credentials reject", async () => {
  for (const mode of [
    "other-number",
    "branch-unlinked",
    "name",
    "qr-removed",
    "qr-stale",
    "credential-stale",
  ]) {
    const f = await setup();
    try {
      if (mode === "other-number") {
        f.setVerified({
          ...f.verified,
          matchedAccount: {
            ...f.verified.matchedAccount,
            bankNumber: "9876543210123",
          },
        });
        f.setAccounts([
          ...branchAccounts(bank),
          {
            id: 103,
            bankCode: "PROMPTPAY",
            bankNumber: "9876543210123",
            nameTh: bank.accountName,
            nameEn: bank.accountNameEn,
          },
        ]);
      }
      if (mode === "branch-unlinked")
        f.setAccounts(
          branchAccounts(bank).filter((a) => a.bankCode !== "PROMPTPAY"),
        );
      if (mode === "name")
        f.setAccounts(
          branchAccounts(bank).map((a) => ({ ...a, nameTh: "บัญชีอื่น" })),
        );
      if (mode === "qr-removed") setSetting(f.db, "paymentQr", "");
      if (mode === "qr-stale") setSetting(f.db, "paymentQrReceiver", "invalid");
      if (mode === "credential-stale")
        f.config.secrets.easyslipApiKey = "different-branch-key";
      const c = await login(f.app, f.customer);
      const response = await upload(c);
      assert.equal(
        response.status,
        422,
        mode + ":" + JSON.stringify(response.body),
      );
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
    } finally {
      f.db.close();
    }
  }
});

test("JSON flags cannot authorize PromptPay; duplicate/amount/date/name checks still apply after trusted recipient proof", async () => {
  const f = await setup();
  try {
    const settings = getSettings(f.db);
    assert.throws(
      () =>
        validateSlip(
          { ...f.verified, verifiedPromptpayNumber: promptpayNumber },
          10000,
          { ...settings, allowedPromptpay: promptpayNumber },
        ),
      /บัญชีผู้รับ/,
    );
    for (const change of [
      (v) => (v.isDuplicate = true),
      (v) => (v.amountInSlip = 101),
      (v) => (v.rawSlip.date = "2000-01-01"),
      (v) => (v.matchedAccount.nameTh = "อื่น"),
      (v) => delete v.isAmountMatched,
    ]) {
      const verified = await easySlip(
        f.db,
        f.config,
        { buffer: PNG, mimetype: "image/png" },
        10000,
      );
      change(verified);
      // The English name remains a valid independent matching name unless both change.
      if (verified.matchedAccount.nameTh === "อื่น")
        verified.matchedAccount.nameEn = "OTHER";
      assert.throws(() => validateSlip(verified, 10000, settings));
    }
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM topups").get().n, 0);
  } finally {
    f.db.close();
  }
});

test("recipient proof fails if QR or receiving settings change after verification, including at atomic commit", async () => {
  for (const field of ["paymentQr", "bankNumber", "easyslipApiKey"]) {
    const f = await setup();
    try {
      const settings = getSettings(f.db),
        verified = await easySlip(
          f.db,
          f.config,
          { buffer: PNG, mimetype: "image/png" },
          10000,
        );
      assert.doesNotThrow(() => validateSlip(verified, 10000, settings));
      setSetting(
        f.db,
        field,
        field === "bankNumber" ? "9999999999" : "changed",
      );
      assert.throws(() =>
        creditTopup(
          f.db,
          f.customer.id,
          id(),
          hash(PNG),
          10000,
          verified,
          settings,
        ),
      );
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
    } finally {
      f.db.close();
    }
  }
});

test("linked LINE customer can top up from a PromptPay slip using the same exact receiver proof", async () => {
  const f = await setup();
  try {
    f.setVerified({ ...f.verified, isAmountMatched: undefined });
    const baseFetch = f.config.fetch;
    f.config.fetch = async (url, options) => {
      if (url.includes("api-data.line.me"))
        return new Response(PNG, { headers: { "content-type": "image/png" } });
      if (url.includes("api.line.me/v2/bot/message/reply"))
        return Response.json({});
      return baseFetch(url, options);
    };
    for (const [key, value] of Object.entries({
      botEnabled: true,
      lineLoginEnabled: true,
      lineTopupEnabled: true,
      lineLoginChannelId: LINE_CHANNEL,
    }))
      setSetting(f.db, key, value);
    f.db
      .prepare("INSERT INTO line_identities VALUES(?,?,?,?,?,?)")
      .run(LINE_ID, f.customer.id, LINE_CHANNEL, "ลูกค้า", id(), now());
    const worker = startBotWorker(f.db, f.config);
    worker.stop();
    queueWebhook(f.db, {
      events: [
        {
          type: "message",
          webhookEventId: id(),
          replyToken: "test",
          source: { type: "user", userId: LINE_ID },
          message: { type: "image", id: "100001" },
        },
      ],
    });
    f.db.prepare("UPDATE webhook_events SET updated_at='2000-01-01'").run();
    await worker.tick();
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      10000,
    );
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM line_topups").get().n, 1);
    assert.equal(
      f.db.prepare("SELECT status FROM webhook_events").get().status,
      "done",
    );
  } finally {
    f.db.close();
  }
});
