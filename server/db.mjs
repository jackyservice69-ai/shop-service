import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export const id = () => randomBytes(16).toString("hex");
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const now = () => new Date().toISOString();
export function passwordHash(value) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 64).toString("hex")}`;
}
export function passwordMatches(value, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(key, "hex"));
}
export function encrypt(value, key) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const body = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return [
    iv.toString("hex"),
    body.toString("hex"),
    c.getAuthTag().toString("hex"),
  ].join(".");
}
export function decrypt(value, key) {
  const [iv, body, tag] = value.split("."),
    d = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      Buffer.from(iv, "hex"),
    );
  d.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    d.update(Buffer.from(body, "hex")),
    d.final(),
  ]).toString("utf8");
}

export function openDb(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  db.exec(`
 CREATE TABLE IF NOT EXISTS roles(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,permissions TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,role_id TEXT NOT NULL REFERENCES roles(id),active INTEGER NOT NULL DEFAULT 1,balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),referral_code TEXT NOT NULL UNIQUE,referred_by TEXT REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),cost INTEGER NOT NULL DEFAULT 0 CHECK(cost>=0),stock INTEGER NOT NULL CHECK(stock>=0),image TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS promotions(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,type TEXT NOT NULL CHECK(type IN ('percent','fixed')),value INTEGER NOT NULL CHECK(value>0),minimum INTEGER NOT NULL DEFAULT 0,limit_count INTEGER NOT NULL DEFAULT 100,per_user INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,total INTEGER NOT NULL CHECK(total>=0),paid INTEGER NOT NULL CHECK(paid>=0),deposit_percent INTEGER NOT NULL,status TEXT NOT NULL,promotion_id TEXT REFERENCES promotions(id),shipping TEXT NOT NULL,tracking TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS order_items(order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL REFERENCES products(id),name TEXT NOT NULL,price INTEGER NOT NULL,cost INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(order_id,product_id));
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,balance_after INTEGER NOT NULL CHECK(balance_after>=0),kind TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(kind,reference));
 CREATE TABLE IF NOT EXISTS topups(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,image_hash TEXT NOT NULL UNIQUE,bank_ref TEXT NOT NULL UNIQUE,amount INTEGER NOT NULL CHECK(amount>0),created_at TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('income','expense')),category TEXT NOT NULL,description TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),request_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT,action TEXT NOT NULL,entity TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,previous_hash TEXT NOT NULL,entry_hash TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS audit_immutable_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS audit_immutable_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS ledger_immutable_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'ledger is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS ledger_immutable_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'ledger is immutable'); END;
 CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS order_user_date ON orders(user_id,created_at);
 CREATE INDEX IF NOT EXISTS ledger_user_date ON ledger(user_id,created_at);
 CREATE INDEX IF NOT EXISTS audit_date ON audit(created_at);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,kind TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,body BLOB NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS banners(id TEXT PRIMARY KEY,title TEXT NOT NULL,image TEXT NOT NULL,link TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS coupon_claims(user_id TEXT NOT NULL REFERENCES users(id),promotion_id TEXT NOT NULL REFERENCES promotions(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,promotion_id));
 CREATE TABLE IF NOT EXISTS commissions(order_id TEXT PRIMARY KEY REFERENCES orders(id),referrer_id TEXT NOT NULL REFERENCES users(id),rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),base INTEGER NOT NULL CHECK(base>=0),amount INTEGER NOT NULL CHECK(amount>=0),status TEXT NOT NULL CHECK(status IN ('pending','credited','void')),created_at TEXT NOT NULL,paid_at TEXT);
 `);
  // Additive, repeatable migration: preserve existing products, orders and balances.
  transaction(db, () => {
    for (const [table, column, type] of [
      ["promotions", "image", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "title", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "description", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "claim_required", "INTEGER NOT NULL DEFAULT 0"],
      ["announcements", "image", "TEXT NOT NULL DEFAULT ''"],
      ["announcements", "position", "INTEGER NOT NULL DEFAULT 0"],
      ["orders", "referrer_id", "TEXT REFERENCES users(id)"],
      ["orders", "commission_bps", "INTEGER NOT NULL DEFAULT 0"],
      ["orders", "commission_amount", "INTEGER NOT NULL DEFAULT 0"],
    ])
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === column)
      )
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    db.exec("PRAGMA user_version=2");
  });
  db.prepare("INSERT OR IGNORE INTO roles VALUES (?,?,?)").run(
    "admin",
    "ผู้ดูแลระบบ",
    JSON.stringify(["*"]),
  );
  db.prepare("INSERT OR IGNORE INTO roles VALUES (?,?,?)").run(
    "customer",
    "ลูกค้า",
    "[]",
  );
  const defaults = {
    shopName: "หิ้วลี่",
    depositPercent: 0,
    commissionPercent: 0,
    theme: {
      primary: "#6554c0",
      ink: "#25243b",
      muted: "#6e7085",
      background: "#f6f7fb",
      surface: "#ffffff",
      positive: "#15785e",
    },
    logo: "",
    favicon: "",
    slideSeconds: 6,
    bankCode: "",
    bankNumber: "",
    bankName: "",
    accountName: "",
    accountNameEn: "",
    botEnabled: false,
    aiEnabled: false,
    aiModel: "gpt-4.1-mini",
    botGreeting:
      "สวัสดีค่ะ ยินดีต้อนรับสู่หิ้วลี่ ดูสินค้าและติดตามคำสั่งซื้อได้ที่หน้าเว็บไซต์ค่ะ",
    aiInstructions:
      "ตอบภาษาไทยอย่างสุภาพเกี่ยวกับบริการรับหิ้วสินค้าเท่านั้น ห้ามอ้างว่ารู้ยอดเงินหรือข้อมูลคำสั่งซื้อส่วนบุคคล ให้ลูกค้าเข้าสู่เว็บไซต์เพื่อตรวจสอบ",
  };
  for (const [k, v] of Object.entries(defaults))
    db.prepare("INSERT OR IGNORE INTO settings VALUES (?,?)").run(
      k,
      JSON.stringify(v),
    );
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function audit(db, actor, action, entity, details = {}) {
  const previous =
      db.prepare("SELECT entry_hash FROM audit ORDER BY id DESC LIMIT 1").get()
        ?.entry_hash || "GENESIS",
    time = now(),
    json = JSON.stringify(details),
    digest = hash(
      JSON.stringify([previous, actor || null, action, entity, json, time]),
    );
  db.prepare(
    "INSERT INTO audit(actor_id,action,entity,details,created_at,previous_hash,entry_hash) VALUES(?,?,?,?,?,?,?)",
  ).run(actor || null, action, entity, json, time, previous, digest);
}
export function verifyAudit(db) {
  let prev = "GENESIS";
  for (const row of db.prepare("SELECT * FROM audit ORDER BY id").all()) {
    if (
      row.previous_hash !== prev ||
      row.entry_hash !==
        hash(
          JSON.stringify([
            prev,
            row.actor_id,
            row.action,
            row.entity,
            row.details,
            row.created_at,
          ]),
        )
    )
      return { valid: false, failedAt: row.id };
    prev = row.entry_hash;
  }
  return {
    valid: true,
    count: db.prepare("SELECT COUNT(*) n FROM audit").get().n,
    head: prev,
  };
}
export function getSettings(db) {
  return Object.fromEntries(
    db
      .prepare("SELECT * FROM settings")
      .all()
      .map((r) => [r.key, JSON.parse(r.value)]),
  );
}
export function setSetting(db, k, v) {
  db.prepare(
    "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(k, JSON.stringify(v));
}
export function wallet(db, userId, amount, kind, reference) {
  const result = db
    .prepare("UPDATE users SET balance=balance+? WHERE id=? AND balance+?>=0")
    .run(amount, userId, amount);
  if (!result.changes)
    throw Object.assign(new Error("ยอดเงินไม่เพียงพอ กรุณาเติมเงิน"), {
      status: 409,
    });
  const balance = db
    .prepare("SELECT balance FROM users WHERE id=?")
    .get(userId).balance;
  db.prepare("INSERT INTO ledger VALUES(?,?,?,?,?,?,?)").run(
    id(),
    userId,
    amount,
    balance,
    kind,
    reference,
    now(),
  );
  return balance;
}
