import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
const password = "Test-strong-password-2026!";
async function authorize(
  page: Page,
  provider: "line" | "google",
  claims: Record<string, string>,
) {
  await page.route(
    provider === "line"
      ? "https://access.line.me/**"
      : "https://accounts.google.com/**",
    async (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      const response = await page.request.post(`/__test/${provider}-code`, {
        data: { state: url.searchParams.get("state"), claims },
      });
      expect(response.ok()).toBe(true);
      const { code } = await response.json();
      const callback = new URL(url.searchParams.get("redirect_uri")!);
      callback.searchParams.set("state", url.searchParams.get("state")!);
      callback.searchParams.set("code", code);
      await route.fulfill({
        status: 302,
        headers: { location: callback.href },
        body: "",
      });
    },
  );
}
async function localMember(page: Page) {
  const email = crypto.randomUUID() + "@example.test";
  const created = await page.request.post("/api/auth/register", {
    data: {
      firstName: "สมาชิก",
      lastName: "เชื่อมบัญชี",
      phone: "0812345678",
      email,
      password,
    },
  });
  expect(created.ok()).toBe(true);
  return (await created.json()).user;
}

test("existing member connects LINE and Google on account; signed LINE slip appears in same wallet, repeated slip credits once", async ({
  page,
}) => {
  const user = await localMember(page),
    subject = "U" + crypto.randomUUID().replaceAll("-", "");
  await authorize(page, "line", { sub: subject, name: "LINE เชื่อมบัญชี" });
  await authorize(page, "google", {
    sub: crypto.randomUUID(),
    email: crypto.randomUUID() + "@test.example",
  });
  await page.goto("/account");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "เชื่อมต่อ LINE", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(user.email);
  await dialog.getByLabel("รหัสผ่านปัจจุบันเพื่อเชื่อมต่อ").fill("wrong");
  await dialog
    .getByRole("button", { name: "ยืนยันและไปยัง LINE", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  );
  await dialog.getByLabel("รหัสผ่านปัจจุบันเพื่อเชื่อมต่อ").fill(password);
  await dialog
    .getByRole("button", { name: "ยืนยันและไปยัง LINE", exact: true })
    .click();
  await expect(page).toHaveURL(/account\?line=linked$/);
  await expect(
    page.getByText("LINE เชื่อมบัญชี", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "เชื่อมต่อ Google", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("รหัสผ่านปัจจุบันเพื่อเชื่อมต่อ")
    .fill(password);
  await page
    .getByRole("button", { name: "ยืนยันและไปยัง Google", exact: true })
    .click();
  await expect(page).toHaveURL(/account\?google=linked$/);
  expect((await (await page.request.get("/api/me")).json()).user.id).toBe(
    user.id,
  );
  expect(
    (await (await page.request.get("/api/auth/connections")).json()).google
      .linked,
  ).toBe(true);
  expect(
    (await (await page.request.get("/api/auth/connections")).json()).line
      .linked,
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "output/playwright/account-social-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.request.post("/__test/bot-tick", { data: {} });
  const event = {
    webhookEventId: crypto.randomUUID(),
    replyToken: "test-reply",
    type: "message",
    source: { type: "user", userId: subject },
    message: { type: "image", id: "101010", contentProvider: { type: "line" } },
  };
  const raw = JSON.stringify({ events: [event] });
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post("/api/line/webhook", {
      data: raw,
      headers: {
        "content-type": "application/json",
        "x-line-signature": createHmac("sha256", "test-line-secret")
          .update(raw)
          .digest("base64"),
      },
    });
    expect(response.ok()).toBe(true);
    await page.request.post("/__test/bot-tick", { data: {} });
  }
  await page.goto("/wallet");
  expect((await (await page.request.get("/api/me")).json()).user.balance).toBe(
    25000,
  );
  await expect(
    page.getByRole("cell", { name: "เติมเงินผ่าน LINE", exact: true }),
  ).toHaveCount(1);
  await page.goto("/account");
  await page
    .getByRole("button", { name: "ออกจากระบบ", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect((await (await page.request.get("/api/me")).json()).user.id).toBe(
    user.id,
  );
});

test("new LINE member completes contact profile; optional unconfigured LINE and cancelled flow recover cleanly", async ({
  page,
}) => {
  await authorize(page, "line", {
    sub: "U" + crypto.randomUUID().replaceAll("-", ""),
    name: "LINE สมาชิกใหม่",
  });
  await page.goto("/register");
  await page
    .getByRole("button", { name: "สมัครสมาชิกด้วย LINE", exact: true })
    .click();
  await expect(page).toHaveURL(/line\/complete$/);
  await page
    .getByRole("button", { name: "สร้างบัญชีและเชื่อมต่อ LINE", exact: true })
    .click();
  await expect(page.getByLabel("ชื่อหน้า")).toBeFocused();
  await page.getByLabel("ชื่อหน้า").fill("ใหม่");
  await page.getByLabel("นามสกุล").fill("ไลน์");
  await page.getByLabel("เบอร์โทร").fill("0812345678");
  await page.getByLabel("อีเมล").fill(crypto.randomUUID() + "@example.test");
  await page.getByLabel("รหัสผ่าน", { exact: false }).fill(password);
  await page.getByLabel("รู้จักเราจากที่ไหน").selectOption("Line");
  await page
    .getByRole("button", { name: "สร้างบัญชีและเชื่อมต่อ LINE", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect(
    (await (await page.request.get("/api/auth/connections")).json()).line
      .linked,
  ).toBe(true);
  await page.goto("/account");
  await page
    .getByRole("button", { name: "ออกจากระบบ", exact: true })
    .last()
    .click();
  await page.route("**/api/auth/line/status", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/login?line=cancelled");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("ยกเลิก LINE Login แล้ว สามารถเริ่มใหม่ได้"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeEnabled();
});

test("Google-only member can link LINE after fresh provider login without inventing a local password", async ({
  page,
}) => {
  await authorize(page, "google", {
    sub: crypto.randomUUID(),
    email: crypto.randomUUID() + "@test.example",
  });
  await authorize(page, "line", {
    sub: "U" + crypto.randomUUID().replaceAll("-", ""),
    name: "LINE จาก Google",
  });
  await page.goto("/register");
  await page
    .getByRole("button", { name: "สมัครสมาชิกด้วย Google", exact: true })
    .click();
  await page.getByLabel("ชื่อหน้า").fill("Google");
  await page.getByLabel("นามสกุล").fill("เชื่อมไลน์");
  await page.getByLabel("เบอร์โทร").fill("0812345678");
  await page
    .getByRole("button", { name: "สร้างบัญชีด้วย Google", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await page
    .getByRole("button", { name: "เชื่อมต่อ LINE", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("รหัสผ่านปัจจุบันเพื่อเชื่อมต่อ"),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "ยืนยันและไปยัง LINE", exact: true })
    .click();
  await expect(page).toHaveURL(/line=linked$/);
});
