import { useEffect, useRef, useState } from "react";
import { Star, ImagePlus, Trash2, Pencil } from "lucide-react";
import { api, send, useApp, useData, date, type PageData } from "./api";
import {
  Form,
  Field,
  Modal,
  Confirm,
  ErrorBox,
  Loading,
  Empty,
  Pagination,
  PageHeading,
  SearchBox,
  Table,
  useListQuery,
  formObject,
} from "./ui";
type Media = {
  id: string;
  mime: string;
  url: string;
  width: number;
  height: number;
  duration: number;
};
export function Stars({ rating }: { rating: number }) {
  return (
    <span
      className="review-stars"
      role="img"
      aria-label={`${Number(rating).toFixed(1)} จาก 5 ดาว`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={16}
          aria-hidden="true"
          fill={i <= Math.round(rating) ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}
function ReviewMedia({ items }: { items: Media[] }) {
  const [selected, setSelected] = useState<Media | null>(null);
  return (
    <>
      <div className="review-media-grid">
        {items.map((m) =>
          m.mime.startsWith("video/") ? (
            <video
              key={m.id}
              src={m.url}
              controls
              playsInline
              preload="metadata"
              aria-label="วิดีโอประกอบรีวิว"
            />
          ) : (
            <button
              key={m.id}
              className="review-image-button"
              type="button"
              aria-label="ขยายรูปประกอบรีวิว"
              onClick={() => setSelected(m)}
            >
              <img
                src={m.url}
                alt="รูปประกอบรีวิวสินค้า"
                width={m.width}
                height={m.height}
                loading="lazy"
              />
            </button>
          ),
        )}
      </div>
      {selected && (
        <Modal title="รูปประกอบรีวิว" onClose={() => setSelected(null)}>
          <img
            className="review-full-image"
            src={selected.url}
            alt="รูปประกอบรีวิวสินค้า"
          />
        </Modal>
      )}
    </>
  );
}
export function ProductReviews({
  productId,
  onChanged,
}: {
  productId: string;
  onChanged: () => void;
}) {
  const [page, setPage] = useState(1),
    { user } = useApp(),
    { data, loading, error, reload } = useData<any>(
      `/products/${productId}/reviews?page=${page}&size=4`,
    );
  return (
    <section className="product-reviews">
      <h3>รีวิวจากผู้ซื้อ</h3>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        data && (
          <>
            <div className="review-summary">
              <Stars rating={data.summary.average} />
              <strong>{Number(data.summary.average).toFixed(1)}</strong>
              <span>{data.summary.count} รีวิว</span>
            </div>
            {data.items.length ? (
              data.items.map((r: any) => (
                <article className="review-card" key={r.id}>
                  <div className="panel-title">
                    <strong>{r.author}</strong>
                    <small className="muted">{date(r.updated_at)}</small>
                  </div>
                  <Stars rating={r.rating} />
                  <span className="verified-buyer">ผู้ซื้อจริง</span>
                  <p className="review-comment">{r.comment}</p>
                  <ReviewMedia items={r.media} />
                </article>
              ))
            ) : (
              <p className="muted">
                ยังไม่มีรีวิว
                เป็นผู้ซื้อคนแรกที่แบ่งปันประสบการณ์ได้หลังรับสินค้าสำเร็จ
              </p>
            )}
            <Pagination data={data} onPage={setPage} />
          </>
        )
      )}
      {user ? (
        <MyReview
          productId={productId}
          changed={() => {
            reload();
            onChanged();
          }}
        />
      ) : (
        <p className="muted">
          เข้าสู่ระบบเพื่อรีวิวสินค้าที่ซื้อและรับสินค้าสำเร็จแล้ว
        </p>
      )}
    </section>
  );
}
function MyReview({
  productId,
  changed,
}: {
  productId: string;
  changed: () => void;
}) {
  const { data, error, loading, reload } = useData<any>(
      `/products/${productId}/reviews/me`,
    ),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    { notify } = useApp();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return null;
  return (
    <div className="my-review">
      {data.eligible ? (
        <button
          type="button"
          className="button secondary"
          onClick={() => setEditing(true)}
        >
          <Pencil size={16} />
          {data.review ? "แก้ไขรีวิวของฉัน" : "เขียนรีวิวสินค้า"}
        </button>
      ) : (
        <p className="muted">รีวิวได้เมื่อคำสั่งซื้อสำเร็จและชำระครบ</p>
      )}
      {data.review && (
        <>
          <button
            type="button"
            className="text-button negative"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={16} />
            ลบรีวิวของฉัน
          </button>
          {!data.review.visible && (
            <p className="warning-box">
              รีวิวของคุณถูกซ่อน: {data.review.moderation_reason}{" "}
              การแก้ไขจะยังไม่เผยแพร่จนกว่าร้านจะตรวจอีกครั้ง
            </p>
          )}
        </>
      )}
      {editing && (
        <ReviewEditor
          productId={productId}
          review={data.review}
          onClose={() => setEditing(false)}
          saved={() => {
            setEditing(false);
            reload();
            changed();
            notify("บันทึกรีวิวแล้ว");
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="ลบรีวิวของฉัน"
          description="ความคิดเห็น รูปและวิดีโอในรีวิวนี้จะถูกลบออก"
          danger
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await send(
              `/products/${productId}/review`,
              { version: data.review.version },
              "DELETE",
            );
            reload();
            changed();
            notify("ลบรีวิวแล้ว");
          }}
        />
      )}
    </div>
  );
}
function ReviewEditor({
  productId,
  review,
  onClose,
  saved,
}: {
  productId: string;
  review: any;
  onClose: () => void;
  saved: () => void;
}) {
  const [rating, setRating] = useState(review?.rating || 0),
    [media, setMedia] = useState<Media[]>(review?.media || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<string[]>([]),
    closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      for (const mid of pending.current)
        send("/review-media/" + mid, {}, "DELETE").catch(() => {});
    };
  }, []);
  return (
    <Modal
      title={review ? "แก้ไขรีวิวสินค้า" : "เขียนรีวิวสินค้า"}
      onClose={onClose}
    >
      <Form
        noValidate
        submit="บันทึกรีวิว"
        blocked={busy}
        onCancel={onClose}
        onSubmit={async (f) => {
          const v = formObject(f);
          await send(
            `/products/${productId}/review`,
            {
              rating,
              comment: v.comment,
              mediaIds: media.map((m) => m.id),
              version: review?.version,
            },
            "PUT",
          );
          pending.current = [];
          saved();
        }}
      >
        <fieldset className="review-rating">
          <legend>ให้คะแนนสินค้า (สูงสุด 5 ดาว)</legend>
          <div>
            {[1, 2, 3, 4, 5].map((i) => (
              <label key={i} className={rating >= i ? "selected" : ""}>
                <input
                  type="radio"
                  name="rating"
                  value={i}
                  checked={rating === i}
                  onChange={() => setRating(i)}
                  required
                  aria-label={`${i} ดาว`}
                />
                <Star
                  size={28}
                  fill={rating >= i ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </label>
            ))}
          </div>
        </fieldset>
        <Field
          label="ความคิดเห็น"
          name="comment"
          type="textarea"
          defaultValue={review?.comment || ""}
          required
          maxLength={2000}
          help="แบ่งปันประสบการณ์ใช้สินค้า หากแนบวิดีโอช่วยอธิบายเนื้อหาไว้ด้วย"
        />
        <label className="review-upload-label">
          <ImagePlus size={18} />
          แนบรูปหรือวิดีโอ
          <input
            type="file"
            aria-label="แนบไฟล์รีวิว"
            accept=".png,.jpg,.jpeg,.mp4,.webm"
            multiple
            disabled={busy}
            onChange={async (e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (media.length + files.length > 5) {
                setError("แนบได้สูงสุด 5 ไฟล์");
                return;
              }
              if (
                media.filter((m) => m.mime.startsWith("video/")).length +
                  files.filter((f) => f.type.startsWith("video/")).length >
                1
              ) {
                setError("แนบวิดีโอได้สูงสุด 1 ไฟล์");
                return;
              }
              setBusy(true);
              setError("");
              try {
                for (const file of files) {
                  if (
                    file.size >
                    (file.type.startsWith("video/") ? 50 : 5) * 1024 * 1024
                  )
                    throw Error("รูปไม่เกิน 5 MB วิดีโอไม่เกิน 50 MB");
                  const form = new FormData();
                  form.append("file", file);
                  const m = await api<Media>(
                    `/products/${productId}/review-media`,
                    { method: "POST", body: form },
                  );
                  if (closed.current) {
                    await send("/review-media/" + m.id, {}, "DELETE");
                    break;
                  }
                  pending.current.push(m.id);
                  setMedia((items) => [...items, m]);
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <p className="muted">
          สูงสุด 5 ไฟล์ รวมวิดีโอได้ 1 ไฟล์ · PNG/JPG/JPEG ≤ 5 MB · MP4/WebM ≤
          50 MB และ 60 วินาที
        </p>
        <div role="status">
          {busy ? "กำลังตรวจไฟล์และแปลงวิดีโอ กรุณารอสักครู่…" : ""}
        </div>
        {error && <ErrorBox error={error} />}
        <div className="review-drafts">
          {media.map((m) => (
            <div key={m.id}>
              {m.mime.startsWith("video/") ? (
                <video
                  src={m.url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label="ตัวอย่างวิดีโอรีวิว"
                />
              ) : (
                <img src={m.url} alt="ตัวอย่างรูปรีวิว" />
              )}
              <button
                type="button"
                className="text-button negative"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (pending.current.includes(m.id)) {
                      await send("/review-media/" + m.id, {}, "DELETE");
                      pending.current = pending.current.filter(
                        (id) => id !== m.id,
                      );
                    }
                    setMedia((items) => items.filter((a) => a.id !== m.id));
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                นำไฟล์นี้ออก
              </button>
            </div>
          ))}
        </div>
      </Form>
    </Modal>
  );
}
export function AdminReviewsPage() {
  const list = useListQuery(),
    { data, loading, error, reload } = useData<PageData>(
      "/admin/reviews?" + list.query,
    ),
    [editing, setEditing] = useState<any>(null),
    { notify } = useApp();
  return (
    <>
      <PageHeading
        title="รีวิวสินค้า"
        sub="ตรวจความคิดเห็นและสื่อจากผู้ซื้อจริง ซ่อนหรือเผยแพร่พร้อมเหตุผล"
      />
      <section className="panel">
        <SearchBox value={list.q} onChange={list.setQ} />
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : data?.items.length ? (
          <>
            <Table
              headers={[
                "สินค้า / ผู้รีวิว",
                "คะแนนและความคิดเห็น",
                "สถานะ",
                "จัดการ",
              ]}
            >
              {data.items.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.product_name}</b>
                    <small className="block muted">{r.author}</small>
                  </td>
                  <td>
                    <Stars rating={r.rating} />
                    <p className="review-comment">{r.comment}</p>
                    <ReviewMedia items={r.media} />
                  </td>
                  <td>{r.visible ? "เผยแพร่" : "ซ่อน"}</td>
                  <td>
                    <button
                      className="button secondary small"
                      onClick={() => setEditing(r)}
                    >
                      {r.visible ? "ซ่อนรีวิว" : "เผยแพร่รีวิว"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            <Pagination data={data} onPage={list.setPage} />
          </>
        ) : (
          <Empty title="ยังไม่มีรีวิว" />
        )}
      </section>
      {editing && (
        <Modal
          title={editing.visible ? "ซ่อนรีวิว" : "เผยแพร่รีวิว"}
          onClose={() => setEditing(null)}
        >
          <p>
            สินค้า {editing.product_name} ·
            การซ่อนจะนำรีวิวและสื่อออกจากหน้าร้าน โดยไม่แก้ไขข้อความของลูกค้า
          </p>
          <Form
            noValidate
            submit="ยืนยันสถานะรีวิว"
            onCancel={() => setEditing(null)}
            onSubmit={async (f) => {
              await send(
                "/admin/reviews/" + editing.id,
                {
                  visible: !editing.visible,
                  reason: formObject(f).reason,
                  version: editing.version,
                },
                "PUT",
              );
              setEditing(null);
              reload();
              notify("บันทึกสถานะรีวิวแล้ว");
            }}
          >
            <Field
              label="เหตุผล"
              name="reason"
              required
              minLength={2}
              maxLength={300}
            />
          </Form>
        </Modal>
      )}
    </>
  );
}
