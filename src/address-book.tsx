import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Plus, Pencil, Trash2 } from "lucide-react";
import { send, useApp, useData } from "./api";
import { useDeviceLocation } from "./use-device-location";
import {
  Field,
  Form,
  Modal,
  Confirm,
  ErrorBox,
  Loading,
  formObject,
  Empty,
  PageHeading,
} from "./ui";

const MapDialog = lazy(() => import("./address-map"));

export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  is_default: number;
  version: number;
};
export type Point = { latitude: number | null; longitude: number | null };
export function MapPicker({
  value,
  onChange,
}: {
  value: Point;
  onChange: (p: Point) => void;
}) {
  const [open, setOpen] = useState(false);
  const { locating, error, locate, cancel } = useDeviceLocation(onChange);
  return (
    <div className="map-picker">
      <div className="map-actions">
        <button
          type="button"
          className="button secondary small"
          onClick={() => {
            cancel();
            setOpen(true);
          }}
        >
          <MapPin size={17} />
          {value.latitude == null ? "ปักหมุดบนแผนที่" : "แก้ไขหมุดบนแผนที่"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={locating}
          onClick={locate}
        >
          <LocateFixed size={16} />
          {locating ? "กำลังหาตำแหน่ง…" : "ใช้ตำแหน่งปัจจุบัน"}
        </button>
      </div>
      <p className="muted">
        หมุดช่วยระบุตำแหน่งจัดส่ง กรุณากรอกที่อยู่และรหัสไปรษณีย์ให้ครบ
      </p>
      <div className="form-grid">
        <Field
          label="ละติจูด"
          name="latitude"
          type="number"
          min={-90}
          max={90}
          step="any"
          value={value.latitude ?? ""}
          onChange={(e) => {
            cancel();
            onChange({
              ...value,
              latitude: e.target.value === "" ? null : Number(e.target.value),
            });
          }}
        />
        <Field
          label="ลองจิจูด"
          name="longitude"
          type="number"
          min={-180}
          max={180}
          step="any"
          value={value.longitude ?? ""}
          onChange={(e) => {
            cancel();
            onChange({
              ...value,
              longitude: e.target.value === "" ? null : Number(e.target.value),
            });
          }}
        />
      </div>
      {value.latitude != null && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            cancel();
            onChange({ latitude: null, longitude: null });
          }}
        >
          ลบหมุด
        </button>
      )}
      {error && <ErrorBox error={error} />}
      {open && (
        <Suspense fallback={<Loading />}>
          <MapDialog
            value={value}
            onSave={(p) => {
              onChange(p);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
export function AddressesPage() {
  return (
    <div className="contained narrow">
      <PageHeading
        title="ที่อยู่และแผนที่"
        sub="บันทึกที่อยู่ ปักหมุดจัดส่ง และเลือกที่อยู่หลักสำหรับสั่งซื้อ"
      />
      <AddressBook />
    </div>
  );
}
export function AddressBook() {
  const { data, loading, error, reload } = useData<{ items: Address[] }>(
      "/addresses",
    ),
    { user, notify } = useApp();
  const [editing, setEditing] = useState<Partial<Address> | null>(null),
    [deleting, setDeleting] = useState<Address | null>(null),
    [point, setPoint] = useState<Point>({ latitude: null, longitude: null });
  const edit = (a: Partial<Address>) => {
    setPoint({ latitude: a.latitude ?? null, longitude: a.longitude ?? null });
    setEditing(a);
  };
  return (
    <section className="panel section-space">
      <div className="panel-title">
        <h2>ที่อยู่จัดส่ง</h2>
        <button
          className="button secondary small"
          type="button"
          onClick={() => edit({ name: user?.name, phone: user?.phone })}
        >
          <Plus size={16} />
          เพิ่มที่อยู่
        </button>
      </div>
      <p className="muted">
        เพิ่มที่อยู่แล้วกด “ปักหมุดบนแผนที่” เพื่อระบุตำแหน่งจัดส่ง
        บันทึกได้สูงสุด 20 ที่อยู่ และเลือกที่อยู่หลักสำหรับการสั่งซื้อ
      </p>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : data?.items.length ? (
        <div className="address-list">
          {data.items.map((a) => (
            <article className="address-card" key={a.id}>
              <div className="panel-title">
                <h3>{a.label}</h3>
                {!!a.is_default && (
                  <span className="badge status-paid">ที่อยู่หลัก</span>
                )}
              </div>
              <strong>{a.name}</strong>
              <p>{a.phone}</p>
              <p className="address-copy">{a.address}</p>
              {a.latitude != null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${a.latitude},${a.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-button"
                >
                  <MapPin size={16} />
                  ดูตำแหน่งจัดส่ง
                </a>
              )}
              <div className="address-actions">
                {!a.is_default && <DefaultAddress address={a} done={reload} />}
                <button className="text-button" onClick={() => edit(a)}>
                  <Pencil size={15} />
                  แก้ไข
                </button>
                <button
                  className="text-button negative"
                  onClick={() => setDeleting(a)}
                >
                  <Trash2 size={15} />
                  ลบ
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="ยังไม่มีที่อยู่จัดส่ง"
          description="เพิ่มที่อยู่แรกเพื่อใช้เป็นที่อยู่หลัก"
        />
      )}
      {editing && (
        <Modal
          title={editing.id ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่"}
          onClose={() => setEditing(null)}
        >
          <Form
            noValidate
            submit="บันทึกที่อยู่"
            onCancel={() => setEditing(null)}
            onSubmit={async (f) => {
              const v = formObject(f);
              await send(
                "/addresses" + (editing.id ? "/" + editing.id : ""),
                {
                  ...v,
                  ...point,
                  isDefault: v.isDefault === "on",
                  version: editing.version,
                },
                editing.id ? "PUT" : "POST",
              );
              setEditing(null);
              reload();
              notify("บันทึกที่อยู่แล้ว");
            }}
          >
            <Field
              label="ชื่อเรียกที่อยู่"
              name="label"
              defaultValue={editing.label}
              required
              maxLength={60}
              placeholder="เช่น บ้าน หรือที่ทำงาน"
            />
            <Field
              label="ชื่อผู้รับ"
              name="name"
              defaultValue={editing.name}
              required
              minLength={2}
              maxLength={100}
              autoComplete="shipping name"
            />
            <Field
              label="เบอร์โทรศัพท์"
              name="phone"
              type="tel"
              defaultValue={editing.phone}
              required
              pattern="0[0-9]{8,9}"
              autoComplete="shipping tel"
            />
            <Field
              label="ที่อยู่และรหัสไปรษณีย์"
              name="address"
              type="textarea"
              defaultValue={editing.address}
              required
              minLength={10}
              maxLength={1000}
              autoComplete="shipping street-address"
            />
            <MapPicker value={point} onChange={setPoint} />
            <label className="checkbox">
              <input
                type="checkbox"
                name="isDefault"
                defaultChecked={!!editing.is_default || !data?.items.length}
              />
              ใช้เป็นที่อยู่หลัก
            </label>
          </Form>
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="ลบที่อยู่นี้?"
          description={`ลบ ${deleting.label} ออกจากสมุดที่อยู่ คำสั่งซื้อเดิมยังเก็บที่อยู่จัดส่งไว้`}
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await send(
              "/addresses/" + deleting.id,
              { version: deleting.version },
              "DELETE",
            );
            reload();
            notify("ลบที่อยู่แล้ว");
          }}
        />
      )}
    </section>
  );
}
function DefaultAddress({
  address,
  done,
}: {
  address: Address;
  done: () => void;
}) {
  return (
    <Form
      noValidate
      submit="ตั้งเป็นที่อยู่หลัก"
      onSubmit={async () => {
        await send(
          "/addresses/" + address.id,
          { ...address, isDefault: true },
          "PUT",
        );
        done();
      }}
    />
  );
}
export function SavedAddressSelect({
  onSelect,
  onDefault,
}: {
  onSelect: (a: Address) => void;
  onDefault: (a: Address) => void;
}) {
  const { data, loading, error, reload } = useData<{ items: Address[] }>(
    "/addresses",
  );
  const [selected, setSelected] = useState("");
  const initialized = useRef(false);
  const selectRef = useRef(onDefault);
  selectRef.current = onDefault;
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    const primary = data.items.find((a) => a.is_default);
    if (primary) {
      setSelected(primary.id);
      selectRef.current(primary);
    }
  }, [data]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <Field
      label="เลือกที่อยู่ที่บันทึกไว้"
      name="savedAddress"
      value={selected}
      onChange={(e) => {
        setSelected(e.target.value);
        const a = data?.items.find((a) => a.id === e.target.value);
        if (a) onSelect(a);
      }}
      help="แก้ไขข้อมูลด้านล่างได้ การแก้ไขครั้งนี้ใช้กับคำสั่งซื้อนี้เท่านั้น"
    >
      <option value="">กรอกที่อยู่อื่น</option>
      {data?.items.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
          {a.is_default ? " · ที่อยู่หลัก" : ""} — {a.name}
        </option>
      ))}
    </Field>
  );
}
