import { ProductCategoryField, ProductImages } from "./product-editor-fields";
import { ImageUpload } from "./experience";
import { CustomerManagement } from "./member-management";
import socialPlatforms from "../shared/socials.json";
import brandColors from "../shared/customer-colors.json";
import authorization from "../shared/authorization.json";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Plus,
  ShoppingBag,
  Users,
  Wallet,
  Package,
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  ShieldCheck,
  Settings,
  ExternalLink,
  Pencil,
  Search,
  RefreshCw,
  Receipt,
  Ticket,
  Megaphone,
  Copy,
  ChevronRight,
} from "lucide-react";
import {
  useApp,
  useData,
  send,
  api,
  money,
  date,
  can,
  type PageData,
} from "./api";
import {
  PageHeading,
  Stat,
  Loading,
  ErrorBox,
  Empty,
  Badge,
  Table,
  Pagination,
  useListQuery,
  SearchBox,
  Modal,
  Form,
  Field,
  formObject,
  cents,
  Confirm,
} from "./ui";

const statusNames: Record<string, string> = {
  reserved: "รอชำระ",
  paid: "ชำระแล้ว",
  processing: "เตรียมสินค้า",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
};
const colors = [
  "#f0b85f",
  brandColors.primary.DEFAULT,
  "#79acd5",
  "#53b2a0",
  "#80b492",
  "#e49eab",
];
const statusColor = (status: string) =>
  colors[
    [
      "reserved",
      "paid",
      "processing",
      "shipped",
      "completed",
      "cancelled",
    ].indexOf(status)
  ] || "#f4eeee";
export function DashboardPage() {
  const [days, setDays] = useState(7);
  const { user } = useApp();
  const {
    data: d,
    error,
    loading,
    reload,
  } = useData("/admin/dashboard?days=" + days);
  return (
    <>
      <div className="breadcrumb">
        หน้าหลัก <ChevronRight size={13} /> <span>ภาพรวมร้านค้า</span>
      </div>
      <PageHeading
        title={"ภาพรวมร้านค้า"}
        sub={
          "ยินดีต้อนรับกลับมา " +
          (user?.name || "") +
          " ดูแลร้านของคุณได้จากที่นี่"
        }
      >
        <select
          className="standalone-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="ช่วงเวลากราฟ"
        >
          <option value={7}>7 วันที่ผ่านมา</option>
          <option value={30}>30 วันที่ผ่านมา</option>
          <option value={90}>90 วันที่ผ่านมา</option>
        </select>
        <button className="button secondary small" onClick={reload}>
          <RefreshCw size={16} /> รีเฟรช
        </button>
      </PageHeading>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !d ? (
        <Loading />
      ) : (
        d && (
          <>
            <div className="dashboard-welcome">
              <div>
                <span className="eyebrow">A LITTLE CARE, EVERY ORDER</span>
                <h2>
                  พร้อมส่งต่อความสุข
                  <br />
                  ให้ลูกค้าของคุณแล้วหรือยัง?
                </h2>
                <p>เช็กคำสั่งซื้อ ดูยอดขาย และจัดการร้านได้ในที่เดียว</p>
                {can(user, "orders") && (
                  <Link to="/admin/orders" className="text-button">
                    จัดการคำสั่งซื้อ <ArrowRight size={17} />
                  </Link>
                )}
              </div>
              <div className="welcome-graphic" aria-hidden="true">
                <div className="mini-parcel">
                  <ShoppingBag size={38} />
                  <span>Iya hiew</span>
                </div>
                <span className="float-check">
                  <CheckCircle2 size={24} />
                </span>
                <span className="welcome-ring" />
              </div>
              <div className="welcome-note">
                <i /> ร้านของคุณพร้อมดูแลลูกค้า
              </div>
            </div>
            <div className="stats-grid">
              <Stat
                label="ยอดสั่งซื้อทั้งหมด"
                value={money(d.sales)}
                detail="มูลค่าคำสั่งซื้อที่ไม่ยกเลิก"
                icon={<TrendingUp size={22} />}
              />
              <Stat
                label="คำสั่งซื้อทั้งหมด"
                value={d.orders.count.toLocaleString()}
                detail="รวมทุกสถานะคำสั่งซื้อ"
                tone="blue"
                icon={<ShoppingBag size={22} />}
              />
              <Stat
                label="สมาชิกทั้งหมด"
                value={d.members.toLocaleString()}
                detail="บัญชีลูกค้าที่ลงทะเบียน"
                tone="mint"
                icon={<Users size={22} />}
              />
              <Stat
                label="รายรับสุทธิเงินสด"
                value={money(d.net)}
                detail="ยอดรับจริง หักคืนเงินและรายจ่าย"
                tone="orange"
                icon={<Wallet size={22} />}
              />
            </div>
            <div className="charts-grid">
              <section className="panel chart-panel">
                <div className="panel-title">
                  <div>
                    <h2>รายรับและรายจ่าย</h2>
                    <p className="muted">กระแสเงินสดของร้านในช่วงที่เลือก</p>
                  </div>
                  <span className="chart-unit">หน่วย: บาท</span>
                </div>
                <div className="chart-legend">
                  <span>
                    <i style={{ background: brandColors.primary.DEFAULT }} />{" "}
                    รายรับ
                  </span>
                  <span>
                    <i style={{ background: brandColors.primary.active }} />{" "}
                    รายจ่าย
                  </span>
                </div>
                <div
                  className="bar-chart"
                  role="img"
                  aria-label={`กราฟรายรับรายจ่าย ${days} วัน ยอดรับจริงสะสม ${money(d.received)} รายจ่ายสะสม ${money(d.expense)}`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={d.bar.map((r: any) => ({
                        ...r,
                        income: r.income / 100,
                        expense: r.expense / 100,
                      }))}
                      margin={{ left: 0, right: 8, top: 10, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="#edf0f5"
                        strokeDasharray="4 4"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(v) =>
                          new Intl.DateTimeFormat("th-TH", {
                            day: "numeric",
                            month: "short",
                          }).format(new Date(v))
                        }
                        tick={{ fontSize: 11, fill: "#89899c" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={24}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "#89899c" }}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                        domain={[
                          (min: number) => Math.min(0, min),
                          (max: number) => Math.max(max, 1000),
                        ]}
                      />
                      <Tooltip
                        formatter={(v: any, n: any) => [
                          money(Number(v) * 100),
                          n === "income" ? "รายรับ" : "รายจ่าย",
                        ]}
                        labelFormatter={(v) =>
                          new Intl.DateTimeFormat("th-TH", {
                            dateStyle: "medium",
                          }).format(new Date(String(v)))
                        }
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="income"
                        fill={brandColors.primary.DEFAULT}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={24}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="expense"
                        fill={brandColors.primary.active}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {d.bar.every((r: any) => !r.income && !r.expense) && (
                  <p className="chart-empty-note">
                    ยังไม่มีรายรับหรือรายจ่ายในช่วงนี้
                  </p>
                )}
              </section>
              <section className="panel chart-panel">
                <div className="panel-title">
                  <div>
                    <h2>สถานะคำสั่งซื้อ</h2>
                    <p className="muted">สัดส่วนคำสั่งซื้อทั้งหมด</p>
                  </div>
                  <Package size={19} className="muted" />
                </div>
                <div
                  className="donut-wrap"
                  role="img"
                  aria-label={
                    d.statuses
                      .map(
                        (s: any) =>
                          statusNames[s.status] + " " + s.count + " รายการ",
                      )
                      .join(", ") || "ยังไม่มีคำสั่งซื้อ"
                  }
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={
                          d.statuses.length
                            ? d.statuses
                            : [{ count: 1, status: "empty" }]
                        }
                        dataKey="count"
                        innerRadius={67}
                        outerRadius={87}
                        paddingAngle={d.statuses.length ? 4 : 0}
                        stroke="none"
                      >
                        {(d.statuses.length ? d.statuses : [{}]).map(
                          (s: any, i: number) => (
                            <Cell
                              key={i}
                              fill={
                                d.statuses.length
                                  ? statusColor(s.status)
                                  : "#f4eeee"
                              }
                            />
                          ),
                        )}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center">
                    <strong>{d.orders.count}</strong>
                    <small>คำสั่งซื้อ</small>
                  </div>
                </div>
                <div className="donut-legend">
                  {[
                    "reserved",
                    "paid",
                    "processing",
                    "shipped",
                    "completed",
                    "cancelled",
                  ].map((s, i) => (
                    <div key={s}>
                      <span>
                        <i style={{ background: colors[i] }} />
                        {statusNames[s]}
                      </span>
                      <b>
                        {d.statuses.find((v: any) => v.status === s)?.count ||
                          0}
                      </b>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="dashboard-bottom">
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h2>คำสั่งซื้อล่าสุด</h2>
                    <p className="muted">อัปเดตความเคลื่อนไหวในร้านของคุณ</p>
                  </div>
                  {can(user, "orders") && (
                    <Link className="text-button" to="/admin/orders">
                      ดูทั้งหมด <ArrowRight size={15} />
                    </Link>
                  )}
                </div>
                {d.recent.length ? (
                  <Table headers={["คำสั่งซื้อ", "ลูกค้า", "ยอดรวม", "สถานะ"]}>
                    {d.recent.map((o: any) => (
                      <tr key={o.id}>
                        <td>
                          <b>#{o.id.slice(0, 8)}</b>
                          <small className="block muted">
                            {date(o.created_at)}
                          </small>
                        </td>
                        <td>{o.name}</td>
                        <td>
                          <b>{money(o.total)}</b>
                        </td>
                        <td>
                          <Badge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </Table>
                ) : (
                  <Empty
                    title="พร้อมรับคำสั่งซื้อแรก"
                    description="คำสั่งซื้อใหม่จะอัปเดตที่นี่โดยอัตโนมัติ"
                  >
                    <Link to="/" className="text-button">
                      ไปที่หน้าร้าน <ArrowUpRight size={15} />
                    </Link>
                  </Empty>
                )}
              </section>
              <section className="panel shop-health">
                <h2>สรุปสถานะร้าน</h2>
                <div>
                  <span className="health-icon mint">
                    <Package size={19} />
                  </span>
                  <span>
                    สินค้าที่เปิดขาย<small>พร้อมให้ลูกค้าเลือกซื้อ</small>
                  </span>
                  <strong>{d.products}</strong>
                </div>
                <div>
                  <span className="health-icon pink">
                    <Wallet size={19} />
                  </span>
                  <span>
                    ยอดกระเป๋าเงินลูกค้า
                    <small>เงินคงเหลือที่ร้านต้องดูแล</small>
                  </span>
                  <strong>{money(d.walletLiability)}</strong>
                </div>
                <div>
                  <span className="health-icon orange">
                    <Receipt size={19} />
                  </span>
                  <span>
                    รอชำระส่วนที่เหลือ<small>จากคำสั่งซื้อที่ยังไม่ปิด</small>
                  </span>
                  <strong>{money(d.orders.outstanding)}</strong>
                </div>
                {d.lowStock.length > 0 && (
                  <div className="low-stock">
                    <b>สินค้าใกล้หมด</b>
                    {d.lowStock.map((p: any) => (
                      <p key={p.id}>
                        {p.name}
                        <span>{p.stock} ชิ้น</span>
                      </p>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="dashboard-tip">
              <ShieldCheck size={18} />
              <span>
                ทุกยอดเงินและการเปลี่ยนแปลงสำคัญ มีบันทึกให้ตรวจสอบย้อนหลัง
              </span>
              {can(user, "audit") && (
                <Link to="/admin/audit">
                  ดูบันทึก Audit <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </>
        )
      )}
    </>
  );
}

const resourceLabels: Record<string, [string, string, string]> = {
  products: ["จัดการสินค้า", "เพิ่มและดูแลของที่ลูกค้าชอบ", "เพิ่มสินค้า"],
  promotions: [
    "โปรโมชั่น",
    "สร้างโค้ดส่วนลด พร้อมกำหนดระยะเวลาและจำนวนสิทธิ์",
    "เพิ่มโปรโมชั่น",
  ],
  announcements: [
    "ประกาศ",
    "ส่งข่าวสารให้ลูกค้าผ่านป๊อปอัปหน้าร้าน",
    "เพิ่มประกาศ",
  ],
};
export function ResourcePage({ resource }: { resource: string }) {
  const list = useListQuery(),
    { notify, refresh } = useApp();
  const { data, error, loading, reload } = useData<PageData>(
    "/admin/" + resource + "?" + list.query,
  );
  const [editing, setEditing] = useState<any>(null);
  const [title, sub, add] = resourceLabels[resource];
  return (
    <>
      <PageHeading title={title} sub={sub}>
        <button className="button primary" onClick={() => setEditing({})}>
          <Plus size={17} />
          {add}
        </button>
      </PageHeading>
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={list.q}
            onChange={list.setQ}
            placeholder={
              resource === "products"
                ? "ค้นหาชื่อสินค้า…"
                : resource === "promotions"
                  ? "ค้นหาโค้ดโปรโมชั่น…"
                  : "ค้นหาประกาศ…"
            }
          />
          <span className="muted">{data?.total || 0} รายการ</span>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={
                resource === "products"
                  ? [
                      "สินค้า",
                      "หมวดหมู่",
                      "ราคา / ต้นทุน",
                      "คงเหลือ",
                      "สถานะ",
                      "จัดการ",
                    ]
                  : resource === "promotions"
                    ? [
                        "โค้ดส่วนลด",
                        "ส่วนลด",
                        "ระยะเวลา",
                        "จำนวนสิทธิ์",
                        "สถานะ",
                        "จัดการ",
                      ]
                    : ["ประกาศ", "ช่วงแสดงผล", "สถานะ", "จัดการ"]
              }
            >
              {data.items.map((r: any) => (
                <tr key={r.id}>
                  {resource === "products" ? (
                    <>
                      <td>
                        <div className="table-product">
                          <img
                            src={r.image}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.src = "/assets/placeholder.svg";
                            }}
                          />
                          <div>
                            <b>{r.name}</b>
                            <small className="block muted">
                              {r.description.slice(0, 60)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{r.category}</td>
                      <td>
                        <b>{money(r.price)}</b>
                        <small className="block muted">
                          ทุน {money(r.cost)}
                        </small>
                      </td>
                      <td>
                        <span className={r.stock < 5 ? "negative" : ""}>
                          {r.stock} ชิ้น
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (r.active ? "status-paid" : "status-cancelled")
                          }
                        >
                          {r.active ? "เปิดขาย" : "ปิดขาย"}
                        </span>
                      </td>
                    </>
                  ) : resource === "promotions" ? (
                    <>
                      <td>
                        <b className="code-label">{r.code}</b>
                      </td>
                      <td>
                        {r.type === "percent" ? r.value + "%" : money(r.value)}
                        <small className="block muted">
                          ขั้นต่ำ {money(r.minimum)}
                        </small>
                      </td>
                      <td>
                        {date(r.starts_at)}
                        <small className="block muted">
                          ถึง {date(r.ends_at)}
                        </small>
                      </td>
                      <td>
                        {r.limit_count} สิทธิ์
                        <small className="block muted">
                          {r.per_user} ครั้ง/คน
                        </small>
                      </td>
                      <td>
                        <Badge
                          status={r.active ? "paid" : "cancelled"}
                          label={r.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <b>{r.title}</b>
                        <small className="block muted">
                          {r.body.slice(0, 90)}
                        </small>
                      </td>
                      <td>
                        {date(r.starts_at)}
                        <small className="block muted">
                          ถึง {date(r.ends_at)}
                        </small>
                      </td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (r.active ? "status-paid" : "status-cancelled")
                          }
                        >
                          {r.active ? "เปิดแสดง" : "ปิดแสดง"}
                        </span>
                      </td>
                    </>
                  )}
                  <td>
                    <button
                      className="icon-button"
                      aria-label={"แก้ไข " + (r.name || r.code || r.title)}
                      onClick={() => setEditing(r)}
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
            title={"ยังไม่มี" + title}
            description="เพิ่มรายการแรกเพื่อเริ่มใช้งาน"
          />
        )}
      </section>
      {editing && (
        <ResourceEditor
          resource={resource}
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            refresh().catch(() => notify("บันทึกแล้ว กรุณาโหลดหน้าร้านใหม่"));
            notify("บันทึกข้อมูลแล้ว");
          }}
        />
      )}
    </>
  );
}
const localDate = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
function ResourceEditor({
  resource,
  row: r,
  onClose,
  onSaved,
}: {
  resource: string;
  row: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [images, setImages] = useState<string[]>(
    r.images?.length ? r.images : r.image ? [r.image] : [],
  );
  const [image, setImage] = useState(r.image || ""),
    [uploading, setUploading] = useState(false);
  return (
    <Modal
      title={
        (r.id ? "แก้ไข" : "เพิ่ม") +
        resourceLabels[resource][0].replace("จัดการ", "")
      }
      onClose={onClose}
      wide
    >
      <Form
        noValidate
        blocked={uploading}
        onCancel={onClose}
        onSubmit={async (f) => {
          const v: any = formObject(f);
          if (resource !== "products") v.image = image;
          if (resource === "promotions")
            v.claim_required = v.claim_required === "on";
          v.active = v.active === "on";
          if (resource === "announcements") v.position = Number(v.position);
          if (resource === "products") {
            if (!images.length)
              throw new Error("กรุณาเพิ่มรูปภาพสินค้าอย่างน้อย 1 รูป");
            v.image = images[0];
            v.images = images;
            if (v.category === "__new_category__")
              v.category = String(v.newCategory || "").trim();
            delete v.newCategory;
            delete v.productFiles;
            for (const k of ["price", "cost"]) v[k] = cents(v[k]);
            v.stock = Number(v.stock);
          } else {
            v.starts_at = new Date(v.starts_at).toISOString();
            v.ends_at = new Date(v.ends_at).toISOString();
            if (resource === "promotions") {
              v.value = v.type === "fixed" ? cents(v.value) : Number(v.value);
              v.minimum = cents(v.minimum);
              v.limit_count = Number(v.limit_count);
              v.per_user = Number(v.per_user);
            }
          }
          if (r.id) v.version = r.version;
          await send(
            "/admin/" + resource + (r.id ? "/" + r.id : ""),
            v,
            r.id ? "PUT" : "POST",
          );
          onSaved();
        }}
      >
        {resource === "products" ? (
          <>
            <Field
              label="ชื่อสินค้า"
              name="name"
              required
              defaultValue={r.name}
            />
            <Field
              label="รายละเอียด"
              name="description"
              type="textarea"
              defaultValue={r.description || ""}
            />
            <div className="form-grid">
              <ProductCategoryField value={r.category} />
              <Field
                label="จำนวนคงเหลือ"
                name="stock"
                type="number"
                min={0}
                max={100000}
                required
                defaultValue={r.stock ?? 0}
              />
              <Field
                label="ราคาขาย (บาท)"
                name="price"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                required
                defaultValue={(r.price || 0) / 100}
              />
              <Field
                label="ต้นทุนต่อชิ้น (บาท)"
                name="cost"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={(r.cost || 0) / 100}
              />
            </div>
            <ProductImages
              images={images}
              onChange={setImages}
              onBusyChange={setUploading}
            />
          </>
        ) : resource === "promotions" ? (
          <>
            <Field
              label="โค้ดส่วนลด"
              name="code"
              required
              defaultValue={r.code}
              placeholder="เช่น HIEW10"
            />
            <div className="form-grid">
              <Field
                label="ประเภทส่วนลด"
                name="type"
                defaultValue={r.type || "percent"}
              >
                <option value="percent">เปอร์เซ็นต์ (%)</option>
                <option value="fixed">จำนวนเงิน (บาท)</option>
              </Field>
              <Field
                label="มูลค่าส่วนลด"
                name="value"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={
                  r.type === "fixed" ? r.value / 100 : r.value || 10
                }
              />
              <Field
                label="ยอดซื้อขั้นต่ำ (บาท)"
                name="minimum"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={(r.minimum || 0) / 100}
              />
              <Field
                label="จำนวนสิทธิ์รวม"
                name="limit_count"
                type="number"
                min={1}
                required
                defaultValue={r.limit_count || 100}
              />
              <Field
                label="ใช้ได้สูงสุดต่อคน"
                name="per_user"
                type="number"
                min={1}
                required
                defaultValue={r.per_user || 1}
              />
            </div>
          </>
        ) : (
          <>
            <Field
              label="หัวข้อประกาศ"
              name="title"
              required
              defaultValue={r.title}
            />
            <Field
              label="เนื้อหาประกาศ"
              name="body"
              type="textarea"
              required
              defaultValue={r.body}
            />
          </>
        )}
        {resource !== "products" && (
          <ImageUpload
            kind={resource === "promotions" ? "promotion" : "announcement"}
            value={image}
            onChange={setImage}
            onBusyChange={setUploading}
          />
        )}
        {resource === "promotions" && (
          <>
            <Field
              label="ชื่อโปรโมชั่น"
              name="title"
              defaultValue={r.title || ""}
            />
            <Field
              label="รายละเอียดโปรโมชั่น"
              name="description"
              type="textarea"
              defaultValue={r.description || ""}
            />
            <label className="checkbox-field">
              <input
                type="checkbox"
                name="claim_required"
                defaultChecked={!!r.claim_required}
              />
              ต้องเก็บคูปองก่อนใช้ส่วนลด
            </label>
          </>
        )}
        {resource === "announcements" && (
          <Field
            label="ลำดับประกาศ (น้อยแสดงก่อน)"
            name="position"
            type="number"
            min={0}
            max={1000}
            defaultValue={r.position || 0}
          />
        )}
        {resource !== "products" && (
          <div className="form-grid">
            <Field
              label="เริ่มต้นแสดง (เวลาท้องถิ่น)"
              name="starts_at"
              type="datetime-local"
              required
              defaultValue={localDate(r.starts_at)}
            />
            <Field
              label="สิ้นสุดแสดง (เวลาท้องถิ่น)"
              name="ends_at"
              type="datetime-local"
              required
              defaultValue={localDate(
                r.ends_at || new Date(Date.now() + 30 * 86400000).toISOString(),
              )}
            />
          </div>
        )}
        <label className="checkbox-field">
          <input
            type="checkbox"
            name="active"
            defaultChecked={r.active === undefined || !!r.active}
          />{" "}
          {resource === "products" ? "เปิดขายสินค้านี้" : "เปิดใช้งานรายการนี้"}
        </label>
      </Form>
    </Modal>
  );
}
export function AdminOrders() {
  const list = useListQuery(),
    { notify, user } = useApp();
  const { data, error, loading, reload } = useData<PageData>(
    "/admin/orders?" + list.query,
  );
  const [view, setView] = useState<any>(null),
    [cancel, setCancel] = useState<any>(null);
  return (
    <>
      <PageHeading
        title="คำสั่งซื้อ"
        sub="ดูแลทุกออร์เดอร์ ตั้งแต่รับจองจนถึงจัดส่ง"
      />
      <section className="panel">
        <div className="table-toolbar">
          <SearchBox
            value={list.q}
            onChange={list.setQ}
            placeholder="ค้นหาเลขคำสั่งซื้อหรือชื่อลูกค้า…"
          />
          <span className="muted">{data?.total || 0} คำสั่งซื้อ</span>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "คำสั่งซื้อ",
                "ลูกค้า",
                "ยอดรวม",
                "ชำระ / คงเหลือ",
                "สถานะ",
                "รายละเอียด",
              ]}
            >
              {data.items.map((o: any) => (
                <tr key={o.id}>
                  <td>
                    <b>#{o.id.slice(0, 8).toUpperCase()}</b>
                    <small className="block muted">{date(o.created_at)}</small>
                  </td>
                  <td>
                    <b>{o.name}</b>
                    <small className="block muted">{o.email}</small>
                  </td>
                  <td>{money(o.total)}</td>
                  <td>
                    {money(o.paid)}
                    <small className="block muted">
                      คงเหลือ{" "}
                      {money(o.status === "cancelled" ? 0 : o.total - o.paid)}
                    </small>
                  </td>
                  <td>
                    <Badge status={o.status} />
                  </td>
                  <td>
                    <button className="text-button" onClick={() => setView(o)}>
                      ดูรายละเอียด <ArrowUpRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty
            title="ยังไม่มีคำสั่งซื้อ"
            description="คำสั่งซื้อจากหน้าร้านจะแสดงที่นี่"
          />
        )}
      </section>
      {view && (
        <Modal
          title={"คำสั่งซื้อ #" + view.id.slice(0, 8).toUpperCase()}
          onClose={() => setView(null)}
          wide
        >
          <Badge status={view.status} />
          {view.items.map((p: any) => (
            <p className="order-line" key={p.product_id}>
              <span>
                {p.name} × {p.quantity}
              </span>
              <b>{money(p.price * p.quantity)}</b>
            </p>
          ))}
          <div className="summary-lines">
            <p>
              <span>ยอดรวม</span>
              <b>{money(view.total)}</b>
            </p>
            <p>
              <span>ชำระแล้ว</span>
              <b>{money(view.paid)}</b>
            </p>
          </div>
          <div className="address-box">
            <b>
              {view.shipping.name} · {view.shipping.phone}
            </b>
            <p>{view.shipping.address}</p>
            {view.shipping.latitude != null &&
              view.shipping.longitude != null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${view.shipping.latitude},${view.shipping.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-button"
                >
                  ดูหมุดจัดส่งบนแผนที่
                </a>
              )}
          </div>
          {view.tracking && (
            <p>
              เลขพัสดุ <b>{view.tracking}</b>
            </p>
          )}
          {can(user, "orders_update") &&
            ["paid", "processing", "shipped"].includes(view.status) && (
              <Form
                noValidate
                submit="อัปเดตสถานะ"
                onSubmit={async (f) => {
                  await send("/admin/orders/" + view.id, formObject(f), "PUT");
                  setView(null);
                  reload();
                  notify("อัปเดตสถานะแล้ว");
                }}
              >
                <Field label="สถานะถัดไป" name="status">
                  <option
                    value={
                      {
                        paid: "processing",
                        processing: "shipped",
                        shipped: "completed",
                      }[view.status as string]
                    }
                  >
                    {
                      {
                        paid: "กำลังเตรียมสินค้า",
                        processing: "จัดส่งแล้ว",
                        shipped: "สำเร็จ",
                      }[view.status as string]
                    }
                  </option>
                </Field>
                {view.status === "processing" && (
                  <Field
                    label="เลขพัสดุและบริษัทขนส่ง"
                    name="tracking"
                    required
                    placeholder="เช่น ไปรษณีย์ไทย TH123456789"
                  />
                )}
              </Form>
            )}
          {can(user, "orders_cancel") &&
            !["shipped", "completed", "cancelled"].includes(view.status) && (
              <button
                className="text-button negative"
                onClick={() => {
                  setCancel(view);
                  setView(null);
                }}
              >
                ยกเลิกและคืนเงิน
              </button>
            )}
        </Modal>
      )}
      {cancel && (
        <Confirm
          title="ยกเลิกและคืนเงิน"
          description={`คำสั่งซื้อ #${cancel.id.slice(0, 8)} จะถูกยกเลิก คืนสต็อก และคืนเงินที่จ่ายจริง ${money(cancel.paid)} ให้ลูกค้า`}
          danger
          onClose={() => setCancel(null)}
          onConfirm={async () => {
            await send("/admin/orders/" + cancel.id + "/cancel", {});
            reload();
            notify("ยกเลิกและคืนเงินแล้ว");
          }}
        />
      )}
    </>
  );
}
export function FinancePage() {
  const [financeParams, setFinanceParams] = useSearchParams();
  const setFinancePage = (key: string, n: number) => {
    const p = new URLSearchParams(financeParams);
    p.set(key, String(n));
    setFinanceParams(p, { replace: true });
  };
  const list = useListQuery(),
    { notify, user } = useApp();
  const { data, error, loading, reload } = useData(
    "/admin/finance?" + financeParams.toString(),
  );
  const [add, setAdd] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  return (
    <>
      <PageHeading
        title="รายรับ–รายจ่าย"
        sub="แยกเงินเติมกระเป๋าออกจากรายได้ร้าน และติดตามกระแสเงินสด"
      >
        {can(user, "finance_export") && (
          <a
            href="/api/admin/finance/export"
            className="button secondary small"
          >
            <ArrowDownToLine size={16} /> ส่งออก CSV
          </a>
        )}
        {can(user, "finance_write") && (
          <button
            className="button primary"
            onClick={() => {
              setRequestKey(crypto.randomUUID());
              setAdd(true);
            }}
          >
            <Plus size={17} /> บันทึกรายการ
          </button>
        )}
      </PageHeading>
      <div className="info-box">
        <Receipt size={21} />
        <p>
          เงินเติมกระเป๋าเป็นยอดที่ลูกค้าฝากไว้
          รายได้ร้านเกิดเมื่อชำระคำสั่งซื้อ ต้นทุนสินค้าเป็นข้อมูลอ้างอิง
          ให้บันทึกรายจ่ายจริงเมื่อจ่ายเงิน เพื่อไม่ให้นับซ้ำ
        </p>
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <section className="panel section-space">
              <h2>รายการที่บันทึกโดยร้าน</h2>
              {data.manual.items.length ? (
                <>
                  <Table
                    headers={[
                      "วันที่",
                      "รายการ",
                      "ประเภท",
                      "จำนวนเงิน",
                      "ผู้บันทึก",
                    ]}
                  >
                    {data.manual.items.map((r: any) => (
                      <tr key={r.id}>
                        <td>{date(r.created_at)}</td>
                        <td>
                          <b>{r.description}</b>
                          <small className="block muted">{r.category}</small>
                        </td>
                        <td>
                          <Badge status={r.type} />
                        </td>
                        <td
                          className={
                            r.type === "income" ? "positive" : "negative"
                          }
                        >
                          {money(r.amount)}
                        </td>
                        <td>{r.name}</td>
                      </tr>
                    ))}
                  </Table>
                  <Pagination
                    data={data.manual}
                    onPage={(n) => setFinancePage("manualPage", n)}
                  />
                </>
              ) : (
                <Empty
                  title="ยังไม่มีรายการรายรับ–รายจ่าย"
                  description="เริ่มบันทึกค่าใช้จ่ายหรือรายได้อื่นของร้าน"
                />
              )}
            </section>
            <section className="panel section-space">
              <h2>ธุรกรรมกระเป๋าเงินลูกค้า</h2>
              {data.ledger.items.length ? (
                <>
                  <Table
                    headers={[
                      "วันที่",
                      "ลูกค้า",
                      "รายการ",
                      "จำนวนเงิน",
                      "ยอดคงเหลือ",
                    ]}
                  >
                    {data.ledger.items.map((r: any) => (
                      <tr key={r.id}>
                        <td>{date(r.created_at)}</td>
                        <td>{r.name}</td>
                        <td>
                          <Badge status={r.kind} />
                        </td>
                        <td className={r.amount >= 0 ? "positive" : "negative"}>
                          {money(r.amount)}
                        </td>
                        <td>{money(r.balance_after)}</td>
                      </tr>
                    ))}
                  </Table>
                  <Pagination
                    data={data.ledger}
                    onPage={(n) => setFinancePage("ledgerPage", n)}
                  />
                </>
              ) : (
                <Empty
                  title="ยังไม่มีธุรกรรม"
                  description="รายการเติมเงิน ชำระ และคืนเงินจะแสดงที่นี่"
                />
              )}
            </section>
          </>
        )
      )}
      {add && (
        <Modal title="บันทึกรายรับ–รายจ่าย" onClose={() => setAdd(false)}>
          <Form
            noValidate
            onCancel={() => setAdd(false)}
            onSubmit={async (f) => {
              const v: any = formObject(f);
              v.amount = cents(v.amount);
              await send("/admin/finance", v, "POST", requestKey);
              setAdd(false);
              reload();
              notify("บันทึกรายการแล้ว");
            }}
          >
            <Field label="ประเภท" name="type">
              <option value="expense">รายจ่าย</option>
              <option value="income">รายรับอื่น</option>
            </Field>
            <Field
              label="หมวดหมู่"
              name="category"
              required
              placeholder="เช่น ค่าสินค้า ค่าขนส่ง"
            />
            <Field
              label="รายละเอียด"
              name="description"
              type="textarea"
              required
            />
            <Field
              label="จำนวนเงิน (บาท)"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
            <p className="muted">
              รายการบัญชีที่บันทึกแล้วเก็บไว้เพื่อการตรวจสอบ
              หากผิดให้บันทึกรายการกลับรายการพร้อมเหตุผล
            </p>
          </Form>
        </Modal>
      )}
    </>
  );
}
export function MembersPage() {
  const list = useListQuery(),
    { user, notify, refresh } = useApp();
  const { data, error, loading, reload } = useData<PageData>(
    "/admin/members?" + list.query,
  );
  const { data: roles } = useData("/admin/roles");
  const [editing, setEditing] = useState<any>(null),
    [confirmation, setConfirmation] = useState<any>(null),
    [customerAction, setCustomerAction] = useState<{
      row: any;
      mode: "profile" | "reset";
    } | null>(null);
  return (
    <>
      <PageHeading
        title="สมาชิก"
        sub="ดูแลบัญชีลูกค้า ยอดเงิน และสิทธิ์การใช้งาน"
      />
      <section className="panel members-panel">
        <div className="table-toolbar">
          <SearchBox
            value={list.q}
            onChange={list.setQ}
            placeholder="ค้นหาชื่อ อีเมล เบอร์โทร หรือ LINE ID…"
          />
          <span className="muted">{data?.total || 0} บัญชี</span>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "สมาชิก",
                "ข้อมูลติดต่อ",
                "รู้จักเราจากที่ไหน",
                "บทบาท",
                "กระเป๋าเงิน",
                "สถานะ",
                "วันที่สมัคร",
                "จัดการ",
              ]}
            >
              {data.items.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                    <small className="block muted">{r.email}</small>
                  </td>
                  <td>
                    <span>{r.phone || "—"}</span>
                    <small className="block muted">
                      LINE: {r.line_id || "—"}
                    </small>
                  </td>
                  <td>{r.discovery_source || "—"}</td>
                  <td>{r.role_name}</td>
                  <td>{can(user, "finance") ? money(r.balance) : "—"}</td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (r.active ? "status-paid" : "status-cancelled")
                      }
                    >
                      {r.active ? "ใช้งาน" : "ระงับ"}
                    </span>
                  </td>
                  <td>{date(r.created_at)}</td>
                  <td>
                    <div className="member-actions">
                      {user?.roleId === "admin" && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil size={15} /> จัดการ
                        </button>
                      )}
                      {r.role_id === "customer" && can(user, "member_edit") && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            setCustomerAction({ row: r, mode: "profile" })
                          }
                        >
                          แก้ไขข้อมูล
                        </button>
                      )}
                      {r.role_id === "customer" &&
                        can(user, "member_reset") && (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              setCustomerAction({ row: r, mode: "reset" })
                            }
                          >
                            รีเซ็ตรหัสผ่าน
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty />
        )}
      </section>
      {editing && (
        <Modal
          title={"จัดการสมาชิก " + editing.name}
          onClose={() => setEditing(null)}
        >
          <Form
            noValidate
            submit="ตรวจสอบการเปลี่ยนแปลง"
            onCancel={() => setEditing(null)}
            onSubmit={async (f) => {
              const v: any = formObject(f);
              v.active = v.active === "on";
              setConfirmation({ user: editing, values: v });
              setEditing(null);
            }}
          >
            <Field label="บทบาท" name="role_id" defaultValue={editing.role_id}>
              {roles?.roles.map((r: any) => (
                <option value={r.id} key={r.id}>
                  {r.name}
                </option>
              ))}
            </Field>
            <label className="checkbox-field">
              <input
                type="checkbox"
                name="active"
                defaultChecked={!!editing.active}
              />{" "}
              อนุญาตให้เข้าสู่ระบบ
            </label>
          </Form>
        </Modal>
      )}
      {confirmation && (
        <Confirm
          title="ยืนยันเปลี่ยนสิทธิ์"
          description={`เปลี่ยนบทบาท ${confirmation.user.name} เป็น ${roles?.roles.find((r: any) => r.id === confirmation.values.role_id)?.name} และ${confirmation.values.active ? "เปิด" : "ระงับ"}การใช้งาน เซสชันเดิมของสมาชิกจะถูกยกเลิก`}
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            await send(
              "/admin/members/" + confirmation.user.id,
              confirmation.values,
              "PUT",
            );
            reload();
            await refresh();
            notify("เปลี่ยนสิทธิ์แล้ว");
          }}
        />
      )}
      {customerAction && (
        <CustomerManagement
          row={customerAction.row}
          mode={customerAction.mode}
          onClose={() => setCustomerAction(null)}
          changed={reload}
        />
      )}
    </>
  );
}
const permissionLabels: Record<string, string> = {
  ...Object.fromEntries(authorization.permissions.map((p) => [p.id, p.label])),
};
export function RolesPage() {
  const { data, error, loading, reload } = useData("/admin/roles"),
    { user, notify } = useApp();
  const [editing, setEditing] = useState<any>(null),
    [confirm, setConfirm] = useState<any>(null);
  return (
    <>
      <PageHeading
        title="สิทธิ์การใช้งาน"
        sub="ให้ทีมเข้าถึงเฉพาะงานที่รับผิดชอบ"
      >
        {user?.roleId === "admin" && (
          <button
            className="button primary"
            onClick={() => setEditing({ permissions: [] })}
          >
            <Plus size={17} /> เพิ่มบทบาท
          </button>
        )}
      </PageHeading>
      <div className="info-box">
        <ShieldCheck size={22} />
        <p>
          เจ้าของร้านเท่านั้นที่สร้างบทบาทและมอบสิทธิ์ได้
          บทบาททีมงานเริ่มต้นปรับสิทธิ์ได้ บัญชีรับเงิน API keys
          และอัตราค่าคอมมิชชั่นสงวนให้เจ้าของร้าน
          ตัวแทนฝากขายเป็นสถานะเสริมของลูกค้า ไม่ได้สิทธิ์ทีมงาน
        </p>
      </div>
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : (
        <div className="roles-grid">
          {data?.roles.map((r: any) => (
            <section className="panel" key={r.id}>
              <div className="panel-title">
                <h2>{r.name}</h2>
                <ShieldCheck size={22} className="pink-ink" />
              </div>
              <p className="muted">
                {r.id === "admin"
                  ? "เข้าถึงทุกส่วน รวมการรับเงิน API keys และการมอบสิทธิ์ทีมงาน"
                  : r.id === "customer"
                    ? "หน้าร้านและข้อมูลของตนเองเท่านั้น"
                    : r.permissions.length + " สิทธิ์ที่เข้าถึงได้"}
              </p>
              <div className="permission-tags">
                {r.permissions.map((p: string) => (
                  <span className="badge" key={p}>
                    {p === "*" ? "ทุกสิทธิ์" : permissionLabels[p]}
                  </span>
                ))}
              </div>
              {!["admin", "customer"].includes(r.id) &&
                user?.roleId === "admin" && (
                  <button className="text-button" onClick={() => setEditing(r)}>
                    <Pencil size={15} /> แก้ไขสิทธิ์
                  </button>
                )}
            </section>
          ))}
        </div>
      )}
      {editing && (
        <Modal
          title={editing.id ? "แก้ไขบทบาท" : "เพิ่มบทบาท"}
          onClose={() => setEditing(null)}
        >
          <Form
            noValidate
            submit="ตรวจสอบสิทธิ์"
            onSubmit={async (f) => {
              const fd = new FormData(f);
              setConfirm({
                id: editing.id,
                name: fd.get("name"),
                permissions: fd.getAll("permissions"),
              });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          >
            <Field
              label="ชื่อบทบาท"
              name="name"
              required
              defaultValue={editing.name}
            />
            <fieldset>
              <legend>ส่วนที่อนุญาตให้เข้าถึง</legend>
              {data.permissions.map((p: string) => (
                <label className="checkbox-field" key={p}>
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p}
                    checked={editing.permissions.includes(p)}
                    onChange={(e) => {
                      const rule = authorization.permissions.find(
                        (r) => r.id === p,
                      )!;
                      const selected = e.target.checked
                        ? [
                            ...new Set([
                              ...editing.permissions,
                              p,
                              ...rule.requires,
                            ]),
                          ]
                        : editing.permissions.filter(
                            (id: string) =>
                              id !== p &&
                              !authorization.permissions
                                .find((r) => r.id === id)
                                ?.requires.includes(p),
                          );
                      setEditing({ ...editing, permissions: selected });
                    }}
                  />
                  {permissionLabels[p]}
                </label>
              ))}
            </fieldset>
          </Form>
          <p className="muted">
            สิทธิ์อัปเดตต้องมีสิทธิ์ดูรายการด้วย ระบบจะเลือกสิทธิ์ที่จำเป็นให้
            บทบาทที่แก้ไขจะออกจากระบบทุกอุปกรณ์
          </p>
        </Modal>
      )}
      {confirm && (
        <Confirm
          title="บันทึกสิทธิ์บทบาท"
          description={`บทบาท ${confirm.name} จะเข้าถึง ${confirm.permissions.map((p: string) => permissionLabels[p]).join(", ") || "หน้าร้านเท่านั้น"} ${confirm.id ? "เซสชันของสมาชิกในบทบาทนี้จะถูกยกเลิก" : ""}`}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await send(
              "/admin/roles" + (confirm.id ? "/" + confirm.id : ""),
              { name: confirm.name, permissions: confirm.permissions },
              confirm.id ? "PUT" : "POST",
            );
            reload();
            notify("บันทึกบทบาทแล้ว");
          }}
        />
      )}
    </>
  );
}
export function SettingsPage() {
  const { data: s, error, loading, reload } = useData("/admin/settings");
  const { notify, refresh } = useApp();
  const [integration, setIntegration] = useState<any>(null),
    [checking, setChecking] = useState(false),
    [checkError, setCheckError] = useState("");
  return (
    <>
      <PageHeading
        title="ตั้งค่าระบบ"
        sub="ตั้งค่าร้าน การรับเงิน และผู้ช่วย LINE ของคุณ"
      />
      {error ? (
        <ErrorBox error={error} retry={reload} />
      ) : loading ? (
        <Loading />
      ) : (
        s && (
          <Form
            noValidate
            onSubmit={async (f) => {
              const v: any = formObject(f);
              v.depositPercent = Number(v.depositPercent);
              v.botEnabled = v.botEnabled === "on";
              v.lineLoginEnabled = v.lineLoginEnabled === "on";
              v.lineTopupEnabled = v.lineTopupEnabled === "on";
              v.aiEnabled = v.aiEnabled === "on";
              v.paymentQr = s.paymentQr || "";
              v.socials = Object.fromEntries(
                socialPlatforms.map((p) => [
                  p.key,
                  String(v["socials." + p.key] || "").trim(),
                ]),
              );
              v.socialVisibility = Object.fromEntries(
                socialPlatforms.map((p) => [
                  p.key,
                  v["socialVisibility." + p.key] === "on",
                ]),
              );
              const result = await send("/admin/settings", v, "PUT");
              await refresh();
              reload();
              notify(
                result.paymentQrCleared
                  ? "บันทึกแล้ว · บัญชีเปลี่ยน กรุณาอัปโหลด QR ที่ตรงกับบัญชีใหม่"
                  : "บันทึกการตั้งค่าแล้ว",
              );
            }}
          >
            <div className="settings-grid">
              <div>
                <section className="panel">
                  <div className="panel-title">
                    <h2>ร้านค้าและการชำระเงิน</h2>
                    <span className="setting-icon">
                      <ShoppingBag size={19} />
                    </span>
                  </div>
                  <Field
                    label="ชื่อร้าน"
                    name="shopName"
                    defaultValue={s.shopName}
                    required
                  />
                  <Field
                    label="มัดจำขั้นต่ำ (%)"
                    name="depositPercent"
                    type="number"
                    min={0}
                    max={100}
                    required
                    defaultValue={s.depositPercent}
                    help="0 = จองได้โดยไม่หักเงิน ต้องจ่ายส่วนที่เหลือก่อนจัดส่ง"
                  />
                </section>
                <section className="panel section-space">
                  <h2>ช่องทางติดต่อร้าน</h2>
                  <p className="muted">
                    เลือกช่องทางที่ต้องการแสดงบนหน้าร้าน
                    ปิดแล้วลิงก์เดิมยังคงอยู่ ช่องทางที่ไม่มีลิงก์จะไม่แสดง ปิด
                    LINE จะซ่อนปุ่มติดต่อ LINE บนหน้าร้านด้วย
                  </p>
                  {socialPlatforms.map((p) => (
                    <div className="social-setting-row" key={p.key}>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          name={"socialVisibility." + p.key}
                          defaultChecked={s.socialVisibility?.[p.key] !== false}
                        />
                        แสดง {p.label}
                      </label>
                      <Field
                        label={p.label}
                        name={"socials." + p.key}
                        type="url"
                        maxLength={500}
                        defaultValue={s.socials?.[p.key] || ""}
                        placeholder={"https://" + p.hosts[0] + "/…"}
                      />
                    </div>
                  ))}
                </section>
                <section className="panel section-space">
                  <div className="panel-title">
                    <h2>ตรวจสลิป EasySlip</h2>
                    <span
                      className={
                        "badge " +
                        (s.easyslipApiKeyConfigured
                          ? "status-paid"
                          : "status-reserved")
                      }
                    >
                      {s.easyslipApiKeyConfigured
                        ? "ใส่ API key แล้ว"
                        : "ยังไม่ตั้งค่า"}
                    </span>
                  </div>
                  <Field
                    label="EasySlip API key"
                    name="easyslipApiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      s.easyslipApiKeyConfigured
                        ? "ตั้งค่าแล้ว · เว้นว่างเพื่อใช้ค่าเดิม"
                        : "ใส่ API key"
                    }
                  />
                  <div className="warning-box">
                    ต้องลงทะเบียนบัญชีรับเงินและเชื่อมโยง Branch ใน EasySlip
                    ด้วย การมี API key
                    อย่างเดียวยังไม่ทำให้การจับคู่บัญชีพร้อมใช้งาน
                  </div>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={checking}
                    onClick={async () => {
                      setChecking(true);
                      setCheckError("");
                      try {
                        setIntegration(
                          await api("/admin/integrations/easyslip"),
                        );
                      } catch (e) {
                        setCheckError((e as Error).message);
                      } finally {
                        setChecking(false);
                      }
                    }}
                  >
                    <RefreshCw size={16} className={checking ? "spin" : ""} />
                    ตรวจการเชื่อมต่อและบัญชี
                  </button>
                  {checkError && <ErrorBox error={checkError} />}
                  {integration && (
                    <div className="integration-result">
                      <b>เชื่อมต่อสำเร็จ</b>
                      <p>พบธนาคาร {integration.banks?.length || 0} แห่ง</p>
                      <pre>{JSON.stringify(integration.accounts, null, 2)}</pre>
                      <p>{integration.note}</p>
                    </div>
                  )}
                  <a
                    className="text-button section-space"
                    href="https://document.easyslip.com/th/v2/bank-accounts/banks"
                    target="_blank"
                    rel="noreferrer"
                  >
                    คู่มือ EasySlip <ExternalLink size={14} />
                  </a>
                </section>
              </div>
              <div>
                <section className="panel">
                  <div className="panel-title">
                    <h2>LINE Chatbot</h2>
                    <span className="line-badge">LINE</span>
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="botEnabled"
                      defaultChecked={s.botEnabled}
                    />{" "}
                    เปิดใช้ LINE Chatbot
                  </label>
                  <Field
                    label="Channel Access Token"
                    name="lineChannelAccessToken"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      s.lineChannelAccessTokenConfigured
                        ? "ตั้งค่าแล้ว · เว้นว่างเพื่อใช้ค่าเดิม"
                        : "ใส่ Access Token"
                    }
                  />
                  <Field
                    label="Channel Secret"
                    name="lineChannelSecret"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      s.lineChannelSecretConfigured
                        ? "ตั้งค่าแล้ว · เว้นว่างเพื่อใช้ค่าเดิม"
                        : "ใส่ Channel Secret"
                    }
                  />
                  <Field
                    label="Webhook URL"
                    name="webhookDisplay"
                    value={s.webhookUrl}
                    disabled
                    help="เมื่อเปิดใช้งานจริงให้ใช้โดเมน HTTPS และเปิด Use webhook ใน LINE Developers"
                  />
                  <Field
                    label="ข้อความตอบกลับพื้นฐาน"
                    name="botGreeting"
                    type="textarea"
                    required
                    defaultValue={s.botGreeting}
                  />
                  <h3>LINE Login และผูกบัญชีสมาชิก</h3>
                  <p className="muted">
                    สร้าง LINE Login Channel ภายใต้ Provider เดียวกับ Messaging
                    API และเชื่อมกับ LINE Official Account ของร้าน ใช้ ID/Secret
                    คนละชุดกับ Chatbot
                  </p>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="lineLoginEnabled"
                      defaultChecked={s.lineLoginEnabled}
                    />{" "}
                    เปิดใช้ LINE Login
                  </label>
                  <Field
                    label="LINE Login Channel ID"
                    name="lineLoginChannelId"
                    defaultValue={s.lineLoginChannelId || ""}
                    maxLength={20}
                    pattern="[0-9]*"
                    autoComplete="off"
                  />
                  <Field
                    label="LINE Login Channel Secret"
                    name="lineLoginChannelSecret"
                    type="password"
                    autoComplete="off"
                    maxLength={500}
                    placeholder={
                      s.lineLoginChannelSecretConfigured
                        ? "ตั้งค่าแล้ว · เว้นว่างเพื่อใช้ค่าเดิม"
                        : "ใส่ Channel Secret ของ LINE Login"
                    }
                  />
                  <Field
                    label="LINE Login Callback URL"
                    name="lineCallbackDisplay"
                    value={s.lineLoginCallback}
                    readOnly
                    help="นำ URL นี้ไปตั้งค่า Callback URL ใน LINE Developers Console"
                  />
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="lineTopupEnabled"
                      defaultChecked={s.lineTopupEnabled}
                    />{" "}
                    เปิดเติมเงินจากสลิปใน LINE
                  </label>
                  <p className="info-box">
                    รับรูป JPEG, PNG หรือ WebP ไม่เกิน 4 MB ในแชทส่วนตัว
                    เฉพาะลูกค้าที่ผูก LINE แล้ว
                    ตรวจยอดจากสลิปจริงและจับคู่บัญชีรับเงินใน EasySlip
                    ก่อนเติมยอด ป้องกันสลิปซ้ำร่วมกับเว็บและหลังบ้าน
                  </p>
                </section>
                <section className="panel section-space">
                  <div className="panel-title">
                    <h2>เชื่อมต่อ ChatGPT</h2>
                    <span
                      className={
                        "badge " +
                        (s.openaiApiKeyConfigured
                          ? "status-paid"
                          : "status-reserved")
                      }
                    >
                      {s.openaiApiKeyConfigured
                        ? "ใส่ API key แล้ว"
                        : "รอ API key"}
                    </span>
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      name="aiEnabled"
                      defaultChecked={s.aiEnabled}
                    />{" "}
                    ใช้ AI ช่วยตอบใน LINE
                  </label>
                  <Field
                    label="OpenAI API key"
                    name="openaiApiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      s.openaiApiKeyConfigured
                        ? "ตั้งค่าแล้ว · เว้นว่างเพื่อใช้ค่าเดิม"
                        : "ใส่ OpenAI API key"
                    }
                  />
                  <Field
                    label="ชื่อโมเดล"
                    name="aiModel"
                    required
                    defaultValue={s.aiModel}
                  />
                  <Field
                    label="แนวทางการตอบของผู้ช่วย"
                    name="aiInstructions"
                    type="textarea"
                    required
                    defaultValue={s.aiInstructions}
                  />
                  <div className="info-box">
                    <ShieldCheck size={18} />
                    <p>
                      AI ตอบจากข้อมูลสินค้าสาธารณะเท่านั้น ไม่มีสิทธิ์ตัดเงิน
                      เปลี่ยนออร์เดอร์ หรืออ่านข้อมูลส่วนตัวลูกค้า
                      ข้อความที่ส่งให้ AI ไม่ถูกบันทึกใน OpenAI Responses
                      storage
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </Form>
        )
      )}
      <section className="panel section-space">
        <h2>การตอบกลับ LINE ล่าสุด</h2>
        {s?.botEvents.length ? (
          <Table headers={["วันที่", "สถานะ", "ลองแล้ว", "ข้อผิดพลาด"]}>
            {s.botEvents.map((e: any) => (
              <tr key={e.id}>
                <td>{date(e.created_at)}</td>
                <td>
                  <Badge status={e.status} />
                </td>
                <td>{e.attempts}</td>
                <td>{e.error || "—"}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="ยังไม่มีข้อความจาก LINE"
            description="รายการจะแสดงเมื่อเชื่อมต่อ Webhook และมีข้อความเข้า"
          />
        )}
      </section>
    </>
  );
}
export function AuditPage() {
  const list = useListQuery();
  const { data, error, loading, reload } = useData(
    "/admin/audit?" + list.query,
  );
  return (
    <>
      <PageHeading
        title="บันทึก Audit"
        sub="ตรวจสอบย้อนหลังว่าใคร ทำอะไร และเมื่อไร"
      >
        <button className="button secondary small" onClick={reload}>
          <RefreshCw size={16} /> ตรวจสอบใหม่
        </button>
      </PageHeading>
      {data?.chain && (
        <div className={data.chain.valid ? "audit-valid" : "error-box"}>
          <ShieldCheck size={22} />
          <div>
            <b>
              {data.chain.valid
                ? "ลำดับบันทึกถูกต้อง"
                : "พบบันทึกไม่สอดคล้องกัน"}
            </b>
            <p>
              {data.chain.count || 0} รายการ · ตรวจสอบ hash chain
              จากรายการแรกถึงล่าสุด
            </p>
          </div>
          <span className="badge status-paid">
            {data.chain.valid ? "VERIFIED" : "FAILED"}
          </span>
        </div>
      )}
      <section className="panel section-space">
        <div className="table-toolbar">
          <SearchBox
            value={list.q}
            onChange={list.setQ}
            placeholder="ค้นหาเหตุการณ์ เช่น order, wallet…"
          />
          <span className="muted">อ่านอย่างเดียว</span>
        </div>
        {error ? (
          <ErrorBox error={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "เวลา",
                "ผู้ดำเนินการ",
                "เหตุการณ์",
                "รายการอ้างอิง",
                "รายละเอียด",
              ]}
            >
              {data.items.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    {date(r.created_at)}
                    <small className="block muted">#{r.id}</small>
                  </td>
                  <td>{r.actor_name || "ระบบ"}</td>
                  <td>
                    <code>{r.action}</code>
                  </td>
                  <td>
                    <code>{r.entity.slice(0, 12)}</code>
                  </td>
                  <td>
                    <details>
                      <summary>ดูข้อมูล</summary>
                      <pre className="audit-json">
                        {JSON.stringify(JSON.parse(r.details), null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty
            title="ยังไม่มีบันทึก"
            description="เหตุการณ์สำคัญจะถูกบันทึกอัตโนมัติ"
          />
        )}
      </section>
    </>
  );
}
