# เมนูบัญชีของฉันบน iPhone

## สิ่งที่ตรวจพบ

ตรวจใน WebKit ด้วย viewport/touch ของ iPhone พบว่าการแตะลิงก์ภายใน dropdown ทำให้โฟกัสย้ายจาก summary ไปที่ nav ที่เลื่อนได้ก่อนเกิด click ตัว onBlur เดิมเห็นว่าโฟกัสออกนอก details จึงปิด dropdown ระหว่าง mousedown กับ mouseup ผลคือ click ไม่ถึงลิงก์และ URL ไม่เปลี่ยน ตรวจพบทั้งแบบ fixed ปกติและแบบ popover ก่อนแก้การจัดการ blur

โครงสร้างเดิมยังวาง fixed dropdown ไว้ภายใน overflow-x:auto / overflow-y:hidden ซึ่งเป็นจุดเสี่ยงต่อการตัด overlay ใน WebKit บางรุ่น การเปิดเมนูอย่างเดียวใน WebKit รุ่นที่ทดสอบไม่เกิดอาการตัด จึงไม่ถือว่าได้จำลอง iOS 17.7.1 หรือเครื่องผู้ใช้จริงครบถ้วน

## การแก้

- ตรวจต้นทาง pointerdown ว่าอยู่ภายใน details หรือไม่ เมื่อแตะภายในจะไม่ปิดด้วย blur ก่อน click ส่วน pointerdown ภายนอกยังปิดเมนูตามเดิม
- รีเซ็ตต้นทาง pointer เมื่อ click หรือใช้คีย์บอร์ด การออกนอกเมนูด้วยคีย์บอร์ดยังคงปิดได้
- แสดง dropdown ใน top layer ผ่าน Popover API แบบ manual เมื่อรองรับ เพื่อให้พ้น overflow clipping ของแถบเลื่อน รักษา DOM links, ลำดับรายการ, theme และการเลื่อนแนวนอนเดิม
- ใช้ summary/รายละเอียดเดิมพร้อม aria-controls ไม่เปลี่ยนเป็น modal และไม่ล็อก scroll ของหน้า
- feature detection ไม่ใส่ popover attribute เมื่อไม่มี API จึงยังใช้ fixed disclosure เดิมได้ ไม่มี dependency หรือ polyfill เพิ่ม
- แยก toggle event ของ details ออกจาก toggle ของ popover และล้าง UA inset/margin เพื่อคงตำแหน่งเดิม

Safari 17.0 เพิ่ม Popover API แล้ว: [WebKit Safari 17.0 release](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/). ข้อมูล fixed/clipping ที่ใช้อ้างอิง: [WebKit bug 160953](https://bugs.webkit.org/show_bug.cgi?id=160953).

## การตรวจ

ใช้ isolated in-memory fixtures เท่านั้น ไม่ล็อกอินลูกค้าจริงหรือสร้างธุรกรรมจริง

- WebKit 27.2 บน Windows แบบ touch/mobile: 430×932, 390×844, 320×568 และ 852×393 ตรวจเปิด/ปิดซ้ำ การ hit-test ลิงก์ที่อยู่เหนือเนื้อหาจริง เลือกกระเป๋าเงินแล้วเปลี่ยนหน้า แตะภายนอก ปิดเมื่อ anchor หลุดจาก rail และ Escape คืนโฟกัส
- ทดสอบ fallback เมื่อปิด API จำลอง และตรวจลิงก์ที่อยู่จัดส่ง
- ทดสอบ Chromium เดิม: mouse drag, native swipe, ไม่มี scrollbar/ปุ่มลูกศร, ปิดด้วย Escape/blur/outside click และ viewport/การเข้าถึง
- ไม่ใช่การทดสอบบนเครื่อง iPhone จริง และไม่ได้อ้างว่า WebKit รุ่นปัจจุบันตรงกับ Safari ทุกเวอร์ชัน

ไม่มีการเปลี่ยน API, สิทธิ์, ฐานข้อมูล หรือกติกากระเป๋าเงิน
