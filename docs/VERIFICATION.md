# ผลการตรวจระบบ

ตรวจเมื่อ 23 ตุลาคม 2026 (Asia/Bangkok) บน Windows, Node.js 26.10.0

| การตรวจ | ผล |
|---|---|
| `npm run build` | ผ่าน TypeScript และ Vite production build |
| `npm test` | ผ่าน 75/75 กรณี ไม่มี skipped |
| `npx playwright test` | ผ่าน 13/13 ชุด ใน Chromium ไม่มี skipped |
| `npm audit --audit-level=low` | 0 vulnerabilities ที่ฐานข้อมูล npm รายงาน ณ เวลาตรวจ |
| `npm run backup` | สร้าง SQLite snapshot สำเร็จ |
| DESIGN.md lint | 0 errors, 1 warning: ไม่พบ YAML frontmatter ในชุดสีที่แก้ล่าสุด จึงยังยืนยัน token ด้วย linter ไม่ได้; คงเนื้อหาชุดสีเดิมไว้ |
| EasySlip `GET /banks` | ตอบ 200 จริง |
| EasySlip `GET /bank-accounts` | ตอบ 200 จริง พบบัญชีธนาคาร เลขบัญชีและชื่อที่ตรงกับการตั้งค่าจากเจ้าของร้าน |
| LINE `GET /v2/bot/info` | ตอบ 200 จริง |

## สิ่งที่ทดสอบ

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

## การตรวจแยก

ผู้ตรวจแยกอ่านหน้าจอ 18 routes และโค้ดธุรกรรม พบเรื่อง quote เปลี่ยนราคา, cost disclosure, guard บทบาท, สีกราฟ, วันไทย, pagination, field errors, cart hydration และ webhook recovery ซึ่งแก้แล้วและเพิ่ม regression tests ผู้ตรวจได้อ่านแก้ไขซ้ำโดยไม่พบประเด็นสำคัญคงเหลือในส่วนที่ตรวจ การตรวจนี้ไม่ใช่ security audit โดยองค์กรภายนอก

Static premium scanner รอบปัจจุบัน `--mode strict` ผ่าน 0 findings หลังประกาศ native control ownership, validation owner ของ Form และ canonical map แบบเครื่องอ่านได้ ตัว scanner ไม่ได้ใช้แทน runtime tests

## การตรวจส่วนที่เพิ่ม

- PNG/JPEG/JPG จริงผ่านการ decode/re-encode, ปฏิเสธไฟล์ปลอม SVG ขนาดเกิน สิทธิ์ไม่พอ CSRF และ favicon ไม่จัตุรัส
- สี 6 ค่า รูปโลโก้/Favicon เวลาสไลด์และ % คอมบันทึกถาวร ตรวจ HEX ป้องกัน CSS injection และชนิด media ตรงกับตำแหน่งใช้
- แบนเนอร์หลายภาพ schedule/sort/version conflict; ประกาศหลายรายการเรียงลำดับพร้อมรูป
- คูปอง claim-required เก็บครั้งเดียว คิดส่วนลดจริงและตรวจ quota ใน transaction
- คอมมิชชั่น snapshot อัตรา ยอดฐานหลังลด ปัดลง จ่ายเมื่อ completed เพียงครั้งเดียว ยกเลิกเป็น void, 0% และบิลเก่าไม่จ่ายย้อนหลัง
- Ledger และ dashboard แสดงค่าคอมเป็นรายจ่าย; ผู้แนะนำเห็นเฉพาะรายการตนเอง
- Migration แบบเพิ่มคอลัมน์รันซ้ำได้และรักษาข้อมูลเก่า
- เบราว์เซอร์ทดสอบ preset/HEX, upload logo/JPEG และ favicon/PNG, CSS colors หลังโหลดใหม่, สี control เมื่อใช้ surface มืด, axe บนธีมพาสเทล
- เบราว์เซอร์ทดสอบประกาศ/แบนเนอร์หมุนอัตโนมัติ หยุด วนกลับ ปุ่มเปลี่ยนภาพ reduced-motion การจำปิด popup ปุ่มกลับด้านบนมุมซ้ายล่างบนมือถือ
- เบราว์เซอร์ทดสอบสร้าง/แก้ไข/ปิดแบนเนอร์และรับ/ใช้คูปองพร้อมรูปผ่าน UI

ผู้ตรวจแยกอ่านฟีเจอร์ใหม่ 5 หน้าและ flow ร่วม พบ edge case เรื่อง foreground และสีช่องกรอกบนธีมมืด แก้แล้ว ไม่มีประเด็นเงิน/สิทธิ์/ภาพอัปโหลดคงเหลือในขอบเขตโค้ดที่ตรวจ

## ข้อจำกัดที่ยังต้องตรวจบนระบบใช้งานจริง

- ยังไม่ได้ส่งสลิปโอนเงินจริงเข้า verification API การทดสอบเพิ่มยอดเป็น mock แยกฐานข้อมูล ไม่สร้างเงินในฐานข้อมูลร้าน
- ยังไม่ได้ตั้ง public HTTPS domain / TLS / reverse proxy / LINE webhook จริง หรือทดสอบรับ-ตอบใน LINE จริง ไม่มีข้อความถูกส่งหาลูกค้าระหว่างการพัฒนา
- ยังไม่มี OpenAI API key จึงทดสอบ schema/พฤติกรรมด้วย mock ไม่ได้ยืนยันโมเดลหรือโควต้าของบัญชีจริง
- ยังไม่ทดสอบ container image, reverse proxy, full restore บน host ใหม่, Safari/Firefox, อุปกรณ์มือถือจริง, load/penetration test หรือ WCAG ทุกเกณฑ์ด้วยคน
- hash chain ไม่มี external anchor; ผู้ครอบครอง DB และ host สามารถแก้ระบบได้ อย่าตีความว่าเป็นหลักฐานที่ต้านผู้ดูแลเครื่องได้สมบูรณ์

ตัวอย่าง API อ้างอิง: [EasySlip verify bank](https://document.easyslip.com/th/v2/verify/bank/image), [LINE webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create)
