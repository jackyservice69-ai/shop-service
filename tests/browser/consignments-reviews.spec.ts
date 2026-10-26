import { test, expect, type BrowserContext } from "@playwright/test";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { videoTools } from "../../server/review-video.mjs";
const run = promisify(execFile),
  password = "Test-strong-password-2026!";
async function member(context: BrowserContext, firstName: string) {
  const r = await context.request.post("/api/auth/register", {
    data: {
      firstName,
      lastName: "ทดสอบ",
      phone: "0812345678",
      email: crypto.randomUUID() + "@test.example",
      password,
    },
  });
  expect(r.ok()).toBe(true);
  return r.json();
}
test("consignor applies and publishes after approval; paid completion settles the fee; verified buyer reviews with photo/video and edits; admin moderates", async ({
  browser,
  page,
}) => {
  test.setTimeout(90000);
  const seller = await browser.newContext({ baseURL: "http://127.0.0.1:4319" }),
    buyer = await browser.newContext({ baseURL: "http://127.0.0.1:4319" });
  const sellerPage = await seller.newPage(),
    buyerPage = await buyer.newPage();
  sellerPage.setDefaultTimeout(12000);
  buyerPage.setDefaultTimeout(12000);
  page.setDefaultTimeout(12000);
  const browserErrors: string[] = [];
  for (const p of [sellerPage, buyerPage, page])
    p.on("pageerror", (error) => browserErrors.push(error.message));
  const dir = mkdtempSync(join(tmpdir(), "hiewly-browser-video-")),
    videoFile = join(dir, "review.mp4");
  try {
    await member(seller, "ตัวแทน");
    const customer = await member(buyer, "ผู้ซื้อ");
    await sellerPage.goto("/consignment");
    await sellerPage.getByLabel("ชื่อร้านตัวแทน").fill("ร้านตัวแทนทดสอบ");
    await sellerPage.getByRole("checkbox").check();
    await sellerPage.getByRole("button", { name: "ส่งคำขอสมัคร" }).click();
    await expect(
      sellerPage.getByText("รออนุมัติ", { exact: true }),
    ).toBeVisible();
    await page.goto("/login?next=/admin/consignments");
    await page.getByLabel("อีเมล").fill("admin@e2e.test");
    await page.getByLabel("รหัสผ่าน").fill(password);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "ตัวแทนฝากขาย", exact: true }),
    ).toBeVisible();
    await page.getByLabel("ค่าฝากขาย (%)").fill("12.5");
    await page
      .getByRole("button", { name: "บันทึกค่าฝากขาย", exact: true })
      .click();
    await page
      .getByRole("button", { name: "จัดการ ร้านตัวแทนทดสอบ", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "ยืนยันสถานะตัวแทน" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await sellerPage.reload();
    await sellerPage
      .getByRole("button", { name: "เพิ่มสินค้าฝากขาย", exact: true })
      .click();
    let dialog = sellerPage.getByRole("dialog");
    await dialog
      .getByRole("textbox", { name: "ชื่อสินค้า", exact: true })
      .fill("สินค้าฝากขายรีวิว");
    await dialog
      .getByLabel("รายละเอียดสินค้า")
      .fill("สินค้าตัวแทนสำหรับตรวจครบวงจร");
    await dialog
      .getByRole("combobox", { name: "หมวดหมู่" })
      .selectOption("__new_category__");
    await dialog.getByLabel("ชื่อหมวดหมู่ใหม่").fill("ฝากขาย");
    await dialog.getByLabel("ราคาขาย (บาท)").fill("200");
    await dialog.getByLabel("จำนวนพร้อมขาย").fill("3");
    const picture = await sharp({
      create: { width: 120, height: 120, channels: 3, background: "#f2a8a8" },
    })
      .png()
      .toBuffer();
    await dialog
      .getByLabel("เพิ่มรูปภาพสินค้า", { exact: true })
      .setInputFiles({
        name: "product.png",
        mimeType: "image/png",
        buffer: picture,
      });
    await expect(dialog.locator(".product-images-editor")).toContainText(
      "อัปโหลดเรียบร้อยแล้ว",
    );
    await dialog.getByRole("button", { name: "ส่งตรวจสินค้าฝากขาย" }).click();
    await expect(
      sellerPage.getByText("รออนุมัติ", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "สินค้าฝากขาย", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "ตรวจสินค้า สินค้าฝากขายรีวิว",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "ยืนยันผลตรวจสินค้า" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const slip = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: Math.floor(Math.random() * 250), g: 70, b: 32 },
      },
    })
      .png()
      .toBuffer();
    const topup = await buyer.request.post("/api/wallet/topup", {
      headers: {
        "x-csrf-token": customer.csrf,
        "Idempotency-Key": crypto.randomUUID(),
      },
      multipart: {
        amount: "100000",
        image: { name: "slip.png", mimeType: "image/png", buffer: slip },
      },
    });
    expect(topup.ok()).toBe(true);
    await buyerPage.goto("/products");
    const announcement = buyerPage.getByRole("dialog", {
      name: "ประกาศจากร้าน",
    });
    if (await announcement.isVisible())
      await announcement.getByRole("button", { name: "รับทราบ" }).click();
    await buyerPage
      .getByRole("button", { name: "เพิ่ม สินค้าฝากขายรีวิว ลงตะกร้า" })
      .click();
    await buyerPage.getByRole("link", { name: /ตะกร้า/ }).click();
    await buyerPage.getByLabel("เบอร์โทรศัพท์").fill("0812345678");
    await buyerPage
      .getByLabel("ที่อยู่จัดส่งและรหัสไปรษณีย์")
      .fill("123 ถนนสุขุมวิท กรุงเทพฯ 10110");
    await buyerPage.getByRole("button", { name: "ตรวจสอบและยืนยัน" }).click();
    await buyerPage
      .getByRole("button", { name: "ยืนยันคำสั่งซื้อ", exact: true })
      .click();
    await expect(
      buyerPage.getByRole("heading", { name: "คำสั่งซื้อของฉัน" }),
    ).toBeVisible();
    const order = (await (await buyer.request.get("/api/orders")).json())
        .items[0],
      csrf = (await (await page.request.get("/api/me")).json()).csrf;
    for (const status of ["processing", "shipped", "completed"])
      expect(
        (
          await page.request.put("/api/admin/orders/" + order.id, {
            headers: { "x-csrf-token": csrf },
            data: { status, tracking: "TH-CONSIGNMENT" },
          })
        ).ok(),
      ).toBe(true);
    await sellerPage.goto("/consignment?tab=sales");
    await expect(
      sellerPage.getByText("฿175", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      sellerPage.getByText("฿25", { exact: true }).first(),
    ).toBeVisible();
    await buyerPage.goto("/products");
    await buyerPage
      .getByRole("button", { name: "ดูรายละเอียด สินค้าฝากขายรีวิว" })
      .click();
    await buyerPage
      .getByRole("button", { name: "เขียนรีวิวสินค้า", exact: true })
      .click();
    dialog = buyerPage.getByRole("dialog", {
      name: "เขียนรีวิวสินค้า",
      exact: true,
    });
    await dialog.getByRole("radio", { name: "5 ดาว", exact: true }).check();
    await dialog
      .getByRole("textbox", { name: "ความคิดเห็น", exact: true })
      .fill("ใช้ดีมาก ส่งตรงตามที่สั่ง");
    await run(
      videoTools().ffmpeg,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=pink:s=160x120:r=24:d=1",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-y",
        videoFile,
      ],
      { windowsHide: true },
    );
    await dialog.getByLabel("แนบไฟล์รีวิว", { exact: true }).setInputFiles([
      { name: "review.png", mimeType: "image/png", buffer: picture },
      {
        name: "review.mp4",
        mimeType: "video/mp4",
        buffer: readFileSync(videoFile),
      },
    ]);
    await expect(dialog.locator(".review-drafts>div")).toHaveCount(2);
    await dialog.getByRole("button", { name: "บันทึกรีวิว" }).click();
    await expect(
      buyerPage.getByText("ใช้ดีมาก ส่งตรงตามที่สั่ง", { exact: true }),
    ).toBeVisible();
    const video = buyerPage.locator(".product-reviews video");
    await expect
      .poll(() =>
        video.evaluate((v: HTMLVideoElement) =>
          Number.isFinite(v.duration) ? v.duration : 0,
        ),
      )
      .toBeGreaterThan(0);
    await buyerPage
      .getByRole("button", { name: "แก้ไขรีวิวของฉัน", exact: true })
      .click();
    dialog = buyerPage.getByRole("dialog", {
      name: "แก้ไขรีวิวสินค้า",
      exact: true,
    });
    await dialog.getByRole("radio", { name: "4 ดาว", exact: true }).check();
    await dialog
      .getByRole("textbox", { name: "ความคิดเห็น", exact: true })
      .fill("อัปเดตรีวิว ใช้งานได้ดี");
    await dialog.getByRole("button", { name: "บันทึกรีวิว" }).click();
    await expect(
      buyerPage.getByText("อัปเดตรีวิว ใช้งานได้ดี", { exact: true }),
    ).toBeVisible();
    await buyerPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await buyerPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await buyerPage.screenshot({
      path: "output/playwright/review-mobile.png",
      fullPage: true,
    });
    await page.goto("/admin/reviews");
    await page
      .getByRole("row")
      .filter({ hasText: "สินค้าฝากขายรีวิว" })
      .getByRole("button", { name: "ซ่อนรีวิว", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: "เหตุผล", exact: true })
      .fill("ทดสอบซ่อนสื่อและรีวิว");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "ยืนยันสถานะรีวิว" })
      .click();
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "สินค้าฝากขายรีวิว" })
        .getByRole("button", { name: "เผยแพร่รีวิว", exact: true }),
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await Promise.allSettled([seller.close(), buyer.close()]);
    try {
      unlinkSync(videoFile);
    } catch {}
    rmdirSync(dir);
  }
});
