import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { config as dotenv } from "dotenv";
import {
  openDb,
  id,
  now,
  passwordHash,
  setSetting,
  audit,
  transaction,
} from "../server/db.mjs";
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    `PORT=3002\nAPP_ORIGIN=http://127.0.0.1:5174\nDATABASE_PATH=./data/hiewly.sqlite\nSETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
dotenv({ quiet: true });
if (!process.env.SETTINGS_ENCRYPTION_KEY) {
  writeFileSync(
    ".env",
    readFileSync(".env", "utf8") +
      `\nSETTINGS_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`,
  );
  dotenv({ override: true, quiet: true });
}
const db = openDb(process.env.DATABASE_PATH || "./data/hiewly.sqlite");
if (!db.prepare("SELECT id FROM users WHERE role_id='admin'").get()) {
  const password =
    process.env.ADMIN_PASSWORD || randomBytes(20).toString("base64url");
  if (password.length < 12)
    throw new Error("ADMIN_PASSWORD must contain at least 12 characters");
  const email = (process.env.ADMIN_EMAIL || "admin@hiewly.local").toLowerCase();
  const uid = id();
  transaction(db, () => {
    db.prepare(
      "INSERT INTO users(id,name,email,password,role_id,referral_code,created_at) VALUES(?,?,?,?,?,?,?)",
    ).run(
      uid,
      "ผู้ดูแลร้าน",
      email,
      passwordHash(password),
      "admin",
      id().slice(0, 10),
      now(),
    );
    audit(db, uid, "system.bootstrap", uid);
  });
  writeFileSync(
    ".local-admin.txt",
    `Local administrator\nURL: ${process.env.APP_ORIGIN || "http://127.0.0.1:5174"}/login\nEmail: ${email}\nPassword: ${password}\nChange this password from the account page after first login. This file is gitignored.\n`,
    { mode: 0o600 },
  );
  chmodSync(".local-admin.txt", 0o600);
  console.log(
    "Created admin. Credentials saved to .local-admin.txt (not printed).",
  );
}
for (const [key, env] of Object.entries({
  bankCode: "BANK_CODE",
  bankNumber: "BANK_NUMBER",
  bankName: "BANK_NAME",
  accountName: "BANK_ACCOUNT_NAME",
  accountNameEn: "BANK_ACCOUNT_NAME_EN",
}))
  if (process.env[env]) setSetting(db, key, process.env[env]);
db.close();
console.log("Database and configuration ready.");
