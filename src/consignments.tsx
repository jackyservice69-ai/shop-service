import { useState } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { Plus, Store, Pencil } from "lucide-react";
import { useApp, useData, send, money, date, can, type PageData } from "./api";
import {
  PageHeading,
  Form,
  Field,
  Modal,
  Confirm,
  Table,
  Pagination,
  Loading,
  ErrorBox,
  Empty,
  SearchBox,
  formObject,
  cents,
  useListQuery,
} from "./ui";
import { ProductCategoryField, ProductImages } from "./product-editor-fields";
import { ProductGallery } from "./product-gallery";
import { SellerWithdrawals } from "./withdrawals";
import {
  ShopProfileFields,
  ShopProfileEditor,
  ShopInformation,
  ShopLogo,
} from "./profiles";
const status = (v: string) =>
  ({
    pending: "รออนุมัติ",
    approved: "อนุมัติแล้ว",
    suspended: "ระงับ",
    rejected: "ไม่อนุมัติ",
    credited: "เข้ากระเป๋าแล้ว",
    void: "ยกเลิก",
  })[v] || v;
function SalesTable({
  data,
  onPage,
}: {
  data: PageData;
  onPage: (p: number) => void;
}) {
  return (
    <>
      <Table
        headers={[
          "สินค้า / ออร์เดอร์",
          "ยอดหลังส่วนลด",
          "ค่าฝากขาย",
          "สุทธิ / สถานะ",
        ]}
      >
        {data.items.map((r: any) => (
          <tr key={r.order_id + r.product_id}>
            <td>
              <b>{r.name}</b>
              <small className="block muted">
                {r.shop_name} · {r.order_id.slice(0, 10)} · {date(r.created_at)}
              </small>
            </td>
            <td>{money(r.base)}</td>
            <td>
              {money(r.fee)}
              <small className="block muted">{r.fee_bps / 100}%</small>
            </td>
            <td>
              <b>{money(r.net)}</b>
              <small className="block muted">{status(r.status)}</small>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination data={data} onPage={onPage} />
    </>
  );
}
export function ConsignmentPage() {
  const location = useLocation(),
    notificationKey = location.state?.notificationId ? location.key : undefined;
  const {
      data: me,
      error,
      loading,
      reload,
    } = useData<any>("/consignment", notificationKey),
    [params, setParams] = useSearchParams(),
    list = useListQuery(),
    tab = params.get("tab") === "sales" ? "sales" : "products",
    rows = useData<PageData>(
      `/consignment/${tab}?` + list.query,
      notificationKey,
    ),
    [editing, setEditing] = useState<any>(null),
    [applicationImage, setApplicationImage] = useState(""),
    [applicationLogo, setApplicationLogo] = useState(""),
    [uploadingProfile, setUploadingProfile] = useState(false),
    { notify } = useApp();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!me) return null;
  return (
    <div className="contained">
      <PageHeading
        title="ตัวแทนฝากขาย"
        sub="สินค้าของคุณ ยอดขาย และค่าฝากขายที่ตรวจสอบได้"
      />
      {!me.membership ? (
        <section className="panel contained narrow">
          <h2>สมัครเป็นตัวแทนฝากขาย</h2>
          <p>
            ร้านหักค่าฝากขาย {me.feePercent}% จากยอดสินค้าหลังส่วนลด
            ล็อกอัตราเมื่อสร้างออร์เดอร์
            ยอดสุทธิเข้ากระเป๋าเมื่อออร์เดอร์สำเร็จและชำระครบ
            การยกเลิกไม่เกิดยอดให้ตัวแทน
          </p>
          <Form
            noValidate
            submit="ส่งคำขอสมัคร"
            blocked={uploadingProfile}
            onSubmit={async (f) => {
              const v = formObject(f);
              await send("/consignment/apply", {
                shopName: v.shopName,
                acceptTerms: v.acceptTerms === "on",
                image: applicationImage,
                logo: applicationLogo,
                serviceArea: v.serviceArea,
              });
              reload();
              notify("ส่งคำขอแล้ว รอร้านอนุมัติ");
            }}
          >
            <Field
              label="ชื่อร้านตัวแทน"
              name="shopName"
              required
              minLength={2}
              maxLength={100}
            />
            <ShopProfileFields
              image={applicationImage}
              onImage={setApplicationImage}
              logo={applicationLogo}
              onLogo={setApplicationLogo}
              onBusy={setUploadingProfile}
            />
            <label className="checkbox">
              <input name="acceptTerms" type="checkbox" required />
              ยอมรับการหักค่าฝากขายและการตรวจอนุมัติสินค้า
            </label>
          </Form>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="panel-title">
              <div className="consignor-shop-heading">
                <ShopLogo
                  logo={me.membership.logo}
                  name={me.membership.shop_name}
                />
                <h2>{me.membership.shop_name}</h2>
              </div>
              <span
                className={
                  "badge " +
                  (me.membership.status === "approved"
                    ? "status-approved"
                    : "status-reserved")
                }
              >
                {status(me.membership.status)}
              </span>
            </div>
            {me.membership.note && <p>{me.membership.note}</p>}
            <p>
              ค่าฝากขายปัจจุบัน <b>{me.feePercent}%</b> ·
              {me.membership.fee_bps != null
                ? " อัตราเฉพาะร้าน"
                : " ใช้อัตรากลาง"}{" "}
              · การเปลี่ยนอัตรามีผลเฉพาะออร์เดอร์ใหม่
            </p>
            <div className="consignment-totals">
              <div>
                <small>ยอดสุทธิรอออร์เดอร์สำเร็จ</small>
                <strong>{money(me.totals.pending)}</strong>
              </div>
              <div>
                <small>เข้ากระเป๋าแล้วสะสม</small>
                <strong>{money(me.totals.credited)}</strong>
              </div>
              <div>
                <small>ค่าฝากขายสะสมที่หักแล้ว</small>
                <strong>{money(me.totals.fees)}</strong>
              </div>
            </div>
          </section>
          <SellerWithdrawals refreshKey={notificationKey} />
          <ShopProfileEditor
            key={me.membership.version}
            membership={me.membership}
            onSaved={reload}
          />
          <div className="section-tabs">
            {["products", "sales"].map((key) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => setParams({ tab: key })}
              >
                {key === "products" ? "สินค้าฝากขาย" : "ยอดขายและค่าฝากขาย"}
              </button>
            ))}
          </div>
          <section className="panel">
            {tab === "products" && (
              <div className="panel-title">
                <h2>สินค้าของฉัน</h2>
                {me.membership.status === "approved" && (
                  <button
                    className="button primary small"
                    onClick={() => setEditing({})}
                  >
                    <Plus size={16} />
                    เพิ่มสินค้าฝากขาย
                  </button>
                )}
              </div>
            )}
            {rows.loading ? (
              <Loading />
            ) : rows.error ? (
              <ErrorBox error={rows.error} retry={rows.reload} />
            ) : rows.data?.items.length ? (
              tab === "sales" ? (
                <SalesTable data={rows.data} onPage={list.setPage} />
              ) : (
                <>
                  <Table
                    headers={["สินค้า", "ราคา / พร้อมขาย", "สถานะ", "จัดการ"]}
                  >
                    {rows.data.items.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="cell-product">
                            <img src={p.image} alt="" />
                            <b>{p.name}</b>
                          </div>
                        </td>
                        <td>
                          {money(p.price)}
                          <small className="block muted">{p.stock} ชิ้น</small>
                        </td>
                        <td>
                          {p.active ? "เปิดขาย" : status(p.consignment_status)}
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={"แก้ไข " + p.name}
                            disabled={me.membership.status !== "approved"}
                            onClick={() => setEditing(p)}
                          >
                            <Pencil size={17} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Table>
                  <Pagination data={rows.data} onPage={list.setPage} />
                </>
              )
            ) : (
              <Empty
                title={
                  tab === "products" ? "ยังไม่มีสินค้าฝากขาย" : "ยังไม่มียอดขาย"
                }
                description="ยอดและสถานะจะแสดงจากรายการจริง"
              />
            )}
          </section>
        </>
      )}
      {editing && (
        <ConsignmentProductEditor
          row={editing}
          onClose={() => setEditing(null)}
          saved={() => {
            setEditing(null);
            rows.reload();
            reload();
            notify("ส่งสินค้าให้ร้านตรวจอนุมัติแล้ว");
          }}
        />
      )}
    </div>
  );
}
function ConsignmentProductEditor({
  row,
  onClose,
  saved,
}: {
  row: any;
  onClose: () => void;
  saved: () => void;
}) {
  const [images, setImages] = useState<string[]>(
      row.images?.length ? row.images : row.image ? [row.image] : [],
    ),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={row.id ? "แก้ไขสินค้าฝากขาย" : "เพิ่มสินค้าฝากขาย"}
      onClose={onClose}
    >
      <p className="muted">
        การบันทึกจะปิดขายชั่วคราวและส่งให้ร้านตรวจอนุมัติใหม่
      </p>
      <Form
        noValidate
        submit="ส่งตรวจสินค้าฝากขาย"
        blocked={busy}
        onCancel={onClose}
        onSubmit={async (f) => {
          const v = formObject(f);
          if (!images.length)
            throw new Error("กรุณาเพิ่มรูปสินค้าอย่างน้อย 1 รูป");
          const category = String(
            v.category === "__new_category__"
              ? v.newCategory || ""
              : v.category || "",
          ).trim();
          if (!category) throw new Error("กรุณาระบุชื่อหมวดหมู่");
          await send(
            "/consignment/products" + (row.id ? "/" + row.id : ""),
            {
              name: v.name,
              description: v.description,
              category,
              price: cents(v.price),
              stock: Number(v.stock),
              image: images[0],
              images,
              version: row.version,
            },
            row.id ? "PUT" : "POST",
          );
          saved();
        }}
      >
        <Field
          label="ชื่อสินค้า"
          name="name"
          defaultValue={row.name}
          required
          maxLength={200}
        />
        <Field
          label="รายละเอียดสินค้า"
          name="description"
          type="textarea"
          defaultValue={row.description}
          required
          maxLength={2000}
        />
        <ProductCategoryField
          value={row.category}
          categoriesPath="/consignment/product-categories"
        />
        <div className="form-grid">
          <Field
            label="ราคาขาย (บาท)"
            name="price"
            type="number"
            min={0.01}
            max={1000000}
            step="0.01"
            required
            defaultValue={row.price ? row.price / 100 : ""}
          />
          <Field
            label="จำนวนพร้อมขาย"
            name="stock"
            type="number"
            min={0}
            max={100000}
            required
            defaultValue={row.stock ?? 0}
            help="ไม่นับจำนวนที่อยู่ในออร์เดอร์จองแล้ว"
          />
        </div>
        <ProductImages
          images={images}
          onChange={setImages}
          onBusyChange={setBusy}
          uploadPath="/consignment/media"
        />
      </Form>
    </Modal>
  );
}
export function AdminConsignmentsPage() {
  const location = useLocation(),
    notificationKey = location.state?.notificationId ? location.key : undefined;
  const [params, setParams] = useSearchParams(),
    tab = ["products", "sales"].includes(params.get("tab") || "")
      ? params.get("tab")!
      : "members",
    list = useListQuery(),
    { user, notify } = useApp(),
    { data, error, loading, reload } = useData<
      PageData & { defaultFeePercent?: number }
    >(
      (tab === "members"
        ? "/admin/consignments"
        : tab === "products"
          ? "/admin/consignment-products"
          : "/admin/consignment-sales") +
        "?" +
        list.query,
      notificationKey,
    ),
    [editing, setEditing] = useState<any>(null),
    [product, setProduct] = useState<any>(null);
  return (
    <>
      <PageHeading
        title="ตัวแทนฝากขาย"
        sub="อนุมัติสมาชิกและสินค้า พร้อมตรวจยอดหลังหักค่าฝากขาย"
      />
      {can(user, "settings") && <ConsignmentFeeSettings onSaved={reload} />}
      <div className="section-tabs">
        {[
          ["members", "สมาชิกตัวแทน"],
          ["products", "สินค้าฝากขาย"],
          ["sales", "ยอดขาย / ค่าฝากขาย"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setParams({ tab: key })}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="panel">
        {tab !== "sales" && <SearchBox value={list.q} onChange={list.setQ} />}
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : data?.items.length ? (
          tab === "sales" ? (
            <SalesTable data={data} onPage={list.setPage} />
          ) : (
            <>
              <Table
                headers={
                  tab === "members"
                    ? [
                        "ชื่อร้าน / สมาชิก",
                        "ติดต่อ",
                        "ค่าฝากขาย",
                        "สถานะ",
                        "จัดการ",
                      ]
                    : [
                        "สินค้า / ร้านตัวแทน",
                        "ราคา / พร้อมขาย",
                        "สถานะ",
                        "จัดการ",
                      ]
                }
              >
                {data.items.map((r: any) => (
                  <tr key={r.user_id || r.id}>
                    {tab === "members" ? (
                      <>
                        <td>
                          <b>{r.shop_name}</b>
                          <small className="block muted">{r.name}</small>
                        </td>
                        <td>
                          {r.email}
                          <small className="block muted">{r.phone}</small>
                        </td>
                        <td className="consignment-fee-cell">
                          <b>
                            {r.fee_bps != null
                              ? `${r.fee_bps / 100}%`
                              : typeof data.defaultFeePercent === "number"
                                ? `${data.defaultFeePercent}%`
                                : "อัตรากลาง"}
                          </b>
                          <small className="block muted">
                            {r.fee_bps != null ? "เฉพาะร้าน" : "ใช้อัตรากลาง"}
                          </small>
                        </td>
                        <td>{status(r.status)}</td>
                        <td>
                          <button
                            className="button secondary small"
                            onClick={() => setEditing(r)}
                          >
                            จัดการ {r.shop_name}
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <b>{r.name}</b>
                          <small className="block muted">{r.shop_name}</small>
                        </td>
                        <td>
                          {money(r.price)} · {r.stock} ชิ้น
                        </td>
                        <td>
                          {r.active ? "เปิดขาย" : status(r.consignment_status)}
                        </td>
                        <td>
                          <button
                            className="button secondary small"
                            onClick={() => setProduct(r)}
                          >
                            ตรวจสินค้า {r.name}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </Table>
              <Pagination data={data} onPage={list.setPage} />
            </>
          )
        ) : (
          <Empty title="ยังไม่มีรายการฝากขาย" />
        )}
      </section>
      {editing && (
        <Modal title="จัดการสมาชิกตัวแทน" onClose={() => setEditing(null)}>
          <h3>{editing.shop_name}</h3>
          <ShopInformation
            shop={{
              name: editing.shop_name,
              image: editing.image || "",
              logo: editing.logo || "",
              serviceArea: editing.service_area || "",
            }}
          />
          <p>
            การระงับหรือไม่อนุมัติจะปิดสินค้าของตัวแทน
            ยอดออร์เดอร์เดิมยังใช้เงื่อนไขที่บันทึกไว้
          </p>
          <Form
            noValidate
            submit="ยืนยันสถานะตัวแทน"
            onCancel={() => setEditing(null)}
            onSubmit={async (f) => {
              const values = formObject(f);
              const payload: {
                status: string;
                note: string;
                version: number;
                feePercent?: number | null;
              } = {
                status: String(values.status || ""),
                note: String(values.note || ""),
                version: editing.version,
              };
              if (can(user, "settings")) {
                if (values.shopFeeOverride === "on") {
                  const raw = String(values.feePercent || "").trim(),
                    percent = Number(raw);
                  if (!raw || !Number.isFinite(percent))
                    throw new Error("กรุณาระบุค่าฝากขายเฉพาะร้าน");
                  payload.feePercent = percent;
                } else payload.feePercent = null;
              }
              await send(
                "/admin/consignments/" + editing.user_id,
                payload,
                "PUT",
              );
              setEditing(null);
              reload();
              notify("บันทึกข้อมูลตัวแทนแล้ว");
            }}
          >
            <Field
              label="สถานะตัวแทน"
              name="status"
              defaultValue={
                editing.status === "pending" ? "approved" : editing.status
              }
            >
              <option value="approved">อนุมัติ</option>
              <option value="suspended">ระงับ</option>
              <option value="rejected">ไม่อนุมัติ</option>
            </Field>
            {can(user, "settings") && (
              <ShopFeeFields
                feeBps={editing.fee_bps}
                defaultFeePercent={data?.defaultFeePercent}
              />
            )}
            <Field
              label="หมายเหตุถึงตัวแทน"
              name="note"
              type="textarea"
              defaultValue={editing.note}
              maxLength={300}
            />
          </Form>
        </Modal>
      )}
      {product && (
        <Modal title="ตรวจสินค้าฝากขาย" onClose={() => setProduct(null)}>
          <ProductGallery key={product.id} product={product} />
          <h3>{product.name}</h3>
          <p className="review-comment">{product.description}</p>
          <p>
            {product.shop_name} · {money(product.price)} · {product.stock} ชิ้น
          </p>
          <Form
            noValidate
            submit="ยืนยันผลตรวจสินค้า"
            onCancel={() => setProduct(null)}
            onSubmit={async (f) => {
              await send(
                "/admin/consignment-products/" + product.id,
                {
                  approved: formObject(f).approved === "true",
                  version: product.version,
                },
                "PUT",
              );
              setProduct(null);
              reload();
              notify("บันทึกผลตรวจสินค้าแล้ว");
            }}
          >
            <Field label="ผลการตรวจสินค้า" name="approved" defaultValue="true">
              <option value="true">อนุมัติและเปิดขาย</option>
              <option value="false">ไม่อนุมัติ / ปิดขาย</option>
            </Field>
          </Form>
        </Modal>
      )}
    </>
  );
}
function ShopFeeFields({
  feeBps,
  defaultFeePercent,
}: {
  feeBps: number | null;
  defaultFeePercent?: number;
}) {
  const [override, setOverride] = useState(feeBps != null);
  const [rate, setRate] = useState(
    feeBps != null
      ? String(feeBps / 100)
      : defaultFeePercent != null
        ? String(defaultFeePercent)
        : "",
  );
  return (
    <fieldset className="shop-fee-fields">
      <legend>ค่าฝากขายของร้านนี้</legend>
      <label className="checkbox">
        <input
          type="checkbox"
          name="shopFeeOverride"
          checked={override}
          onChange={(e) => setOverride(e.target.checked)}
        />
        กำหนดค่าฝากขายเฉพาะร้านนี้
      </label>
      {override ? (
        <Field
          label="ค่าฝากขาย (%)"
          name="feePercent"
          type="number"
          inputMode="decimal"
          required
          min={0}
          max={100}
          step="0.01"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
          help="0–100% ทศนิยมได้ 2 ตำแหน่ง มีผลกับออร์เดอร์ใหม่เท่านั้น"
        />
      ) : (
        <p className="muted">
          {typeof defaultFeePercent === "number"
            ? `ใช้อัตรากลาง ${defaultFeePercent}%`
            : "ใช้อัตรากลางของร้าน"}{" "}
          และเปลี่ยนตามการตั้งค่าอัตรากลาง
        </p>
      )}
    </fieldset>
  );
}

function ConsignmentFeeSettings({ onSaved }: { onSaved: () => void }) {
  const { data, error, loading, reload } = useData<any>(
      "/admin/consignment-settings",
    ),
    { notify } = useApp();
  return (
    <section className="panel">
      <h2>ค่าฝากขายอัตรากลาง</h2>
      <p className="muted">ใช้กับร้านตัวแทนที่ไม่ได้กำหนดค่าฝากขายเฉพาะร้าน</p>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        data && (
          <Form
            key={data.feePercent}
            noValidate
            submit="บันทึกค่าฝากขาย"
            onSubmit={async (f) => {
              await send(
                "/admin/consignment-settings",
                { feePercent: Number(formObject(f).feePercent) },
                "PUT",
              );
              reload();
              onSaved();
              notify("บันทึกอัตราสำหรับออร์เดอร์ใหม่แล้ว");
            }}
          >
            <Field
              label="ค่าฝากขาย (%)"
              name="feePercent"
              type="number"
              min={0}
              max={100}
              step="0.01"
              required
              defaultValue={data.feePercent}
              help="คิดจากยอดสินค้าหลังส่วนลด ปัดลงเป็นสตางค์ และจ่ายยอดสุทธิเมื่อออร์เดอร์สำเร็จ อัตราเดิมในบิลไม่เปลี่ยน คอมมิชชั่นแนะนำเพื่อนเป็นค่าใช้จ่ายร้านแยกต่างหาก"
            />
          </Form>
        )
      )}
    </section>
  );
}
