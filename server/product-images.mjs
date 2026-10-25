import { z } from "zod";
import { checkMedia } from "./experience.mjs";

export const productImageUrl = z
  .string()
  .max(1500)
  .refine(
    (v) =>
      v.startsWith("/assets/") ||
      /^\/api\/media\/[a-f0-9]{32}$/.test(v) ||
      /^https:\/\//.test(v),
    "รูปภาพต้องเป็น HTTPS หรือภาพที่อัปโหลดผ่านระบบ",
  );
export function productDto(row) {
  let images = [];
  try {
    images = JSON.parse(row.images || "[]");
  } catch {}
  return { ...row, images: images.length ? images : [row.image] };
}
export function prepareProductImages(db, value) {
  if (!value.images) value.images = [value.image];
  for (const image of value.images)
    if (image.startsWith("/api/media/")) checkMedia(db, image, "product");
  value.image = value.images[0];
  value.images = JSON.stringify(value.images);
}
