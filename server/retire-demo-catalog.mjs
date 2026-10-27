// Only the original main-store seed records qualify. Uploaded photos, renamed
// products and consignor listings must never be removed by this migration.
const originals = [
  ["กระเป๋าสะพาย Everyday mini", "bag"],
  ["รองเท้า Retro everyday", "shoe"],
  ["แก้วเก็บอุณหภูมิ Daily tumbler", "cup"],
  ["หูฟังไร้สาย Pocket sound", "headphone"],
  ["กล้องดิจิทัล Weekend snap", "camera"],
  ["หมวกแก๊ป Little getaway", "cap"],
  ["กระเป๋าผ้า Soft carry", "tote"],
  ["น้ำหอม Sunday mood", "perfume"],
];

export function retireDemoCatalog(db) {
  const deleted = [],
    archived = [];
  for (const [name, asset] of originals) {
    const image = `/assets/${asset}.svg`;
    const rows = db
      .prepare(
        "SELECT id,images,active FROM products WHERE name=? AND image=? AND consignor_id IS NULL",
      )
      .all(name, image);
    for (const row of rows) {
      let images;
      try {
        images = JSON.parse(row.images || "[]");
      } catch {
        continue;
      }
      if (!Array.isArray(images) || images.some((value) => value !== image))
        continue;
      const referenced = db
        .prepare(
          `SELECT
        EXISTS(SELECT 1 FROM order_items WHERE product_id=?) OR
        EXISTS(SELECT 1 FROM consignment_sales WHERE product_id=?) OR
        EXISTS(SELECT 1 FROM reviews WHERE product_id=?) OR
        EXISTS(SELECT 1 FROM review_media WHERE product_id=?) AS found`,
        )
        .get(row.id, row.id, row.id, row.id).found;
      if (referenced) {
        if (row.active)
          db.prepare(
            "UPDATE products SET active=0,version=version+1 WHERE id=?",
          ).run(row.id);
        archived.push(row.id);
      } else {
        db.prepare("DELETE FROM products WHERE id=?").run(row.id);
        deleted.push(row.id);
      }
    }
  }
  return { deleted, archived };
}
