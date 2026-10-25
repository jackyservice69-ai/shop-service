import { useState } from "react";
import { api, useData } from "./api";
import { ErrorBox, Field } from "./ui";

export const defaultCategories = [
  "กระเป๋า",
  "น้ำหอม",
  "เครื่องประดับ",
  "เสื้อผ้า",
  "เครื่องสำอาง",
  "สกินแคร์",
  "บิวตี้",
  "รองเท้า",
  "นาฬิกา",
  "แว่นตา",
  "ของใช้ในบ้าน",
  "อุปกรณ์ไอที",
  "แก็ดเจ็ต",
  "ของสะสม",
];

export function ProductCategoryField({ value }: { value?: string }) {
  const { data, error, reload } = useData<string[]>(
    "/admin/product-categories",
  );
  const [selected, setSelected] = useState(value || defaultCategories[0]);
  const options = [
    ...new Set([
      ...defaultCategories,
      ...(data || []),
      ...(value ? [value] : []),
    ]),
  ];
  return (
    <div>
      <Field
        label="หมวดหมู่"
        name="category"
        required
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value="__new_category__">＋ เพิ่มหมวดหมู่ใหม่</option>
      </Field>
      {selected === "__new_category__" && (
        <Field
          label="ชื่อหมวดหมู่ใหม่"
          name="newCategory"
          required
          maxLength={200}
          placeholder="เช่น อุปกรณ์เดินทาง"
          help="หมวดหมู่ใหม่จะถูกเพิ่มเมื่อบันทึกสินค้า"
        />
      )}
      {error && <ErrorBox error={error} retry={reload} />}
    </div>
  );
}

export function ProductImages({
  images,
  onChange,
  onBusyChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <fieldset className="product-images-editor" disabled={busy}>
      <legend>รูปภาพสินค้า ({images.length}/8)</legend>
      <p className="muted">
        .png / .jpeg / .jpg · ไม่เกิน 5 MB ต่อรูป · สูงสุด 8 รูป · แนะนำ 1200 ×
        1200 px
      </p>
      <Field
        label="เพิ่มรูปภาพสินค้า"
        name="productFiles"
        type="file"
        accept=".png,.jpeg,.jpg,image/png,image/jpeg"
        multiple
        disabled={busy || images.length >= 8}
        onChange={async (e) => {
          const input = e.currentTarget as HTMLInputElement,
            files = Array.from(input.files || []);
          if (!files.length) return;
          if (files.length + images.length > 8) {
            setErrors(["เพิ่มได้สูงสุด 8 รูป กรุณาลดจำนวนไฟล์"]);
            input.value = "";
            return;
          }
          setBusy(true);
          onBusyChange(true);
          setErrors([]);
          const next = [...images],
            failures: string[] = [];
          try {
            for (const [index, file] of files.entries()) {
              setProgress(
                `กำลังอัปโหลด ${index + 1}/${files.length}: ${file.name}`,
              );
              try {
                if (
                  !/\.(png|jpe?g)$/i.test(file.name) ||
                  !["image/png", "image/jpeg"].includes(file.type)
                )
                  throw new Error("รองรับ PNG/JPEG/JPG เท่านั้น");
                if (!file.size || file.size > 5 * 1024 * 1024)
                  throw new Error("ไฟล์ต้องมีขนาด 1 ไบต์–5 MB");
                const body = new FormData();
                body.append("image", file);
                const result = await api("/admin/media/product", {
                  method: "POST",
                  body,
                });
                next.push(result.url);
                onChange([...next]);
              } catch (error) {
                failures.push(file.name + ": " + (error as Error).message);
              }
            }
          } finally {
            setErrors(failures);
            setProgress(
              failures.length
                ? "รูปที่สำเร็จยังอยู่ เลือกไฟล์ที่ไม่สำเร็จเพื่อลองใหม่ได้"
                : "อัปโหลดเรียบร้อยแล้ว",
            );
            setBusy(false);
            onBusyChange(false);
            input.value = "";
          }
        }}
      />
      <p role="status" aria-live="polite">
        {progress}
      </p>
      {errors.length > 0 && <ErrorBox error={errors.join(" · ")} />}
      <div className="product-images-grid">
        {images.map((image, index) => (
          <div key={image} className="product-image-item">
            <img
              src={image}
              alt={`รูปสินค้า ${index + 1}`}
              width={120}
              height={120}
            />
            <span>{index === 0 ? "รูปหลัก" : `รูปที่ ${index + 1}`}</span>
            {index > 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onChange([image, ...images.filter((v) => v !== image)])
                }
              >
                ใช้เป็นรูปหลัก
              </button>
            )}
            <button
              type="button"
              className="text-button"
              aria-label={`ลบรูปสินค้า ${index + 1}`}
              onClick={() => onChange(images.filter((v) => v !== image))}
            >
              ลบรูปสินค้า {index + 1}
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
