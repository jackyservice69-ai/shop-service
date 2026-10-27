import { fail } from "./commerce.mjs";

export function findPublicShop(db, publicId) {
  if (typeof publicId !== "string" || !/^[a-f0-9]{32}$/.test(publicId))
    fail(404, "ไม่พบร้านนี้หรือร้านยังไม่เปิดให้บริการ");
  const shop = db
    .prepare(
      `SELECT c.public_id,c.user_id,c.shop_name,c.image,c.logo
    FROM consignors c JOIN users u ON u.id=c.user_id
    WHERE c.public_id=? AND c.status='approved' AND u.active=1`,
    )
    .get(publicId);
  if (!shop) fail(404, "ไม่พบร้านนี้หรือร้านยังไม่เปิดให้บริการ");
  return shop;
}

export function attachPublicShops(app, db, { asyncRoute }) {
  app.get(
    "/api/shops/:id",
    asyncRoute((req, res) => {
      const shop = findPublicShop(db, req.params.id);
      const visible =
        "consignor_id=? AND active=1 AND consignment_status='approved'";
      res.json({
        id: shop.public_id,
        name: shop.shop_name,
        image: shop.image,
        logo: shop.logo,
        productCount: db
          .prepare("SELECT COUNT(*) n FROM products WHERE " + visible)
          .get(shop.user_id).n,
        categories: db
          .prepare(
            "SELECT DISTINCT category FROM products WHERE " +
              visible +
              " ORDER BY category",
          )
          .all(shop.user_id)
          .map((r) => r.category),
      });
    }),
  );
}
