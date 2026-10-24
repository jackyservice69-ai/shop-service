import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const chrome =
  "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/142.0.0.0 Mobile Safari/537.36";
const samsung = chrome + " SamsungBrowser/29.0";
const safari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const password = "Test-strong-password-2026!";
const browsers = [
  [chrome, "Chrome", "com.android.chrome"],
  [samsung, "Samsung Internet", "com.sec.android.app.sbrowser"],
  [safari, "Safari", "manual"],
  [safari + " CriOS/142.0", "Chrome", "ios"],
] as const;
async function member(context: BrowserContext) {
  const response = await context.request.post("/api/auth/register", {
    data: {
      firstName: "สมาชิก",
      lastName: "ทดสอบเบราว์เซอร์",
      phone: "0812345678",
      email: crypto.randomUUID() + "@example.test",
      password,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).user;
}
test("Android and iPhone start LINE and Google in the current browser without forcing Chrome", async ({
  browser,
  baseURL,
}) => {
  for (const [ua] of browsers) {
    const context = await browser.newContext({
      baseURL,
      userAgent: ua,
      viewport: { width: 390, height: 844 },
    });
    try {
      const page = await context.newPage();
      for (const provider of ["line", "google"]) {
        let reached = false;
        await page.route(
          provider === "line"
            ? "https://access.line.me/**"
            : "https://accounts.google.com/**",
          async (route) => {
            reached = true;
            await route.fulfill({
              contentType: "text/html",
              body: "<html><title>test provider</title><body>test provider</body></html>",
            });
          },
        );
        await page.goto("/login");
        await expect(
          page.getByRole("link", { name: /เข้าสู่ระบบด้วย (LINE|Google)/ }),
        ).toHaveCount(0);
        await page
          .getByRole("button", {
            name: `เข้าสู่ระบบด้วย ${provider === "line" ? "LINE" : "Google"}`,
            exact: true,
          })
          .click();
        await expect.poll(() => reached).toBe(true);
        await expect(page).toHaveURL(
          provider === "line"
            ? /^https:\/\/access\.line\.me\//
            : /^https:\/\/accounts\.google\.com\//,
        );
        await page.waitForLoadState("load");
      }
    } finally {
      await context.close();
    }
  }
});
for (const provider of ["line", "google"] as const)
  for (const [startUa, browserName, packageName] of browsers) {
    test(`${provider} ${browserName}/${packageName}: return to origin, disconnect, reconnect using the same control`, async ({
      browser,
      baseURL,
    }) => {
      const original = await browser.newContext({
        baseURL,
        userAgent: startUa,
        viewport: { width: 390, height: 844 },
      });
      const other = await browser.newContext({
        baseURL,
        userAgent: samsung,
        viewport: { width: 390, height: 844 },
      });
      // Capture the test page's copy operation without touching the host clipboard.
      await other.addInitScript(() =>
        Object.defineProperty(navigator, "clipboard", {
          value: {
            writeText: async (value: string) => {
              (window as any).__copiedAuthUrl = value;
            },
          },
        }),
      );
      try {
        const user = await member(original),
          page = await original.newPage();
        let callback = "";
        await page.route(
          provider === "line"
            ? "https://access.line.me/**"
            : "https://accounts.google.com/**",
          async (route) => {
            const url = new URL(route.request().url());
            expect(url.searchParams.get("code_challenge_method")).toBe("S256");
            const response = await page.request.post(
              `/__test/${provider}-code`,
              {
                data: {
                  state: url.searchParams.get("state"),
                  claims:
                    provider === "line"
                      ? {
                          sub: "U" + crypto.randomUUID().replaceAll("-", ""),
                          name: "ทดสอบคืนเบราว์เซอร์",
                        }
                      : {
                          sub: crypto.randomUUID(),
                          email: crypto.randomUUID() + "@example.test",
                        },
                },
              },
            );
            expect(response.ok()).toBe(true);
            const target = new URL(url.searchParams.get("redirect_uri")!);
            target.searchParams.set("state", url.searchParams.get("state")!);
            target.searchParams.set("code", (await response.json()).code);
            callback = target.href;
            await route.fulfill({
              contentType: "text/html",
              body: '<!doctype html><html lang="th"><title>test provider</title><body>ยืนยันแล้ว</body></html>',
            });
          },
        );
        const label = provider === "line" ? "LINE" : "Google";
        async function connect() {
          await page
            .getByRole("button", { name: `เชื่อมต่อ ${label}`, exact: true })
            .click();
          await page
            .getByLabel("รหัสผ่านปัจจุบันเพื่อเชื่อมต่อ")
            .fill(password);
          await page
            .getByRole("button", {
              name: `ยืนยันและไปยัง ${label}`,
              exact: true,
            })
            .click();
          await expect(page).toHaveURL(
            provider === "line"
              ? /^https:\/\/access\.line\.me\//
              : /^https:\/\/accounts\.google\.com\//,
          );
          await page.waitForLoadState("load");
        }
        await page.goto("/account");
        await connect();
        await expect.poll(() => callback).not.toBe("");
        const recovery = await other.newPage();
        await recovery.goto(callback);
        await expect(
          recovery.getByRole("heading", {
            name: `กลับไปยืนยันใน ${browserName}`,
          }),
        ).toBeVisible();
        await expect.poll(() => new URL(recovery.url()).hash).toBe("");
        let target = "";
        const action = recovery.getByRole(
          packageName === "manual" ? "button" : "link",
          {
            name:
              packageName === "manual"
                ? "คัดลอกลิงก์ยืนยัน"
                : `กลับไปยืนยันใน ${browserName}`,
            exact: true,
          },
        );
        if (packageName === "manual") {
          await action.click();
          await expect(
            recovery.getByRole("status").filter({ hasText: "คัดลอกแล้ว" }),
          ).toContainText("คัดลอกแล้ว");
          target = await recovery.evaluate(
            () => (window as any).__copiedAuthUrl,
          );
        } else {
          const href = (await action.getAttribute("href"))!;
          if (packageName === "ios") {
            expect(href).toMatch(/^googlechrome:/);
            target = href.replace(/^googlechrome:/, "http:");
          } else {
            expect(href).toContain(`;package=${packageName};`);
            const match = /^intent:\/\/(.*?)#Intent;scheme=(https?);/.exec(
              href,
            )!;
            target = `${match[2]}://${match[1]}`;
          }
        }
        const expected = new URL(callback);
        expected.searchParams.set("browser_return", "1");
        expect(target).toBe(expected.href);
        expect(
          (await other.request.get("/api/auth/connections")).status(),
        ).toBe(401);
        expect(
          (await (await original.request.get("/api/auth/connections")).json())[
            provider
          ].linked,
        ).toBe(false);
        expect(
          (await new AxeBuilder({ page: recovery }).analyze()).violations,
        ).toEqual([]);
        expect(
          await recovery.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(action).toHaveCSS("box-shadow", "none");
        await recovery.screenshot({
          path: `output/playwright/${provider}-return-${packageName}.png`,
          fullPage: true,
        });
        await page.goto(target);
        await expect(page).toHaveURL(
          new RegExp(`account\\?${provider}=linked$`),
        );
        expect(
          (await (await original.request.get("/api/me")).json()).user.id,
        ).toBe(user.id);
        expect(
          (await (await original.request.get("/api/auth/connections")).json())[
            provider
          ].linked,
        ).toBe(true);
        await page
          .getByRole("button", {
            name: `ยกเลิกการเชื่อมต่อ ${label}`,
            exact: true,
          })
          .click();
        await page
          .getByLabel("รหัสผ่านปัจจุบันเพื่อยกเลิกการเชื่อมต่อ")
          .fill("wrong");
        await page
          .getByRole("button", {
            name: `ยืนยันยกเลิกการเชื่อมต่อ ${label}`,
            exact: true,
          })
          .click();
        await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
          "รหัสผ่านปัจจุบันไม่ถูกต้อง",
        );
        await page
          .getByLabel("รหัสผ่านปัจจุบันเพื่อยกเลิกการเชื่อมต่อ")
          .fill(password);
        await page
          .getByRole("button", {
            name: `ยืนยันยกเลิกการเชื่อมต่อ ${label}`,
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("button", { name: `เชื่อมต่อ ${label}`, exact: true }),
        ).toBeEnabled();
        await expect(
          page.getByText(`เชื่อมต่อ ${label} สำเร็จแล้ว`, { exact: true }),
        ).toHaveCount(0);
        expect(
          (await (await original.request.get("/api/auth/connections")).json())[
            provider
          ].linked,
        ).toBe(false);
        const previous = callback;
        await connect();
        await expect.poll(() => callback).not.toBe(previous);
        await page.goto(callback);
        await expect(page).toHaveURL(
          new RegExp(`account\\?${provider}=linked$`),
        );
        await recovery.goto(callback);
        await expect(recovery).toHaveURL(
          new RegExp(`login\\?${provider}=failed$`),
        );
      } finally {
        await original.close();
        await other.close();
      }
    });
  }
test("missing recovery data and disabled providers recover without launching another browser", async ({
  page,
}) => {
  await page.goto("/auth/browser-return");
  await expect(page.getByRole("alert")).toContainText("ไม่พบขั้นตอนยืนยัน");
  await page.route("**/api/auth/line/status", (r) =>
    r.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย LINE", exact: true }),
  ).toBeDisabled();
});

test("Safari copy denial exposes a selectable temporary link and cannot authenticate without the original cookie", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  const fragment = new URLSearchParams({
    provider: "line",
    browser: "safari",
    state: "a".repeat(64),
    code: "isolated-ui-code",
  });
  await page.goto(`/auth/browser-return#${fragment}`);
  await page
    .getByRole("button", { name: "คัดลอกลิงก์ยืนยัน", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("คัดลอกอัตโนมัติไม่ได้");
  const field = page.getByLabel("ลิงก์ยืนยันชั่วคราว");
  await expect(field).toHaveAttribute("readonly", "");
  const target = await field.inputValue();
  expect(target).toContain("browser_return=1");
  await page.goto(target);
  await expect(page).toHaveURL(/login\?line=failed$/);
});

test("a Google-only member sees the last-login protection in the same disconnect control", async ({
  page,
}) => {
  await page.route("https://accounts.google.com/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await page.request.post("/__test/google-code", {
      data: {
        state: url.searchParams.get("state"),
        claims: {
          sub: crypto.randomUUID(),
          email: crypto.randomUUID() + "@example.test",
          given_name: "Google",
          family_name: "ทดสอบ",
        },
      },
    });
    const target = new URL(url.searchParams.get("redirect_uri")!);
    target.searchParams.set("state", url.searchParams.get("state")!);
    target.searchParams.set("code", (await response.json()).code);
    await route.fulfill({
      status: 302,
      headers: { location: target.href },
      body: "",
    });
  });
  await page.goto("/register");
  await page
    .getByRole("button", { name: "สมัครสมาชิกด้วย Google", exact: true })
    .click();
  await expect(page).toHaveURL(/google\/complete$/);
  await page.getByLabel("เบอร์โทร").fill("0812345678");
  await page
    .getByRole("button", { name: "สร้างบัญชีด้วย Google", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await page
    .getByRole("button", { name: "ยกเลิกการเชื่อมต่อ Google", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "ช่องทางเข้าสู่ระบบอื่น",
  );
  await expect(
    page.getByRole("button", {
      name: "ยืนยันยกเลิกการเชื่อมต่อ Google",
      exact: true,
    }),
  ).toBeDisabled();
  expect(
    (await (await page.request.get("/api/auth/connections")).json()).google
      .linked,
  ).toBe(true);
});
