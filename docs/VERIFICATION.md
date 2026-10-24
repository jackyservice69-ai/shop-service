# ผลการตรวจระบบ

ปรับปรุงผลการตรวจเมื่อ 24 ตุลาคม 2026 (Asia/Bangkok) บน Windows, Node.js 26.10.0 ตรวจ EasySlip Branch accounts จริงซ้ำสำหรับ QR ที่เจ้าของร้านส่งใหม่ และตรวจ dependency audit หลังเพิ่ม jsQR/Leaflet แล้ว ส่วน LINE bot info ตรวจไว้เมื่อ 23 ตุลาคม ไม่ได้ส่งข้อความจริง

| การตรวจ | ผล |
|---|---|
| `npm run build` | ผ่าน TypeScript และ Vite production build |
| `npm test` | ผ่าน 110/110 กรณี ไม่มี skipped รวม Google OAuth/การเชื่อมบัญชีเดิม/การแก้ไขข้อมูลลูกค้า/รีเซ็ตรหัสผ่าน/สิทธิ์และการเพิกถอนเซสชัน |
| `npx playwright test` | ผ่านรอบเต็ม 23/23 ชุด ใน Chromium รวม Google signup/login/link, ตัวแทนฝากขาย รีวิวรูป/วิดีโอ และการรีเซ็ตผ่านหลังบ้านจนลูกค้าตั้งรหัสใหม่ |
| `npm audit --audit-level=low` | 0 vulnerabilities ที่ฐานข้อมูล npm รายงาน ณ เวลาตรวจ |
| `npm run backup` | สร้าง SQLite snapshot สำเร็จ |
| Premium static audit (strict) | 0 findings |
| DESIGN.md lint | 0 errors, 37 warnings: linter คาด primary แบบค่าเดี่ยวและ component references แต่ palette ใช้กลุ่ม DEFAULT/hover/active; runtime ใช้ shared/customer-colors.json ตาม mapping ใน DESIGN.md |
| EasySlip `GET /banks` | ตอบ 200 จริง |
| EasySlip `GET /bank-accounts?limit=100&page=1` | ตอบ 200 จริง พบทั้ง SCB และ PROMPTPAY ที่เลขและชื่อผู้รับตรงกับการตั้งค่า/QR ใน Branch ของ API key |
| รูป QR ของเจ้าของร้าน | ตัดกรอบเป็น 1080×1440, ถอดรหัสก่อน/หลังตรงกัน, ติดตั้งแบบมี audit และเรียกภาพจาก API ที่รันจริงได้ 200 โดยยังสแกนได้ |
| LINE `GET /v2/bot/info` | ตอบ 200 จริง |

## สิ่งที่ทดสอบ

Google Login (24 ตุลาคม 2026): สำรอง SQLite ก่อน migration 7 ที่เพิ่ม has_password และตาราง Google identity/attempt/pending โดยคงบัญชีและยอดเดิม ใช้ google-auth-library 11.3.1 จริง ทดสอบด้วย RSA-signed JWT fixture และ provider transport แยกซึ่งไม่ติดต่อภายนอก ครอบคลุม signature/audience/issuer/expiry/nonce ผิด, email ไม่ verified, provider failure, state-cookie binding, OAuth denial/expiry/replay, S256 PKCE, บังคับ Origin, ค่าลับไม่อยู่ใน response, กรอก profile/เบอร์โทร, referral, role=customer/balance=0, ห้ามปลอมอีเมล/สิทธิ์, pending ใช้ซ้ำไม่ได้, returning subject แม้ Google เปลี่ยนอีเมล, ห้าม auto-link อีเมลเดิม, รหัสเดิมผิด/เพดานห้าครั้ง, คงบัญชีและ role เดิม, บัญชีระงับ/รหัสชั่วคราว/หมดอายุ, unlink หลัง admin เปลี่ยนอีเมล และ validation ของไฟล์ web credentials/callback ทดสอบเว็บจริงของ fixture รวมมือถือ 390px/axe, สมัครใหม่/กลับมา login, local login เดิม, existing-password link, error/retry/disabled states พบ accessible-name mismatch ของ fallback brand เดิมและแก้ header link ให้อิงชื่อที่แสดงแทน aria-label ที่ไม่ตรงกัน

ตรวจโดเมนจริง https://app.ca77group.org: /api/auth/google/status ตอบ enabled=true; OAuth start ตอบ URL Google พร้อม callback ของโดเมนนี้ เปิดต่อไปถึง accounts.google.com/v3/signin/identifier (200) ไม่พบ OAuth error/redirect_uri_mismatch/invalid_client ที่จุดเข้าหน้า login และ cancellation กลับ /login?google=cancelled (303) ข้อจำกัด: ไม่ได้ลงชื่อเข้าใช้ด้วยบัญชี Google จริงหรือยินยอมแทนเจ้าของ จึงยังไม่อ้างว่ายืนยัน consent/token exchange กับบัญชีจริงแล้ว ต้องตรวจ Authorized redirect URIs/consent audience ใน Google Cloud หากยังไม่ได้ตั้ง โลโก้ใช้ SVG ต้นฉบับจาก https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg ไม่สร้างเลียนแบบ

ไฟล์ Credentials.json ย้ายไป .secrets/google-oauth.json แล้วและจำกัด Windows ACL ให้ ADMIN กับ SYSTEM; ไม่มีไฟล์ต้นทางที่ root กัน .secrets/credentials filenames ออกจาก Git/Docker และ Vite fs.deny ตรวจ HTTP ทั้ง localhost:5174 และโดเมนจริงที่ /.secrets/google-oauth.json และ /@fs/.../.secrets/google-oauth.json ได้ 403 ทุกกรณี ไม่มีค่าลับใน response ตรวจ dist ทุกไฟล์แล้วไม่พบ client_secret จริง ไม่บันทึก provider access/id token ลงฐานข้อมูลหรือ audit; audit มีเพียง action/ID ไม่ส่ง email/LINE ในการทดสอบ

จัดการข้อมูลลูกค้าและรหัสผ่าน (24 ตุลาคม 2026): สำรอง SQLite ก่อน migration version 6; migration เพิ่มคอลัมน์โดยไม่เปลี่ยนชื่อ รหัสผ่าน หรือยอดเงินเดิม และรันซ้ำได้ ทดสอบ API ใหม่ 4 กรณีครอบคลุม member_edit แยกจาก members, CSRF, รหัสผู้ดำเนินการผิด, ห้ามแก้ staff/admin, validation, อีเมลซ้ำ, version เก่า, invalidation ของทุกเซสชัน, hash แทน plaintext, รหัสชั่วคราวหมดอายุ, restricted login, ยืนยันรหัสใหม่และล้าง flag/expiry, audit ไม่มีรหัสหรือข้อมูลติดต่อ และ throttle รายการผิดพลาด ทดสอบผ่านเว็บทั้งเส้นทาง พร้อมปิดบัง/แสดง/คัดลอกแบบ clipboard จริง และตรวจ modal 390px ไม่ล้น รวม axe ที่หน้าบังคับเปลี่ยนรหัส ไม่มี violations ในการตรวจนั้น บัญชีทั้งหมดเป็น fixture แยก ไม่รีเซ็ตรหัสหรือแก้ข้อมูลลูกค้าจริง ไม่มีการส่ง email/LINE; ภาพ customer-reset-mobile.png เป็นข้อมูลทดสอบ

ลายหินอ่อนชมพู (24 ตุลาคม 2026): เพิ่มเฉพาะ header, hero หน้าแรก และ footer แบบเต็มความกว้างของหน้าร้าน พร้อมโลโก้โปร่งใสสำหรับ source ปัจจุบัน สื่อ AVIF/WebP ประมาณ 50/59KB; Build ผ่าน และเบราว์เซอร์ 4/4 ชุดผ่าน (accessibility, appearance/custom dark surfaces, social contact links, mobile routes) ตรวจภาพเว็บจริงที่ 1440px/390px ไม่ล้น ไม่มีเงา และโหลดภาพ texture ได้ ภาพหลัก marble-store-desktop.png, marble-store-mobile.png, marble-store-footer.png ใน output/playwright ไม่เปลี่ยนการตั้งค่าธีม/ข้อมูล/ยอดเงินร้าน

ปรับ wallet-card ให้กะทัดรัดตามคำขอล่าสุด: ภาพจริงที่ 1440px ได้การ์ด 448×237px (เดิม 448×310px) และที่หน้าจอ 390px ได้ 350×231px โลโก้กรอบกว้าง 126px พร้อม PNG alpha โปร่งใสจริงที่เก็บใน public/assets/brands/iya-wallet-transparent-v1.png ผูกกับ URL โลโก้ต้นฉบับและใช้เฉพาะ Brand variant wallet ตรวจว่าโลโก้หัวเว็บยังใช้ต้นฉบับ Build ผ่าน; เบราว์เซอร์เติมเงิน/ซื้อ/คืนเงิน, QR และ mobile routes ผ่าน 3/3; ตรวจชื่อยาว/ยอดจำลองในฐานข้อมูลแยกที่ 320/390/800/1440px ไม่ล้นและไม่มี box-shadow ภาพล่าสุด wallet-card-compact.png / wallet-card-compact-mobile.png

ปรับหน้าตา wallet-card ตามภาพอ้างอิง Iya (24 ตุลาคม 2026): production build ผ่าน; รันทดสอบเบราว์เซอร์เฉพาะเติมเงิน/ซื้อ/คืนเงิน, QR รับเงิน และ mobile routes ผ่าน 3/3 ตรวจภาพด้วยโลโก้ร้านจริงในฐานข้อมูลทดสอบแยก ตรวจชื่อยาวและยอดจำลองสำหรับ layout ที่ความกว้าง 320/390/800/1440px โดยไม่มี document/card overflow และ computed box-shadow เป็น none การจำลองเพื่อดู layout ไม่เปลี่ยนยอดเงินในฐานข้อมูลร้าน; ไม่มีการเปลี่ยน API หรือกติกากระเป๋าเงิน ภาพตัวอย่างอยู่ที่ output/playwright/wallet-card-detail.png และ wallet-card-mobile.png

- ฝากขาย: สมัคร/อนุมัติ แยกเจ้าของสินค้า ตรวจรูปจริงและอนุมัติก่อนขาย ระงับสมาชิก ป้องกันซื้อสินค้าตนเอง แบ่งส่วนลดหลายตัวแทน ล็อกอัตรา ค่าฝากขาย 0%/100% ยอดสุทธิเมื่อสำเร็จครบชำระ ไม่เครดิตซ้ำ ยกเลิกไม่จ่าย และ rollback เมื่อเงินไม่พอ รายงานหักยอดจ่ายตัวแทนเป็นค่าใช้จ่าย
- รีวิว: ผู้ซื้อที่สำเร็จและชำระครบเท่านั้น 1–5 ดาว หนึ่งรีวิวต่อสินค้า แก้ไขแบบ version และสิทธิ์เจ้าของ ป้องกันแนบสื่อของผู้อื่น ปกปิดชื่อเต็ม/ข้อมูลติดต่อในรายการสาธารณะ draft และสื่อที่ซ่อนเข้าถึงไม่ได้จากผู้ใช้อื่น รูปผ่านการ re-encode; FFmpeg 9.0.2 แปลงวิดีโอจริง/เล่นผ่าน byte ranges และปฏิเสธไฟล์ปลอมกับวิดีโอยาวเกิน 60 วินาที
- เบราว์เซอร์ฟีเจอร์ใหม่: ตัวแทนสมัคร → ร้านอนุมัติ/ตั้ง 12.5% → ลงสินค้าและรูป → ร้านเปิดขาย → ผู้ซื้อชำระเต็ม → ออร์เดอร์สำเร็จ → ตัวแทนได้สุทธิ 175 บาทจากสินค้า 200 บาท → ผู้ซื้อรีวิว 5 ดาวพร้อมภาพและ MP4 → แก้เป็น 4 ดาว → หลังบ้านซ่อนพร้อมเหตุผล ตรวจวิดีโออ่าน duration ได้และมือถือ 390px ไม่ล้นเอกสาร

การทดสอบรายการซื้อและเติมเงินทั้งหมดใช้ฐานข้อมูลในหน่วยความจำ บัญชีทดสอบ และ EasySlip mock ไม่ใช้เงินจริงหรือยอดลูกค้า ระบบวิดีโอ Windows ติดตั้งและตรวจจริงแล้ว; Dockerfile เพิ่ม FFmpeg แต่ยังไม่ได้ build/run container ในเครื่องนี้ ทดสอบอัปโหลดคลิปสั้นจริงและปฏิเสธคลิป 61 วินาที ไม่ใช่การทดสอบโหลดผู้ใช้พร้อมกันจำนวนมาก

- สมัคร/เข้าสู่ระบบ/ออกจากระบบ เปลี่ยนรหัสผ่าน เซสชันหมดอายุ บัญชีถูกระงับ และ CSRF/origin
- สิทธิ์ทุกโมดูล: anonymous/customer ถูกปฏิเสธ, staff เฉพาะส่วน, บทบาทดูอย่างเดียว, ห้ามลดยศ admin คนสุดท้าย และเพิกถอนเซสชันหลังเปลี่ยนสิทธิ์
- จ่ายเต็ม มัดจำ 0% มัดจำบางส่วน ปัดขึ้นหน่วยสตางค์ ยอดไม่พอ rollback ทั้งรายการ สต็อกหมด ผู้ใช้ต่างคนเข้าถึงออร์เดอร์ไม่ได้
- จ่ายส่วนที่เหลือ ยกเลิก คืนเงินครั้งเดียวและคืนเฉพาะยอดจ่ายจริง คืนสต็อก ลำดับสถานะ และเลขพัสดุก่อนส่ง
- Idempotency: คำขอสั่งซื้อซ้ำและพร้อมกัน, รหัสคำขอใช้กับข้อมูลอื่น, concurrent slip ไม่เครดิตซ้ำ
- ใบเสนอราคาเก่าถูกราคา/มัดจำเปลี่ยน: ต้องยืนยันใหม่ ไม่ตัดเงินเกินยอดที่ตรวจ
- สลิปซ้ำ ผิดบัญชี ผิดธนาคาร ผิดชื่อ ผิดยอด ไม่มีผลจับคู่ ผิดสกุลเงิน เก่า/เวลาอนาคต ไฟล์ปลอม และ provider ล้มเหลว
- โปรโมชั่นเปอร์เซ็นต์/จำนวนเงิน ขั้นต่ำ อายุ จำนวนสิทธิ์ และคืนสิทธิ์หลังยกเลิก
- CRUD สินค้า/โปรโมชั่น/ประกาศ ตรวจ version เก่า SQL input binding และปิด active โดยรักษาประวัติ
- บัญชีรายรับ/รายจ่าย CSV ป้องกัน formula injection ยอดฝากไม่ถูกนับเป็นรายได้ กราฟข้อมูลจริง และแยก pagination ของ ledger กับบัญชีร้าน
- Secrets เข้ารหัส AES-GCM ปิดบังในการอ่านและไม่อยู่ใน audit, ledger/audit กันแก้/ลบ และตรวจ hash chain
- LINE HMAC จาก raw bytes, webhook ซ้ำ, worker retry แบบจำกัด, กู้คืนรอบสุดท้ายที่ขัดจังหวะ, ล้าง payload หลังสำเร็จ/ล้มเหลวสุดท้าย
- OpenAI request ใช้ข้อมูลสินค้าสาธารณะ ไม่มี tools และ `store:false`
- เบราว์เซอร์: ค้นหา/รายละเอียด/ตะกร้า/reload, สมัครสมาชิก, จอง 0%, ยอดไม่พอ, เติมสลิปจำลอง, จ่ายเต็ม, คืนเงิน, QR แนะนำ, CRUD หลังบ้าน, การตั้งค่า, รีทรายเมื่อโหลดล้มเหลว
- มือถือกว้าง 390px: หน้าร้าน หลังบ้าน สินค้า ตั้งค่า wallet ออร์เดอร์ แนะนำเพื่อนและบัญชี ไม่ล้นเอกสาร, dialog ปิดด้วย Escape และคืน focus
- ตะกร้าที่โหลดล้มเหลวเก็บ ID เดิมไว้และเรียกคืนผ่านปุ่มลองใหม่
- axe อัตโนมัติ WCAG 2 A/AA และ 2.1 AA tags ที่หน้าร้าน login register dashboard: ไม่พบ violation ในชุดตรวจนี้

## การตรวจแยกจากรอบก่อนหน้า

ผู้ตรวจแยกอ่านหน้าจอ 18 routes และโค้ดธุรกรรม พบเรื่อง quote เปลี่ยนราคา, cost disclosure, guard บทบาท, สีกราฟ, วันไทย, pagination, field errors, cart hydration และ webhook recovery ซึ่งแก้แล้วและเพิ่ม regression tests ผู้ตรวจได้อ่านแก้ไขซ้ำโดยไม่พบประเด็นสำคัญคงเหลือในส่วนที่ตรวจ การตรวจนี้ไม่ใช่ security audit โดยองค์กรภายนอก

Static premium scanner รอบปัจจุบัน `--mode strict` ผ่าน 0 findings หลังประกาศ native control ownership, validation owner ของ Form และ canonical map แบบเครื่องอ่านได้ ตัว scanner ไม่ได้ใช้แทน runtime tests

## การตรวจส่วนที่เพิ่ม

- QR รับเงินร้าน: อัปโหลดผ่าน settings permission/CSRF, ภาพถูกชนิด paymentQr และคงพิกเซล/quiet zone ของ QR ทดสอบ, บันทึก/ลบ/คงค่าจาก client เดิมได้ และปฏิเสธ URL ภายนอกหรือ media ผิดประเภทโดยไม่บันทึกบางส่วน
- เปลี่ยนบัญชีผู้รับแล้ว QR เดิมถูกล้างและซ่อนจนเพิ่มรูปใหม่; binding ที่ไม่ตรงถูกซ่อนจาก public แม้ค่าเปลี่ยนจาก script ภายใน ทดสอบ browser อัปโหลด → บันทึก → wallet ลูกค้า → เปิด Modal/Escape/focus restore → ดาวน์โหลด PNG → error/retry → เปลี่ยนบัญชี/ซ่อน QR ผ่าน ภาพ wallet-payment-qr.png ใช้ QR ข้อความทดสอบที่โอนเงินจริงไม่ได้
- ระบบจริงใช้ QR จากไฟล์ 2116.jpg ที่เจ้าของร้านส่งเมื่อ 24 ตุลาคม และตรวจข้อมูลบัญชีใน Branch จริงแล้ว เจ้าของร้านยืนยัน QRcode.jpg ภายหลัง ตรวจซ้ำว่ารหัสตรงกับรูปที่ใช้อยู่และผ่านการตรวจข้อมูลใน Branch พร้อมบันทึก audit โดยไม่ได้โอนเงินจริง

- สมัครสมาชิก: ชื่อหน้า/นามสกุลแยกคอลัมน์ เบอร์โทรบังคับพร้อม normalize และตรวจรูปแบบ ช่องทางรู้จักร้าน/LINE ID ไม่บังคับ ตรวจความยาวและอักขระ LINE ID ฝั่ง server
- ตรวจการสมัครผ่าน UI พร้อม error/focus/การรักษาค่าที่กรอก, บันทึกข้อมูลลง DB และ /me, ค้นหา/แสดงเบอร์และ LINE ID ในหลังบ้าน, ปฏิเสธ customer/anonymous ที่ขออ่านสมาชิกและไม่เผยข้อมูลผ่าน referral/audit
- Migration profile รันซ้ำได้และรักษาชื่อ รหัสผ่าน และยอดเงินเดิม ภาพหน้าสมัคร desktop/mobile อยู่ใน output/playwright/register-desktop.png และ register-live-mobile.png
- ชุดทดสอบเบราว์เซอร์ใช้เพดานคำขอสูงขึ้นเฉพาะเซิร์ฟเวอร์ in-memory เพื่อแยกการทดสอบฟังก์ชันจาก throttle; มี regression ยืนยัน production ยังคง 300 คำขอ/นาทีและไม่รับ override นี้

- PNG/JPEG/JPG จริงผ่านการ decode/re-encode, ปฏิเสธไฟล์ปลอม SVG ขนาดเกิน สิทธิ์ไม่พอ CSRF และ favicon ไม่จัตุรัส
- สี 6 ค่า รูปโลโก้/Favicon เวลาสไลด์และ % คอมบันทึกถาวร ตรวจ HEX ป้องกัน CSS injection และชนิด media ตรงกับตำแหน่งใช้
- แบนเนอร์หลายภาพ schedule/sort/version conflict; ประกาศหลายรายการเรียงลำดับพร้อมรูป
- คูปอง claim-required เก็บครั้งเดียว คิดส่วนลดจริงและตรวจ quota ใน transaction
- คอมมิชชั่น snapshot อัตรา ยอดฐานหลังลด ปัดลง จ่ายเมื่อ completed เพียงครั้งเดียว ยกเลิกเป็น void, 0% และบิลเก่าไม่จ่ายย้อนหลัง
- Ledger และ dashboard แสดงค่าคอมเป็นรายจ่าย; ผู้แนะนำเห็นเฉพาะรายการตนเอง
- Migration แบบเพิ่มคอลัมน์รันซ้ำได้และรักษาข้อมูลเก่า
- เบราว์เซอร์ทดสอบ preset/HEX, upload logo/JPEG และ favicon/PNG, CSS colors หลังโหลดใหม่, สี control เมื่อใช้ surface มืด, axe บนธีมพาสเทล
- ชุดสีชมพู–ฟ้าจากเจ้าของร้านถูกใช้จริงผ่าน shared/customer-colors.json, ตรวจปุ่ม hover #f2a8a8 / active #eb8d8d, contrast บนเดสก์ท็อป/มือถือ 390px และภาพหน้าร้านจริงใน output/playwright/pink-sky-desktop.png / pink-sky-customer-mobile.png
- เลิกใช้สีม่วงในระบบ: ธีมส่วนกลาง/หลังบ้าน/กราฟ/สถานะ/โฟกัส/placeholder เป็นชมพูหรือสีกลาง, นำ preset ลาเวนเดอร์ออกและเปลี่ยนแสงสะท้อนเป็นชมพูโรส; สแกน hex ใน src/shared/index ไม่พบม่วงตามช่วง hue 235–320° saturation > 12% และตรวจ contrast หลังบ้านผ่าน ภาพ pink-admin-test.png ใช้ฐานข้อมูลทดสอบแยก
- นำ box-shadow ทั้ง 23 declarations และ transition ที่เกี่ยวข้องออกจาก stylesheet พร้อมคง outline สำหรับโฟกัส; production build และ browser regression ทั้ง 13 ชุดผ่านหลังเปลี่ยน
- ขยายโลโก้อัปโหลด: หน้าร้าน desktop 264×99px, มือถือ 164–196px, เพิ่มพื้นที่ header และขยายใน sidebar/footer โดยคง object-fit contain และไม่มี box-shadow ตรวจภาพโลโก้จริงที่ 1440/390/320px ไม่ล้นเอกสาร; build และ browser regression 14/14 ผ่าน
- Favicon เดิมเป็นภาพทึบ RGB มีมุมสีขาว จึงสร้างเวอร์ชัน transparent ด้วย built-in image_gen และติดตั้งเป็น media URL ใหม่ โดยเก็บต้นฉบับเดิมไว้ ตรวจไฟล์ที่ API ส่งจริงได้ PNG 256×256 RGBA มี alpha และ isOpaque=false; ไฟล์และ prompt อยู่ใน assets/branding
- ทดสอบ upload PNG ที่มี alpha 0 และ 128 แล้วย่อ/โหลดกลับยังคงค่าโปร่งใส, opaque PNG/JPEG รายงาน hasTransparency=false, พรีวิวใช้ CSS checkerboard และแสดงสถานะพื้นทึบตามจริง; build, API/unit 80/80 และ browser 14/14 ผ่าน
- เบราว์เซอร์ทดสอบประกาศ/แบนเนอร์หมุนอัตโนมัติ หยุด วนกลับ ปุ่มเปลี่ยนภาพ reduced-motion การจำปิด popup ปุ่มกลับด้านบนมุมซ้ายล่างบนมือถือ
- เบราว์เซอร์ทดสอบสร้าง/แก้ไข/ปิดแบนเนอร์และรับ/ใช้คูปองพร้อมรูปผ่าน UI

ผู้ตรวจแยกอ่านฟีเจอร์ใหม่ 5 หน้าและ flow ร่วม พบ edge case เรื่อง foreground และสีช่องกรอกบนธีมมืด แก้แล้ว ไม่มีประเด็นเงิน/สิทธิ์/ภาพอัปโหลดคงเหลือในขอบเขตโค้ดที่ตรวจ

## ที่อยู่ QR และช่องทางติดต่อ (24 ตุลาคม)

- API: แยกเจ้าของที่อยู่, CSRF, จำกัด 20 รายการ, พิกัดคู่/ขอบเขต, default เดียว, stale version และย้าย default หลังลบ; audit ไม่มีข้อความที่อยู่
- สั่งซื้อเก็บพิกัด/ที่อยู่เป็น snapshot และยังคงเดิมหลังแก้/ลบที่อยู่ในสมุด
- QR: ปฏิเสธข้อมูลทั่วไป, checksum เสีย, ระบุยอด, เลขผู้รับผิด, บัญชี/พร้อมเพย์ไม่อยู่ใน Branch, ชื่อไม่ตรง และ provider ล่ม; ตรวจซ้ำก่อนบันทึกภาพใหม่และซ่อนเมื่อเปลี่ยนบัญชี/API key
- เบราว์เซอร์: login ลูกค้ากลับหน้าแรก, profile/logout icon, session ถูกเพิกถอน, คลิกรูป QR เปิด modal/คืน focus/ดาวน์โหลด
- เพิ่มหลายที่อยู่ ตั้งหลัก เลือกใน checkout ลบที่อยู่หลัก; ปักหมุดด้วยเมาส์ ลากหมุด ใช้ลูกศร+Enter และ geolocation จำลองที่ได้รับอนุญาต
- ตรวจ axe ใน modal ที่อยู่และส่วนแผนที่ ไม่พบ violation ใน tags ที่ทดสอบ; ตรวจ controls ไม่มี shadow และไม่ล้นหน้ามือถือ
- ช่องทางติดต่อ 5 รายการผ่าน UI พร้อม SVG สีจากไฟล์ในโปรเจกต์; server ปฏิเสธ host ปลอม/HTTP/URL credentials
- Rate limit ของ production คง 300 API/min และ 20 authentication attempts/15min แม้ config ทดสอบพยายามเพิ่ม
- แผนที่ใน functional tests ใช้ tile จำลอง ไม่ไล่ดาวน์โหลดข้อมูลจาก OpenStreetMap; ไม่ได้ยืนยัน availability ของบริการแผนที่ทุกพื้นที่/อุปกรณ์
- EasySlip API ที่ใช้ยืนยันรายการที่ลงทะเบียนกับ Branch ไม่ใช่ bank inquiry ยืนยันว่าพร้อมเพย์ผูกกับบัญชีใดโดยตรง การเพิ่มเงินยังต้องผ่าน verified-slip match

## ข้อจำกัดที่ยังต้องตรวจบนระบบใช้งานจริง

- ยังไม่ได้ส่งสลิปโอนเงินจริงเข้า verification API การทดสอบเพิ่มยอดเป็น mock แยกฐานข้อมูล ไม่สร้างเงินในฐานข้อมูลร้าน
- ยังไม่ได้ตั้ง public HTTPS domain / TLS / reverse proxy / LINE webhook จริง หรือทดสอบรับ-ตอบใน LINE จริง ไม่มีข้อความถูกส่งหาลูกค้าระหว่างการพัฒนา
- ยังไม่มี OpenAI API key จึงทดสอบ schema/พฤติกรรมด้วย mock ไม่ได้ยืนยันโมเดลหรือโควต้าของบัญชีจริง
- ยังไม่ทดสอบ container image, reverse proxy, full restore บน host ใหม่, Safari/Firefox, อุปกรณ์มือถือจริง, load/penetration test หรือ WCAG ทุกเกณฑ์ด้วยคน
- hash chain ไม่มี external anchor; ผู้ครอบครอง DB และ host สามารถแก้ระบบได้ อย่าตีความว่าเป็นหลักฐานที่ต้านผู้ดูแลเครื่องได้สมบูรณ์

ตัวอย่าง API อ้างอิง: [EasySlip verify bank](https://document.easyslip.com/th/v2/verify/bank/image), [LINE webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create)

การย้าย QR ข้างบัญชี (24 ตุลาคม): production build ผ่าน, browser flow QR ผ่านโดยตรวจตำแหน่งด้านขวาที่ 1918px ขนาดไม่เกิน 180x180 ไม่มีปุ่มเปิดรูปใหญ่ คลิกภาพ/คืน focus/ดาวน์โหลด/รีทรายยังทำงาน และมือถือ 390px ไม่ล้น ตรวจภาพ QR ร้านที่ย่อแบบ contain เป็น 180x180 แล้วยังถอดรหัสได้ Strict static audit 0 findings ไม่ได้รันชุด API ซ้ำสำหรับการเปลี่ยน layout ครั้งนี้

ปรับ QR ให้เต็มกรอบ (24 ตุลาคม): API tests 91/91 ผ่าน, production build ผ่าน, browser QR flow ผ่านพร้อม fixture ภาพแนวตั้ง 1080x1440 ที่มีขอบขาวกว้าง ตรวจจาก screenshot ว่าตัวรหัสกว้างเกิน 130px ในกรอบ 180px และ jsQR อ่านได้ payload เดิม ทดสอบขยาย/ดาวน์โหลด/retry/มือถือด้วย ตรวจ QR ร้านจริงหลังจัดกรอบว่าถอดรหัสได้ และ API ที่รันจริงส่ง paymentQrFrame แล้ว เก็บภาพต้นฉบับ/URL เดิมและบันทึก audit Strict static audit 0 findings
