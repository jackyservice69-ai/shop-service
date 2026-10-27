import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import request from "supertest";
import {
  fixture,
  addUser,
  login,
  mutate,
  PASSWORD,
  orderInput,
} from "./helpers.mjs";
import {
  openDb,
  wallet,
  id,
  now,
  verifyAudit,
  getSettings,
} from "../server/db.mjs";
import { catalog, hasPermission } from "../shared/authorization.mjs";

async function staff(f, role) {
  return login(f.app, addUser(f.db, role));
}
function custom(f, name, permissions) {
  f.db
    .prepare("INSERT INTO roles VALUES(?,?,?)")
    .run(name, name, JSON.stringify(permissions));
}
const profile = (email) => ({
  firstName: "ชื่อใหม่",
  lastName: "ทดสอบ",
  phone: "0812345678",
  email,
  version: 1,
  actorPassword: PASSWORD,
});
test("six initial roles grant only their intended modules; staff never get receiving accounts, secrets or fee settings", async () => {
  const f = fixture({ apiRateLimit: 1000, authRateLimit: 100 });
  try {
    const rows = f.db.prepare("SELECT * FROM roles").all();
    assert.deepEqual(
      rows.map((r) => r.id).sort(),
      [
        "admin",
        "customer",
        "manager",
        "support",
        "accountant",
        "marketing",
      ].sort(),
    );
    const endpoints = {
      dashboard: ["manager"],
      orders: ["manager", "support"],
      products: ["manager"],
      members: ["manager"],
      finance: ["accountant"],
      commissions: ["accountant"],
      promotions: ["marketing"],
      announcements: ["marketing"],
      banners: ["marketing"],
      appearance: ["marketing"],
      consignments: ["manager"],
      reviews: ["manager"],
    };
    for (const role of ["manager", "support", "accountant", "marketing"]) {
      const c = await staff(f, role);
      for (const [route, allowed] of Object.entries(endpoints)) {
        const suffix = "";
        assert.equal(
          (await c.agent.get("/api/admin/" + route + suffix)).status,
          allowed.includes(role) ? 200 : 403,
          `${role}: ${route}`,
        );
      }
      for (const route of [
        "settings",
        "integrations/easyslip",
        "consignment-settings",
        "audit",
      ])
        assert.equal(
          (await c.agent.get("/api/admin/" + route)).status,
          403,
          role + ": " + route,
        );
      assert.equal(
        (await mutate(c, "/api/admin/settings", {}, "put")).status,
        403,
      );
      assert.equal(
        (
          await mutate(
            c,
            "/api/admin/consignment-settings",
            { feePercent: 99 },
            "put",
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await mutate(c, "/api/admin/roles", {
            name: "escalation",
            permissions: ["roles"],
          })
        ).status,
        403,
      );
    }
    const a = await login(f.app, f.admin);
    assert.equal((await a.agent.get("/api/admin/settings")).status, 200);
    assert.equal(
      (await a.agent.get("/api/admin/consignment-settings")).status,
      200,
    );
    const info = (await a.agent.get("/api/admin/roles")).body;
    assert.ok(!info.permissions.includes("settings"));
    assert.equal(info.ownerOnly[0].id, "settings");
  } finally {
    f.db.close();
  }
});
test("viewing, advancing and cancelling orders are separate: shipping staff cannot refund and refund rights require order visibility", async () => {
  const f = fixture();
  try {
    wallet(f.db, f.customer.id, 50000, "test-opening", id());
    const c = await login(f.app, f.customer),
      a = await login(f.app, f.admin),
      support = await staff(f, "support");
    const created = await mutate(
      c,
      "/api/orders",
      orderInput(f.product),
      "post",
      id(),
    );
    assert.equal(created.status, 201);
    const oid = created.body.id;
    custom(f, "order-reader", ["orders"]);
    const reader = await staff(f, "order-reader");
    const visibleOrders = await reader.agent.get("/api/admin/orders");
    assert.equal(visibleOrders.status, 200);
    assert.ok(
      visibleOrders.body.items.every((o) =>
        o.items.every((item) => !("cost" in item)),
      ),
    );
    const ownerOrders = await a.agent.get("/api/admin/orders");
    assert.ok(
      ownerOrders.body.items.every((o) =>
        o.items.every((item) => "cost" in item),
      ),
    );
    assert.equal(
      (
        await mutate(
          reader,
          "/api/admin/orders/" + oid,
          { status: "processing" },
          "put",
        )
      ).status,
      403,
    );
    const before = f.db
      .prepare("SELECT balance FROM users WHERE id=?")
      .get(f.customer.id).balance;
    assert.equal(
      (await mutate(support, "/api/admin/orders/" + oid + "/cancel")).status,
      403,
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      before,
    );
    assert.equal(
      (
        await mutate(
          support,
          "/api/admin/orders/" + oid,
          { status: "processing" },
          "put",
        )
      ).status,
      200,
    );
    custom(f, "broken-update", ["orders_update", "orders_cancel"]);
    const broken = await staff(f, "broken-update");
    assert.equal(
      (
        await mutate(
          broken,
          "/api/admin/orders/" + oid,
          { status: "shipped", tracking: "TEST123" },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (await mutate(broken, "/api/admin/orders/" + oid + "/cancel")).status,
      403,
    );
    assert.equal(
      (await mutate(a, "/api/admin/orders/" + oid + "/cancel")).status,
      200,
    );
    assert.equal(
      f.db.prepare("SELECT balance FROM users WHERE id=?").get(f.customer.id)
        .balance,
      50000,
    );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM ledger WHERE kind='refund'").get().n,
      1,
    );
  } finally {
    f.db.close();
  }
});
test("financial read, write and CSV export require independent permissions; recording expenses cannot change wallet balances", async () => {
  const f = fixture();
  try {
    custom(f, "finance-reader", ["finance"]);
    const reader = await staff(f, "finance-reader"),
      accountant = await staff(f, "accountant");
    const body = {
      type: "expense",
      category: "ขนส่ง",
      description: "ค่าขนส่งทดสอบ",
      amount: 500,
    };
    assert.equal((await reader.agent.get("/api/admin/finance")).status, 200);
    assert.equal(
      (await reader.agent.get("/api/admin/finance/export")).status,
      403,
    );
    assert.equal(
      (await mutate(reader, "/api/admin/finance", body, "post", id())).status,
      403,
    );
    assert.equal(
      (await mutate(accountant, "/api/admin/finance", body, "post", id()))
        .status,
      200,
    );
    assert.equal(
      (await accountant.agent.get("/api/admin/finance/export")).status,
      200,
    );
    assert.equal(f.db.prepare("SELECT SUM(balance) n FROM users").get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ledger").get().n, 0);
  } finally {
    f.db.close();
  }
});
test("profile edit and password reset are independent, require member visibility and reauthentication, and hide balances from member-only staff", async () => {
  const f = fixture();
  try {
    custom(f, "profile-staff", ["members", "member_edit"]);
    custom(f, "reset-staff", ["members", "member_reset"]);
    const edit = await staff(f, "profile-staff"),
      reset = await staff(f, "reset-staff"),
      target = "/api/admin/members/" + f.customer.id;
    assert.equal(
      (
        await mutate(edit, target + "/reset-password", {
          version: 1,
          actorPassword: PASSWORD,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          reset,
          target + "/profile",
          profile(f.customer.email),
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          edit,
          target + "/profile",
          profile(f.customer.email),
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(reset, target + "/reset-password", {
          version: 2,
          actorPassword: "wrong",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(reset, target + "/reset-password", {
          version: 2,
          actorPassword: PASSWORD,
        })
      ).status,
      200,
    );
    const rows = (await edit.agent.get("/api/admin/members")).body.items;
    assert.ok(rows.every((r) => !("balance" in r)));
    const a = await login(f.app, f.admin);
    assert.ok(
      (await a.agent.get("/api/admin/members")).body.items.every(
        (r) => "balance" in r,
      ),
    );
  } finally {
    f.db.close();
  }
});
test("marketing can upload and save branding and banners but cannot change commissions, receiving QR, bank accounts or API keys", async () => {
  const f = fixture();
  try {
    const m = await staff(f, "marketing");
    const initial = (await m.agent.get("/api/admin/appearance")).body;
    assert.ok(!("commissionPercent" in initial));
    const image = await sharp({
      create: { width: 32, height: 32, channels: 4, background: "#f6c2c2" },
    })
      .png()
      .toBuffer();
    const upload = (kind) =>
      m.agent
        .post("/api/admin/media/" + kind)
        .set("x-csrf-token", m.csrf)
        .attach("image", image, {
          filename: "test.png",
          contentType: "image/png",
        });
    const logo = await upload("logo");
    assert.equal(logo.status, 201);
    assert.equal((await upload("favicon")).status, 201);
    const banner = await upload("banner");
    assert.equal(banner.status, 201);
    assert.equal((await upload("paymentQr")).status, 403);
    const { imageGuides, ...fields } = initial;
    assert.equal(
      (
        await mutate(
          m,
          "/api/admin/appearance",
          { ...fields, logo: logo.body.url },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(
          m,
          "/api/admin/appearance",
          { ...fields, commissionPercent: 99 },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          m,
          "/api/admin/appearance",
          { ...fields, bankNumber: "9999999999" },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          m,
          "/api/admin/appearance",
          { ...fields, easyslipApiKey: "attacker" },
          "put",
        )
      ).status,
      400,
    );
    const before = getSettings(f.db);
    assert.equal(before.commissionPercent, 0);
    assert.equal(before.bankNumber, "1234567890");
    const res = await mutate(m, "/api/admin/banners", {
      title: "ข่าวใหม่",
      image: banner.body.url,
      link: "/promotions",
      position: 0,
      active: true,
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 600000).toISOString(),
    });
    assert.equal(res.status, 201);
    assert.equal(
      (await request(f.app).get("/api/public")).body.banners[0].title,
      "ข่าวใหม่",
    );
  } finally {
    f.db.close();
  }
});
test("owner-only configuration rejects even a custom wildcard; dependency validation and session revocation prevent escalation and stale grants", async () => {
  const f = fixture();
  try {
    custom(f, "wildcard-staff", ["*"]);
    const wide = await staff(f, "wildcard-staff"),
      a = await login(f.app, f.admin);
    assert.equal((await wide.agent.get("/api/admin/settings")).status, 403);
    assert.equal(
      (
        await mutate(
          wide,
          "/api/admin/consignment-settings",
          { feePercent: 99 },
          "put",
        )
      ).status,
      403,
    );
    const appearance = (await wide.agent.get("/api/admin/appearance")).body;
    assert.equal(
      (
        await mutate(
          wide,
          "/api/admin/appearance",
          { ...appearance, commissionPercent: 99 },
          "put",
        )
      ).status,
      403,
    );
    for (const permissions of [
      ["settings"],
      ["*"],
      ["orders_cancel"],
      ["finance_write"],
      ["member_reset"],
    ])
      assert.equal(
        (await mutate(a, "/api/admin/roles", { name: id(), permissions }))
          .status,
        400,
      );
    const role = await mutate(a, "/api/admin/roles", {
      name: "อัปเดตออร์เดอร์",
      permissions: ["orders", "orders_update"],
    });
    assert.equal(role.status, 201);
    const u = addUser(f.db, role.body.id),
      s = await login(f.app, u);
    assert.equal((await s.agent.get("/api/admin/orders")).status, 200);
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/roles/" + role.body.id,
          { name: "ดูออร์เดอร์", permissions: ["orders"] },
          "put",
        )
      ).status,
      200,
    );
    assert.equal((await s.agent.get("/api/me")).body.user, null);
    const fresh = await login(f.app, u);
    assert.equal(
      (
        await mutate(
          fresh,
          "/api/admin/orders/missing",
          { status: "processing" },
          "put",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(
          fresh,
          "/api/admin/members/" + f.customer.id,
          { role_id: "admin", active: true },
          "put",
        )
      ).status,
      403,
    );
    assert.ok(verifyAudit(f.db).valid);
    for (const p of catalog.permissions)
      assert.equal(hasPermission(null, p.id), false);
  } finally {
    f.db.close();
  }
});
test("v8 migration narrows legacy broad grants, revokes staff sessions, preserves financial data and role edits, and is repeatable", () => {
  const dir = mkdtempSync(join(tmpdir(), "hiewly-roles-")),
    path = join(dir, "legacy.sqlite");
  let db;
  try {
    db = openDb(path);
    db.prepare("INSERT INTO roles VALUES(?,?,?)").run(
      "legacy",
      "ทีมเดิม",
      JSON.stringify(["orders", "finance", "member_edit", "settings"]),
    );
    const u = addUser(db, "legacy", 76543);
    db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
      id(),
      u.id,
      id(),
      new Date(Date.now() + 60000).toISOString(),
    );
    db.prepare(
      "UPDATE roles SET permissions='[\"orders\"]' WHERE id='manager'",
    ).run();
    db.exec("PRAGMA user_version=7");
    db.close();
    db = null;
    let auditCount;
    for (let i = 0; i < 2; i++) {
      db = openDb(path);
      const row = db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
      assert.equal(row.role_id, "legacy");
      assert.equal(row.balance, 76543);
      assert.equal(row.password, u.password);
      const permissions = JSON.parse(
        db.prepare("SELECT permissions FROM roles WHERE id='legacy'").get()
          .permissions,
      );
      for (const allowed of [
        "orders",
        "finance",
        "members",
        "member_edit",
        "appearance",
        "banners",
      ])
        assert.ok(permissions.includes(allowed));
      for (const forbidden of [
        "settings",
        "orders_update",
        "orders_cancel",
        "finance_write",
        "finance_export",
        "member_reset",
      ])
        assert.ok(!permissions.includes(forbidden));
      assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
      assert.deepEqual(
        JSON.parse(
          db.prepare("SELECT permissions FROM roles WHERE id='manager'").get()
            .permissions,
        ),
        ["orders"],
      );
      const count = db.prepare("SELECT COUNT(*) n FROM audit").get().n;
      if (i) assert.equal(count, auditCount);
      auditCount = count;
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 17);
      assert.ok(verifyAudit(db).valid);
      db.close();
      db = null;
    }
  } finally {
    db?.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
    rmdirSync(dir);
  }
});
