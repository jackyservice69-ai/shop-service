import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  MapPin,
  PackageCheck,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { useApp } from "./api";
import { PageHeading } from "./ui";
import "./shopping-guide.css";

export function ShoppingGuidePage() {
  const { publicData } = useApp();
  const depositPercent = publicData?.depositPercent;
  const depositLabel =
    depositPercent != null
      ? `${Number(depositPercent).toLocaleString("th-TH", { maximumFractionDigits: 2 })}%`
      : "ตามอัตราที่ร้านกำหนด";

  return (
    <div className="contained shopping-guide">
      <PageHeading
        title="วิธีสั่งซื้อ"
        sub="เลือกของที่ชอบ เตรียมที่อยู่ แล้วติดตามทุกขั้นตอนได้ในบัญชีของคุณ"
      >
        <Link to="/products" className="button primary">
          เลือกซื้อสินค้า <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </PageHeading>

      <section className="shopping-guide-process" aria-labelledby="guide-steps">
        <div className="shopping-guide-section-heading">
          <div>
            <h2 id="guide-steps">สั่งซื้อใน 4 ขั้นตอน</h2>
            <p>ตรวจสอบสินค้า ที่อยู่ และยอดชำระให้ครบก่อนยืนยัน</p>
          </div>
          <Link to="/cart" className="shopping-guide-link">
            เปิดตะกร้า <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <ol className="shopping-guide-steps">
          <li>
            <div className="shopping-guide-step-top">
              <span className="shopping-guide-step-number" aria-hidden="true">
                1
              </span>
              <ShoppingBag size={21} aria-hidden="true" />
            </div>
            <h3>เลือกสินค้าที่ชอบ</h3>
            <p>
              ดูรายละเอียดสินค้า เพิ่มลงตะกร้า และตรวจสอบจำนวนที่ต้องการสั่ง
            </p>
            <Link to="/products" className="shopping-guide-link">
              ไปเลือกสินค้า <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <div className="shopping-guide-step-top">
              <span className="shopping-guide-step-number" aria-hidden="true">
                2
              </span>
              <MapPin size={21} aria-hidden="true" />
            </div>
            <h3>เข้าสู่ระบบและเตรียมที่อยู่</h3>
            <p>
              สมัครสมาชิกหรือเข้าสู่ระบบ กรอกชื่อผู้รับ เบอร์โทร
              และที่อยู่จัดส่ง เพิ่มหมุดแผนที่ได้เพื่อช่วยระบุตำแหน่ง
            </p>
            <Link to="/addresses" className="shopping-guide-link">
              จัดการที่อยู่จัดส่ง <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <div className="shopping-guide-step-top">
              <span className="shopping-guide-step-number" aria-hidden="true">
                3
              </span>
              <Wallet size={21} aria-hidden="true" />
            </div>
            <h3>เลือกวิธีชำระเงิน</h3>
            <p>
              ชำระเต็มจำนวนจากกระเป๋าเงิน หรือเลือกจองมัดจำ {depositLabel}{" "}
              ตรวจสอบยอดชำระตอนนี้และยอดคงเหลือก่อนยืนยัน
            </p>
            <Link to="/wallet" className="shopping-guide-link">
              ดูและเติมเงินในกระเป๋า <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
          <li>
            <div className="shopping-guide-step-top">
              <span className="shopping-guide-step-number" aria-hidden="true">
                4
              </span>
              <PackageCheck size={21} aria-hidden="true" />
            </div>
            <h3>ติดตามและชำระส่วนที่เหลือ</h3>
            <p>
              ดูสถานะในคำสั่งซื้อของฉัน หากเลือกมัดจำ
              ให้ชำระส่วนที่เหลือจากกระเป๋าเงินก่อนจัดส่ง
              เลขพัสดุจะแสดงเมื่อร้านบันทึกแล้ว
            </p>
            <Link to="/orders" className="shopping-guide-link">
              ดูคำสั่งซื้อของฉัน <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </li>
        </ol>
        <p className="shopping-guide-payment-note">
          <strong>เงินจะถูกหักเมื่อยืนยันยอดชำระ</strong>{" "}
          ระบบหักเงินจากกระเป๋าตามยอดที่ยืนยันโดยอัตโนมัติ
          อัตรามัดจำอาจเป็นศูนย์ตามการตั้งค่าของร้าน
          แต่ยอดคงเหลือยังต้องชำระก่อนจัดส่ง
        </p>
      </section>

      <div className="shopping-guide-preparation">
        <section className="shopping-guide-panel" aria-labelledby="guide-topup">
          <h2 id="guide-topup">เติมเงินก่อนชำระ</h2>
          <ol className="shopping-guide-checklist">
            <li>
              เปิดหน้ากระเป๋าเงิน แล้วตรวจสอบบัญชีรับเงินหรือ QR
              ที่ร้านยืนยันไว้
            </li>
            <li>ตรวจสอบชื่อผู้รับในแอปธนาคารก่อนโอน และเก็บสลิปไว้</li>
            <li>
              ระบุยอดที่โอนและอัปโหลดสลิปในหน้ากระเป๋าเงิน
              ระบบจะตรวจสอบบัญชีรับเงินและยอดก่อนเพิ่มเงิน
            </li>
          </ol>
          <p>
            หากตรวจสอบไม่สำเร็จ
            ให้ดูข้อความแจ้งในหน้าเติมเงินและตรวจสอบรายละเอียดอีกครั้ง
          </p>
          <Link to="/wallet" className="shopping-guide-link">
            ไปหน้ากระเป๋าเงิน <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </section>
        <section
          className="shopping-guide-panel"
          aria-labelledby="guide-account"
        >
          <h2 id="guide-account">เตรียมบัญชีให้พร้อม</h2>
          <p>
            สมัครสมาชิกหรือเข้าสู่ระบบก่อนยืนยันคำสั่งซื้อ
            บันทึกที่อยู่ไว้ใช้ครั้งต่อไปได้
            และตรวจสอบข้อมูลผู้รับอีกครั้งในตะกร้า
          </p>
          <p>
            Google และ LINE ใช้งานได้เมื่อร้านเปิดให้บริการ
            หากต้องการส่งสลิปเติมเงินทาง LINE ต้องเชื่อมบัญชี LINE
            กับบัญชีสมาชิกก่อน และร้านต้องเปิดรับสลิปทาง LINE
          </p>
          <div className="shopping-guide-panel-links">
            <Link to="/account" className="shopping-guide-link">
              บัญชีและการเชื่อมต่อ <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/addresses" className="shopping-guide-link">
              ที่อยู่จัดส่ง <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>

      <section className="shopping-guide-faq" aria-labelledby="guide-faq">
        <div className="shopping-guide-section-heading">
          <div>
            <h2 id="guide-faq">คำถามที่พบบ่อย</h2>
            <p>กดที่คำถามเพื่ออ่านรายละเอียด</p>
          </div>
        </div>
        <div className="shopping-guide-faq-list">
          <details>
            <summary>
              ต้องสมัครสมาชิกก่อนสั่งซื้อไหม?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                เลือกดูสินค้าและเพิ่มลงตะกร้าได้ก่อน
                แต่ต้องสมัครสมาชิกหรือเข้าสู่ระบบเพื่อยืนยันคำสั่งซื้อ
                จัดการกระเป๋าเงิน และติดตามรายการของตัวเอง
              </p>
              <Link to="/account" className="shopping-guide-link">
                ไปที่บัญชีของฉัน <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              ชำระเต็มจำนวนกับจองมัดจำต่างกันอย่างไร?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                ชำระเต็มจำนวนจะหักยอดเต็มจากกระเป๋าเงินเมื่อยืนยัน
                ส่วนการจองมัดจำใช้อัตราปัจจุบัน {depositLabel}{" "}
                และชำระยอดคงเหลือก่อนจัดส่ง หากร้านตั้งมัดจำเป็นศูนย์
                ยอดชำระตอนจองอาจเป็นศูนย์ได้
                ตรวจสอบยอดจริงในตะกร้าก่อนยืนยันทุกครั้ง
              </p>
              <Link to="/cart" className="shopping-guide-link">
                ตรวจสอบยอดในตะกร้า <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              เงินในกระเป๋าไม่พอ ต้องทำอย่างไร?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                เติมเงินผ่านบัญชีหรือ QR ที่แสดงในหน้ากระเป๋าเงิน
                โอนแล้วระบุยอดและอัปโหลดสลิป
                รอผลตรวจสอบและเช็กยอดกระเป๋าก่อนกลับไปยืนยันการชำระ
              </p>
              <Link to="/wallet" className="shopping-guide-link">
                ไปเติมเงิน <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              อัปโหลดสลิปแล้ว แต่เงินยังไม่เข้า ต้องทำอย่างไร?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                ดูผลตรวจสอบในหน้ากระเป๋าเงิน ตรวจสอบบัญชีรับเงิน ยอดที่ระบุ
                และความชัดเจนของสลิป หากยังแก้ไขไม่ได้
                ให้ติดต่อร้านพร้อมรายละเอียดการโอนและข้อความที่พบ
                โดยเช็กยอดและประวัติกระเป๋าก่อนโอนเพิ่ม
              </p>
              <Link to="/contact" className="shopping-guide-link">
                ดูช่องทางติดต่อร้าน <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              ส่งสลิปเติมเงินทาง LINE ได้ไหม?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                ได้เมื่อร้านเปิดบริการนี้ และคุณเชื่อมบัญชี LINE
                กับบัญชีสมาชิกแล้ว ให้เชื่อมต่อจากหน้าบัญชีก่อนส่งสลิป
                ระบบต้องตรวจสอบสลิปสำเร็จก่อนเพิ่มเงิน การกรอก LINE ID
                ในข้อมูลติดต่อเพียงอย่างเดียวไม่ใช่การเชื่อมบัญชี
              </p>
              <Link to="/account" className="shopping-guide-link">
                ตรวจสอบการเชื่อมบัญชี{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              จำเป็นต้องปักหมุดที่อยู่บนแผนที่ไหม?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                หมุดแผนที่เป็นข้อมูลเสริม คุณยังต้องกรอกชื่อผู้รับ เบอร์โทร
                และที่อยู่ให้ครบ หากไม่สะดวกใช้ตำแหน่งอุปกรณ์
                สามารถเลือกหมุดเองหรือใช้ที่อยู่แบบข้อความได้
                ตรวจสอบที่อยู่ในตะกร้าก่อนยืนยัน
                เพราะการแก้สมุดที่อยู่ภายหลังไม่เปลี่ยนที่อยู่ในคำสั่งซื้อเดิม
              </p>
              <Link to="/addresses" className="shopping-guide-link">
                จัดการที่อยู่ของฉัน <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              จะชำระส่วนที่เหลือและติดตามพัสดุได้ที่ไหน?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                เปิดคำสั่งซื้อของฉันเพื่อดูยอดรวม ยอดที่ชำระแล้ว และยอดคงเหลือ
                เลือกชำระส่วนที่เหลือและยืนยันหักเงินจากกระเป๋าก่อนจัดส่ง
                เมื่อร้านบันทึกเลขพัสดุแล้ว เลขจะแสดงในคำสั่งซื้อนั้น
              </p>
              <Link to="/orders" className="shopping-guide-link">
                ดูสถานะคำสั่งซื้อ <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
          <details>
            <summary>
              ต้องใช้ Google หรือ LINE เพื่อเข้าสู่ระบบไหม?
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="shopping-guide-answer">
              <p>
                Google และ LINE เป็นทางเลือกตามบริการที่ร้านเปิดไว้
                คุณสามารถสมัครด้วยอีเมลและรหัสผ่านได้ หากมีบัญชีสมาชิกอยู่แล้ว
                ให้เข้าสู่บัญชีเดิมและเชื่อม Google หรือ LINE จากหน้าบัญชีของฉัน
              </p>
              <Link to="/account" className="shopping-guide-link">
                จัดการบัญชีของฉัน <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </details>
        </div>
      </section>

      <aside className="shopping-guide-contact" aria-labelledby="guide-help">
        <div>
          <h2 id="guide-help">ยังมีข้อสงสัยเกี่ยวกับการสั่งซื้อ?</h2>
          <p>
            ดูช่องทางติดต่อที่ร้านเปิดไว้ หากสอบถามเรื่องคำสั่งซื้อ
            เตรียมเลขคำสั่งซื้อไว้ด้วย
          </p>
        </div>
        <Link to="/contact" className="button secondary">
          ติดต่อร้าน <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
