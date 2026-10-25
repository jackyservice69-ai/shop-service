import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("account links stay grouped, support Escape/outside click, and navigate with focus", async ({
  page,
}) => {
  const login = await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
  });
  expect(login.ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/products");
  const account = page.locator(".account-navigation > summary");
  const group = page.locator(".account-navigation");
  await expect(
    group.getByRole("link", { name: "กระเป๋าเงิน", exact: true }),
  ).toBeHidden();
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(group.getByRole("link")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await expect(group).not.toHaveAttribute("open");
  await account.click();
  await page
    .getByRole("searchbox", { name: "ค้นหาสินค้า", exact: true })
    .click();
  await expect(group).not.toHaveAttribute("open");
  await account.click();
  await group.getByRole("link", { name: "กระเป๋าเงิน", exact: true }).click();
  await expect(page).toHaveURL("/wallet");
  await expect(group).not.toHaveAttribute("open");
  await expect(page.locator("#main-content")).toBeFocused();
  await account.click();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: "output/playwright/account-navigation-dropdown-desktop.png",
  });
  await expect(group).toHaveAttribute("open", "");
  await page.setViewportSize({ width: 1440, height: 400 });
  await expect
    .poll(async () => {
      const box = (await group
        .locator(".account-navigation-links")
        .boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await group.getByRole("link", { name: "ข้อมูลบัญชี", exact: true }).click();
  await expect(page).toHaveURL("/account");
  await account.click();
  await group.getByRole("link", { name: "ข้อมูลบัญชี", exact: true }).click();
  await expect(group).not.toHaveAttribute("open");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("public ordering guide has keyboard FAQ and follows the configured deposit rate", async ({
  page,
}) => {
  let deposit = 0;
  await page.route("**/api/public", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      // Announcements created by other shared-fixture scenarios are tested separately.
      json: {
        ...(await response.json()),
        depositPercent: deposit,
        announcements: [],
      },
    });
  });
  await page.goto("/how-to-order");
  await expect(
    page.getByRole("heading", { name: "วิธีสั่งซื้อ", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".account-navigation > summary")).toHaveCount(0);
  await expect(page.locator(".shopping-guide-steps")).toContainText(
    "จองมัดจำ 0%",
  );
  const faq = page.locator(".shopping-guide-faq details");
  await expect(faq).toHaveCount(8);
  await faq.first().locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(faq.first()).toHaveAttribute("open", "");
  await expect(faq.first().locator(".shopping-guide-answer")).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
  deposit = 25;
  await page.reload();
  await expect(page.locator(".shopping-guide-steps")).toContainText(
    "จองมัดจำ 25%",
  );
  await page.getByRole("link", { name: "ติดต่อร้าน", exact: true }).click();
  await expect(page).toHaveURL("/contact");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "ช่องทางการติดต่อ", exact: true }),
  ).toBeVisible();
});
