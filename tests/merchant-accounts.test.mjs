import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import QRCode from "qrcode";
import {
  fixture,
  bank,
  slip,
  PNG,
  login,
  mutate,
  addUser,
} from "./helpers.mjs";
import {
  branchAccounts,
  accountResponse,
  paymentPayload,
} from "./payment-data.mjs";
import {
  getSettings,
  setSetting,
  verifyAudit,
  hash,
  id,
} from "../server/db.mjs";
import {
  easySlip,
  queueWebhook,
  startBotWorker,
} from "../server/integrations.mjs";
import { LINE_ID, LINE_CHANNEL } from "./line-provider.mjs";
import { creditTopup } from "../server/commerce.mjs";
import { currentBankCard } from "../server/line-bank-card.mjs";

const path = "/api/admin/merchant-accounts";
const second = {
  bankCode: "004",
  bankName: "ธนาคารกสิกรไทย",
  bankNumber: "9876543210",
  accountName: "ร้านทดสอบสอง",
  accountNameEn: "SECOND TEST SHOP",
};
const secondPromptpay = "9876543210123";
async function setup() {
  const f = fixture();
  let accounts = [
    ...branchAccounts(bank),
    ...branchAccounts(second).map((a, i) => ({
      ...a,
      id: 201 + i,
      bankNumber: i ? secondPromptpay : a.bankNumber,
    })),
  ];
  let verified = slip();
  let beforeAccounts;
  f.config.fetch = async (url) => {
    if (url.includes("/bank-accounts?")) {
      beforeAccounts?.();
      return accountResponse(accounts);
    }
    if (url.endsWith("/banks"))
      return Response.json({
        success: true,
        data: [bank, second].map((b) => ({
          code: b.bankCode,
          nameTh: b.bankName,
        })),
      });
    if (url.includes("/verify/bank"))
      return Response.json({ success: true, data: verified });
    throw new Error("No external traffic in merchant account tests");
  };
  const owner = await login(f.app, f.admin);
  const list = async () => (await owner.agent.get(path)).body.items;
  const edit = async (a, extra = {}) =>
    mutate(
      owner,
      path + "/" + a.id,
      {
        label: a.label,
        visible: a.visible,
        isPrimary: a.isPrimary,
        version: a.version,
        ...extra,
      },
      "put",
    );
  const imported = await mutate(owner, path, {
    bankAccountId: 201,
    label: "บัญชีที่สอง",
    visible: true,
    isPrimary: false,
  });
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  return {
    ...f,
    owner,
    list,
    edit,
    aid: imported.body.id,
    setAccounts: (v) => {
      accounts = v;
    },
    setVerified: (v) => {
      verified = v;
    },
    onAccounts: (v) => {
      beforeAccounts = v;
    },
  };
}
async function upload(
  f,
  aid,
  number,
  version,
  label = "QR ทดสอบ",
  primary = false,
) {
  const image = await QRCode.toBuffer(paymentPayload(number), { width: 420 });
  const uploaded = await f.owner.agent
    .post("/api/admin/media/paymentQr?accountId=" + aid)
    .set("x-csrf-token", f.owner.csrf)
    .attach("image", image, { filename: "qr.png", contentType: "image/png" });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  return mutate(f.owner, path + "/" + aid + "/qrs", {
    label,
    visible: true,
    isPrimary: primary,
    version,
    image: uploaded.body.url,
  });
}

test("bank accounts are imported from the current Branch only; owner/CSRF/strict schemas and optimistic versions protect changes", async () => {
  const f = await setup();
  try {
    assert.equal((await request(f.app).get(path)).status, 401);
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("wide-bank-staff", "Wildcard", '["*"]');
    for (const role of [
      "customer",
      "accountant",
      "marketing",
      "wide-bank-staff",
    ]) {
      const actor = await login(f.app, addUser(f.db, role));
      assert.equal((await actor.agent.get(path)).status, 403);
      assert.equal((await actor.agent.get(path + "/branch")).status, 403);
      assert.equal(
        (
          await mutate(actor, path, {
            bankAccountId: 201,
            label: "x",
            visible: true,
            isPrimary: true,
          })
        ).status,
        403,
      );
      assert.equal(
        (await mutate(actor, path + "/" + f.aid + "/qrs", {})).status,
        403,
      );
    }
    const branch = await f.owner.agent.get(path + "/branch");
    assert.deepEqual(
      branch.body.items.map((a) => a.id),
      [101, 201],
    );
    for (const bankAccountId of [999, 202])
      assert.equal(
        (
          await mutate(f.owner, path, {
            bankAccountId,
            label: "x",
            visible: true,
            isPrimary: true,
          })
        ).status,
        422,
      );
    assert.equal(
      (
        await mutate(f.owner, path, {
          bankAccountId: 201,
          label: "x",
          visible: true,
          isPrimary: true,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.owner.agent.put(path + "/" + f.aid).send({})).status,
      403,
    );
    const a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal((await f.edit(a, { bankNumber: "9999999999" })).status, 400);
    assert.equal((await f.edit(a, { visible: "false" })).status, 400);
    assert.equal(
      (await f.edit(a, { visible: false, isPrimary: true })).status,
      200,
    );
    assert.equal((await f.edit(a)).status, 409);
    assert.equal(
      (await f.list()).find((a) => a.id === "legacy").isPrimary,
      false,
    );
    const settings = (await f.owner.agent.get("/api/admin/settings")).body;
    assert.equal(
      (
        await mutate(
          f.owner,
          "/api/admin/settings",
          { ...settings, bankNumber: "9999999999" },
          "put",
        )
      ).status,
      409,
    );
    assert.equal(verifyAudit(f.db).valid, true);
    assert.equal(
      f.db
        .prepare("SELECT COUNT(*) n FROM audit WHERE action LIKE 'merchant_%'")
        .get().n,
      2,
    );
  } finally {
    f.db.close();
  }
});

test("primary visible account/QR projection omits hidden details while both hidden bank accounts still accept genuine slips exactly once", async () => {
  const f = await setup();
  try {
    let a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal((await f.edit(a, { isPrimary: true })).status, 200);
    let pub = (await request(f.app).get("/api/public")).body;
    assert.equal(pub.bankNumber, second.bankNumber);
    assert.equal(
      currentBankCard(f.db, f.config).data.bankNumber,
      second.bankNumber,
    );
    a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal((await f.edit(a, { visible: false })).status, 200);
    pub = (await request(f.app).get("/api/public")).body;
    assert.equal(pub.bankNumber, bank.bankNumber);
    assert.equal(JSON.stringify(pub).includes(second.bankNumber), false);
    const old = (await f.list()).find((a) => a.id === "legacy");
    assert.equal((await f.edit(old, { visible: false })).status, 200);
    pub = (await request(f.app).get("/api/public")).body;
    assert.deepEqual(pub.merchantAccounts, []);
    assert.equal(pub.bankNumber, "");
    assert.equal(pub.topupReady, true);
    assert.throws(() => currentBankCard(f.db, f.config), /ยังไม่ได้ตั้งค่า/);
    const customer = await login(f.app, f.customer);
    const verified = slip(100, {
      matchedAccount: {
        bank: { code: second.bankCode },
        bankNumber: second.bankNumber,
        nameTh: second.accountName,
        nameEn: second.accountNameEn,
      },
    });
    f.setVerified(verified);
    const topup = (key, image = PNG) =>
      customer.agent
        .post("/api/wallet/topup")
        .set("x-csrf-token", customer.csrf)
        .set("Idempotency-Key", key)
        .field("amount", "10000")
        .attach("image", image, {
          filename: "slip.png",
          contentType: "image/png",
        });
    const result = await topup(id());
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal((await topup(id())).status, 409);
    f.setVerified(
      slip(100, {
        matchedAccount: {
          ...verified.matchedAccount,
          bankNumber: "0000000000",
        },
      }),
    );
    assert.equal(
      (await topup(id(), await QRCode.toBuffer("other-slip"))).status,
      422,
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      10000,
    );
  } finally {
    f.db.close();
  }
});

test("multiple QR images bind to their own bank, choose primary and hide independently; hidden PromptPay is reverified and credits only once", async () => {
  const f = await setup();
  try {
    assert.equal((await upload(f, "legacy", "1234567890123", 1)).status, 201);
    const legacyState = getSettings(f.db).merchantAccounts;
    delete legacyState.find((a) => a.id === "legacy").qrs[0].verification
      .promptpayIdentifier;
    setSetting(f.db, "merchantAccounts", legacyState);
    let a = (await f.list()).find((a) => a.id === f.aid);
    const wrong = await f.owner.agent
      .post("/api/admin/media/paymentQr?accountId=" + a.id)
      .set("x-csrf-token", f.owner.csrf)
      .attach("image", await QRCode.toBuffer(paymentPayload()), {
        filename: "wrong.png",
        contentType: "image/png",
      });
    assert.equal(wrong.status, 422);
    assert.equal(
      (await upload(f, a.id, secondPromptpay, a.version)).status,
      201,
    );
    a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal(
      (await upload(f, a.id, secondPromptpay, a.version, "QR รูปที่สอง", true))
        .status,
      201,
    );
    a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal((await f.edit(a, { isPrimary: true })).status, 200);
    a = (await f.list()).find((a) => a.id === f.aid);
    const q = a.qrs[1];
    assert.ok(a.qrs.every((q) => q.ready && !q.verification && !q.receiver));
    assert.equal(
      (await request(f.app).get("/api/public")).body.paymentQr,
      q.image,
    );
    const hide = {
      label: q.label,
      visible: false,
      isPrimary: true,
      version: a.version,
    };
    assert.equal(
      (await mutate(f.owner, path + "/" + a.id + "/qrs/" + q.id, hide, "put"))
        .status,
      200,
    );
    let pub = (await request(f.app).get("/api/public")).body;
    assert.equal(pub.paymentQr, a.qrs[0].image);
    assert.equal(JSON.stringify(pub).includes(q.image), false);
    a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal((await f.edit(a, { visible: false })).status, 200);
    const verified = slip(100, {
      matchedAccount: {
        bank: { code: "PROMPTPAY" },
        bankNumber: secondPromptpay,
        nameTh: second.accountName,
        nameEn: second.accountNameEn,
      },
    });
    f.setVerified(verified);
    const data = await easySlip(f.db, f.config, PNG, "image/png", 10000);
    creditTopup(
      f.db,
      f.customer.id,
      id(),
      hash("hidden-second-qr"),
      10000,
      data,
      getSettings(f.db),
    );
    assert.throws(
      () =>
        creditTopup(
          f.db,
          f.other.id,
          id(),
          hash("same-transfer-different-image"),
          10000,
          data,
          getSettings(f.db),
        ),
      /สลิป|รายการ/,
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      10000,
    );
    f.setAccounts(branchAccounts(bank));
    await assert.rejects(
      easySlip(f.db, f.config, PNG, "image/png", 10000),
      /Branch|บัญชี/,
    );
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});

test("proof injection, foreign-bank QR attachment, stale API credentials and concurrent Branch changes cannot register a receiver", async () => {
  const f = await setup();
  try {
    const a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal(
      (
        await mutate(f.owner, path + "/" + a.id + "/qrs", {
          label: "Forged",
          visible: true,
          isPrimary: true,
          version: a.version,
          image: "/api/media/" + id(),
        })
      ).status,
      422,
    );
    assert.equal((await upload(f, "legacy", "1234567890123", 1)).status, 201);
    const old = (await f.list()).find((a) => a.id === "legacy");
    assert.equal(
      (
        await mutate(f.owner, path + "/" + a.id + "/qrs", {
          label: "Wrong bank",
          visible: true,
          isPrimary: true,
          version: a.version,
          image: old.qrs[0].image,
        })
      ).status,
      422,
    );
    const qr = await f.owner.agent
      .post("/api/admin/media/paymentQr?accountId=" + a.id)
      .set("x-csrf-token", f.owner.csrf)
      .attach("image", await QRCode.toBuffer(paymentPayload(secondPromptpay)), {
        filename: "valid.png",
        contentType: "image/png",
      });
    assert.equal(qr.status, 201);
    f.config.secrets.easyslipApiKey = "changed-test-key";
    assert.equal(
      (
        await mutate(f.owner, path + "/" + a.id + "/qrs", {
          label: "Stale",
          visible: true,
          isPrimary: true,
          version: a.version,
          image: qr.body.url,
        })
      ).status,
      409,
    );
    assert.equal((await request(f.app).get("/api/public")).body.paymentQr, "");
    f.onAccounts(() => {
      f.config.secrets.easyslipApiKey = id();
    });
    assert.equal((await f.owner.agent.get(path + "/branch")).status, 409);
    assert.equal(
      (
        await mutate(f.owner, path, {
          bankAccountId: 101,
          label: "Race",
          visible: true,
          isPrimary: true,
        })
      ).status,
      409,
    );
    assert.equal((await f.list()).length, 2);
  } finally {
    f.db.close();
  }
});

test("rotating API credentials can reverify immutable QR without adding images; stale versions and Branch removal fail closed", async () => {
  const f = await setup();
  try {
    assert.equal((await upload(f, "legacy", "1234567890123", 1)).status, 201);
    let a = (await f.list()).find((a) => a.id === "legacy");
    const q = a.qrs[0],
      pathQr = path + "/legacy/qrs/" + q.id + "/verify";
    f.config.secrets.easyslipApiKey = "new-fake-key";
    assert.equal(
      (await f.list()).find((a) => a.id === "legacy").qrs[0].ready,
      false,
    );
    assert.equal((await request(f.app).get("/api/public")).body.paymentQr, "");
    assert.equal(
      (await mutate(f.owner, pathQr, { version: a.version })).status,
      200,
    );
    assert.equal(
      (await mutate(f.owner, pathQr, { version: a.version })).status,
      409,
    );
    a = (await f.list()).find((a) => a.id === "legacy");
    assert.equal(a.qrs.length, 1);
    assert.equal(a.qrs[0].image, q.image);
    assert.equal(a.qrs[0].ready, true);
    assert.equal(
      (await request(f.app).get("/api/public")).body.paymentQr,
      q.image,
    );
    f.setAccounts([]);
    assert.equal(
      (await mutate(f.owner, pathQr, { version: a.version })).status,
      422,
    );
    assert.equal(
      (await f.list()).find((a) => a.id === "legacy").version,
      a.version,
    );
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});

test("linked LINE topup accepts a hidden secondary bank QR through the shared deduplication ledger", async () => {
  const f = await setup();
  try {
    let a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal(
      (await upload(f, a.id, secondPromptpay, a.version)).status,
      201,
    );
    a = (await f.list()).find((a) => a.id === f.aid);
    assert.equal((await f.edit(a, { visible: false })).status, 200);
    f.setVerified(
      slip(100, {
        isAmountMatched: undefined,
        matchedAccount: {
          bank: { code: "PROMPTPAY" },
          bankNumber: secondPromptpay,
          nameTh: second.accountName,
          nameEn: second.accountNameEn,
        },
      }),
    );
    const transport = f.config.fetch;
    f.config.fetch = async (url, options) => {
      if (url.includes("api-data.line.me"))
        return new Response(PNG, { headers: { "content-type": "image/png" } });
      if (url.includes("api.line.me/v2/bot/message/reply"))
        return Response.json({});
      return transport(url, options);
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
      .run(
        LINE_ID,
        f.customer.id,
        LINE_CHANNEL,
        "ลูกค้าทดสอบ",
        id(),
        new Date().toISOString(),
      );
    const worker = startBotWorker(f.db, f.config);
    worker.stop();
    queueWebhook(f.db, {
      events: [
        {
          type: "message",
          webhookEventId: id(),
          replyToken: "fake",
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
      f.db.prepare("SELECT COUNT(*) n FROM funding_receipts").get().n,
      1,
    );
    assert.equal(verifyAudit(f.db).valid, true);
  } finally {
    f.db.close();
  }
});
