import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import customerColors from "../shared/customer-colors.json";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Upload,
  ImagePlus,
  Gift,
  Ticket,
  Check,
  Copy,
  Palette,
  Plus,
  Pencil,
} from "lucide-react";
import {
  api,
  send,
  useApp,
  useData,
  can,
  money,
  date,
  type PageData,
} from "./api";
import {
  Field,
  Form,
  PageHeading,
  ErrorBox,
  Loading,
  Empty,
  Pagination,
  useListQuery,
  Table,
  Modal,
  formObject,
  Badge,
} from "./ui";

export const IMAGE_SIZES: Record<
  string,
  { w: number; h: number; label: string }
> = {
  paymentQr: { w: 1080, h: 1440, label: "QR รับเงิน" },
  product: { w: 1200, h: 1200, label: "สินค้า" },
  banner: { w: 1600, h: 600, label: "แบนเนอร์" },
  announcement: { w: 1080, h: 1350, label: "ประกาศ" },
  promotion: { w: 1200, h: 800, label: "โปรโมชั่น" },
  logo: { w: 640, h: 240, label: "โลโก้" },
  favicon: { w: 256, h: 256, label: "Favicon" },
};
function luminance(hex: string) {
  const rgb = hex
    .replace("#", "")
    .match(/../g)
    ?.map((h) => parseInt(h, 16) / 255) || [0, 0, 0];
  const c = rgb.map((v) =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    ),
    lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return lum;
}
export function foreground(hex: string) {
  const lum = luminance(hex);
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#ffffff" : "#000000";
}
function readable(color: string, background: string, fallback: string) {
  const a = luminance(color),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5
    ? color
    : fallback;
}
function shade(color: string, ink: string, weight: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((start) =>
        Math.round(
          parseInt(color.slice(start, start + 2), 16) * weight +
            parseInt(ink.slice(start, start + 2), 16) * (1 - weight),
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
const pinkTheme = Object.fromEntries(
  (
    ["primary", "ink", "muted", "background", "surface", "positive"] as const
  ).map((role) => [role, customerColors[role].DEFAULT]),
);
export function themeStyle(theme: any): CSSProperties {
  if (!theme) return {};
  const palette = Object.entries(customerColors).flatMap(([role, shades]) =>
    typeof shades === "string"
      ? [["--" + role, shades]]
      : Object.entries(shades).map(([shade, value]) => [
          "--" + role + (shade === "DEFAULT" ? "" : "-" + shade),
          value,
        ]),
  );
  const onSurface = readable(
    theme.ink,
    theme.surface,
    foreground(theme.surface),
  );
  const isPink = theme.primary.toLowerCase() === customerColors.primary.DEFAULT;
  const primaryHover = isPink
    ? customerColors.primary.hover
    : shade(theme.primary, theme.ink, 0.88);
  const primaryActive = isPink
    ? customerColors.primary.active
    : shade(theme.primary, theme.ink, 0.8);
  const positiveFill =
    theme.positive === customerColors.positive.DEFAULT
      ? theme.positive
      : shade(theme.positive, theme.surface, 0.12);
  return Object.fromEntries([
    ...palette,
    ...Object.entries(theme).map(([k, v]) => [
      "--" + (k === "background" ? "bg" : k),
      v,
    ]),
    [
      "--on-primary",
      readable(theme.ink, theme.primary, foreground(theme.primary)),
    ],
    [
      "--on-primary-hover",
      readable(theme.ink, primaryHover, foreground(primaryHover)),
    ],
    [
      "--on-primary-active",
      readable(theme.ink, primaryActive, foreground(primaryActive)),
    ],
    ["--primary-hover", primaryHover],
    ["--primary-active", primaryActive],
    [
      "--ink-heading",
      theme.ink === customerColors.ink.DEFAULT
        ? customerColors.ink.heading
        : onSurface,
    ],
    [
      "--ink-subtle",
      theme.ink === customerColors.ink.DEFAULT
        ? customerColors.ink.subtle
        : onSurface,
    ],
    [
      "--muted-text",
      readable(
        theme.muted,
        theme.surface,
        onSurface === customerColors.ink.DEFAULT
          ? customerColors.ink.subtle
          : onSurface,
      ),
    ],
    [
      "--positive-ink",
      readable(
        theme.positive,
        theme.surface,
        readable(customerColors.positive.text, theme.surface, onSurface),
      ),
    ],
    ["--positive-fill", positiveFill],
    [
      "--positive-text",
      readable(
        customerColors.positive.text,
        positiveFill,
        foreground(positiveFill),
      ),
    ],
    [
      "--surface-hover",
      theme.surface === customerColors.surface.DEFAULT
        ? customerColors.surface.hover
        : shade(theme.surface, theme.ink, 0.96),
    ],
    [
      "--surface-subtle",
      theme.surface === customerColors.surface.DEFAULT
        ? customerColors.surface.subtle
        : theme.surface,
    ],
    ["--focus-ring", onSurface],
    [
      "--link-ink",
      readable(shade(theme.primary, theme.ink, 0.2), theme.surface, onSurface),
    ],
    [
      "--primary-soft",
      isPink && theme.surface === customerColors.surface.DEFAULT
        ? customerColors.primary.light
        : `color-mix(in srgb, ${theme.primary} 16%, ${theme.surface})`,
    ],
    [
      "--primary-dark",
      `color-mix(in srgb, ${theme.primary} 82%, ${theme.ink})`,
    ],
  ]) as CSSProperties;
}
export function ImageUpload({
  kind,
  value,
  onChange,
  onBusyChange,
  uploadPath,
}: {
  kind: string;
  value: string;
  onChange: (v: string) => void;
  onBusyChange?: (busy: boolean) => void;
  uploadPath?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [size, setSize] = useState("");
  const inputId = useId(),
    guide = IMAGE_SIZES[kind];
  return (
    <div className="image-uploader">
      <div
        className={
          "upload-preview" + (kind === "favicon" ? " transparency-preview" : "")
        }
      >
        {value ? (
          <img src={value} alt={"ตัวอย่าง" + guide.label} />
        ) : (
          <ImagePlus size={30} />
        )}
      </div>
      <div>
        <label htmlFor={inputId}>อัปโหลด{guide.label}</label>
        <p>
          แนะนำ{" "}
          <strong>
            {guide.w} × {guide.h} px
          </strong>
          {kind === "favicon" ? " · สี่เหลี่ยมจัตุรัส" : ""}
          <br />
          .png / .jpeg / .jpg · สูงสุด 5 MB
          {kind === "favicon" && (
            <>
              <br />
              ต้องการพื้นหลังโปร่งใส: ใช้ PNG โปร่งใส
              <br />
              JPG/JPEG และ PNG ที่มีพื้นขาวจะยังติดพื้นหลังเดิม
            </>
          )}
        </p>
        <input
          id={inputId}
          aria-label={"ไฟล์" + guide.label}
          type="file"
          accept=".png,.jpeg,.jpg,image/png,image/jpeg"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setError("");
            if (file.size > 5 * 1024 * 1024) {
              setError("ไฟล์ต้องไม่เกิน 5 MB");
              return;
            }
            setBusy(true);
            onBusyChange?.(true);
            try {
              const body = new FormData();
              body.append("image", file);
              const r = await api(uploadPath || "/admin/media/" + kind, {
                method: "POST",
                body,
              });
              onChange(r.url);
              setSize(
                `จัดเก็บ ${r.width} × ${r.height} px` +
                  (kind === "favicon"
                    ? r.hasTransparency
                      ? " · มีส่วนโปร่งใส"
                      : " · พื้นหลังทึบ"
                    : kind === "paymentQr" && r.verified
                      ? " · " + r.message
                      : ""),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
              onBusyChange?.(false);
              e.target.value = "";
            }
          }}
        />
        <small role="status">{busy ? "กำลังตรวจสอบและอัปโหลด…" : size}</small>
        {value && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              onChange("");
              setSize("");
            }}
          >
            เอารูปออก
          </button>
        )}
      </div>
      {error && <ErrorBox error={error} />}
    </div>
  );
}

export function StorePaymentQr({
  image,
  frame,
  shopName,
  exportMode = false,
}: {
  image: string;
  frame?: {
    width: number;
    height: number;
    size: number;
    left: number;
    top: number;
    codeLeft: number;
    codeTop: number;
    codeRight: number;
    codeBottom: number;
  } | null;
  shopName: string;
  exportMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setOpen(false);
  }, [image]);
  const alt = "QR รับเงินของ " + shopName;
  return (
    <div className="payment-qr">
      {failed ? (
        <ErrorBox
          error="โหลด QR ไม่สำเร็จ กรุณาลองใหม่หรือใช้ข้อมูลบัญชีร้าน"
          retry={() => setFailed(false)}
        />
      ) : (
        <>
          <button
            type="button"
            className="payment-qr-trigger"
            aria-label="ขยายรูป QR รับเงิน"
            onClick={() => setOpen(true)}
          >
            <span className="payment-qr-frame">
              <img
                className="payment-qr-image"
                style={
                  frame
                    ? {
                        position: "absolute",
                        width: `${(frame.width / frame.size) * 100}%`,
                        height: `${(frame.height / frame.size) * 100}%`,
                        left: `${(-frame.left / frame.size) * 100}%`,
                        top: `${(-frame.top / frame.size) * 100}%`,
                        maxWidth: "none",
                        clipPath: `inset(${(frame.codeTop / frame.height) * 100}% ${((frame.width - frame.codeRight) / frame.width) * 100}% ${((frame.height - frame.codeBottom) / frame.height) * 100}% ${(frame.codeLeft / frame.width) * 100}%)`,
                      }
                    : undefined
                }
                src={image}
                alt={alt}
                width={1080}
                height={1440}
                onError={() => {
                  setFailed(true);
                  setOpen(false);
                }}
              />
            </span>
          </button>
          <p className="muted">
            {exportMode
              ? "สแกน QR เพื่อโอนเงิน"
              : "สแกน QR หรือคลิกที่รูปเพื่อขยาย"}
          </p>
          {!exportMode && (
            <div className="payment-qr-actions">
              <a
                className="button secondary small"
                href={image}
                download="shop-payment-qr.png"
              >
                บันทึก QR
              </a>
            </div>
          )}
        </>
      )}
      {open && (
        <Modal title="QR รับเงินของร้าน" onClose={() => setOpen(false)}>
          <img
            className="payment-qr-full"
            src={image}
            alt={alt}
            width={1080}
            height={1440}
          />
          <p className="muted">
            ตรวจสอบชื่อผู้รับในแอปธนาคารให้ตรงกับบัญชีร้านก่อนยืนยันโอน
          </p>
          <a
            className="button primary full"
            href={image}
            download="shop-payment-qr.png"
          >
            บันทึก QR
          </a>
        </Modal>
      )}
    </div>
  );
}

export function Carousel({
  items,
  label,
  seconds = 6,
  render,
  className = "",
}: {
  items: any[];
  label: string;
  seconds?: number;
  render: (item: any, index: number) => ReactNode;
  className?: string;
}) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [hidden, setHidden] = useState(document.hidden),
    [reduced, setReduced] = useState(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  const n = items.length,
    at = n ? index % n : 0;
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setReduced(query.matches),
      visibility = () => setHidden(document.hidden);
    query.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      query.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (n < 2 || paused || hover || focus || hidden || reduced) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % n),
      Math.max(3, seconds) * 1000,
    );
    return () => clearInterval(timer);
  }, [n, seconds, paused, hover, focus, hidden, reduced]);
  if (!n) return null;
  return (
    <section
      className={"carousel " + className}
      role="region"
      aria-roledescription="สไลด์"
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
    >
      <div
        className="carousel-viewport"
        aria-live={paused || hover || focus || reduced ? "polite" : "off"}
      >
        <div
          key={items[at].id}
          className="carousel-slide"
          role="group"
          aria-roledescription="สไลด์"
          aria-label={`${at + 1} จาก ${n}`}
        >
          {render(items[at], at)}
        </div>
      </div>
      {n > 1 && (
        <div className="carousel-controls">
          <button
            type="button"
            className="icon-button"
            aria-label={label + " ก่อนหน้า"}
            onClick={() => setIndex((i) => (i - 1 + n) % n)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="carousel-dots">
            {items.map((item, i) => (
              <button
                type="button"
                key={item.id}
                aria-label={label + " " + (i + 1)}
                aria-current={at === i ? "true" : undefined}
                className={at === i ? "selected" : ""}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={label + " ถัดไป"}
            onClick={() => setIndex((i) => (i + 1) % n)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={paused ? "เล่นสไลด์ต่อ" : "หยุดสไลด์"}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <small>
            {at + 1}/{n}
          </small>
        </div>
      )}
    </section>
  );
}
export function StoreBanners() {
  const { publicData } = useApp();
  return (
    <Carousel
      className="store-banners"
      label="แบนเนอร์ร้าน"
      seconds={publicData?.slideSeconds}
      items={publicData?.banners || []}
      render={(b) =>
        b.link ? (
          <Link to={b.link}>
            <img src={b.image} alt={b.title} width="1600" height="600" />
          </Link>
        ) : (
          <img src={b.image} alt={b.title} width="1600" height="600" />
        )
      }
    />
  );
}
export function BackToTop() {
  const [shown, setShown] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const update = () => setShown(scrollY > 250);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [pathname]);
  return shown ? (
    <button
      className="back-to-top"
      type="button"
      aria-label="กลับสู่ด้านบน"
      title="กลับสู่ด้านบน"
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
        document
          .querySelector<HTMLElement>("#main-content")
          ?.focus({ preventScroll: true });
      }}
    >
      <ArrowUp size={22} />
    </button>
  ) : null;
}

const presets = {
  pink: pinkTheme,
  peach: {
    primary: "#efb69d",
    ink: "#42302d",
    muted: "#7a6460",
    background: "#fff7f2",
    surface: "#fffdfb",
    positive: "#30715e",
  },
  mint: {
    primary: "#abd9c6",
    ink: "#284039",
    muted: "#60796f",
    background: "#f2f9f5",
    surface: "#ffffff",
    positive: "#25694f",
  },
};
export function AppearancePage() {
  const { data, error, loading, reload } = useData("/admin/appearance");
  return (
    <>
      <PageHeading
        title="สีและภาพลักษณ์ร้าน"
        sub="เลือกสีพาสเทล โลโก้ ไอคอนร้าน และระยะเวลาเปลี่ยนสไลด์"
      />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : (
        data && <AppearanceEditor key={JSON.stringify(data)} initial={data} />
      )}
    </>
  );
}
function AppearanceEditor({ initial: s }: { initial: any }) {
  const [theme, setTheme] = useState(s.theme),
    [logo, setLogo] = useState(s.logo),
    [favicon, setFavicon] = useState(s.favicon),
    [uploads, setUploads] = useState(0);
  const { notify, refresh, user } = useApp();
  const busy = (value: boolean) => setUploads((n) => n + (value ? 1 : -1));
  return (
    <Form
      noValidate
      blocked={uploads > 0}
      onSubmit={async (f) => {
        const v = formObject(f);
        await send(
          "/admin/appearance",
          {
            theme,
            logo,
            favicon,
            slideSeconds: Number(v.slideSeconds),
            ...(can(user, "settings")
              ? { commissionPercent: Number(v.commissionPercent) }
              : {}),
          },
          "PUT",
        );
        await refresh();
        notify("บันทึกสีและภาพลักษณ์ร้านแล้ว");
      }}
    >
      <div className="settings-grid">
        <section className="panel">
          <h2>
            <Palette size={20} /> สีพาสเทลของร้าน
          </h2>
          <div className="theme-presets">
            {Object.entries(presets).map(([name, t]) => (
              <button
                type="button"
                className="button secondary small"
                key={name}
                onClick={() => setTheme(t)}
              >
                <i style={{ background: t.primary }} />
                {
                  {
                    pink: "ชมพู–ฟ้า",
                    peach: "พีช",
                    mint: "มิ้นต์",
                  }[name as keyof typeof presets]
                }
              </button>
            ))}
          </div>
          <div className="color-grid">
            {Object.entries(theme).map(([name, value]) => (
              <div className="color-field" key={name}>
                <span>{name}</span>
                <input
                  type="color"
                  aria-label={"สี " + name}
                  value={String(value)}
                  onChange={(e) =>
                    setTheme((t: any) => ({ ...t, [name]: e.target.value }))
                  }
                />
                <Field
                  label={"รหัสสี " + name}
                  name={"theme." + name}
                  required
                  value={String(value)}
                  pattern="#[0-9a-fA-F]{6}"
                  onChange={(e) =>
                    setTheme((t: any) => ({ ...t, [name]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div
            className="theme-preview customer-shell"
            style={
              /^#[a-f0-9]{6}$/i.test(theme.primary) ? themeStyle(theme) : {}
            }
          >
            <small>ตัวอย่างหน้าร้าน</small>
            <h3 style={{ color: theme.ink }}>ของที่ชอบ ให้เราหิ้วมาให้</h3>
            <p style={{ color: "var(--muted-text)" }}>
              ปรับแสง เงา และสีให้เป็นร้านของคุณ
            </p>
            <span className="button primary" aria-hidden="true">
              เลือกซื้อสินค้า
            </span>
            <strong style={{ color: "var(--positive-ink)" }}>พร้อมหิ้ว</strong>
          </div>
          <p className="muted">
            สีมีผลกับหน้าลูกค้า ตัวอักษรบนปุ่มปรับสีอัตโนมัติให้เหมาะกับ primary
            ควรเลือก ink และ muted ที่อ่านชัดบน background/surface
          </p>
        </section>
        <div>
          <section className="panel">
            <h2>โลโก้และ Favicon</h2>
            <ImageUpload
              kind="logo"
              value={logo}
              onChange={setLogo}
              onBusyChange={busy}
            />
            <ImageUpload
              kind="favicon"
              value={favicon}
              onChange={setFavicon}
              onBusyChange={busy}
            />
          </section>
          <section className="panel section-space">
            <h2>ระยะเวลาสไลด์</h2>
            <Field
              label="ระยะเวลาเปลี่ยนสไลด์ (วินาที)"
              name="slideSeconds"
              type="number"
              min={3}
              max={30}
              required
              defaultValue={s.slideSeconds}
            />
            {can(user, "settings") && (
              <>
                <Field
                  label="ค่าคอมมิชชั่นแนะนำเพื่อน (% ต่อบิล)"
                  name="commissionPercent"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  required
                  defaultValue={s.commissionPercent}
                />
                <div className="info-box">
                  <p>
                    คิดจากยอดบิลหลังหักส่วนลด
                    จ่ายเข้ากระเป๋าเงินผู้แนะนำเมื่อออร์เดอร์สำเร็จ ล็อก %
                    ตอนสร้างบิล ปัดลงเป็นสตางค์ และไม่จ่ายบิลยกเลิก ค่า 0%
                    คือปิดค่าคอมสำหรับบิลใหม่
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Form>
  );
}

const localDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function BannersPage() {
  const list = useListQuery(),
    { notify, refresh } = useApp();
  const { data, error, loading, reload } = useData<PageData>(
    "/admin/banners?" + list.query,
  );
  const [editing, setEditing] = useState<any>(null);
  return (
    <>
      <PageHeading
        title="แบนเนอร์หน้าร้าน"
        sub="สไลด์ได้หลายภาพ จัดลำดับและกำหนดเวลาแสดงได้"
      >
        <button className="button primary" onClick={() => setEditing({})}>
          <Plus size={18} />
          เพิ่มแบนเนอร์
        </button>
      </PageHeading>
      <section className="panel">
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "ภาพแบนเนอร์",
                "หัวข้อ / ลิงก์",
                "ลำดับ",
                "ช่วงแสดงผล",
                "สถานะ",
                "จัดการ",
              ]}
            >
              {data.items.map((b: any) => (
                <tr key={b.id}>
                  <td>
                    <img className="banner-thumb" src={b.image} alt={b.title} />
                  </td>
                  <td>
                    <b>{b.title}</b>
                    <small className="block muted">
                      {b.link || "ไม่มีลิงก์"}
                    </small>
                  </td>
                  <td>{b.position}</td>
                  <td>
                    {date(b.starts_at)}
                    <small className="block muted">ถึง {date(b.ends_at)}</small>
                  </td>
                  <td>
                    <Badge
                      status={b.active ? "paid" : "cancelled"}
                      label={b.active ? "เปิดแสดง" : "ปิดแสดง"}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={"แก้ไข " + b.title}
                      onClick={() => setEditing(b)}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty
            title="ยังไม่มีแบนเนอร์"
            description="แนะนำ 1600 × 600 px · PNG/JPEG ไม่เกิน 5 MB"
          />
        )}
      </section>
      {editing && (
        <BannerEditor
          row={editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            reload();
            await refresh();
            notify("บันทึกแบนเนอร์แล้ว");
          }}
        />
      )}
    </>
  );
}
function BannerEditor({
  row: r,
  close,
  saved,
}: {
  row: any;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [image, setImage] = useState(r.image || ""),
    [upload, setUpload] = useState(false);
  return (
    <Modal
      title={r.id ? "แก้ไขแบนเนอร์" : "เพิ่มแบนเนอร์"}
      onClose={close}
      wide
    >
      <Form
        noValidate
        blocked={upload}
        onCancel={close}
        onSubmit={async (f) => {
          if (!image) throw new Error("กรุณาอัปโหลดแบนเนอร์");
          const v = formObject(f);
          await send(
            "/admin/banners" + (r.id ? "/" + r.id : ""),
            {
              ...v,
              image,
              position: Number(v.position),
              active: v.active === "on",
              starts_at: new Date(String(v.starts_at)).toISOString(),
              ends_at: new Date(String(v.ends_at)).toISOString(),
              version: r.version,
            },
            r.id ? "PUT" : "POST",
          );
          await saved();
        }}
      >
        <Field
          label="หัวข้อแบนเนอร์ / คำอธิบายรูป"
          name="title"
          required
          defaultValue={r.title}
        />
        <ImageUpload
          kind="banner"
          value={image}
          onChange={setImage}
          onBusyChange={setUpload}
        />
        <Field
          label="ลิงก์ในร้าน (ถ้ามี)"
          name="link"
          defaultValue={r.link || ""}
          placeholder="/promotions"
        />
        <Field
          label="ลำดับ (น้อยแสดงก่อน)"
          name="position"
          type="number"
          min={0}
          max={1000}
          defaultValue={r.position || 0}
          required
        />
        <div className="form-grid">
          <Field
            label="เริ่มแสดง"
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={localDate(r.starts_at)}
          />
          <Field
            label="สิ้นสุดแสดง"
            name="ends_at"
            type="datetime-local"
            required
            defaultValue={localDate(
              r.ends_at || new Date(Date.now() + 30 * 86400000).toISOString(),
            )}
          />
        </div>
        <label className="checkbox-field">
          <input
            type="checkbox"
            name="active"
            defaultChecked={r.active === undefined || !!r.active}
          />
          เปิดแสดง
        </label>
      </Form>
    </Modal>
  );
}

export function PromotionsPage({ coupons = false }: { coupons?: boolean }) {
  const list = useListQuery(),
    { user, notify } = useApp();
  const { data, error, loading, reload } = useData<PageData>(
    (coupons ? "/coupons?" : "/promotions?") + list.query,
  );
  const [busy, setBusy] = useState(""),
    [actionError, setActionError] = useState("");
  return (
    <div className="contained">
      <PageHeading
        title={coupons ? "คูปองของฉัน" : "โปรโมชั่นและคูปอง"}
        sub="เก็บสิทธิ์ที่ชอบ แล้วใช้ส่วนลดในตะกร้า"
      >
        <Link
          className="button secondary small"
          to={coupons ? "/promotions" : "/coupons"}
        >
          {coupons ? "ดูโปรโมชั่นทั้งหมด" : "ดูคูปองของฉัน"}
        </Link>
      </PageHeading>
      {actionError && <ErrorBox error={actionError} />}
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          <div className="promotions-grid">
            {data.items.map((p: any) => {
              const exhausted =
                p.used_count >= p.per_user || p.total_used >= p.limit_count;
              return (
                <article className="panel promo-card" key={p.id}>
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.title || p.code}
                      width="1200"
                      height="800"
                    />
                  ) : (
                    <div className="promo-art">
                      <Ticket size={48} />
                    </div>
                  )}
                  <div className="promo-content">
                    <span className="eyebrow">IYA HIEW PRIVILEGES</span>
                    <h2>{p.title || p.code}</h2>
                    <strong className="discount-value">
                      ลด {p.type === "percent" ? p.value + "%" : money(p.value)}
                    </strong>
                    <p>
                      {p.description ||
                        "เลือกสินค้าที่ชอบ แล้วใช้สิทธิ์ส่วนลดได้เลย"}
                    </p>
                    <small>
                      ยอดซื้อขั้นต่ำ {money(p.minimum)}
                      <br />
                      ใช้ได้ถึง {date(p.ends_at)}
                    </small>
                    <div className="coupon-code">
                      <code>{p.code}</code>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={"คัดลอกโค้ด " + p.code}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(p.code);
                            notify("คัดลอกโค้ดแล้ว");
                          } catch {
                            notify("กรุณาเลือกและคัดลอกโค้ดด้วยตนเอง");
                          }
                        }}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    {!user ? (
                      <Link
                        className="button primary full"
                        to="/login?next=/coupons"
                      >
                        เข้าสู่ระบบเพื่อรับคูปอง
                      </Link>
                    ) : !coupons ? (
                      <Link className="button primary full" to="/coupons">
                        เก็บคูปอง / ใช้สิทธิ์
                      </Link>
                    ) : exhausted ? (
                      <span className="badge status-cancelled">
                        ใช้สิทธิ์ครบแล้ว
                      </span>
                    ) : p.claimed_at ? (
                      <Link
                        className="button primary full"
                        to={"/cart?coupon=" + encodeURIComponent(p.code)}
                      >
                        <Check size={16} />
                        ใช้คูปองนี้
                      </Link>
                    ) : (
                      <button
                        className="button primary full"
                        disabled={busy === p.id}
                        onClick={async () => {
                          setBusy(p.id);
                          setActionError("");
                          try {
                            await send("/coupons/" + p.id + "/claim", {});
                            reload();
                            notify("เก็บคูปองแล้ว");
                          } catch (e) {
                            setActionError((e as Error).message);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        {busy === p.id
                          ? "กำลังเก็บคูปอง…"
                          : "เก็บคูปองรับส่วนลด"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <Pagination data={data} onPage={list.setPage} />
        </>
      ) : (
        <Empty
          title="ยังไม่มีโปรโมชั่นในช่วงนี้"
          description="สิทธิ์ใหม่จากร้านจะแสดงที่นี่"
        />
      )}
    </div>
  );
}
export function CommissionsPage() {
  const list = useListQuery();
  const { data, error, loading, reload } = useData<any>(
    "/admin/commissions?" + list.query,
  );
  return (
    <>
      <PageHeading
        title="ค่าคอมมิชชั่นแนะนำเพื่อน"
        sub="อัตราถูกล็อกตอนสร้างบิล จ่ายเมื่อสำเร็จ และบันทึกเข้ากระเป๋าอัตโนมัติ"
      />
      <section className="panel">
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "คำสั่งซื้อ",
                "ผู้แนะนำ",
                "ยอดฐาน / อัตรา",
                "ค่าคอม",
                "สถานะ",
                "วันที่",
              ]}
            >
              {data.items.map((c: any) => (
                <tr key={c.order_id}>
                  <td>#{c.order_id.slice(0, 8)}</td>
                  <td>{c.referrer_name}</td>
                  <td>
                    {money(c.base)} / {c.rate_bps / 100}%
                  </td>
                  <td>{money(c.amount)}</td>
                  <td>
                    <Badge status={c.status} />
                  </td>
                  <td>{date(c.paid_at || c.created_at)}</td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty
            title="ยังไม่มีค่าคอมมิชชั่น"
            description="ตั้ง % ในสีและภาพลักษณ์ร้าน แล้วรายการจากบิลใหม่จะแสดงที่นี่"
          />
        )}
      </section>
    </>
  );
}
