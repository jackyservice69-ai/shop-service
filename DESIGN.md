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
Thai personal-shopping service for customers on phones and shop operators on laptops. Customer identity: pink and sky-blue pastel light around a parcel illustration and calm readable surfaces. Product register throughout the authenticated app. Do not imply sample products or unconfigured integrations are live transactions.
## Colors
System palette owner: shared/customer-colors.json mirrors the owner's palette above. server/db.mjs derives the six initial settings.theme values from that same file. src/experience.tsx themeStyle flattens the palette into --role-shade CSS variables and maps settings.theme to the six editable roles (primary, ink, muted, background→--bg, surface, positive). It computes readable text and button-state foregrounds; src/styles.css .customer-shell consumes them. scripts/generate-colors.mjs exports src/brand.generated.css at build/dev start, and :root maps --palette-* into the shared/admin theme. Keep generated CSS derived from JSON. The pink–sky preset restores the owner's six values, with peach/mint alternatives. Purple is retired from system UI. Admin navigation and shared controls use the same pink brand, with dark rose text for readable links. Semantic status surfaces use pastel fills with dark status text. Muted/light tokens are decorative; ordinary supporting text and placeholders use contrast-checked --muted-text instead. Primary hover/active follow the exact palette; other primary colors derive shade states. Chart fills remain semantic.
## Typography
Thai copy uses Noto Sans Thai with local system fallback. Brand uses heavy Thai lettering; amounts use tabular figures. Body 14px with 1.65 line-height; headings 24–32px.
## Layout
Desktop: 248px navigation, flexible main, 32px gutters. Store: top navigation and responsive product grid. Below 800px navigation becomes a horizontal scrollable row. Below 520px single-column forms and cards. Natural document scrolling. There is no universal spacing divisor: compact optical gaps (6/9px), field rhythm (17px), and section rhythm (24px) are named roles; do not infer every dimension must be a multiple of 4.
## Elevation & Depth
No box-shadow anywhere in the application, including hover, active, focus, dialogs, previews and illustrations. Separate surfaces with borders, spacing and color. Customer surfaces retain pink–sky gradients and rose reflected light through backgrounds. Keep text on quiet surfaces. Keyboard focus uses an outline, never a shadow. Admin uses restrained pink accents and neutral surfaces. Stable image aspect ratio. Cards 18px, controls 10px. The distinctive parcel tracking route belongs only in the storefront hero and brand. Preserve reduced-motion rules; decorative light stays static.
## Shapes
Lucide line icons at 18–22px; quiet rounded rectangles. No emoji as functional icons.
## Components
Shared Field, Form, Modal, Table, Empty, Badge, PageHeading, Stat, notification provider. Native selects and dates. All charts have textual summaries. Display 0% deposits literally; never treat 0 as missing.
Uploaded logos use a prominent, uncropped contain frame: storefront 264×99px on desktop, 224×84px on tablet and 164–196px wide at an 8:3 frame on phones; sidebar 208×78px (200×75px on phones), footer 176×66px. Reserve these dimensions and leave navigation room. On narrow admin headers, place the workspace label below the logo to prevent overlap. Do not add shadows or modify the uploaded image to achieve prominence.
## Do's and Don'ts
Use baht from integer satang and Asia/Bangkok timestamps. Never show fabricated dashboard gains or wallet credits. Every server action has pending/error/success feedback; no browser alert/confirm.
