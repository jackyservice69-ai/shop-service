import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const password = "Test-strong-password-2026!";
async function authorize(page: Page, email: string, subject: string) {
  await page.route("https://accounts.google.com/**", async (route) => {
    const url = new URL(route.request().url());
    const state = url.searchParams.get("state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const response = await page.request.post("/__test/google-code", {
      data: {
        state,
        claims: {
          email,
          sub: subject,
          given_name: "ชื่อกูเกิล",
          family_name: "ทดสอบ",
        },
      },
    });
    expect(response.ok()).toBe(true);
    const { code } = await response.json();
    const callback = new URL(url.searchParams.get("redirect_uri")!);
    callback.searchParams.set("state", state!);
    callback.searchParams.set("code", code);
    await route.fulfill({
      status: 302,
      headers: { location: callback.href },
      body: "",
    });
  });
}
test("Google signup and returning login preserve member and referral; buttons have Google logo, work on mobile and retain local login", async ({
  page,
}) => {
  const email = crypto.randomUUID() + "@test.example",
    subject = crypto.randomUUID();
  await authorize(page, email, subject);
  await page.goto("/register");
  const google = page.getByRole("button", {
    name: "สมัครสมาชิกด้วย Google",
    exact: true,
  });
  await expect(google).toBeEnabled();
  await expect(google.locator("img")).toHaveAttribute(
    "src",
    "/assets/brands/google.svg",
  );
  await expect(google).toHaveCSS("box-shadow", "none");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await google.click();
  await expect(page).toHaveURL(/\/google\/complete$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByLabel("ชื่อหน้า")).toHaveValue("ชื่อกูเกิล");
  await page
    .getByRole("button", { name: "สร้างบัญชีด้วย Google", exact: true })
    .click();
  await expect(page.getByLabel("เบอร์โทร")).toBeFocused();
  await page.getByLabel("เบอร์โทร").fill("081-234-5678");
  await page.getByLabel("รู้จักเราจากที่ไหน").selectOption("อื่นๆ");
  await page
    .getByRole("button", { name: "สร้างบัญชีด้วย Google", exact: true })
    .click();
  await expect(page.getByLabel("ระบุช่องทางอื่นๆ")).toBeFocused();
  await page.getByLabel("ระบุช่องทางอื่นๆ").fill("  เพื่อนร่วมงานบอกต่อ  ");
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await page
    .getByRole("button", { name: "สร้างบัญชีด้วย Google", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  const first = (await (await page.request.get("/api/me")).json()).user;
  expect(first.email).toBe(email);
  expect(first.roleId).toBe("customer");
  expect(first.balance).toBe(0);
  expect(first.discoverySource).toBe("เพื่อนร่วมงานบอกต่อ");
  await page.goto("/account");
  await expect(
    page.getByText("บัญชีนี้เข้าสู่ระบบด้วย Google", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("รหัสผ่านปัจจุบัน")).toHaveCount(0);
  await page
    .getByRole("button", { name: "ออกจากระบบ", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page
    .getByRole("button", { name: "เข้าสู่ระบบด้วย Google", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect((await (await page.request.get("/api/me")).json()).user.id).toBe(
    first.id,
  );
});
test("Google with an existing email requires original password and keeps the same account", async ({
  page,
}) => {
  const email = crypto.randomUUID() + "@test.example";
  const created = await page.request.post("/api/auth/register", {
    data: {
      firstName: "เดิม",
      lastName: "ทดสอบ",
      phone: "0812345678",
      email,
      password,
    },
  });
  expect(created.ok()).toBe(true);
  const original = await created.json();
  await page.request.post("/api/auth/logout", {
    headers: { "x-csrf-token": original.csrf },
    data: {},
  });
  await authorize(page, email, crypto.randomUUID());
  await page.goto("/login?next=/admin");
  await page
    .getByRole("button", { name: "เข้าสู่ระบบด้วย Google", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "เชื่อม Google กับบัญชีเดิม",
      exact: true,
    }),
  ).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user).toBeNull();
  await page.getByLabel("รหัสผ่านบัญชีเดิม").fill("wrong");
  await page
    .getByRole("button", { name: "ยืนยันและเชื่อม Google", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "รหัสผ่านบัญชีเดิมไม่ถูกต้อง",
  );
  await page.getByLabel("รหัสผ่านบัญชีเดิม").fill(password);
  await page
    .getByRole("button", { name: "ยืนยันและเชื่อม Google", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect((await (await page.request.get("/api/me")).json()).user.id).toBe(
    original.user.id,
  );
});
test("cancelled and expired Google flows explain recovery; disabled Google keeps email form usable", async ({
  page,
}) => {
  await page.goto("/login?google=cancelled");
  await expect(
    page.getByText("ยกเลิก Google Login แล้ว สามารถเริ่มใหม่ได้", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/google/complete");
  await expect(page.getByRole("alert")).toContainText("หมดอายุ");
  await page
    .getByRole("link", { name: "กลับไปเข้าสู่ระบบ", exact: true })
    .click();
  await page.route("**/api/auth/google/status", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }),
  ).toBeEnabled();
});
