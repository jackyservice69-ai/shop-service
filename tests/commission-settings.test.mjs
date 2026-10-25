import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, mutate, addUser } from "./helpers.mjs";
import { getSettings, verifyAudit } from "../server/db.mjs";

const path = "/api/admin/commissions/settings";

test("commission-only settings validate the rate, preserve branding and audit owner changes", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin);
    const initial = getSettings(f.db);
    assert.equal((await a.agent.get(path)).body.commissionPercent, 0);
    assert.equal(
      (await a.agent.put(path).send({ commissionPercent: 7.25 })).status,
      403,
    );
    assert.equal(
      (
        await a.agent
          .put(path)
          .set("x-csrf-token", a.csrf)
          .set("Origin", "https://other.test")
          .send({ commissionPercent: 7.25 })
      ).status,
      403,
    );
    for (const commissionPercent of [-1, 101, 0.001, "7.25", null]) {
      assert.equal(
        (await mutate(a, path, { commissionPercent }, "put")).status,
        400,
      );
    }
    assert.equal(
      (
        await mutate(
          a,
          path,
          { commissionPercent: 10, bankNumber: "9999999999" },
          "put",
        )
      ).status,
      400,
    );
    assert.equal(getSettings(f.db).commissionPercent, 0);
    for (const commissionPercent of [100, 0, 7.25]) {
      assert.equal(
        (await mutate(a, path, { commissionPercent }, "put")).status,
        200,
      );
      assert.equal(
        (await a.agent.get(path)).body.commissionPercent,
        commissionPercent,
      );
    }
    const settings = getSettings(f.db);
    assert.deepEqual(
      { ...settings, commissionPercent: initial.commissionPercent },
      initial,
    );
    const audits = f.db
      .prepare(
        "SELECT * FROM audit WHERE action='commission.settings.updated' ORDER BY id",
      )
      .all();
    assert.equal(audits.length, 3);
    assert.ok(audits.every((row) => row.actor_id === f.admin.id));
    assert.equal(verifyAudit(f.db).valid, true);
    const { commissionPercent, ...appearance } = (
      await a.agent.get("/api/admin/appearance")
    ).body;
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/appearance",
          { ...appearance, slideSeconds: 9 },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(getSettings(f.db).commissionPercent, 7.25);
  } finally {
    f.db.close();
  }
});

test("customers, finance, marketing and wildcard staff cannot read or change owner commission settings", async () => {
  const f = fixture();
  try {
    assert.equal((await request(f.app).get(path)).status, 401);
    f.db
      .prepare("INSERT INTO roles VALUES(?,?,?)")
      .run("test-wide", "Test broad staff", '["*"]');
    for (const role of ["customer", "accountant", "marketing", "test-wide"]) {
      const actor = await login(f.app, addUser(f.db, role));
      assert.equal((await actor.agent.get(path)).status, 403, role);
      assert.equal(
        (await mutate(actor, path, { commissionPercent: 25 }, "put")).status,
        403,
        role,
      );
      if (role === "accountant")
        assert.equal(
          (await actor.agent.get("/api/admin/commissions")).status,
          200,
        );
    }
    assert.equal(getSettings(f.db).commissionPercent, 0);
  } finally {
    f.db.close();
  }
});
