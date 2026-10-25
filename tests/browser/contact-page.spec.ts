import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("contact page uses configured brand links and stays readable from narrow mobile to desktop", async ({
  page,
}) => {
  let hideLine = false,
    showShopee = true;
  const socials = {
    facebook: "https://facebook.com/iya-test",
    line: "https://lin.ee/iya-test",
    telegram: "https://t.me/iya-test",
    instagram: "https://instagram.com/iya-test",
    tiktok: "https://tiktok.com/@iya-test",
    shopee: "https://shopee.co.th/iya-test",
  };
  await page.route("**/api/public", async (route) => {
    const response = await route.fetch();
    const visible: Record<string, string> = { ...socials };
    if (hideLine) delete visible.line;
    if (!showShopee) delete visible.shopee;
    await route.fulfill({
      json: {
        ...(await response.json()),
        announcements: [],
        socials: visible,
        socialVisibility: { line: !hideLine, shopee: showShopee },
      },
    });
  });
  await page.goto("/");
  await page.locator(".reference-contact-cta").click();
  await expect(page).toHaveURL("/contact");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(
    page.locator(".store-navigation a[href='/contact']"),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "ช่องทางการติดต่อ", exact: true }),
  ).toBeVisible();
  const buttons = page.locator(".contact-brand-button");
  await expect(buttons).toHaveCount(6);
  for (const [key, href] of Object.entries(socials)) {
    const link = page.locator(`.contact-platform-${key} .contact-brand-button`);
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  for (const link of await buttons.all()) {
    await expect(link).toHaveCSS("background-image", /linear-gradient/);
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const link of await buttons.all()) {
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(await link.evaluate((el) => getComputedStyle(el).position)).toBe(
        "static",
      );
    }
    const scan = await new AxeBuilder({ page })
      .include(".contact-page")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.locator(".contact-page-closing").scrollIntoViewIfNeeded();
    expect(
      await page
        .locator(".contact-page img")
        .evaluateAll((nodes) =>
          nodes.every(
            (n) =>
              (n as HTMLImageElement).complete &&
              (n as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/contact-page-v1-${width}.png`,
      fullPage: true,
    });
  }
  hideLine = true;
  showShopee = false;
  await page.reload();
  await expect(page.locator(".contact-platform-line")).toHaveCount(0);
  await expect(page.locator(".contact-platform-shopee")).toHaveCount(0);
  await expect(
    page.locator(".contact-section-marketplace .contact-channel-empty"),
  ).toBeVisible();
  await expect(page.locator(".contact-section-marketplace a")).toHaveCount(0);
  await page.locator(".contact-service-grid a[href='/wallet']").click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/products");
  await page.locator(".store-navigation a[href='/contact']").click();
  await expect(page).toHaveURL("/contact");
});
