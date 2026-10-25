# Iya local refresh v5 — 25 October 2026

All 26 new raster assets were made with the built-in Imagegen tool. Prompts are recorded in [IYA-REFRESH-V5-PROMPTS.json](IYA-REFRESH-V5-PROMPTS.json). Original generated PNGs are retained locally in `output/imagegen/iya-refresh-v5/`; web derivatives are in `public/assets/iya-refresh-v5/`. Existing v2–v4 assets remain available. The iteration was prepared locally and subsequently approved for production release. No real customer data was edited.

## Art direction and placement

Blush pink, warm ivory, champagne gold, soft satin lighting and fine botanical detail continue the owner's existing palette. No purple or CSS shadows were added.

- Fourteen individual category illustrations: bag, perfume, jewelry, clothing, makeup, skincare, beauty, shoes, watch, eyewear, home, tech, gadgets and collectibles. These square 512px WebP generations remain saved but are no longer active after the owner requested restoring the previous category images. The circular rail again uses the v2/v3 atlases and v4 beauty/gadgets images; browse cards again use the four-photo atlas plus the established v4 beauty/gadgets illustrations. Six browse cards remain. Unknown catalog categories retain the existing parcel fallback; navigation never creates inventory.
- Hero is an Imagegen edit of `public/assets/storefront/hero-no-button-v3.webp`, preserving its existing Thai copy and composition. The artwork includes rounded corners and ivory breathing room. The container adds 8px outer vertical margins and rounded clipping. At the owner's latest request, the rendered viewport also clips 72px of top and 48px of bottom ivory image padding; the stored source stays intact. Artwork and real CTA retain their original scale, with proportional offsets inside a 1440×1078 viewport. Use the real HTML shopping CTA over the blank area; no generated button. Derivatives: 1440×1198 and 720px wide.
- Wallet uses a generated 1100×666 pale embossed card surface and an alpha-transparent 128px gold heart coin. Balance, holder, logo and existing decorative chip stay as live elements; no invented card numbers, expiry or payment capabilities. The coin replaces the visible baht glyph, while the live balance keeps an accessible currency label.
- Bank panel uses an 800px pale botanical background with its middle left quiet for text. Heading is “บัญชีรับเงินของร้าน Iya”. Real bank symbols, recipient data and original verified QR pixels remain separate. Responsive side-by-side account/QR behavior remains intact. The LINE export cache artwork version is `bank-surface-v5`.

## Announcement and promotion drafts

The existing announcement/promotion ImageUpload editor now has an optional library of four images per kind. Choosing an image uploads the real JPEG through the existing permission-protected media pipeline; it does not create a record or publish a campaign. No coupons or discounts were activated. Images include Thai copy; their HTML descriptions remain accessible.

Announcements, 1080×1350 JPEG:

1. เติมเงินง่าย ใช้สลิปได้เลย — transfer, upload slip, wait for verified result.
2. จองของที่ชอบ มัดจำเริ่ม 0% — full payment also available; remainder before shipping. Use only while the store's deposit configuration matches.
3. เชื่อมต่อ LINE ไว้ อุ่นใจกว่า — link the account before sending slips in chat. Use only while LINE service is enabled.
4. ส่งถึงที่อยู่ที่ใช่ — multiple saved addresses and primary address selection.

Promotion concepts, 1200×800 JPEG, explicitly marked as examples awaiting activation:

1. New members: 5% up to 100 baht, minimum 500 baht.
2. Beauty: 10% up to 150 baht, minimum 1,000 baht.
3. Handbags: 200 baht discount, minimum 2,000 baht.
4. Weekend: 8% up to 250 baht, minimum 1,500 baht.

These are artwork concepts rather than new promotion engine rules. Before publishing, the owner must ensure the real offer implements every advertised condition, including eligibility, category and maximum discount. The referral commission cap below is independent of customer promotion discounts.

## Functional changes

### Referral commission cap

The owner-only commission form now saves the percentage together with an optional per-bill ceiling. UI values are baht; API/database values are integer satang. Blank means unlimited, zero prevents new payouts, and omitted API fields preserve the previous cap. Example: 5% of a discounted 20,000-baht bill would be 1,000 baht, limited to 500 baht when that cap is set.

Order creation snapshots the rate, cap and final amount. Changing settings never recalculates old orders. Completion and full payment still atomically credit the snapshotted amount once; cancellation voids it. Audits record previous/new rate and cap. Referral information discloses the current cap. Existing permissions and branding settings are preserved.

### Category selection and product galleries

The product editor uses a native category dropdown containing the fourteen defaults, all stored categories including inactive products, and the current category. “เพิ่มหมวดหมู่ใหม่” reveals a required name input. The new category is committed only when the product saves successfully.

Upload up to eight PNG/JPEG/JPG images, max 5MB each, recommended 1200×1200. Every image is decoded/re-encoded by the existing server pipeline. Successful uploads survive a different file failing; the owner can select a main image or remove individual images. Save is blocked during upload. New product creation requires at least one image.

An additive, repeatable `products.images` JSON-text column preserves existing rows and single-image clients. `image` remains the first gallery photo. Server validation rejects duplicate lists, too many images, unsafe URL schemes and invalid/wrong-kind media IDs. Public DTOs include the ordered images while retaining their existing privacy boundaries. Product details provide accessible thumbnail buttons. Existing consignment forms retain their single-image behavior. A seller changing the photo clears a previously managed gallery, while metadata-only changes preserve it; the existing approval requirement still applies.

## Verification evidence

See local logs under `output/iya-refresh-*.log` and browser captures under `output/playwright/iya-refresh-*`. Tests use isolated in-memory fixtures and fake providers. No actual transfers, bot messages or production credentials are used. QR browser tests decode the unchanged payload at nine viewport widths; the real Chromium LINE panel capture is checked as well.

Final verification: build passed; all 190 Node/API tests passed; all 58 browser tests passed; six affected browser flows passed again after the final artwork/layout adjustment. Seven consignment/review API tests also passed after the gallery compatibility check. The strict UI audit reported zero findings. Manual local preview at 1440px and 390px retained six browse cards without horizontal overflow.
