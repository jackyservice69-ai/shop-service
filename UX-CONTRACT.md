# Observable UI and business contract
Language: th-TH; timezone: Asia/Bangkok; money: THB integer satang in storage, formatted at the UI boundary.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | src/ui.tsx Form and Field | UX-CONTRACT + server Zod | create, edit, confirmation | inline errors, first-invalid focus, browser tests |
| Select/Listbox | native select via Field | UX-CONTRACT | native | platform keyboard behavior |
| Date | native datetime-local via Field | UX-CONTRACT | native | converted to ISO on save |
| Scrollbar | src/styles.css global baseline | DESIGN.md | global, forced-colors | visible, inherited styles |
| Toast | src/api.tsx AppProvider | UX-CONTRACT | success, error, info | polite status, persistent error |
| CRUD | src/admin.tsx and API endpoints | UX-CONTRACT + server schemas | create, edit, deactivate | save returns to list; retain filters |
| Modal | src/ui.tsx Modal | UX-CONTRACT | native dialog | focus trap, Escape, focus restore |
| Table | src/ui.tsx Table, Pagination | UX-CONTRACT | read-only | server pagination, URL page/search |

New project: no sibling workflows or inherited theme existed. This contract establishes shared owners. Per-page checklist: store (search/category/cart), login/register (validation/session), wallet (bank details/slip results/ledger), orders (settle/cancel/tracking), referrals (copy/link/QR), dashboard (real data/bar/donut), products/promotions/announcements (CRUD/empty/error), finance (income/expense/export), members/roles (least privilege/confirmation), settings (masked secrets/integration state), audit (read-only chain verification).

All mutations disable their submit control while pending; failures retain form values. Lists have bounded server pages. Committed search/page live in URL; sensitive form values never do. Cart persists only non-sensitive product IDs/quantities. Server is authoritative for stock, prices, discounts and all permissions.

Registration requires separate firstName (ชื่อหน้า), lastName (นามสกุล), phone, email and password. discoverySource (รู้จักเราจากที่ไหน) and lineId (Line ID Add) are optional text fields. Names accept Unicode and use given-name/family-name autocomplete. Telephone uses type tel and is normalized on the server by removing spaces, parentheses and hyphens; allow Thai 9–10 digit local numbers or +country numbers of 8–15 digits. This is format validation, not SMS verification. Keep the combined name for existing displays and orders. Additive migration leaves legacy names, credentials and balances unchanged, with empty profile columns. Profile contact/source data is available only to its owner and staff with members permission; do not include it in public referral statistics, bot context or audit details. The member list displays contact/source and searches phone/LINE ID as well as name/email.

Financial rules: wallet purchases debit atomically; deposit minimum accepts 0. Deposit orders reserve inventory and owe the balance; balance must be paid before shipping. Full-wallet payment is also supported. Referral commission uses the discounted total, with the configured percentage snapshotted at order creation in integer basis points, rounded down to satang. Credit only upon completed + fully paid order, within the completion transaction, once per order. Cancelled orders void pending commission. The user asked for a balanced policy and this choice was stated before implementation. Changes affect new orders only; the default 0% disables new commissions. Cancellation refunds precisely the amount actually paid, once, and restores inventory. A cancelled order releases its coupon use.

Appearance and campaigns: reusable ImageUpload and Carousel live in src/experience.tsx. PNG/JPEG are fully decoded and re-encoded; uploads max 5 MB, input 16–6000px and 24M pixels, favicon must be square and is normalized to 256px. Media blobs live in SQLite and are included in backups. Recommended sizes: banners 1600×600; announcements 1080×1350; promotions 1200×800; logo 640×240; favicon 256×256. Images keep containment rather than crop essential content.

Banner/announcement slides have scheduled visibility and numeric ordering (lower first). Default cycle 6s, configurable 3–30s, wrap around; pause on hover, keyboard focus, hidden document and reduced-motion. Manual previous/next/dots and pause are available. Announcements close for the current session and set of IDs/versions; future editions can appear again. The popup remains home-only. Back to top lives at bottom-left, appears after 250px scroll and respects reduced motion.

Promotions may require a member to collect the coupon before redemption. Claim is idempotent and does not reserve discount inventory. Expiry, minimum, global and per-user use limits are rechecked transactionally at checkout; a claim alone does not guarantee remaining availability. Legacy direct-code promotions stay usable without collecting.

Top-up fails closed until an exact receiving bank/account is configured. EasySlip must affirm matching account and amount, nonduplicate, THB and a recent timestamp. Unique bank+transaction reference, image digest and request id prevent duplicate wallet credits. No manual credit endpoint exists.

Roles: customer sees only own records; admin has all permissions; custom staff roles are explicitly assigned permissions. Last admin cannot be demoted/disabled. Permission change confirmation identifies the user. No self-promotion. Settings secrets stay server-only and encrypted at rest.

External bot never has tools for financial operations or personal records. Signed LINE webhooks are processed by a durable inbox worker, event IDs are deduplicated, retry is bounded. Repeated failures are visible in audit and bot status.
