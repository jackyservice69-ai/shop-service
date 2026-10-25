import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("navigation exposes its destinations in one free-scrolling row, supports native touch/mouse drag and keeps account dropdown usable", async ({
  page,
}) => {
  const login = await page.request.post("/api/auth/login", {
    data: { email: "admin@e2e.test", password: "Test-strong-password-2026!" },
  });
  expect(login.ok()).toBe(true);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/products");
  const nav = page.getByRole("navigation", {
    name: "เมนูหน้าร้าน",
    exact: true,
  });
  const track = nav.locator(".store-navigation-track");
  await expect(track.locator(":scope > a")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "เมนู", exact: true }),
  ).toHaveCount(0);
  await expect(nav).toHaveCSS("scroll-snap-type", "none");
  await expect(nav).toHaveCSS("overflow-x", "auto");
  await expect(nav).toHaveCSS("scrollbar-width", "none");
  const metrics = await track
    .locator(":scope > a")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().top),
    );
  expect(new Set(metrics.map(Math.round)).size).toBe(1);
  expect(
    await nav.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  const box = (await nav.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  const y = box.y + box.height / 2,
    start = box.x + box.width - 30;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start, y }],
  });
  for (const delta of [20, 65, 135, 220]) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start - delta, y }],
    });
    await page.waitForTimeout(12);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const atRelease = await nav.evaluate((node) => node.scrollLeft);
  expect(atRelease).toBeGreaterThan(160);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await session.detach();
  await nav.evaluate((node) => {
    node.scrollLeft = 0;
  });
  const url = page.url();
  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 25, y, { steps: 10 });
  await page.mouse.up();
  expect(await nav.evaluate((node) => node.scrollLeft)).toBeGreaterThan(160);
  await expect(page).toHaveURL(url);
  await expect(nav).not.toHaveClass(/is-dragging/);
  const account = nav.locator(".account-navigation > summary");
  await account.focus();
  await page.keyboard.press("Enter");
  const panel = nav.locator(".account-navigation-links");
  await expect(panel).toHaveCSS("position", "fixed");
  await expect(
    panel.getByRole("link", { name: "กระเป๋าเงิน", exact: true }),
  ).toBeVisible();
  const mainTop = (await page.locator("#main-content").boundingBox())!.y;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: "output/playwright/store-navigation-mobile-free-scroll.png",
  });
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  expect((await page.locator("#main-content").boundingBox())!.y).toBe(mainTop);
  await account.click();
  await page
    .getByRole("searchbox", { name: "ค้นหาสินค้า", exact: true })
    .click();
  await expect(nav.locator(".account-navigation")).not.toHaveAttribute("open");
  for (const size of [
    { width: 320, height: 568 },
    { width: 768, height: 900 },
    { width: 667, height: 375 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    await account.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => {
        const rectangle = (await panel.boundingBox())!;
        return rectangle.y + rectangle.height;
      })
      .toBeLessThanOrEqual(size.height - 10);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 375, height: 844 });
  await nav.getByRole("link", { name: "หน้าหลัก", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    nav.getByRole("link", { name: "วิธีสั่งซื้อ", exact: true }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await nav.getByRole("link", { name: "โปรโมชั่น", exact: true }).click();
  await expect(page).toHaveURL("/promotions");
  await expect(page.locator("#main-content")).toBeFocused();
});
