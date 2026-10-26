# Consignor shop logo and approval badge

Deploy through the existing backend-first Render/Vercel release procedure, using the same commit for both services.

- Shop applications and existing-shop profile forms have a separate **โลโก้ร้าน** uploader, alongside the existing shop photograph and service area. Save/removal is explicit. Upload activity from either image control keeps form submission blocked until both uploads finish.
- Accept PNG/JPG/JPEG up to 5 MB. Recommend 512×512 px and transparent PNG. The existing image validation, metadata removal and storage quota apply. `shopLogo` images resize inside 512×512 without cropping, preserving aspect ratio and transparency. Profile, shop-photo and logo uploads share the 20/hour member limit.
- Logos appear next to the shop name in the seller dashboard, membership approval dialog and approved seller information on public product details. Use contained images with flat borders and no shadows. Missing/failed logos leave readable shop names intact.
- New media references must be the current member's own `shopLogo` uploads. Drafts stay private. Approvers may view the submitted current logo; the current logo becomes public only while the shop is approved and its member is active. Removed/replaced/revoked logo URLs return 404 publicly, with `private, no-store` caching.
- `PUT /api/consignment/profile` accepts optional `logo`. Older clients that omit it retain the saved logo; explicit `""` removes it. Existing ownership, CSRF, Origin, forced-password-reset, audit transaction and membership-version guards remain in force.
- Schema v14 adds `consignors.logo` with an empty default, preserving all existing shops, photographs, fees, funds and orders. Production startup's pre-migration backup target advances to 14 so a schema-13 database is backed up before this additive migration.
- Approved membership uses **badge status-approved**: pastel green `#e2f2d5`, readable green text `#2d6a4f`, border `#c3e6aa`. Pending/nonapproved membership retains its existing reserved badge styling. Global reserved order badges keep their existing meaning and colors.

Verification: `tests/shop-logo.test.mjs` covers transparent non-square images, private/public visibility, ownership/type guards, optional-field compatibility, removal, quota, rollback and migration backup. The profile browser flow covers upload during application, pending/approved badge classes and exact approved colors, admin/public logo display, mobile/desktop Axe checks and independent logo removal without deleting the shop photo.
