import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  X,
  LoaderCircle,
  Search,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ApiError, useApp, type PageData } from "./api";
import walletLogo from "../shared/wallet-logo.json";
export function Brand({
  variant = "default",
}: {
  variant?: "default" | "wallet" | "marble";
}) {
  const { publicData } = useApp();
  const logo =
    (variant === "wallet" || variant === "marble") &&
    publicData?.logo === walletLogo.source
      ? walletLogo.image
      : publicData?.logo;
  if (logo)
    return (
      <span className="brand custom-brand">
        <img src={logo} alt={publicData.shopName} width="264" height="99" />
      </span>
    );
  return (
    <span className="brand">
      <span className="brand-mark">
        <span />
      </span>
      <span>
        Iya หิ้ว<span className="brand-en">Iya hiew</span>
      </span>
    </span>
  );
}
export function PageHeading({
  title,
  sub,
  children,
  level = 1,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 2 ? "h2" : "h1";
  return (
    <div className="page-heading">
      <div>
        <Heading>{title}</Heading>
        {sub && <p>{sub}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={22} className="spin" /> กำลังโหลดข้อมูล…
    </div>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <span>{error}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          ลองอีกครั้ง
        </button>
      )}
    </div>
  );
}
export function Empty({
  title = "ยังไม่มีรายการ",
  description = "รายการใหม่จะแสดงที่นี่",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={36} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Badge({ status, label }: { status: string; label?: string }) {
  const labels: Record<string, string> = {
    reserved: "รอชำระส่วนที่เหลือ",
    paid: "ชำระแล้ว",
    processing: "กำลังเตรียมสินค้า",
    shipped: "จัดส่งแล้ว",
    completed: "สำเร็จ",
    cancelled: "ยกเลิก",
    topup: "เติมเงิน",
    admin_topup: "เติมเงินโดยผู้ดูแล",
    purchase: "ซื้อสินค้า",
    settlement: "ชำระส่วนที่เหลือ",
    refund: "คืนเงิน",
    commission: "ค่าคอมมิชชั่น",
    consignment: "รายรับฝากขาย",
    credited: "จ่ายแล้ว",
    void: "ยกเลิกสิทธิ์",
    income: "รายรับ",
    expense: "รายจ่าย",
    pending: "รอดำเนินการ",
    retry: "รอลองใหม่",
    failed: "ล้มเหลว",
    done: "ตอบแล้ว",
  };
  return (
    <span className={"badge status-" + status}>
      {label || labels[status] || status}
    </span>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
  tone = "pink",
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className="stat">
      <div>
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      <span className={"stat-icon " + tone}>{icon}</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const d = ref.current;
    const cancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d?.addEventListener("cancel", cancel);
    return () => {
      d?.removeEventListener("cancel", cancel);
      d?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "modal wide" : "modal"}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="ปิดหน้าต่าง"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onClose,
  danger = false,
  blocked = false,
}: {
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  danger?: boolean;
  blocked?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-copy">{description}</p>
      <Form
        noValidate
        onSubmit={async () => {
          await onConfirm();
          onClose();
        }}
        submit={title}
        danger={danger}
        onCancel={onClose}
      />
    </Modal>
  );
}
type FieldProps = {
  label: string;
  name: string;
  type?: string;
  value?: any;
  onChange?: (e: any) => void;
  children?: ReactNode;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  minLength?: number;
  maxLength?: number;
  step?: string | number;
  placeholder?: string;
  help?: string;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "text" | "numeric" | "decimal";
  spellCheck?: boolean;
  autoCapitalize?: string;
  disabled?: boolean;
  readOnly?: boolean;
  defaultValue?: any;
  accept?: string;
  pattern?: string;
};
const FormErrors = createContext<{ path: string; message: string }[]>([]);
export function Field({ label, children, help, ...props }: FieldProps) {
  const fieldId = useId(),
    errors = useContext(FormErrors),
    error = errors.find(
      (e) => e.path === props.name || e.path.split(".").at(-1) === props.name,
    );
  const common = {
    id: fieldId,
    "aria-invalid": error ? true : undefined,
    "aria-describedby":
      [help ? fieldId + "-help" : "", error ? fieldId + "-error" : ""]
        .filter(Boolean)
        .join(" ") || undefined,
    ...props,
  };
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      {props.type === "textarea" ? (
        <textarea {...common} rows={3} className="resize-none" />
      ) : children ? (
        <select {...common}>{children}</select>
      ) : (
        <input {...common} />
      )}
      {help && <small id={fieldId + "-help"}>{help}</small>}
      {error && (
        <small id={fieldId + "-error"} className="negative">
          {error.message}
        </small>
      )}
    </div>
  );
}
export function Form({
  children,
  onSubmit,
  submit = "บันทึก",
  onCancel,
  danger = false,
  blocked = false,
}: {
  noValidate?: true;
  children?: ReactNode;
  onSubmit: (form: HTMLFormElement) => Promise<void>;
  submit?: string;
  onCancel?: () => void;
  danger?: boolean;
  blocked?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fields, setFields] = useState<{ path: string; message: string }[]>([]);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || blocked) return;
    const f = e.currentTarget;
    if (!f.checkValidity()) {
      const invalid = Array.from(f.elements).filter(
        (c: any) => c.willValidate && !c.validity.valid,
      ) as HTMLInputElement[];
      setFields(
        invalid.map((c) => ({
          path: c.name,
          message: c.validity.valueMissing
            ? "กรุณากรอกช่องนี้"
            : c.validity.typeMismatch
              ? "รูปแบบข้อมูลไม่ถูกต้อง"
              : c.validity.tooShort
                ? "กรุณาระบุข้อมูลให้ครบตามจำนวนตัวอักษร"
                : c.validity.patternMismatch
                  ? "รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"
                  : "กรุณาตรวจสอบค่าหรือช่วงที่กำหนด",
        })),
      );
      setError("กรุณาตรวจสอบข้อมูลที่ระบุ");
      invalid[0]?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setFields([]);
    try {
      await onSubmit(f);
    } catch (e) {
      const er = e as ApiError;
      setError(er.message);
      setFields(er.fields || []);
      const path = er.fields?.[0]?.path || "",
        target = (f.elements.namedItem(path) ||
          f.elements.namedItem(path.split(".").at(-1) || "")) as HTMLElement;
      target?.focus();
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormErrors.Provider value={fields}>
      <form noValidate onSubmit={handle} aria-busy={busy}>
        {children}
        {error && <ErrorBox error={error} />}
        <div className="form-actions">
          {onCancel && (
            <button
              type="button"
              className="button secondary"
              onClick={onCancel}
              disabled={busy || blocked}
            >
              ยกเลิก
            </button>
          )}
          <button
            className={"button " + (danger ? "danger" : "primary")}
            disabled={busy || blocked}
            type="submit"
          >
            <span className={busy ? "button-label hidden" : "button-label"}>
              {submit}
            </span>
            {busy && <LoaderCircle size={18} className="spin button-spinner" />}
          </button>
        </div>
      </form>
    </FormErrors.Provider>
  );
}
export const formObject = (form: HTMLFormElement) =>
  Object.fromEntries(new FormData(form));
export const cents = (value: any) => Math.round(Number(value) * 100);
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Pagination({
  data,
  onPage,
}: {
  data: PageData;
  onPage: (p: number) => void;
}) {
  const max = Math.max(1, Math.ceil(data.total / data.size));
  return (
    <div className="pagination">
      <small>
        {data.total
          ? `${(data.page - 1) * data.size + 1}–${Math.min(data.page * data.size, data.total)} จาก ${data.total} รายการ`
          : "0 รายการ"}
      </small>
      <div>
        <button
          className="icon-button"
          aria-label="หน้าก่อนหน้า"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {data.page} / {max}
        </span>
        <button
          className="icon-button"
          aria-label="หน้าถัดไป"
          disabled={data.page >= max}
          onClick={() => onPage(data.page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
export function useListQuery() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const q = params.get("q") || "";
  function setPage(n: number) {
    const p = new URLSearchParams(params);
    p.set("page", String(n));
    setParams(p, { replace: true });
  }
  function setQ(s: string) {
    const p = new URLSearchParams(params);
    if (s) p.set("q", s);
    else p.delete("q");
    p.delete("page");
    setParams(p, { replace: true });
  }
  return {
    page,
    q,
    setPage,
    setQ,
    query: `page=${page}&q=${encodeURIComponent(q)}`,
  };
}
export function SearchBox({
  value,
  onChange,
  placeholder = "ค้นหารายการ…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={18} />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
