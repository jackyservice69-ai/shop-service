# Public seller storefronts

Deploy through the existing backend-first Render/Vercel release procedure. Both services must use the same reviewed commit, with the schema-v14 database backed up before migration to v15.

## Customer flow

Click a seller logo or shop name in the product's seller section or catalog card to open `/shops/:shopId`. The storefront shows the shop's own photo, contained logo, real service area, approved status and published product count. It reuses the catalog's product cards, category/price/stock/sort filters, pagination, product gallery, reviews and cart. A shop-specific search keeps the URL/bookmark state and the shop scope. Returning to the same shop from a product dialog closes that dialog.

## Interface contract

- Preserve the Iya pastel pink/mint theme, existing Thai fonts, rounded white surfaces and flat borders without shadows. The uploaded storefront photograph is the visual focus; the logo and readable shop name remain distinct.
- Native links own navigation, including modified clicks and keyboard use. Both the logo and name are inside the same clearly named shop link, with 44 px targets and a visible focus outline. Avoid nesting the link inside a product button. Catalog category/sold-out overlays sit outside the image button so the visible labels do not conflict with its accessible name.
- Use the shared `Form`/`Field`, `ErrorBox`, `Loading`, `Empty`, `Pagination`, `ShopLogo`, gallery and cart owners. No second catalog implementation or invented shipping/rating/shop metrics.
- Shop metadata must load successfully before rendering its catalog. A missing/unavailable shop must never fall back to the global product list. Failed metadata loads offer retry and a route back to the catalog. Valid empty shops show an honest empty state. Existing image/logo error fallbacks preserve the name and layout.
- Keep shop-header CSS scoped to `seller-store-*` and keep the main catalog stylesheet order intact. Verify 390/1440 px, no horizontal overflow, accessible names, contrast, keyboard focus and URL restoration.

## Data and access

- SQLite v15 adds `consignors.public_id`. Existing stores receive independent random 128-bit public aliases; a unique index and insert trigger cover new stores, including older application clients. IDs stay fixed across name/profile edits and database reopen. Public links expose this alias, never a member ID or referral code.
- `GET /api/shops/:id` is anonymous and returns only `id,name,image,logo,serviceArea,productCount,categories`. Only approved stores belonging to active users are available. Unknown, pending, rejected, suspended and inactive shops return the same 404 message.
- `GET /api/products?shop=:id` validates that public identity before applying owner scope. All existing filters are combined with that scope; only `active=1` and `consignment_status='approved'` products appear. Counts and categories use that same publication rule. Drafts, disabled products, other sellers and official store items cannot enter the scoped results.
- Existing public product DTOs add `shop.id` so shared seller links can navigate. Internal notes, fees, email, phone and user IDs stay out of public shop payloads. Existing photo/logo visibility rules and no-store API caching remain in force.
- Production startup's pre-migration backup target advances to 15. Migration preserves wallet balances, orders and historical commission/fee snapshots. No production database is opened during local checks.

## Verification checklist

- API: safe/stable aliases and DTO privacy; scoped search/filter/sort/pagination/ID queries; malformed/repeated shop parameters; approval/active gating; empty stores; v14 backup and repeatable migration with financial history preserved.
- Browser: click logo in a product dialog and name in a catalog card; scoped categories and listing; page reload/bookmark; search and cart; close a dialog on same-shop navigation; mobile/desktop Axe and layout; metadata retry; honest empty state; pending shop with no unscoped catalog fetch.

Tests: `tests/public-shops.test.mjs` and `tests/browser/public-shops.spec.ts`; screenshots under `output/playwright/public-shop-*.png`.
