# Compact storefront banners v6

Local-only refinement requested on 25 October 2026. The header cart and product-detail add-to-cart action use the existing Lucide ShoppingCart icon; product/category/service icons retain their original meaning. Cart destination, accessible name, count badge and circular control stay unchanged.

The two existing banner images were edited with the built-in Imagegen tool, then refined to leave usable space for real HTML buttons. Exact prompts and edit targets are in [COMPACT-BANNERS-V6-PROMPTS.json](COMPACT-BANNERS-V6-PROMPTS.json).

- Hero: `public/assets/storefront/hero-compact-v6.webp` (1536×1024) and `hero-compact-small-v6.webp` (768×512). Full-bleed 3:2 artwork replaces the earlier 1440×1078 visible viewport, reducing height about 11% at the same width. Retain rounded corners and 8px external vertical spacing. The image has no outer ivory bands or drawn button. The real shopping link stays over the blank region; its minimum target is 44px.
- Promotion: `public/assets/storefront/promotion-compact-v6.webp` (1536×512) and `promotion-compact-small-v6.webp` (768×256). The rendered 24:7 viewport is 12.5% shorter than the previous 3:1 banner. Wide screens clip only peripheral decorative space through object-fit cover; the edited text was moved upward while retaining wording. Small phones contain the artwork at the top and keep a 112px minimum panel height, reduced from 128px, so the real promotion button retains a 44px target without covering text.

Original selected Imagegen PNGs are saved locally in `output/imagegen/compact-v6/`. Old images remain available. Category artwork remains the restored v2/v3/v4 set. No CSS shadows, new promotions, financial changes or production deployment are included.

Verification: build and three affected browser workflows passed (home/catalog, branding/CTA behavior, and narrow/desktop banner/layout checks). Manual inspection covered 390px mobile and 1440px desktop previews. Browser checks cover 320, 412 and 1440px widths, preserved links, cart icon, shorter banner heights, 44px buttons, no horizontal overflow and the retained wallet/bank panel accessibility check. Captures are under `output/playwright/compact-v6-*`.
