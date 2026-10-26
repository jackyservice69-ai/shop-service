# Profile photos and shop service areas

Local implementation; no production deployment as part of this change.

## Where to use

- **บัญชีของฉัน → รูปโปรไฟล์**: choose a PNG/JPG/JPEG, preview, then save. Removing a picture takes effect after saving. The header and admin account icons use the saved photo, with the existing icon/initial as a fallback.
- **ตัวแทนฝากขาย**: optional shop photo and service area on application; existing applicants and shops can edit these in **รูปหน้าร้านและพื้นที่ให้บริการ**. Service area is plain text, up to 1,000 characters, with multiple lines for provinces, districts or delivery coverage. It describes coverage; it does not calculate shipping or restrict checkout.
- Approvers see the current photo and service area in the membership dialog. Approved shops display this information in their public product details. No photo/area is invented for existing shops.

## Contracts

- Shared `Form`, `Field`, `ImageUpload`, account icons and pastel theme; flat borders, no shadows. Explicit save, upload progress, actionable errors, 44 px controls, mobile layout and keyboard labels.
- PNG/JPEG only, 5 MB maximum, 32–6000 px and 24 megapixel decode limit; content, extension and MIME must agree. Auto-rotate, strip metadata and encode PNG. Profile photos crop to 512×512; shop photos retain their aspect ratio within 1200×800. Originals and EXIF/GPS are not stored.
- Authenticated uploads: `POST /api/profile/media/avatar|shop`, multipart `image`. Rate limit: 20 combined uploads/hour/member, checked before decode and again atomically at storage. All media shares the existing 250 MB default storage budget. Unused uploads count toward that budget and remain private.
- Own photo: `PUT /api/account/photo` with `{image,version}`. Own shop: `PUT /api/consignment/profile` with `{image,serviceArea,version}`. Shop applications accept optional `image,serviceArea`. Foreign media, wrong media kinds, external URLs and extra ownership/status/fee fields are rejected. Clearing the image requires an explicit empty string.
- Existing session, CSRF, Origin and forced-password-reset guards remain in force. Avatar version is separate from member administration version; shop edits use existing optimistic membership version to prevent overwriting approval/fee edits. Uploads and edits are audited in the same transaction as the write.
- Avatars and drafts are private. Only the owner may read drafts; current member managers may view saved avatars and current consignment approvers may view submitted shop photos. Public access is limited to the current shop picture while the shop is approved and its member is active. Replaced or revoked shop pictures return 404 publicly. Profile media uses `private, no-store` to preserve revocation. Existing product/brand media policy is unchanged.
- Public products add only `shop:{name,image,serviceArea}`. No seller IDs, fees, personal email/phone or internal notes are added. Shop profile edits preserve status, fees, wallet balances and order snapshots.
- SQLite v13 is additive and repeatable: empty images/area for existing accounts; no financial history or notification reads rewritten.

## Verification

`tests/profiles.test.mjs` covers upload sanitizing/metadata, private/public visibility, ownership, version conflicts, validation, quotas, guards, rollback and migration preservation. `tests/browser/profiles.spec.ts` covers upload/save/reload/remove, failed-avatar fallback, application/approval/public product flow, multiline coverage, 390/1440 px layouts and Axe checks. Screenshots are local under `output/playwright/`.
