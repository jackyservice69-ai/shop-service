import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("store, auth and dashboard pass automated accessibility checks", async ({
  page,
}) => {
  for (const path of ["/", "/products", "/login", "/register"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
      path,
    ).toEqual([]);
  }
  await page.goto("/login?next=/admin");
  await page.getByLabel("อีเมล").fill("admin@e2e.test");
  await page.getByLabel("รหัสผ่าน").fill("Test-strong-password-2026!");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ภาพรวมร้านค้า" }),
  ).toBeVisible();
  await expect(page.locator(".mini-parcel")).toHaveCSS(
    "background-color",
    "rgb(246, 194, 194)",
  );
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    scan.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({
    path: "output/playwright/pink-admin-test.png",
    fullPage: true,
  });
});
