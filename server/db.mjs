import { DatabaseSync } from "node:sqlite";
import socialPlatforms from "../shared/socials.json" with { type: "json" };
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import customerColors from "../shared/customer-colors.json" with { type: "json" };
import authorization from "../shared/authorization.json" with { type: "json" };
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
export const bankTransferKey = (reference) =>
  String(reference).normalize("NFKC").trim().toUpperCase();
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
 CREATE TABLE IF NOT EXISTS google_identities(subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS google_auth_attempts(state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL UNIQUE,nonce TEXT NOT NULL,verifier TEXT NOT NULL,next TEXT NOT NULL,referral_code TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS google_pending(cookie_hash TEXT PRIMARY KEY,subject TEXT NOT NULL,email TEXT NOT NULL,first_name TEXT NOT NULL,last_name TEXT NOT NULL,next TEXT NOT NULL,referral_code TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS google_attempt_expiry ON google_auth_attempts(expires_at);
 CREATE INDEX IF NOT EXISTS google_pending_expiry ON google_pending(expires_at);
 CREATE TABLE IF NOT EXISTS social_link_flows(state_hash TEXT PRIMARY KEY,provider TEXT NOT NULL CHECK(provider IN ('google','line')),user_id TEXT NOT NULL REFERENCES users(id),session_token TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS line_identities(subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id),channel_id TEXT NOT NULL,display_name TEXT NOT NULL,binding_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS line_auth_attempts(state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL UNIQUE,nonce TEXT NOT NULL,verifier TEXT NOT NULL,next TEXT NOT NULL,referral_code TEXT NOT NULL,config_hash TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS line_pending(cookie_hash TEXT PRIMARY KEY,subject TEXT NOT NULL,display_name TEXT NOT NULL,channel_id TEXT NOT NULL,next TEXT NOT NULL,referral_code TEXT NOT NULL,config_hash TEXT NOT NULL,expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),cost INTEGER NOT NULL DEFAULT 0 CHECK(cost>=0),stock INTEGER NOT NULL CHECK(stock>=0),image TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS promotions(id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,type TEXT NOT NULL CHECK(type IN ('percent','fixed')),value INTEGER NOT NULL CHECK(value>0),minimum INTEGER NOT NULL DEFAULT 0,limit_count INTEGER NOT NULL DEFAULT 100,per_user INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,subtotal INTEGER NOT NULL,discount INTEGER NOT NULL,total INTEGER NOT NULL CHECK(total>=0),paid INTEGER NOT NULL CHECK(paid>=0),deposit_percent INTEGER NOT NULL,status TEXT NOT NULL,promotion_id TEXT REFERENCES promotions(id),shipping TEXT NOT NULL,tracking TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS order_items(order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL REFERENCES products(id),name TEXT NOT NULL,price INTEGER NOT NULL,cost INTEGER NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(order_id,product_id));
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,balance_after INTEGER NOT NULL CHECK(balance_after>=0),kind TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(kind,reference));
 CREATE TABLE IF NOT EXISTS topups(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,image_hash TEXT NOT NULL UNIQUE,bank_ref TEXT NOT NULL UNIQUE,amount INTEGER NOT NULL CHECK(amount>0),created_at TEXT NOT NULL,UNIQUE(user_id,request_key));
 CREATE TABLE IF NOT EXISTS funding_receipts(bank_ref TEXT PRIMARY KEY,source TEXT NOT NULL CHECK(source IN ('slip','manual')),reference TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS manual_topups(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES users(id),user_id TEXT NOT NULL REFERENCES users(id),request_key TEXT NOT NULL,request_hash TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('bank_transfer','cash','adjustment')),reference TEXT NOT NULL,reference_key TEXT NOT NULL UNIQUE,bank_ref TEXT,reason TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),balance_before INTEGER NOT NULL CHECK(balance_before>=0),balance_after INTEGER NOT NULL CHECK(balance_after=balance_before+amount),created_at TEXT NOT NULL,UNIQUE(actor_id,request_key));
 CREATE INDEX IF NOT EXISTS manual_topups_customer ON manual_topups(user_id,created_at);
 CREATE TRIGGER IF NOT EXISTS manual_topups_immutable_update BEFORE UPDATE ON manual_topups BEGIN SELECT RAISE(ABORT,'manual topups are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS manual_topups_immutable_delete BEFORE DELETE ON manual_topups BEGIN SELECT RAISE(ABORT,'manual topups are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS funding_receipts_immutable_update BEFORE UPDATE ON funding_receipts BEGIN SELECT RAISE(ABORT,'funding receipts are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS funding_receipts_immutable_delete BEFORE DELETE ON funding_receipts BEGIN SELECT RAISE(ABORT,'funding receipts are immutable'); END;
 CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('income','expense')),category TEXT NOT NULL,description TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),request_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id));
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT,action TEXT NOT NULL,entity TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,previous_hash TEXT NOT NULL,entry_hash TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS audit_immutable_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS audit_immutable_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS ledger_immutable_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'ledger is immutable'); END;
 CREATE TRIGGER IF NOT EXISTS ledger_immutable_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'ledger is immutable'); END;
 CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS line_topups(event_id TEXT PRIMARY KEY REFERENCES webhook_events(id),topup_id TEXT NOT NULL UNIQUE REFERENCES topups(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS line_slip_limits(subject_hash TEXT PRIMARY KEY,window_start INTEGER NOT NULL,requests INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS line_topups_immutable_update BEFORE UPDATE ON line_topups BEGIN SELECT RAISE(ABORT,'line topups are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS line_topups_immutable_delete BEFORE DELETE ON line_topups BEGIN SELECT RAISE(ABORT,'line topups are immutable'); END;
 CREATE INDEX IF NOT EXISTS order_user_date ON orders(user_id,created_at);
 CREATE INDEX IF NOT EXISTS ledger_user_date ON ledger(user_id,created_at);
 CREATE INDEX IF NOT EXISTS audit_date ON audit(created_at);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,kind TEXT NOT NULL,mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,bytes INTEGER NOT NULL,body BLOB NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS payment_qr_checks(media_id TEXT PRIMARY KEY REFERENCES media(id),receiver TEXT NOT NULL,verification TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS addresses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),label TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,latitude REAL,longitude REAL,is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)));
 CREATE INDEX IF NOT EXISTS addresses_user ON addresses(user_id,created_at);
 CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default ON addresses(user_id) WHERE is_default=1;
 CREATE TABLE IF NOT EXISTS banners(id TEXT PRIMARY KEY,title TEXT NOT NULL,image TEXT NOT NULL,link TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS coupon_claims(user_id TEXT NOT NULL REFERENCES users(id),promotion_id TEXT NOT NULL REFERENCES promotions(id),created_at TEXT NOT NULL,PRIMARY KEY(user_id,promotion_id));
 CREATE TABLE IF NOT EXISTS commissions(order_id TEXT PRIMARY KEY REFERENCES orders(id),referrer_id TEXT NOT NULL REFERENCES users(id),rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),base INTEGER NOT NULL CHECK(base>=0),amount INTEGER NOT NULL CHECK(amount>=0),status TEXT NOT NULL CHECK(status IN ('pending','credited','void')),created_at TEXT NOT NULL,paid_at TEXT);
 CREATE TABLE IF NOT EXISTS consignors(user_id TEXT PRIMARY KEY REFERENCES users(id),shop_name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','suspended','rejected')),note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS consignment_sales(order_id TEXT NOT NULL REFERENCES orders(id),product_id TEXT NOT NULL REFERENCES products(id),seller_id TEXT NOT NULL REFERENCES users(id),fee_bps INTEGER NOT NULL CHECK(fee_bps BETWEEN 0 AND 10000),base INTEGER NOT NULL CHECK(base>=0),fee INTEGER NOT NULL CHECK(fee>=0 AND fee<=base),net INTEGER NOT NULL CHECK(net=base-fee),status TEXT NOT NULL CHECK(status IN ('pending','credited','void')),created_at TEXT NOT NULL,paid_at TEXT,PRIMARY KEY(order_id,product_id));
 CREATE INDEX IF NOT EXISTS consignment_sales_seller ON consignment_sales(seller_id,created_at);
 CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),user_id TEXT NOT NULL REFERENCES users(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),moderation_reason TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(product_id,user_id));
 CREATE INDEX IF NOT EXISTS reviews_product ON reviews(product_id,visible,created_at);
 CREATE TABLE IF NOT EXISTS review_media(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),product_id TEXT NOT NULL REFERENCES products(id),review_id TEXT REFERENCES reviews(id),mime TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,duration REAL NOT NULL DEFAULT 0,bytes INTEGER NOT NULL,body BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS review_media_owner ON review_media(user_id,created_at);
 `);
  const schemaVersion = db.prepare("PRAGMA user_version").get().user_version;
  // Additive, repeatable migration: preserve existing products, orders and balances.
  transaction(db, () => {
    for (const [table, column, type] of [
      ["users", "first_name", "TEXT NOT NULL DEFAULT ''"],
      ["users", "last_name", "TEXT NOT NULL DEFAULT ''"],
      ["users", "phone", "TEXT NOT NULL DEFAULT ''"],
      ["users", "discovery_source", "TEXT NOT NULL DEFAULT ''"],
      ["users", "line_id", "TEXT NOT NULL DEFAULT ''"],
      ["users", "member_version", "INTEGER NOT NULL DEFAULT 1"],
      ["users", "must_change_password", "INTEGER NOT NULL DEFAULT 0"],
      ["users", "password_reset_expires_at", "TEXT"],
      ["users", "has_password", "INTEGER NOT NULL DEFAULT 1"],
      ["line_auth_attempts", "origin_browser", "TEXT NOT NULL DEFAULT 'same'"],
      [
        "google_auth_attempts",
        "origin_browser",
        "TEXT NOT NULL DEFAULT 'same'",
      ],
      ["webhook_events", "reply_text", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "image", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "title", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "description", "TEXT NOT NULL DEFAULT ''"],
      ["promotions", "claim_required", "INTEGER NOT NULL DEFAULT 0"],
      ["announcements", "image", "TEXT NOT NULL DEFAULT ''"],
      ["announcements", "position", "INTEGER NOT NULL DEFAULT 0"],
      ["orders", "referrer_id", "TEXT REFERENCES users(id)"],
      ["orders", "commission_bps", "INTEGER NOT NULL DEFAULT 0"],
      ["orders", "commission_amount", "INTEGER NOT NULL DEFAULT 0"],
      ["products", "consignor_id", "TEXT REFERENCES users(id)"],
      ["products", "consignment_status", "TEXT NOT NULL DEFAULT 'none'"],
    ])
      if (
        !db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === column)
      )
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  });
  db.prepare("INSERT OR IGNORE INTO roles VALUES (?,?,?)").run(
    "admin",
    "เจ้าของร้าน",
    JSON.stringify(["*"]),
  );
  db.prepare("INSERT OR IGNORE INTO roles VALUES (?,?,?)").run(
    "customer",
    "ลูกค้า",
    "[]",
  );
  transaction(db, () => {
    if (schemaVersion < 8) {
      // Legacy broad grants become view-only. New mutation privileges need the
      // owner's explicit choice; never silently grant refund/reset/export rights.
      for (const role of db
        .prepare("SELECT * FROM roles WHERE id NOT IN ('admin','customer')")
        .all()) {
        const before = JSON.parse(role.permissions);
        const permissions = before.includes("*")
          ? authorization.permissions
              .filter((p) => !p.ownerOnly && !p.requires.length)
              .map((p) => p.id)
          : [
              ...new Set(
                before.flatMap((p) =>
                  p === "settings"
                    ? ["appearance", "banners"]
                    : p === "member_edit"
                      ? ["members", "member_edit"]
                      : [p],
                ),
              ),
            ].filter((p) =>
              authorization.permissions.some(
                (rule) => rule.id === p && !rule.ownerOnly,
              ),
            );
        db.prepare("UPDATE roles SET permissions=? WHERE id=?").run(
          JSON.stringify(permissions),
          role.id,
        );
        db.prepare(
          "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role_id=?)",
        ).run(role.id);
        audit(db, null, "role.permissions_migrated", role.id, {
          before,
          permissions,
          sessionsRevoked: true,
        });
      }
      db.prepare(
        "UPDATE roles SET name='เจ้าของร้าน' WHERE id='admin' AND name='ผู้ดูแลระบบ'",
      ).run();
      // Do not recreate presets deleted/edited later or overwrite existing custom roles.
      for (const role of authorization.roles) {
        const result = db
          .prepare("INSERT OR IGNORE INTO roles VALUES(?,?,?)")
          .run(role.id, role.name, JSON.stringify(role.permissions));
        if (result.changes)
          audit(db, null, "role.preset_created", role.id, {
            permissions: role.permissions,
          });
      }
      db.exec("PRAGMA user_version=8");
    }
    if (schemaVersion < 9) {
      for (const row of db
        .prepare("SELECT id,bank_ref,created_at FROM topups")
        .all())
        db.prepare(
          "INSERT OR IGNORE INTO funding_receipts VALUES(?,?,?,?)",
        ).run(bankTransferKey(row.bank_ref), "slip", row.id, row.created_at);
      audit(db, null, "wallet.manual_topup_enabled", "system", {
        permission: "wallet_topup",
        defaultStaffGranted: false,
      });
      db.exec("PRAGMA user_version=9");
    }
    if (schemaVersion < 10) {
      audit(db, null, "auth.line_enabled_schema", "system");
      db.exec("PRAGMA user_version=10");
    }
  });
  const defaults = {
    shopName: "หิ้วลี่",
    depositPercent: 0,
    commissionPercent: 0,
    consignmentFeePercent: 0,
    theme: Object.fromEntries(
      ["primary", "ink", "muted", "background", "surface", "positive"].map(
        (role) => [role, customerColors[role].DEFAULT],
      ),
    ),
    logo: "",
    favicon: "",
    paymentQr: "",
    paymentQrReceiver: "",
    slideSeconds: 6,
    socialVisibility: Object.fromEntries(
      socialPlatforms.map((p) => [p.key, true]),
    ),
    bankCode: "",
    bankNumber: "",
    bankName: "",
    accountName: "",
    accountNameEn: "",
    botEnabled: false,
    lineLoginEnabled: false,
    lineLoginChannelId: "",
    lineTopupEnabled: false,
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
