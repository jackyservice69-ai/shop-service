import request from "supertest";
import {
  openDb,
  id,
  now,
  passwordHash,
  wallet,
  setSetting,
} from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { branchAccounts, accountResponse } from "./payment-data.mjs";
export const PASSWORD = "Test-strong-password-2026!";
export const bank = {
  bankCode: "014",
  bankNumber: "1234567890",
  bankName: "ธนาคารไทยพาณิชย์",
  accountName: "บัญชีทดสอบ",
  accountNameEn: "TEST ACCOUNT",
};
export function fixture(overrides = {}) {
  const db = openDb(":memory:");
  for (const [k, v] of Object.entries(bank)) setSetting(db, k, v);
  const config = {
    origin: "http://127.0.0.1:5174",
    encryptionKey: "ab".repeat(32),
    secrets: {
      easyslipApiKey: "test-slip",
      lineChannelSecret: "test-line-secret",
      lineChannelAccessToken: "test-line-token",
    },
    fetch: async (url) => {
      if (String(url).includes("/bank-accounts?"))
        return accountResponse(branchAccounts(bank));
      throw new Error("External network disabled in unit tests");
    },
    ...overrides,
  };
  const app = createApp(db, config);
  const admin = addUser(db, "admin"),
    customer = addUser(db, "customer"),
    other = addUser(db, "customer");
  const product = addProduct(db);
  return { db, app, config, admin, customer, other, product };
}
export function addUser(db, role = "customer", balance = 0) {
  const uid = id(),
    email = uid + "@example.test";
  db.prepare(
    "INSERT INTO users(id,name,email,password,role_id,referral_code,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(
    uid,
    "ผู้ทดสอบ " + uid.slice(0, 4),
    email,
    passwordHash(PASSWORD),
    role,
    id().slice(0, 10),
    now(),
  );
  if (balance) wallet(db, uid, balance, "opening-test", id());
  return db.prepare("SELECT * FROM users WHERE id=?").get(uid);
}
export function addProduct(db, stock = 10, price = 10000) {
  const pid = id();
  db.prepare(
    "INSERT INTO products(id,name,description,category,price,cost,stock,image,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    pid,
    "สินค้าทดสอบ",
    "รายละเอียด",
    "ไลฟ์สไตล์",
    price,
    5000,
    stock,
    "/assets/bag.svg",
    now(),
  );
  return db.prepare("SELECT * FROM products WHERE id=?").get(pid);
}
export async function login(app, user) {
  const agent = request.agent(app),
    res = await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(JSON.stringify(res.body));
  return { agent, csrf: res.body.csrf, user: res.body.user };
}
export const mutate = async (client, path, body = {}, method = "post", key) => {
  if (path === "/api/orders" && !body.expectedQuote) {
    const q = await client.agent
      .post("/api/orders/quote")
      .set("x-csrf-token", client.csrf)
      .send(body);
    body = { ...body, expectedQuote: q.body.fingerprint || "" };
  }
  let r = client.agent[method](path).set("x-csrf-token", client.csrf);
  if (key) r = r.set("Idempotency-Key", key);
  return r.send(body);
};
export const orderInput = (product, extra = {}) => ({
  items: [{ productId: product.id, quantity: 1 }],
  coupon: "",
  payment: "full",
  shipping: {
    name: "ผู้รับทดสอบ",
    phone: "0812345678",
    address: "123 ถนนทดสอบ กรุงเทพฯ 10110",
  },
  ...extra,
});
export const slip = (amount = 100, extra = {}) => ({
  isDuplicate: false,
  matchedAccount: {
    bank: { code: "014" },
    bankNumber: bank.bankNumber,
    nameTh: bank.accountName,
    nameEn: bank.accountNameEn,
  },
  amountInSlip: amount,
  isAmountMatched: true,
  rawSlip: {
    transRef: id(),
    date: now(),
    countryCode: "TH",
    sender: { bank: { id: "004" } },
    amount: { amount, local: { amount, currency: "THB" } },
  },
  ...extra,
});
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl5kAAAAASUVORK5CYII=",
  "base64",
);
