import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("member submits a request, approver reads it independently, and the result appears in the member bell", async ({
  page,
  browser,
  baseURL,
}) => {
  const admin = await browser.newContext({ baseURL }),
    adminPage = await admin.newPage();
  const shopName = "ร้านกระดิ่ง " + crypto.randomUUID().slice(0, 8);
  try {
    await page.goto("/contact");
    await expect(page.locator(".notification-bell")).toHaveCount(0);
    const registration = await page.request.post("/api/auth/register", {
      data: {
        firstName: "ทดสอบกระดิ่ง",
        lastName: "แจ้งเตือน",
        phone: "0812345678",
        email: crypto.randomUUID() + "@notifications.test",
        password: "Test-strong-password-2026!",
      },
    });
    expect(registration.ok()).toBe(true);
    const member = (await registration.json()).user;
    await page.goto("/consignment");
    await page.getByLabel("ชื่อร้านตัวแทน").fill(shopName);
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "ส่งคำขอสมัคร", exact: true })
      .click();
    const bell = page.locator(".notification-bell");
    await expect(bell).toHaveAccessibleName("การแจ้งเตือน ยังไม่อ่าน 1 รายการ");
    await bell.click();
    let dialog = page.getByRole("dialog", {
      name: "การแจ้งเตือน",
      exact: true,
    });
    await expect(dialog.locator(".notification-feed")).toContainText(shopName);
    await expect(dialog).toContainText("ส่งคำขอสมัครตัวแทนแล้ว");
    await page.keyboard.press("Escape");
    await expect(bell).toBeFocused();
    expect(
      (await (await page.request.get("/api/notifications")).json()).unreadCount,
    ).toBe(1);
    const login = await admin.request.post("/api/auth/login", {
      data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
    });
    expect(login.ok()).toBe(true);
    await adminPage.goto("/admin/consignments");
    await adminPage.locator(".notification-bell").click();
    const adminDialog = adminPage.getByRole("dialog", {
      name: "การแจ้งเตือน",
      exact: true,
    });
    await adminDialog
      .locator(".notification-feed li")
      .filter({ hasText: shopName })
      .getByRole("link")
      .click();
    await expect(adminDialog).toHaveCount(0);
    const roleFeed = await (
      await admin.request.get("/api/notifications")
    ).json();
    expect(
      roleFeed.items.find((n: any) => n.body.includes(shopName)).read_at,
    ).toBeTruthy();
    expect(
      (await (await page.request.get("/api/notifications")).json()).unreadCount,
    ).toBe(1);
    const csrf = (await (await admin.request.get("/api/me")).json()).csrf;
    const decision = await admin.request.put(
      "/api/admin/consignments/" + member.id,
      {
        headers: { "x-csrf-token": csrf },
        data: { status: "approved", note: "", version: 1 },
      },
    );
    expect(decision.ok()).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(bell).toHaveAccessibleName("การแจ้งเตือน ยังไม่อ่าน 2 รายการ");
    await bell.click();
    dialog = page.getByRole("dialog", { name: "การแจ้งเตือน", exact: true });
    await expect(dialog).toContainText("อนุมัติเป็นตัวแทนฝากขายแล้ว");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const scan = await new AxeBuilder({ page })
        .include("dialog")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        scan.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
    }
    await page.screenshot({
      path: "output/playwright/notification-member-desktop.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "output/playwright/notification-member-mobile.png",
    });
    await dialog
      .getByRole("button", { name: "อ่านทั้งหมด", exact: true })
      .click();
    await expect(bell).toHaveAccessibleName("การแจ้งเตือน");
    await page.keyboard.press("Escape");
    await bell.click();
    await page
      .getByRole("dialog", { name: "การแจ้งเตือน", exact: true })
      .getByRole("link")
      .filter({ hasText: "อนุมัติเป็นตัวแทนฝากขายแล้ว" })
      .click();
    await expect(page).toHaveURL("/consignment");
    await expect(
      page.getByRole("heading", { name: shopName, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".panel .badge").first()).toContainText(
      "อนุมัติแล้ว",
    );
    await page.reload();
    await expect(bell).toHaveAccessibleName("การแจ้งเตือน");
    await adminPage.setViewportSize({ width: 320, height: 900 });
    await adminPage.goto("/contact");
    expect(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await admin.close();
  }
});

test("bell handles empty lists and load failures without presenting a false success", async ({
  page,
}) => {
  const signup = await page.request.post("/api/auth/register", {
    data: {
      firstName: "รายการว่าง",
      lastName: "แจ้งเตือน",
      phone: "0812345678",
      email: crypto.randomUUID() + "@notifications.test",
      password: "Test-strong-password-2026!",
    },
  });
  expect(signup.ok()).toBe(true);
  let failing = true;
  await page.route("**/api/notifications?*", (route) =>
    failing
      ? route.fulfill({
          status: 503,
          json: { error: "โหลดรายการไม่ได้ชั่วคราว" },
        })
      : route.continue(),
  );
  await page.goto("/account");
  const bell = page.locator(".notification-bell");
  await expect(bell).toHaveAccessibleName("การแจ้งเตือน โหลดไม่สำเร็จ");
  await bell.click();
  const dialog = page.getByRole("dialog", {
    name: "การแจ้งเตือน",
    exact: true,
  });
  await expect(dialog.getByRole("alert")).toContainText(
    "โหลดรายการไม่ได้ชั่วคราว",
  );
  await expect(
    dialog.getByText("ยังไม่มีการแจ้งเตือน", { exact: true }),
  ).toHaveCount(0);
  failing = false;
  await dialog.getByRole("button", { name: "โหลดใหม่", exact: true }).click();
  await expect(
    dialog.getByText("ยังไม่มีการแจ้งเตือน", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "อ่านทั้งหมด", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});
