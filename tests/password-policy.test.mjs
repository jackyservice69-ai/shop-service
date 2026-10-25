import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture, login, mutate, PASSWORD } from "./helpers.mjs";
import { passwordMatches } from "../server/db.mjs";

test("registration rejects seven characters, accepts eight and retains the upper password limit", async () => {
  const f = fixture();
  try {
    for (const [password, status] of [
      ["Aa12!xy", 400],
      ["Aa12!xyz", 200],
      ["x".repeat(128), 200],
      ["x".repeat(129), 400],
    ]) {
      const email = crypto.randomUUID() + "@password.test";
      const response = await request(f.app).post("/api/auth/register").send({
        firstName: "ลูกค้า",
        lastName: "รหัสผ่าน",
        phone: "0812345678",
        email,
        password,
      });
      assert.equal(response.status, status);
      const user = f.db.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (status === 200) {
        assert.equal(user.role_id, "customer");
        assert.notEqual(user.password, password);
        assert.ok(passwordMatches(password, user.password));
        assert.equal(
          (
            await request(f.app)
              .post("/api/auth/login")
              .send({ email, password })
          ).status,
          200,
        );
      } else assert.equal(user, undefined);
    }
  } finally {
    f.db.close();
  }
});

test("changing to eight characters still checks current password/CSRF and revokes old sessions", async () => {
  const f = fixture();
  try {
    const client = await login(f.app, f.customer);
    const second = await login(f.app, f.customer);
    assert.equal(
      (
        await mutate(client, "/api/auth/password", {
          current: PASSWORD,
          password: "Aa12!xy",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(client, "/api/auth/password", {
          current: "wrong",
          password: "Aa12!xyz",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await client.agent
          .post("/api/auth/password")
          .set("Origin", "http://127.0.0.1:5174")
          .send({ current: PASSWORD, password: "Aa12!xyz" })
      ).status,
      403,
    );
    assert.equal(
      (
        await mutate(client, "/api/auth/password", {
          current: PASSWORD,
          password: "Aa12!xyz",
        })
      ).status,
      200,
    );
    assert.equal((await client.agent.get("/api/me")).body.user, null);
    assert.equal((await second.agent.get("/api/me")).body.user, null);
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: f.customer.email, password: PASSWORD })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(f.app)
          .post("/api/auth/login")
          .send({ email: f.customer.email, password: "Aa12!xyz" })
      ).status,
      200,
    );
  } finally {
    f.db.close();
  }
});
