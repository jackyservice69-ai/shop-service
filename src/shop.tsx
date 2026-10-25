import { StoreBanners, Carousel } from "./experience";
import "./storefront-home.css";
import { AddressBook, MapPicker, SavedAddressSelect } from "./address-book";
import { BankDetailsPanel } from "./bank-details";
import { WalletCard } from "./wallet-card";
import { GoogleButton } from "./google-auth";
import { LineButton, SocialConnections } from "./line-auth";
import { DiscoverySourceField, registrationValues } from "./discovery-source";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
  ShieldCheck,
  Truck,
  Wallet,
  Upload,
  Copy,
  Gift,
  Package,
  Minus,
  Plus,
  Trash2,
  Check,
  Link2,
  CreditCard,
  Clock,
  ChevronRight,
  LogOut,
} from "lucide-react";
import QRCode from "qrcode";
import {
  api,
  ApiError,
  send,
  useApp,
  useData,
  money,
  date,
  type PageData,
} from "./api";
import {
  PageHeading,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  Modal,
  Confirm,
  Form,
  Field,
  formObject,
  cents,
  Table,
  Pagination,
  useListQuery,
  SearchBox,
} from "./ui";

export function StorePage() {
  const { publicData } = useApp();
  const quickCategories = [
    { label: "กระเป๋า", match: /กระเป๋า|bag/i, art: "bag" },
    { label: "น้ำหอม", match: /น้ำหอม|perfume|fragrance/i, art: "perfume" },
    {
      label: "เครื่องประดับ",
      match: /เครื่องประดับ|จิวเวล|jewel|accessor/i,
      art: "jewelry",
    },
    {
      label: "เสื้อผ้า",
      match: /เสื้อ|แฟชั่น|cloth|fashion/i,
      art: "clothing",
    },
  ];
  const categories: string[] = publicData?.categories || [];
  const browseCategories = categories.slice(0, 4).map((name) => ({
    name,
    art: quickCategories.find((item) => item.match.test(name))?.art,
  }));
  return (
    <div className="pastel-storefront">
      <StoreBanners />
      <section className="store-hero reference-hero">
        <img
          className="pastel-hero-illustration"
          src="/assets/storefront/hero-hd-v2.webp"
          srcSet="/assets/storefront/hero-hd-small-v2.webp 688w, /assets/storefront/hero-hd-v2.webp 1376w"
          sizes="(max-width: 700px) calc(100vw - 30px), (max-width: 1100px) calc(100vw - 64px), 1000px"
          alt=""
          width="1376"
          height="1143"
          fetchPriority="high"
        />
        <h1 className="sr-only">ของที่ชอบ ให้เราหิ้วมาให้</h1>
        <p className="sr-only">
          รวมของน่ารัก ของน่าใช้ และของที่คุณเล็งไว้ สั่งง่าย จ่ายสะดวก
          ติดตามได้ทุกขั้นตอน ตรวจสลิปอัตโนมัติ จ่ายได้หลายช่องทาง จัดส่งทั่วไทย
        </p>
        <Link className="button primary reference-hero-cta" to="/products">
          เลือกช้อปของที่ชอบ <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>
      <nav className="pastel-quick-categories" aria-label="เลือกหมวดหมู่สินค้า">
        {quickCategories.map((item) => {
          const value =
            categories.find((name) => item.match.test(name)) || item.label;
          return (
            <Link
              key={item.art}
              to={"/products?category=" + encodeURIComponent(value)}
            >
              <span
                className={"pastel-category-art art-" + item.art}
                aria-hidden="true"
              />
              <span>
                {item.label} <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </nav>
      <section
        className="pastel-promotion reference-promotion"
        aria-labelledby="pastel-promotion-title"
      >
        <img
          src="/assets/storefront/promotion-hd-v2.webp"
          srcSet="/assets/storefront/promotion-hd-small-v2.webp 894w, /assets/storefront/promotion-hd-v2.webp 1788w"
          sizes="(max-width: 700px) calc(100vw - 30px), (max-width: 1100px) calc(100vw - 64px), 1000px"
          alt=""
          width="1788"
          height="564"
          loading="lazy"
        />
        <h2 className="sr-only" id="pastel-promotion-title">
          โปรโมชั่นสุดพิเศษ
        </h2>
        <Link
          to="/promotions"
          className="button primary reference-promotion-cta"
        >
          ดูโปรโมชั่นทั้งหมด <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </section>
      <section className="service-strip" aria-label="บริการของเรา">
        <div>
          <span className="pastel-benefit-icon">
            <ShoppingBag size={25} aria-hidden="true" />
          </span>
          <span>
            <b>รับหิ้วของที่ชอบ</b>
            <small>เลือกจากรายการในร้าน</small>
          </span>
        </div>
        <div>
          <span className="pastel-benefit-icon">
            <ShieldCheck size={25} aria-hidden="true" />
          </span>
          <span>
            <b>ตรวจสลิปอัตโนมัติ</b>
            <small>ตรวจสอบก่อนเติมเงิน</small>
          </span>
        </div>
        <div>
          <span className="pastel-benefit-icon">
            <Wallet size={25} aria-hidden="true" />
          </span>
          <span>
            <b>ชำระผ่านกระเป๋าเงิน</b>
            <small>รวมไว้ในบัญชีของคุณ</small>
          </span>
        </div>
        <div>
          <span className="pastel-benefit-icon">
            <Truck size={25} aria-hidden="true" />
          </span>
          <span>
            <b>ติดตามคำสั่งซื้อ</b>
            <small>ดูสถานะและเลขพัสดุ</small>
          </span>
        </div>
      </section>
      <section className="pastel-browse" aria-labelledby="pastel-browse-title">
        <div className="pastel-section-heading">
          <h2 id="pastel-browse-title">
            <span aria-hidden="true" />
            หมวดหมู่ที่น่าช้อป
          </h2>
          <Link to="/products" className="pastel-text-link">
            ดูทั้งหมด <ArrowRight size={16} />
          </Link>
        </div>
        {browseCategories.length ? (
          <div className="pastel-browse-grid">
            {browseCategories.map((item) => (
              <Link
                key={item.name}
                className="pastel-browse-card"
                to={"/products?category=" + encodeURIComponent(item.name)}
              >
                <span
                  className={
                    "pastel-category-art art-" + (item.art || "generic")
                  }
                  aria-hidden="true"
                >
                  {!item.art && <Package size={64} strokeWidth={1.2} />}
                </span>
                <span className="pastel-browse-label">
                  <span>
                    <b>{item.name}</b>
                    <small>เลือกดูสินค้า</small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="pastel-section-help">
            เลือกดูสินค้าได้ที่หน้าเลือกซื้อสินค้า
          </p>
        )}
      </section>
      <section className="pastel-steps" aria-labelledby="pastel-steps-title">
        <div className="pastel-section-heading">
          <h2 id="pastel-steps-title">
            <ShoppingBag size={23} aria-hidden="true" />
            หิ้วง่าย ๆ ใน 4 ขั้นตอน
          </h2>
          <Link to="/products" className="pastel-text-link">
            เริ่มเลือกสินค้า <ArrowRight size={16} />
          </Link>
        </div>
        <ol>
          <li>
            <span className="pastel-step-icon">
              <Link2 size={27} aria-hidden="true" />
            </span>
            <b>
              <span>1</span> เลือกของที่ชอบ
            </b>
            <p>เลือกรายการ หรือส่งลิงก์ทาง LINE</p>
          </li>
          <li>
            <span className="pastel-step-icon">
              <ShoppingBag size={27} aria-hidden="true" />
            </span>
            <b>
              <span>2</span> รอตรวจสอบ
            </b>
            <p>เช็กรายละเอียดและยอดที่ต้องชำระ</p>
          </li>
          <li>
            <span className="pastel-step-icon">
              <CreditCard size={27} aria-hidden="true" />
            </span>
            <b>
              <span>3</span> ชำระเงิน
            </b>
            <p>จองเริ่ม {publicData?.depositPercent ?? 0}% ตามเงื่อนไขร้าน</p>
          </li>
          <li>
            <span className="pastel-step-icon">
              <Truck size={27} aria-hidden="true" />
            </span>
            <b>
              <span>4</span> ติดตามจัดส่ง
            </b>
            <p>ชำระครบ แล้วรอรับของที่ชอบ</p>
          </li>
        </ol>
      </section>
      <section className="pastel-contact reference-contact">
        <img
          src="/assets/storefront/contact-hd-v2.webp"
          srcSet="/assets/storefront/contact-hd-small-v2.webp 1084w, /assets/storefront/contact-hd-v2.webp 2169w"
          sizes="(max-width: 700px) calc(100vw - 30px), (max-width: 1100px) calc(100vw - 64px), 1000px"
          width={2169}
          height={348}
          alt=""
          loading="lazy"
        />
        <h2 className="sr-only">IYA HIEW · Your everyday personal shopper</h2>
        <p className="sr-only">ให้ทุกความชอบของคุณอยู่ใกล้ขึ้น</p>
        <a
          href="https://lin.ee/rwcULIh"
          target="_blank"
          rel="noopener noreferrer"
          className="button primary reference-contact-cta"
        >
          ติดต่อเรา <ArrowUpRight size={17} aria-hidden="true" />
        </a>
        <Link
          to="/referrals"
          className="pastel-text-link reference-referral-link"
        >
          ชวนเพื่อนมาช้อปด้วยกัน <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
export function AnnouncementPopup() {
  const { publicData } = useApp();
  const location = useLocation();
  const [opened, setOpened] = useState(false);
  const announcements = publicData?.announcements || [],
    signature = announcements.map((a: any) => a.id + ":" + a.version).join("|");
  useEffect(() => {
    if (
      location.pathname === "/" &&
      signature &&
      !sessionStorage.getItem("announcements-" + signature)
    )
      setOpened(true);
  }, [signature, location.pathname]);
  const close = () => {
    sessionStorage.setItem("announcements-" + signature, "1");
    setOpened(false);
  };
  return opened && location.pathname === "/" && announcements.length ? (
    <Modal title="ประกาศจากร้าน" onClose={close}>
      <Carousel
        items={announcements}
        label="ประกาศร้าน"
        seconds={publicData.slideSeconds}
        render={(a) => (
          <article className="announcement-slide">
            {a.image && (
              <img src={a.image} alt={a.title} width="1080" height="1350" />
            )}
            <h3>{a.title}</h3>
            <p className="announcement-body">{a.body}</p>
          </article>
        )}
      />
      <button className="button primary full" onClick={close}>
        รับทราบ
      </button>
    </Modal>
  ) : null;
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const { refresh, notify, user } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const socialButtons = (
    <>
      <GoogleButton
        divider={false}
        register={register}
        next={safeNext}
        referralCode={params.get("ref") || ""}
      />
      <LineButton
        register={register}
        next={safeNext}
        referralCode={params.get("ref") || ""}
      />
    </>
  );
  useEffect(() => {
    if (user)
      navigate(user.roleId === "customer" ? "/" : safeNext, { replace: true });
  }, [user]);
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">WELCOME TO IYA HIEW</span>
        <h1>
          ช้อปที่ชอบ
          <br />
          หิ้วที่ใช่
        </h1>
        <p>
          กระเป๋าเงิน คำสั่งซื้อ และของโปรดของคุณ
          <br />
          ดูแลได้ง่าย ๆ ในที่เดียว
        </p>
        <div className="auth-parcel">
          <ShoppingBag size={86} />
        </div>
        <span>
          <ShieldCheck size={18} /> ข้อมูลของคุณได้รับการดูแลอย่างปลอดภัย
        </span>
      </div>
      <div className="auth-card">
        <h1>{register ? "เริ่มต้นช้อปกับIyaหิ้ว" : "ยินดีต้อนรับกลับมา"}</h1>
        <p className="muted">
          {register
            ? "สร้างบัญชีของคุณ ใช้เวลาเพียงครู่เดียว"
            : "เข้าสู่ระบบเพื่อดูแลของโปรดของคุณ"}
        </p>
        {params.get("google") === "failed" && (
          <ErrorBox error="เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง หรือใช้อีเมลและรหัสผ่าน" />
        )}
        {params.get("google") === "cancelled" && (
          <p role="status" className="info-box">
            ยกเลิก Google Login แล้ว สามารถเริ่มใหม่ได้
          </p>
        )}
        {params.get("line") === "failed" && (
          <ErrorBox error="เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองอีกครั้ง หรือใช้ช่องทางอื่น" />
        )}
        {params.get("line") === "cancelled" && (
          <p role="status" className="info-box">
            ยกเลิก LINE Login แล้ว สามารถเริ่มใหม่ได้
          </p>
        )}
        <Form
          noValidate
          submit={register ? "สร้างบัญชี" : "เข้าสู่ระบบ"}
          onSubmit={async (f) => {
            const v = register ? registrationValues(f) : formObject(f);
            const result = await send(
              register ? "/auth/register" : "/auth/login",
              v,
            );
            await refresh();
            notify(
              register ? "สร้างบัญชีเรียบร้อยแล้ว" : "เข้าสู่ระบบเรียบร้อยแล้ว",
            );
            navigate(result.user?.roleId === "customer" ? "/" : safeNext, {
              replace: true,
            });
          }}
        >
          {register && (
            <>
              <div className="form-grid">
                <Field
                  label="ชื่อหน้า"
                  name="firstName"
                  required
                  maxLength={80}
                  autoComplete="given-name"
                />
                <Field
                  label="นามสกุล"
                  name="lastName"
                  required
                  maxLength={80}
                  autoComplete="family-name"
                />
              </div>
              <Field
                label="เบอร์โทร"
                name="phone"
                type="tel"
                inputMode="tel"
                required
                maxLength={30}
                autoComplete="tel"
                placeholder="0812345678"
                help="เบอร์ไทย หรือเบอร์พร้อมรหัสประเทศ เช่น +66812345678"
              />
            </>
          )}
          <Field
            label="อีเมล"
            name="email"
            type="email"
            required
            autoComplete="username"
            spellCheck={false}
            placeholder="you@example.com"
          />
          <Field
            label="รหัสผ่าน"
            name="password"
            type="password"
            required
            autoComplete={register ? "new-password" : "current-password"}
            help={register ? "อย่างน้อย 12 ตัวอักษร" : ""}
          />
          {register && (
            <>
              <DiscoverySourceField />
              <Field
                label="Line ID Add"
                name="lineId"
                maxLength={100}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="@yourlineid"
                help="ไม่บังคับ · LINE ID ที่ใช้ติดต่อได้"
              />
              <Field
                label="รหัสแนะนำเพื่อน (ถ้ามี)"
                name="referralCode"
                defaultValue={params.get("ref") || ""}
              />
            </>
          )}
        </Form>
        <div className="auth-divider">
          <span>
            {register ? "หรือสมัครสมาชิกด้วย" : "หรือเข้าสู่ระบบด้วย"}
          </span>
        </div>
        {socialButtons}
        <p className="auth-switch">
          {register ? "มีบัญชีแล้ว?" : "ยังไม่มีบัญชี?"}{" "}
          <Link
            to={
              (register ? "/login" : "/register") +
              "?next=" +
              encodeURIComponent(safeNext)
            }
          >
            {register ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </Link>
        </p>
      </div>
    </div>
  );
}
export function CartPage() {
  const { cart, setCart, user, publicData, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [shipping, setShipping] = useState({
    name: "",
    phone: "",
    address: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const defaultAddressApplied = useRef(false);
  const shippingEdited = useRef(false);
  useEffect(() => {
    if (user) setShipping((s) => ({ ...s, name: s.name || user.name }));
  }, [user?.id]);
  const [cartParams] = useSearchParams();
  const [coupon, setCoupon] = useState(cartParams.get("coupon") || ""),
    [payment, setPayment] = useState("full"),
    [quote, setQuote] = useState<any>(null),
    [qError, setQError] = useState(""),
    [quoting, setQuoting] = useState(false),
    [quoteVersion, setQuoteVersion] = useState(0),
    [confirmation, setConfirmation] = useState<any>(null);
  const requestKey = useRef(crypto.randomUUID());
  const payload = {
    items: cart.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
    coupon,
    payment,
  };
  useEffect(() => {
    setQuote(null);
    setQError("");
    if (!user || !cart.length) return;
    const ctrl = new AbortController();
    setQuoting(true);
    const t = setTimeout(
      () =>
        api("/orders/quote", {
          method: "POST",
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        })
          .then((q) => setQuote(q))
          .catch((e) => {
            if (e.name !== "AbortError") setQError(e.message);
          })
          .finally(() => {
            if (!ctrl.signal.aborted) setQuoting(false);
          }),
      300,
    );
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [JSON.stringify(payload), user?.id, quoteVersion]);
  const update = (id: string, qty: number) =>
    setCart((c) =>
      c.map((i) =>
        i.product.id === id
          ? { ...i, quantity: Math.max(1, Math.min(99, qty)) }
          : i,
      ),
    );
  return (
    <div className="contained">
      <PageHeading
        title="ตะกร้าของคุณ"
        sub="อีกนิดเดียว ของที่ชอบก็จะได้ไปต่อ"
      />
      {!cart.length ? (
        <Empty
          title="ตะกร้ายังว่างอยู่"
          description="เลือกสินค้าที่ชอบ แล้วให้เราช่วยหิ้ว"
        >
          <Link className="button primary" to="/products">
            ไปเลือกสินค้า <ArrowRight size={17} />
          </Link>
        </Empty>
      ) : (
        <div className="checkout-grid">
          <section className="panel">
            <h2>
              สินค้าที่เลือก <span className="count-pill">{cart.length}</span>
            </h2>
            {cart.map((i) => (
              <div className="cart-row" key={i.product.id}>
                <img src={i.product.image} alt={i.product.name} />
                <div>
                  <b>{i.product.name}</b>
                  <p>{money(i.product.price)}</p>
                  <div className="quantity">
                    <button
                      aria-label={"ลดจำนวน " + i.product.name}
                      onClick={() => update(i.product.id, i.quantity - 1)}
                      disabled={i.quantity <= 1}
                    >
                      <Minus size={14} />
                    </button>
                    <span>{i.quantity}</span>
                    <button
                      aria-label={"เพิ่มจำนวน " + i.product.name}
                      onClick={() => update(i.product.id, i.quantity + 1)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="cart-row-end">
                  <strong>{money(i.product.price * i.quantity)}</strong>
                  <button
                    className="icon-button"
                    aria-label={"นำ " + i.product.name + " ออก"}
                    onClick={() =>
                      setCart((c) =>
                        c.filter((x) => x.product.id !== i.product.id),
                      )
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
            <Link to="/products" className="text-button">
              เลือกสินค้าเพิ่ม <ArrowRight size={16} />
            </Link>
          </section>
          <section className="panel checkout-summary">
            <h2>สรุปคำสั่งซื้อ</h2>
            {user ? (
              <>
                <Field
                  label="โค้ดโปรโมชั่น"
                  name="coupon"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  placeholder="ใส่โค้ดส่วนลด (ถ้ามี)"
                />
                <div className="payment-options">
                  <label className={payment === "full" ? "chosen" : ""}>
                    <input
                      type="radio"
                      name="payment"
                      checked={payment === "full"}
                      onChange={() => setPayment("full")}
                    />
                    <span>
                      <b>ชำระเต็มจำนวน</b>
                      <small>หักจากกระเป๋าเงินทันที</small>
                    </span>
                  </label>
                  <label className={payment === "deposit" ? "chosen" : ""}>
                    <input
                      type="radio"
                      name="payment"
                      checked={payment === "deposit"}
                      onChange={() => setPayment("deposit")}
                    />
                    <span>
                      <b>จองมัดจำ {publicData?.depositPercent ?? 0}%</b>
                      <small>จ่ายส่วนที่เหลือก่อนจัดส่ง</small>
                    </span>
                  </label>
                </div>
                {quoting && <Loading />}
                {qError && <ErrorBox error={qError} />}
                {quote && (
                  <>
                    <div className="summary-lines">
                      <p>
                        <span>ราคาสินค้า</span>
                        <b>{money(quote.subtotal)}</b>
                      </p>
                      <p>
                        <span>ส่วนลด</span>
                        <b className="positive">−{money(quote.discount)}</b>
                      </p>
                      <p className="total">
                        <span>ยอดรวม</span>
                        <b>{money(quote.total)}</b>
                      </p>
                      <p>
                        <span>ชำระตอนนี้</span>
                        <b>{money(quote.payNow)}</b>
                      </p>
                      <p>
                        <span>คงเหลือชำระก่อนส่ง</span>
                        <b>{money(quote.due)}</b>
                      </p>
                    </div>
                    <div className="wallet-hint">
                      <Wallet size={18} /> กระเป๋าเงิน {money(user.balance)}{" "}
                      <Link to="/wallet">เติมเงิน</Link>
                    </div>
                    <Form
                      noValidate
                      submit="ตรวจสอบและยืนยัน"
                      onSubmit={async (f) => {
                        const v = formObject(f);
                        const errors = [];
                        if (String(v.name).trim().length < 2)
                          errors.push({
                            path: "name",
                            message: "กรุณาระบุชื่อผู้รับอย่างน้อย 2 ตัวอักษร",
                          });
                        if (String(v.address).trim().length < 10)
                          errors.push({
                            path: "address",
                            message:
                              "กรุณาระบุที่อยู่ให้ครบอย่างน้อย 10 ตัวอักษร",
                          });
                        if (errors.length)
                          throw new ApiError(
                            "กรุณาตรวจสอบข้อมูลจัดส่ง",
                            400,
                            errors,
                          );
                        setConfirmation({
                          shipping: {
                            name: v.name,
                            phone: v.phone,
                            address: v.address,
                            latitude: shipping.latitude,
                            longitude: shipping.longitude,
                          },
                          ...payload,
                          expectedQuote: quote.fingerprint,
                          quote,
                        });
                      }}
                    >
                      <h3>ข้อมูลจัดส่ง</h3>
                      <SavedAddressSelect
                        onDefault={(a) => {
                          if (
                            defaultAddressApplied.current ||
                            shippingEdited.current
                          )
                            return;
                          defaultAddressApplied.current = true;
                          setShipping({
                            name: a.name,
                            phone: a.phone,
                            address: a.address,
                            latitude: a.latitude,
                            longitude: a.longitude,
                          });
                        }}
                        onSelect={(a) =>
                          setShipping({
                            name: a.name,
                            phone: a.phone,
                            address: a.address,
                            latitude: a.latitude,
                            longitude: a.longitude,
                          })
                        }
                      />
                      <Field
                        name="name"
                        label="ชื่อผู้รับ"
                        required
                        value={shipping.name}
                        onChange={(e) => {
                          shippingEdited.current = true;
                          setShipping((s) => ({ ...s, name: e.target.value }));
                        }}
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                      />
                      <Field
                        name="phone"
                        label="เบอร์โทรศัพท์"
                        type="tel"
                        required
                        pattern="0[0-9]{8,9}"
                        value={shipping.phone}
                        onChange={(e) => {
                          shippingEdited.current = true;
                          setShipping((s) => ({ ...s, phone: e.target.value }));
                        }}
                        autoComplete="tel"
                      />
                      <Field
                        name="address"
                        label="ที่อยู่จัดส่งและรหัสไปรษณีย์"
                        type="textarea"
                        minLength={10}
                        maxLength={1000}
                        value={shipping.address}
                        onChange={(e) => {
                          shippingEdited.current = true;
                          setShipping((s) => ({
                            ...s,
                            address: e.target.value,
                          }));
                        }}
                        required
                        autoComplete="street-address"
                      />
                      <MapPicker
                        value={shipping}
                        onChange={(point) => {
                          shippingEdited.current = true;
                          setShipping((s) => ({ ...s, ...point }));
                        }}
                      />
                      {quote.payNow > user.balance && (
                        <div className="warning-box">
                          ยอดเงินไม่พอ กรุณาเติมเงินก่อนยืนยัน
                        </div>
                      )}
                    </Form>
                  </>
                )}
              </>
            ) : (
              <div className="empty">
                <Wallet size={32} />
                <p>เข้าสู่ระบบเพื่อคำนวณยอดและสั่งซื้อ</p>
                <Link className="button primary" to="/login?next=/cart">
                  เข้าสู่ระบบ
                </Link>
              </div>
            )}
          </section>
        </div>
      )}
      {confirmation && (
        <Confirm
          title="ยืนยันคำสั่งซื้อ"
          description={`ยอดรวม ${money(confirmation.quote.total)} หักกระเป๋าเงินตอนนี้ ${money(confirmation.quote.payNow)} คงเหลือ ${money(confirmation.quote.due)} จัดส่งให้ ${confirmation.shipping.name} เมื่อชำระครบ`}
          onClose={() => {
            setConfirmation(null);
            setQuoteVersion((v) => v + 1);
            requestKey.current = crypto.randomUUID();
          }}
          onConfirm={async () => {
            const { quote, ...body } = confirmation;
            await send("/orders", body, "POST", requestKey.current);
            setCart([]);
            await refresh();
            notify("สร้างคำสั่งซื้อแล้ว");
            navigate("/orders");
          }}
        />
      )}
    </div>
  );
}
export function WalletPage() {
  const { user, publicData, refresh, notify } = useApp(),
    list = useListQuery();
  const { data, error, loading, reload } = useData<any>(
    "/wallet?" + list.query,
  );
  const requestKey = useRef(crypto.randomUUID());
  return (
    <div className="contained">
      <PageHeading
        title="กระเป๋าเงิน"
        sub="เติมเงินไว้ แล้วช้อปได้สะดวกกว่าเดิม"
      />
      <div className="wallet-layout">
        <section>
          <WalletCard balance={user?.balance ?? 0} holder={user?.name || ""} />
          <BankDetailsPanel data={publicData} />
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>เติมเงินด้วยสลิป</h2>
            <span className="badge status-paid">
              <ShieldCheck size={13} /> EasySlip
            </span>
          </div>
          {publicData?.topupReady && (
            <img
              className="topup-steps-image"
              src="/assets/guides/topup-transfer-steps-th.png"
              width={1774}
              height={887}
              decoding="async"
              alt="ขั้นตอนเติมเงิน: 1. สแกน QR หรือใช้เลขบัญชีร้าน 2. โอนเงินผ่านแอปธนาคาร 3. กรอกยอดเงินแล้วแนบสลิป ยอดเงินจะเข้าเมื่อระบบตรวจสอบสลิปผ่าน"
            />
          )}
          <p className="muted">
            โอนเข้าบัญชีร้าน แล้วแนบสลิปเพื่อรับยอดอัตโนมัติ
          </p>
          {publicData?.topupReady ? (
            <Form
              noValidate
              submit="ตรวจสอบสลิปและเติมเงิน"
              onSubmit={async (f) => {
                const data = new FormData(f);
                data.set("amount", String(cents(data.get("amount"))));
                await api("/wallet/topup", {
                  method: "POST",
                  body: data,
                  headers: { "Idempotency-Key": requestKey.current },
                });
                requestKey.current = crypto.randomUUID();
                await refresh();
                reload();
                f.reset();
                notify("ตรวจสลิปสำเร็จ เติมเงินเข้ากระเป๋าแล้ว");
              }}
            >
              <Field
                label="จำนวนเงินที่โอน (บาท)"
                name="amount"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                required
                placeholder="0.00"
              />
              <div className="upload-area">
                <Upload size={30} />
                <strong>แนบรูปสลิปการโอนเงิน</strong>
                <span>JPG, PNG, GIF หรือ WebP ไม่เกิน 4 MB</span>
                <Field
                  label="เลือกรูปสลิป"
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  required
                />
              </div>
              <div className="info-box">
                <ShieldCheck size={18} />
                <p>
                  ระบบตรวจยอด ชื่อและบัญชีผู้รับ พร้อมป้องกันสลิปซ้ำ
                  เงินจะเข้าเมื่อการตรวจสอบผ่านครบเท่านั้น
                </p>
              </div>
            </Form>
          ) : (
            <div className="warning-box">
              ร้านยังตั้งค่ารับเงินไม่ครบ กรุณาติดต่อผู้ดูแลก่อนโอนเงิน
            </div>
          )}
        </section>
      </div>
      <section className="panel section-space">
        <div className="panel-title">
          <h2>ประวัติกระเป๋าเงิน</h2>
          <span className="muted">รายการล่าสุดของคุณ</span>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table headers={["วันที่", "รายการ", "จำนวนเงิน", "ยอดคงเหลือ"]}>
              {data.items.map((r: any) => (
                <tr key={r.id}>
                  <td>{date(r.created_at)}</td>
                  <td>
                    <Badge
                      status={r.kind}
                      label={
                        r.topup_channel === "LINE"
                          ? "เติมเงินผ่าน LINE"
                          : undefined
                      }
                    />
                  </td>
                  <td className={r.amount >= 0 ? "positive" : "negative"}>
                    {r.amount >= 0 ? "+" : ""}
                    {money(r.amount)}
                  </td>
                  <td>{money(r.balance_after)}</td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty
            title="ยังไม่มีรายการในกระเป๋า"
            description="รายการเติมเงิน ซื้อสินค้า และคืนเงินจะแสดงที่นี่"
          />
        )}
      </section>
    </div>
  );
}
export function OrdersPage() {
  const list = useListQuery(),
    { refresh, notify } = useApp();
  const { data, error, loading, reload } = useData<PageData>(
    "/orders?" + list.query,
  );
  const [confirm, setConfirm] = useState<any>(null);
  return (
    <div className="contained">
      <PageHeading
        title="คำสั่งซื้อของฉัน"
        sub="ติดตามของที่ชอบ ตั้งแต่จองจนถึงมือคุณ"
      >
        <Link to="/products" className="button primary small">
          <Plus size={16} /> เลือกสินค้าเพิ่ม
        </Link>
      </PageHeading>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          {data.items.map((o: any) => (
            <section className="panel order-card" key={o.id}>
              <div className="panel-title">
                <div>
                  <b>คำสั่งซื้อ #{o.id.slice(0, 8).toUpperCase()}</b>
                  <small className="muted block">{date(o.created_at)}</small>
                </div>
                <Badge status={o.status} />
              </div>
              {o.items.map((i: any) => (
                <div className="order-line" key={i.product_id}>
                  <span>
                    <Package size={18} />
                    {i.name} <small>× {i.quantity}</small>
                  </span>
                  <b>{money(i.price * i.quantity)}</b>
                </div>
              ))}
              <div className="order-summary">
                <span>
                  ยอดรวม <b>{money(o.total)}</b>
                </span>
                <span>
                  ชำระแล้ว <b>{money(o.paid)}</b>
                </span>
                <span>
                  คงเหลือ{" "}
                  <b>
                    {money(o.status === "cancelled" ? 0 : o.total - o.paid)}
                  </b>
                </span>
              </div>
              <p className="muted">
                จัดส่งให้ {o.shipping.name} · {o.shipping.phone}
                <br />
                {o.shipping.address}
                {o.shipping.latitude != null &&
                  o.shipping.longitude != null && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${o.shipping.latitude},${o.shipping.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-button"
                    >
                      ดูหมุดจัดส่งบนแผนที่
                    </a>
                  )}
              </p>
              {o.tracking && (
                <div className="info-box">
                  <Truck size={20} />
                  <span>
                    เลขพัสดุ <b>{o.tracking}</b>
                  </span>
                </div>
              )}
              <div className="form-actions">
                {!["cancelled", "shipped", "completed"].includes(o.status) && (
                  <button
                    className="button secondary small"
                    onClick={() => setConfirm({ o, action: "cancel" })}
                  >
                    ยกเลิกคำสั่งซื้อ
                  </button>
                )}
                {o.total > o.paid && o.status !== "cancelled" && (
                  <button
                    className="button primary small"
                    onClick={() => setConfirm({ o, action: "pay" })}
                  >
                    ชำระส่วนที่เหลือ {money(o.total - o.paid)}
                  </button>
                )}
              </div>
            </section>
          ))}
          <Pagination data={data} onPage={list.setPage} />
        </>
      ) : (
        <Empty
          title="ยังไม่มีคำสั่งซื้อ"
          description="เริ่มเลือกของที่ชอบ แล้วให้เราช่วยหิ้ว"
        >
          <Link to="/products" className="button primary">
            ไปเลือกสินค้า
          </Link>
        </Empty>
      )}
      {confirm && (
        <Confirm
          title={
            confirm.action === "pay" ? "ยืนยันชำระเงิน" : "ยกเลิกคำสั่งซื้อ"
          }
          description={
            confirm.action === "pay"
              ? `หักเงินจากกระเป๋า ${money(confirm.o.total - confirm.o.paid)} สำหรับคำสั่งซื้อ #${confirm.o.id.slice(0, 8)}`
              : `ยกเลิกคำสั่งซื้อ #${confirm.o.id.slice(0, 8)} และคืนเงินที่จ่ายจริง ${money(confirm.o.paid)} เข้ากระเป๋า`
          }
          danger={confirm.action === "cancel"}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await send(`/orders/${confirm.o.id}/${confirm.action}`, {});
            await refresh();
            reload();
            notify("ดำเนินการเรียบร้อยแล้ว");
          }}
        />
      )}
    </div>
  );
}
export function ReferralPage() {
  const { user, notify } = useApp();
  const commissionList = useListQuery();
  const { data, error, loading, reload } = useData(
    "/referrals?" + commissionList.query,
  );
  const [qr, setQr] = useState("");
  const link =
    location.origin + "/register?ref=" + encodeURIComponent(data?.code || "");
  useEffect(() => {
    if (data)
      QRCode.toDataURL(link, {
        width: 240,
        margin: 2,
        color: { dark: "#25243b", light: "#ffffff" },
      }).then(setQr);
  }, [data?.code]);
  return (
    <div className="contained narrow">
      <PageHeading
        title="ชวนเพื่อนมาหิ้วด้วยกัน"
        sub="แบ่งปันของที่ชอบ ผ่านลิงก์แนะนำของคุณ"
      />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : (
        <>
          <section className="panel referral-panel">
            <span className="gift-tile">
              <Gift size={36} />
            </span>
            <h2>ช้อปสนุกกว่า เมื่อมีเพื่อน</h2>
            <p className="muted">
              เพื่อนสมัครผ่านลิงก์นี้ ระบบจะบันทึกว่าคุณเป็นผู้แนะนำ
            </p>
            {qr && (
              <img
                className="referral-qr"
                src={qr}
                width={240}
                height={240}
                alt="QR Code สมัครสมาชิกผ่านการแนะนำของคุณ"
              />
            )}
            <div className="share-link">
              <Link2 size={18} />
              <input aria-label="ลิงก์แนะนำเพื่อน" readOnly value={link} />
              <button
                className="button primary small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    notify("คัดลอกลิงก์แล้ว");
                  } catch {
                    notify("กรุณาเลือกลิงก์แล้วคัดลอกด้วยตนเอง");
                  }
                }}
              >
                <Copy size={16} /> คัดลอก
              </button>
            </div>
            <p className="muted">
              รหัสของคุณ <b>{data?.code}</b>
            </p>
          </section>
          <div className="referral-stats">
            <div className="panel">
              <strong>{data?.count || 0}</strong>
              <span>เพื่อนที่สมัครผ่านลิงก์</span>
            </div>
            <div className="panel">
              <strong>{data?.converted || 0}</strong>
              <span>เพื่อนที่ชำระคำสั่งซื้อครบแล้ว</span>
            </div>
          </div>
          <div className="referral-stats">
            <div className="panel">
              <strong>{money(data?.commissionTotals?.pending || 0)}</strong>
              <span>ค่าคอมรอออร์เดอร์สำเร็จ</span>
            </div>
            <div className="panel">
              <strong>{money(data?.commissionTotals?.credited || 0)}</strong>
              <span>ค่าคอมเข้ากระเป๋าแล้ว</span>
            </div>
          </div>
          <section className="panel">
            <h2>ประวัติค่าคอมมิชชั่น</h2>
            {data?.commissions?.items.length ? (
              <>
                <Table headers={["บิล", "ฐาน / อัตรา", "ค่าคอม", "สถานะ"]}>
                  {data.commissions.items.map((c: any) => (
                    <tr key={c.order_id}>
                      <td>#{c.order_id.slice(0, 8)}</td>
                      <td>
                        {money(c.base)} / {c.rate_bps / 100}%
                      </td>
                      <td>{money(c.amount)}</td>
                      <td>
                        <Badge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </Table>
                <Pagination
                  data={data.commissions}
                  onPage={commissionList.setPage}
                />
              </>
            ) : (
              <Empty
                title="ยังไม่มีค่าคอมมิชชั่น"
                description="บิลจากเพื่อนที่คุณแนะนำจะแสดงที่นี่"
              />
            )}
          </section>
          <div className="info-box">
            <Gift size={22} />
            <p>
              อัตราสำหรับบิลใหม่ {data?.commissionPercent || 0}%
              จากยอดหลังส่วนลด จ่ายเข้ากระเป๋าเมื่อออร์เดอร์สำเร็จ
              อัตราของบิลเดิมใช้ค่าที่ล็อกไว้ตอนสั่งซื้อ
            </p>
          </div>
        </>
      )}
    </div>
  );
}
export function AccountPage() {
  const { user, refresh, notify } = useApp();
  const navigate = useNavigate();
  return (
    <div className="contained narrow">
      <PageHeading title="บัญชีของฉัน" sub="ดูแลข้อมูลการเข้าสู่ระบบของคุณ" />
      <section className="panel">
        <h2>{user?.name}</h2>
        <p>{user?.email}</p>
        <Badge status={user?.roleName || ""} />
        {!user?.hasPassword ? (
          <p className="info-box">บัญชีนี้เข้าสู่ระบบด้วย Google</p>
        ) : (
          <>
            <h3>
              {user?.mustChangePassword
                ? "ตั้งรหัสผ่านใหม่ก่อนใช้งาน"
                : "เปลี่ยนรหัสผ่าน"}
            </h3>
            {user?.mustChangePassword && (
              <p className="warning-box">
                ผู้ดูแลรีเซ็ตรหัสผ่านให้แล้ว
                กรุณาตั้งรหัสใหม่ที่คุณทราบเพียงคนเดียวก่อนใช้งานกระเป๋าเงินหรือสั่งซื้อ
              </p>
            )}
            <Form
              noValidate
              submit="เปลี่ยนรหัสผ่าน"
              onSubmit={async (f) => {
                const values = formObject(f);
                if (
                  user?.mustChangePassword &&
                  values.password !== values.confirmPassword
                )
                  throw Error("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน");
                await send("/auth/password", values);
                await refresh();
                notify("เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบอีกครั้ง");
                navigate("/login");
              }}
            >
              <Field
                label={
                  user?.mustChangePassword
                    ? "รหัสผ่านชั่วคราว"
                    : "รหัสผ่านปัจจุบัน"
                }
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
              <Field
                label="รหัสผ่านใหม่"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                help="อย่างน้อย 12 ตัวอักษร"
              />
              {user?.mustChangePassword && (
                <Field
                  label="ยืนยันรหัสผ่านใหม่"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              )}
            </Form>
          </>
        )}
        <hr />
        <button
          className="button secondary"
          onClick={async () => {
            await send("/auth/logout", {});
            await refresh();
            navigate("/login");
          }}
        >
          <LogOut size={18} /> ออกจากระบบ
        </button>
      </section>
      {!user?.mustChangePassword && <SocialConnections />}
      {!user?.mustChangePassword && <AddressBook />}
    </div>
  );
}
