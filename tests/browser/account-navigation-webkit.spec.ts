import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.use({
  browserName: "webkit",
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  viewport: { width: 430, height: 932 },
});

test.describe("iPhone account dropdown in WebKit", () => {
  test("touch opens a hittable top-layer menu above the scrolling rail; links, dismissal and keyboard still work", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    expect(
      (
        await page.request.post("/api/auth/login", {
          data: {
            email: "admin@e2e.test",
            password: "Test-strong-password-2026!",
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/products");
    const group = page.locator(".account-navigation"),
      trigger = group.locator("summary"),
      panel = group.locator(".account-navigation-links");
    for (const size of [
      { width: 430, height: 932 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 852, height: 393 },
    ]) {
      await page.setViewportSize(size);
      await trigger.tap();
      await expect(group).toHaveAttribute("open", "");
      await expect(panel).toHaveAttribute("popover", "manual");
      await expect
        .poll(() => panel.evaluate((p) => p.matches(":popover-open")))
        .toBe(true);
      await expect(panel.getByRole("link")).toHaveCount(7);
      const first = panel.getByRole("link", {
        name: "ข้อมูลบัญชี",
        exact: true,
      });
      await expect
        .poll(() =>
          first.evaluate((link) => {
            const r = link.getBoundingClientRect();
            return link.contains(
              document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
            );
          }),
        )
        .toBe(true);
      const rectangle = (await panel.boundingBox())!;
      expect(rectangle.x).toBeGreaterThanOrEqual(0);
      expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(size.width);
      expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(
        size.height - 10,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (size.width === 430) {
        const scan = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(scan.violations.map((v) => v.id)).toEqual([]);
        await page.screenshot({
          path: "output/playwright/account-dropdown-webkit-iphone.png",
        });
      }
      await trigger.tap();
      await expect(group).not.toHaveAttribute("open");
      await expect(panel).toBeHidden();
    }
    await page.setViewportSize({ width: 430, height: 932 });
    await trigger.tap();
    await page
      .getByRole("searchbox", { name: "ค้นหาสินค้า", exact: true })
      .tap();
    await expect(group).not.toHaveAttribute("open");
    await trigger.tap();
    await panel.getByRole("link", { name: "กระเป๋าเงิน", exact: true }).tap();
    await expect(page).toHaveURL("/wallet");
    await expect(group).not.toHaveAttribute("open");
    await expect(page.locator("#main-content")).toBeFocused();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    // WinCairo's link tabbing policy differs from Safari's user preference.
    // Exercise Escape from a focused link; natural Tab order is covered in Chromium.
    await panel.getByRole("link", { name: "ข้อมูลบัญชี", exact: true }).focus();
    await expect(
      panel.getByRole("link", { name: "ข้อมูลบัญชี", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(panel).toBeHidden();
    await page.setViewportSize({ width: 320, height: 568 });
    await trigger.tap();
    await expect(panel).toBeVisible();
    await page
      .getByRole("navigation", { name: "เมนูหน้าร้าน", exact: true })
      .evaluate((node) => {
        node.scrollLeft = 0;
      });
    await expect(group).not.toHaveAttribute("open");
    await expect(panel).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test("account disclosure retains its fixed-position fallback without Popover API", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: undefined,
    }),
  );
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: {
          email: "admin@e2e.test",
          password: "Test-strong-password-2026!",
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/products");
  const group = page.locator(".account-navigation"),
    trigger = group.locator("summary"),
    panel = group.locator(".account-navigation-links");
  await trigger.click();
  await expect(panel).not.toHaveAttribute("popover");
  await panel.getByRole("link", { name: "ที่อยู่จัดส่ง", exact: true }).click();
  await expect(page).toHaveURL("/addresses");
  await expect(group).not.toHaveAttribute("open");
});
