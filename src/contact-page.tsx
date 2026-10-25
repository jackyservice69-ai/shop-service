import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CreditCard,
  Headset,
  Heart,
  MessageCircle,
  Megaphone,
  ShoppingBag,
  Clock3,
  Truck,
} from "lucide-react";
import platforms from "../shared/socials.json";
import { useApp } from "./api";
import { Loading } from "./ui";
import "./contact-page.css";

const channelDetails: Record<
  string,
  { group: string; action: string; description: string }
> = {
  facebook: {
    group: "chat",
    action: "ทักแชต Facebook",
    description: "สอบถามสินค้าและติดตามข่าวสารจากร้าน",
  },
  line: {
    group: "chat",
    action: "เพิ่มเพื่อน LINE",
    description: "สอบถามสินค้าและพูดคุยกับทางร้าน",
  },
  telegram: {
    group: "chat",
    action: "เปิด Telegram",
    description: "เลือกติดต่อร้านผ่าน Telegram",
  },
  instagram: {
    group: "social",
    action: "ติดตาม Instagram",
    description: "ชมภาพสินค้าและไอเดียของน่าช้อป",
  },
  tiktok: {
    group: "social",
    action: "ติดตาม TikTok",
    description: "ชมวิดีโอสินค้าและอัปเดตจากร้าน",
  },
  shopee: {
    group: "marketplace",
    action: "ไปที่ร้าน Shopee",
    description: "เลือกซื้อสินค้าผ่านร้านค้าใน Shopee",
  },
};
const channelOrder = [
  "facebook",
  "line",
  "telegram",
  "instagram",
  "tiktok",
  "shopee",
];

function addressLabel(link: string) {
  try {
    const url = new URL(link);
    return decodeURIComponent(url.hostname + url.pathname).replace(/\/$/, "");
  } catch {
    return "ช่องทางที่ร้านตั้งค่าไว้";
  }
}

export function ContactPage() {
  const { publicData } = useApp();
  if (!publicData) return <Loading />;
  const active = platforms
    .filter(
      (p) =>
        publicData.socialVisibility?.[p.key] !== false &&
        publicData.socials?.[p.key],
    )
    .sort((a, b) => channelOrder.indexOf(a.key) - channelOrder.indexOf(b.key));
  const groups = [
    {
      key: "chat",
      title: "แชตสอบถาม",
      subtitle: "สอบถามสินค้าและคำสั่งซื้อ เลือกช่องทางที่สะดวก",
      icon: MessageCircle,
    },
    {
      key: "social",
      title: "โซเชียลมีเดีย",
      subtitle: "ติดตามข่าวสาร สินค้าใหม่ และโปรโมชั่น",
      icon: Megaphone,
    },
    {
      key: "marketplace",
      title: "สั่งซื้อผ่านมาร์เก็ตเพลส",
      subtitle: "เปิดร้านค้าผ่านช่องทางมาร์เก็ตเพลส",
      icon: ShoppingBag,
    },
  ];
  return (
    <div className="contact-page">
      <header className="contact-page-hero">
        <img
          src="/assets/contact-page-v1/hero.webp"
          srcSet="/assets/contact-page-v1/hero-small.webp 768w, /assets/contact-page-v1/hero.webp 1536w"
          sizes="(max-width: 700px) calc(100vw - 30px), 1000px"
          alt=""
          width={1536}
          height={512}
          fetchPriority="high"
        />
        <div>
          <span className="contact-eyebrow">
            <Heart size={14} aria-hidden="true" /> {publicData.shopName}
          </span>
          <h1>ช่องทางการติดต่อ</h1>
          <p>
            เลือกช่องทางที่สะดวก แล้วทักหาเราได้เลย{" "}
            <Heart size={16} aria-hidden="true" />
          </p>
        </div>
      </header>
      <p id="contact-external-note" className="contact-external-note">
        ช่องทางภายนอกจะเปิดในแท็บใหม่
      </p>
      {groups.map((group) => {
        const items = active.filter(
            (p) => channelDetails[p.key]?.group === group.key,
          ),
          Icon = group.icon;
        return (
          <section
            key={group.key}
            className={`contact-section contact-section-${group.key}`}
            aria-labelledby={`contact-${group.key}-title`}
          >
            <div className="contact-section-heading">
              <h2 id={`contact-${group.key}-title`}>
                <Icon size={26} aria-hidden="true" />
                {group.title}
              </h2>
              <p>{group.subtitle}</p>
            </div>
            {items.length ? (
              <div className="contact-channel-grid">
                {items.map((p) => {
                  const details = channelDetails[p.key],
                    href = publicData.socials[p.key];
                  return (
                    <article
                      className={`contact-channel-card contact-platform-${p.key}`}
                      key={p.key}
                    >
                      <div className="contact-channel-identity">
                        <span className="contact-channel-logo">
                          <img
                            src={`/assets/brands/${p.key}.svg`}
                            alt=""
                            width={60}
                            height={60}
                          />
                        </span>
                        <div>
                          <h3>
                            {p.key === "line" ? "LINE Official" : p.label}
                          </h3>
                          <p className="contact-address">
                            {addressLabel(href)}
                          </p>
                        </div>
                      </div>
                      <p className="contact-channel-description">
                        {details.description}
                      </p>
                      {group.key === "marketplace" && (
                        <img
                          className="contact-gift-art"
                          src="/assets/contact-page-v1/gifts.webp"
                          alt=""
                          width={180}
                          height={180}
                          loading="lazy"
                        />
                      )}
                      <a
                        className="contact-brand-button"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-describedby="contact-external-note"
                      >
                        <span>{details.action}</span>
                        <ArrowUpRight size={18} aria-hidden="true" />
                      </a>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="contact-channel-empty">
                {group.key === "marketplace" && (
                  <img
                    src="/assets/contact-page-v1/gifts.webp"
                    alt=""
                    width={100}
                    height={100}
                    loading="lazy"
                  />
                )}
                <p>ยังไม่มีช่องทาง{group.title}ที่เปิดแสดง</p>
              </div>
            )}
          </section>
        );
      })}
      <section
        className="contact-section contact-customer-service"
        aria-labelledby="contact-service-title"
      >
        <div className="contact-section-heading">
          <h2 id="contact-service-title">
            <Headset size={26} aria-hidden="true" />
            บริการลูกค้า
          </h2>
          <p>ข้อมูลที่ช่วยให้คุณช้อปได้สะดวกขึ้น</p>
        </div>
        <div className="contact-service-grid">
          <article>
            <span>
              <Clock3 size={28} aria-hidden="true" />
            </span>
            <h3>ฝากข้อความไว้</h3>
            <p>ส่งคำถามผ่านช่องทางที่ร้านเปิดให้บริการ</p>
            <small>เลือกช่องทางด้านบนได้เลย</small>
          </article>
          <article>
            <span>
              <MessageCircle size={28} aria-hidden="true" />
            </span>
            <h3>สอบถามคำสั่งซื้อ</h3>
            <p>ดูรายละเอียดและสถานะคำสั่งซื้อของคุณ</p>
            <Link to="/orders">
              ดูคำสั่งซื้อ <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </article>
          <article>
            <span>
              <CreditCard size={28} aria-hidden="true" />
            </span>
            <h3>ชำระเงิน</h3>
            <p>ดูบัญชีรับเงินและเติมเงินด้วยสลิป</p>
            <Link to="/wallet">
              เปิดกระเป๋าเงิน <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </article>
          <article>
            <span>
              <Truck size={28} aria-hidden="true" />
            </span>
            <h3>ติดตามพัสดุ</h3>
            <p>ตรวจสอบเลขพัสดุเมื่อร้านแจ้งจัดส่งแล้ว</p>
            <Link to="/orders">
              ตรวจสอบการจัดส่ง <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </article>
        </div>
      </section>
      <section className="contact-page-closing">
        <img
          src="/assets/contact-page-v1/footer.webp"
          srcSet="/assets/contact-page-v1/footer-small.webp 768w, /assets/contact-page-v1/footer.webp 1536w"
          sizes="(max-width: 700px) calc(100vw - 30px), 1000px"
          alt=""
          width={1536}
          height={512}
          loading="lazy"
        />
        <h2>
          ขอบคุณที่ไว้ใจ {publicData.shopName}{" "}
          <Heart size={22} aria-hidden="true" />
        </h2>
        <Link to="/how-to-order">
          ดูวิธีสั่งซื้อ <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
