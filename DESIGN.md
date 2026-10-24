---
version: alpha
colors:
  primary:
    DEFAULT: '#f6c2c2'   # ชมพูพาสเทลหลัก (Main Pink)
    hover: '#f2a8a8'     # ชมพูเข้มขึ้นเล็กน้อย (Hover state)
    active: '#eb8d8d'    # ชมพูเข้มสำหรับกด (Active/Pressed state)
    light: '#fde8e8'     # ชมพูอ่อนมากๆ (Background highlight)
  secondary:
    DEFAULT: '#d4edf4'   # ฟ้าพาสเทลหลัก (Main Sky Blue)
    hover: '#b2deec'     # ฟ้าเข้มขึ้นสำหรับ Hover
    active: '#8eccde'    # ฟ้าเข้มสำหรับ Active
    light: '#eff8fb'     # ฟ้าอ่อนมากสำหรับพื้นหลังรอง
  accent:
    rose: '#f9d7df'      # ชมพูโรสพาสเทล
    peach: '#fce3d4'     # พีชพาสเทล

  # --- 2. NEUTRAL & TYPOGRAPHY (สีข้อความและโทนกลาง) ---
  ink:
    DEFAULT: '#3a3d4a'   # เทาเข้มนุ่มๆ (Primary Text)
    heading: '#262832'   # เทาเข้มเกือบดำ (Headings/Titles)
    subtle: '#5c6072'    # เทากลาง อ่านง่าย (Secondary Text)
  muted:
    DEFAULT: '#8b90a0'   # เทาพาสเทลอมฟ้า (Muted Text/Icons)
    light: '#b7bbca'     # เทาอ่อนสำหรับ Placeholder ในช่องกรอกข้อมูล
  border:
    DEFAULT: '#e8ecef'   # เส้นขอบการ์ด/กล่องข้อความ
    subtle: '#f0f3f5'    # เส้นแบ่งส่วน (Divider) แบบกลมกลืน
    focus: '#f6c2c2'     # เส้นขอบตอนคลิก Focus ช่องกรอกข้อมูล

  # --- 3. BACKGROUNDS & SURFACES (พื้นหลังและส่วนประกอบ) ---
  background:
    DEFAULT: '#fcfdfa'   # ครีมขาวอ่อนมากๆ (Main Page Background)
    alt: '#f5f7f8'       # สีพื้นหลังสลับ/Section
  surface:
    DEFAULT: '#ffffff'   # สีขาวการ์ด/Modal (Elevated surface)
    hover: '#f8fafc'     # สีการ์ดเมื่อใช้นิ้วชี้หรือเมาส์วาง Hover
    subtle: '#f7faf8'    # กล่องข้อความ/Input Background

  # --- 4. STATUS & FEEDBACK (สีแจ้งเตือนและสถานะ) ---
  positive:
    DEFAULT: '#e2f2d5'   # เขียวมิ้นต์พาสเทล (Success)
    text: '#2d6a4f'      # สีตัวอักษรเขียวบนพื้นพาสเทล (อ่านง่าย WCAG ผ่าน)
    border: '#c3e6aa'    # กรอบแจ้งเตือนเขียว
  warning:
    DEFAULT: '#f9fbba'   # เหลืองพาสเทล (Warning)
    text: '#746200'      # สีตัวอักษรเหลืองอมน้ำตาล
    border: '#f3f783'    # กรอบแจ้งเตือนเหลือง
  danger:
    DEFAULT: '#fcd5d5'   # แดงชมพูพาสเทล (Error/Delete)
    text: '#9b2226'      # สีตัวอักษรแดงเข้ม
    border: '#f8acac'    # กรอบแจ้งเตือนแดง
  info:
    DEFAULT: '#d4edf4'   # ฟ้าพาสเทล (Info)
    text: '#1d5c75'      # สีตัวอักษรฟ้าเข้ม
    border: '#abdbe7'    # กรอบแจ้งเตือนฟ้า
  overlay: 'rgba(58, 61, 74, 0.4)'
typography:
  display:
    fontFamily: 'Noto Sans Thai, system-ui, sans-serif'
  body:
    fontFamily: 'Noto Sans Thai, system-ui, sans-serif'
  data:
    fontFamily: 'system-ui, sans-serif'
rounded:
  card: '18px'
  control: '10px'
spacing:
  compact: '6px'
  fieldGap: '17px'
  sectionGap: '24px'
components:
  Button:
    rounded: '10px'
---
# Hiewly / หิ้วลี่
## Overview
Thai personal-shopping service for customers on phones and shop operators on laptops. Customer identity: blush pink marble on the storefront masthead, welcome panel and footer, with a parcel illustration and calm readable surfaces. Product register throughout the authenticated app. Do not imply sample products or unconfigured integrations are live transactions.
## Colors
System palette owner: shared/customer-colors.json mirrors the owner's palette above. server/db.mjs derives the six initial settings.theme values from that same file. src/experience.tsx themeStyle flattens the palette into --role-shade CSS variables and maps settings.theme to the six editable roles (primary, ink, muted, background→--bg, surface, positive). It computes readable text and button-state foregrounds; src/styles.css .customer-shell consumes them. scripts/generate-colors.mjs exports src/brand.generated.css at build/dev start, and :root maps --palette-* into the shared/admin theme. Keep generated CSS derived from JSON. The pink–sky preset restores the owner's six values, with peach/mint alternatives. Purple is retired from system UI. Admin navigation and shared controls use the same pink brand, with dark rose text for readable links. Semantic status surfaces use pastel fills with dark status text. Muted/light tokens are decorative; ordinary supporting text and placeholders use contrast-checked --muted-text instead. Primary hover/active follow the exact palette; other primary colors derive shade states. Chart fills remain semantic.
## Typography
Thai copy uses Noto Sans Thai with local system fallback. Brand uses heavy Thai lettering; amounts use tabular figures. Body 14px with 1.65 line-height; headings 24–32px.
## Layout
Desktop: 248px navigation, flexible main, 32px gutters. Store: top navigation and responsive product grid. Below 800px navigation becomes a horizontal scrollable row. Below 520px single-column forms and cards. Natural document scrolling. There is no universal spacing divisor: compact optical gaps (6/9px), field rhythm (17px), and section rhythm (24px) are named roles; do not infer every dimension must be a multiple of 4.
## Elevation & Depth
No box-shadow anywhere in the application, including hover, active, focus, dialogs, previews and illustrations. Separate surfaces with borders, spacing and color. Customer surfaces retain pink–sky gradients and rose reflected light through backgrounds. Keep text on quiet surfaces. Keyboard focus uses an outline, never a shadow. Admin uses restrained pink accents and neutral surfaces. Stable image aspect ratio. Cards 18px, controls 10px. The distinctive parcel tracking route belongs only in the storefront hero and brand. Preserve reduced-motion rules; decorative light stays static.

The approved marble reference is implemented by the original generated swatch assets/textures/rose-marble-source.png, delivered as AVIF (~50KB) or WebP (~59KB) from public/assets/textures/rose-marble-v1.*. Customer --marble-texture owns the image-set with WebP fallback. Header, full-width footer and home hero use isolated, noninteractive background pseudo-elements at 72% opacity with multiply blending over their canonical theme surface; this retains dark-theme readability. Texture scale is 1200×600px. Forms, product media, payment QR and admin surfaces keep their existing backgrounds. Hide the decoration in forced-colors. Brand variant marble reuses the current approved logo's transparent derivative, bound by shared/wallet-logo.json, so white artwork backgrounds do not form a rectangle on the texture. Changing the configured source logo still selects that new image. No marble animation, shadows or changes to product/navigation/payment behavior.
## Shapes
Contact brands use locally bundled color SVGs in public/assets/brands; SCB uses the bank's original logo. Brand artwork retains its own colors. Application surfaces and functional icons continue to use the pink palette and Lucide. Address cards reuse panel/Field/Form/Modal. The shared MapPicker lazily loads Leaflet only when opened, with a pink outlined pin, visible OpenStreetMap attribution and flat controls without shadows. Profile uses UserRound; logout uses LogOut with a Thai accessible name.
Lucide line icons at 18–22px; quiet rounded rectangles. No emoji as functional icons.
## Components
Social account controls keep the browser chosen by the member. shared/auth-browser.mjs classifies the initiating browser; src/auth-browser.tsx owns the flat /auth/browser-return recovery panel using the existing panel, Field, ErrorBox and button variants. Show the remembered browser name, expiry and an explicit return action only when the callback lacks the initiating cookie. Android Chrome/Samsung and iOS Chrome use user-activated platform links; Safari recovery offers copying into the original Safari tab. Never force Chrome at OAuth start. SocialConnections uses the same per-provider control for connect/disconnect, with a named account confirmation, current-password/fresh-session proof, last-login protection and a LINE funding consequence. Retain the pastel palette, original provider logos, outline focus and no shadows.
LINE auth in src/line-auth.tsx reuses Field/Form/Modal/ErrorBox and the existing flat provider-button geometry with the local original green LINE logo. SocialConnections sits in Account before AddressBook, shows per-provider linked/disabled states and a target-labelled confirmation dialog; password accounts reauthenticate, Google-only accounts need a fresh provider session. Keep setup credentials exclusively in the owner's SettingsPage. Shared empty-state supporting text uses --muted-text with ink.subtle fallback for readable account/address help. Wallet and finance tables label verified LINE receipts without a parallel ledger or new color system.
AdminWalletPage in src/admin-wallet.tsx owns finance nav ธุรกรรมกระเป๋าเงิน, search/Field filters/Table/Pagination and transaction-detail Modal. Only wallet_topup renders เติมเงินให้ลูกค้า. Reuse Form/Field/Modal for an aria-pressed customer-choice list and draft/review/password-confirmation/result sequence. Wrap IDs/references on phones; show actor/source/reason and balances with existing money/status styles. Financial screenshots/tests use isolated data. Customer nav ที่อยู่จัดส่ง opens /addresses with AddressBook; MapDialog adds explicit location/center-pin controls while preserving click/drag/keyboard, attribution and retry. Shared src/use-device-location.ts handles cancellation and localized denial recovery without requesting permission on mount. Preserve pastel surfaces, outline focus and no shadows.
Role cards and their editor stay in src/admin.tsx RolesPage, using the shared Form/Field/Modal/Confirm and existing flat pink permission badges. The shared authorization catalogue owns labels and dependencies; selecting a mutation checks its required view right, and clearing a view right clears dependent mutations. Six initial role cards explain owner/customer scope and enumerate actual staff grants. No owner-only bank/API setting checkbox is offered for staff roles. Owner grants remain explicit, confirmed and session-revoking. Members actions keep their established order and center alignment, with profile/reset each rendered only for its own permission; member-only viewers see an em dash instead of wallet balances. Order-status/refund and finance-write/export controls render independently. Appearance uses the same editor for marketing and owner, with the commission field exclusively for the owner. Preserve no-shadow, mobile overflow, keyboard focus and Thai feedback contracts.
GoogleButton in src/google-auth.tsx is shared by login and registration. Keep the original locally bundled multicolour Google G from Google's official Firebase UI asset, a white bordered button with dark legible text, labelled loading/disabled/error states and an email divider; brand artwork retains its native colours. GoogleCompletePage reuses canonical Field/Form/ErrorBox and the narrow panel layout. It confirms existing-account linking with the original password or collects the required split names and telephone for a new Google customer. No shadows or competing auth design system. Header Brand link derives its accessible name from its visible content/alt text so both configured logos and the fallback brand have matching names.
Shared Field, Form, Modal, Table, Empty, Badge, PageHeading, Stat, notification provider. Native selects and dates. All charts have textual summaries. Display 0% deposits literally; never treat 0 as missing.
DiscoverySourceField in src/discovery-source.tsx reuses Field's native select and conditional labelled input for email signup and Google new-member completion. Keep the existing pink form geometry, outline focus and error messages. Other details are required only while visible and cleared when the selection changes away; registrationValues maps them to the existing bounded source string without extra API fields. Admin profile editing retains free text for historical sources.
Customer editing/reset lives in the existing member table with explicit Thai action labels and shared dialogs. Its actions are one centered horizontal row below the centered จัดการ column heading in this order: จัดการ, แก้ไขข้อมูล, รีเซ็ตรหัสผ่าน, subject to existing permissions; narrow tables retain their own horizontal scrolling. Sensitive actions identify the target, explain session revocation and ask for the operator password. The temporary-password result reuses read-only Field with masked default, labelled reveal/copy buttons, localized expiry and wrapping actions on phones. Confirmation/error feedback stays with Form and AppProvider. No plaintext credentials in notifications, URLs or screenshots of real accounts; verification screenshots use isolated test customers.
Uploaded logos use a prominent, uncropped contain frame: storefront 264×99px on desktop, 224×84px on tablet and 164–196px wide at an 8:3 frame on phones; sidebar 208×78px (200×75px on phones), footer 176×66px. Reserve these dimensions and leave navigation room. On narrow admin headers, place the workspace label below the logo to prevent overlap. Do not add shadows or modify the uploaded image to achieve prominence.
## Do's and Don'ts
Use baht from integer satang and Asia/Bangkok timestamps. Never show fabricated dashboard gains or wallet credits. Every server action has pending/error/success feedback; no browser alert/confirm.

WalletCard in src/wallet-card.tsx interprets the owner's pink Iya card reference as a digital store wallet: pale primary-to-white gradients, the configured Brand logo, a decorative gold chip, fine curved gold threads and a flower outline on the right edge. Its local decorative gold token is --wallet-gold (#c89c54); text uses the canonical palette ink.heading on the consistently pale surface, independent of custom dark theme text. Brand variant=wallet selects a true transparent PNG derivative of the approved current shop logo, bound to its immutable source media URL in shared/wallet-logo.json. Other Brand variants keep the original upload; a future changed logo uses its newly configured image. The wallet logo frame is 126px wide, with 18×22px card padding, 14px row gaps and a flexible 210px minimum height (typically 237px desktop / 231px mobile). Do not restore multiply blending as a substitute for actual alpha transparency. Center the balance label and amount horizontally in the card using symmetric 40px outer grid tracks; keep the decorative chip at the left without shifting the amount off-center. Align its center below the 80px WALLET CARD caption using the component caption/chip width tokens (40px chip, 20px rightward translation). Show only the real wallet balance and account holder, with an explicit digital-wallet label. Do not invent card numbers, expiry, CVV, NFC payment capability, rewards or a back-of-card flow. No shadows, text shadows or drop shadows. The card has a flexible minimum height, contained logo and wrapping holder/amount so narrow layouts and long names retain their full values. Bank transfer/QR/slip UI stays with its existing owners below/beside the card.

Receiving-bank card: bank-receiver owns a container-aware layout. At 360px available inner width, put account details on the left and QR on the right in a 180px square frame. Use the server-derived paymentQrFrame geometry to project the original QR pixels with a four-module quiet zone, excluding excess portrait whitespace and surrounding artwork; retain contain as a fallback for legacy images without geometry. Narrower cards stack without overflow. Use the clickable image for enlargement, a short hint and the download control; omit the separate enlarge button.

Wallet top-up instructions use public/assets/guides/topup-transfer-steps-th.png above the slip form, only when receiving settings are ready. Preserve its 1774×887 intrinsic ratio at full available width, with a Thai text alternative containing all three steps and the verified-slip condition. The illustrated QR in the guide is instructional artwork; the actual receiving QR stays in the bank-receiver card.

Consignment and reviews reuse the same flat pink surfaces, Form/Field/Modal, paginated Table and URL tabs. Seller portal shows real pending net, lifetime credited net and deducted fees with explicit units/status; approval and fee changes use labelled confirmation forms. Product images recommend 1200×1200 PNG/JPEG. Star summaries use the existing dark pink foreground; rating inputs are five native radios in a fieldset with 44px label targets, visible outline focus and Thai accessible names. Review media use contained image thumbnails, shared image enlargement and native video controls without autoplay. Comments preserve line breaks, dates follow Asia/Bangkok, public author labels use first names. Review forms retain values on failure and announce upload/transcode progress. Narrow screens wrap actions and media without document overflow; tables may scroll within their own container. Do not add shadows, purple theme values or fabricated earnings/reviews.

LINE bank image reuses BankDetailsPanel from src/bank-details.tsx. Its standalone anonymous /bank-details-card route has no store header/footer, wallet balance or member history. Export mode keeps the actual bank logo, recipient values and verified QR pixels, with a scan hint and no download control. The server screenshots only .panel.bank-details at 540 CSS px / 2x resolution; preview is 540px wide. Keep the shared panel as the single markup owner. Noto Sans Thai is served locally from public/fonts with its SIL OFL license so screenshots remain deterministic without external font requests.

