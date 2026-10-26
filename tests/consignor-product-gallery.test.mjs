import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import sharp from "sharp";
import { fixture, login, mutate, addProduct, addUser } from "./helpers.mjs";
import { id, now } from "../server/db.mjs";

function shop(db, user, status = "approved") {
  db.prepare(
    "INSERT INTO consignors(user_id,shop_name,status,created_at,updated_at) VALUES(?,?,?,?,?)",
  ).run(user.id, "ร้านชุดรูป", status, now(), now());
}
const productInput = (images) => ({
  name: "สินค้าหลายรูป",
  description: "รายละเอียดตัวแทน",
  category: "หมวดใหม่ของตัวแทน",
  price: 25000,
  stock: 3,
  image: images[0],
  images,
});
async function upload(client, color = "pink") {
  const bytes = await sharp({
    create: { width: 128, height: 128, channels: 3, background: color },
  })
    .png()
    .toBuffer();
  const result = await client.agent
    .post("/api/consignment/media")
    .set("x-csrf-token", client.csrf)
    .attach("image", bytes, {
      filename: "product.png",
      contentType: "image/png",
    });
  assert.equal(result.status, 201);
  return result.body.url;
}

test("seller gallery is saved, reviewed and published in order; edits re-enter approval and legacy updates preserve galleries", async () => {
  const f = fixture();
  try {
    shop(f.db, f.customer);
    const c = await login(f.app, f.customer),
      admin = await login(f.app, f.admin);
    const images = [await upload(c), await upload(c, "gold")],
      body = productInput(images);
    assert.equal(
      (await mutate(c, "/api/consignment/products", body)).status,
      201,
    );
    let row = (await c.agent.get("/api/consignment/products")).body.items[0];
    assert.deepEqual(row.images, images);
    assert.equal(row.image, images[0]);
    assert.equal(row.active, 0);
    assert.equal(row.consignment_status, "pending");
    assert.deepEqual(
      (
        await admin.agent.get("/api/admin/consignment-products")
      ).body.items.find((p) => p.id === row.id).images,
      images,
    );
    assert.equal(
      (await request(f.app).get("/api/products?ids=" + row.id)).body.items
        .length,
      0,
    );
    assert.equal(
      (
        await mutate(
          admin,
          "/api/admin/consignment-products/" + row.id,
          { approved: true, version: row.version },
          "put",
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await request(f.app).get("/api/products?ids=" + row.id)).body.items[0]
        .images,
      images,
    );
    row = (await c.agent.get("/api/consignment/products")).body.items[0];
    const reordered = [images[1], images[0]];
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + row.id,
          {
            ...body,
            image: reordered[0],
            images: reordered,
            version: row.version,
          },
          "put",
        )
      ).status,
      200,
    );
    let updated = (await c.agent.get("/api/consignment/products")).body
      .items[0];
    assert.deepEqual(updated.images, reordered);
    assert.equal(updated.image, reordered[0]);
    assert.equal(updated.active, 0);
    assert.equal(
      (await request(f.app).get("/api/products?ids=" + row.id)).body.items
        .length,
      0,
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + row.id,
          { ...body, version: row.version },
          "put",
        )
      ).status,
      409,
    );
    const legacy = { ...body, image: reordered[0], version: updated.version };
    delete legacy.images;
    assert.equal(
      (await mutate(c, "/api/consignment/products/" + row.id, legacy, "put"))
        .status,
      200,
    );
    updated = (await c.agent.get("/api/consignment/products")).body.items[0];
    assert.deepEqual(updated.images, reordered);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + row.id,
          { ...body, images: [images[0]], version: updated.version },
          "put",
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await c.agent.get("/api/consignment/products")).body.items[0].images,
      [images[0]],
    );
  } finally {
    f.db.close();
  }
});

test("each gallery entry is owned product media; limits, primary consistency, authentication and approval protect writes", async () => {
  const f = fixture();
  try {
    shop(f.db, f.customer);
    shop(f.db, f.other);
    const c = await login(f.app, f.customer),
      other = await login(f.app, f.other);
    const mine = await upload(c),
      theirs = await upload(other),
      body = productInput([mine]);
    assert.equal(
      (await request(f.app).post("/api/consignment/products").send(body))
        .status,
      401,
    );
    assert.equal(
      (await c.agent.post("/api/consignment/products").send(body)).status,
      403,
    );
    for (const images of [
      [],
      [mine, mine],
      [mine, theirs],
      [mine, "/assets/bag.svg"],
      [mine, "https://other.test/photo.jpg"],
      Array.from({ length: 9 }, () => "/api/media/" + id()),
    ])
      assert.equal(
        (await mutate(c, "/api/consignment/products", { ...body, images }))
          .status,
        400,
      );
    assert.equal(
      (await mutate(c, "/api/consignment/products", { ...body, image: theirs }))
        .status,
      400,
    );
    const wrongId = id();
    f.db
      .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)")
      .run(
        wrongId,
        "shop",
        "image/png",
        128,
        128,
        1,
        Buffer.from("x"),
        f.customer.id,
        now(),
      );
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products",
          productInput([mine, "/api/media/" + wrongId]),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(c, "/api/consignment/products", {
          ...body,
          category: "__new_category__",
        })
      ).status,
      400,
    );
    const eight = [mine];
    for (let n = 0; n < 7; n++) {
      const mid = id();
      f.db
        .prepare("INSERT INTO media VALUES(?,?,?,?,?,?,?,?,?)")
        .run(
          mid,
          "product",
          "image/png",
          128,
          128,
          1,
          Buffer.from("x"),
          f.customer.id,
          now(),
        );
      eight.push("/api/media/" + mid);
    }
    assert.equal(
      (await mutate(c, "/api/consignment/products", productInput(eight)))
        .status,
      201,
    );
    const row = (await c.agent.get("/api/consignment/products")).body.items[0];
    assert.equal(row.images.length, 8);
    f.db
      .prepare("UPDATE products SET images=? WHERE id=?")
      .run(JSON.stringify([mine, theirs]), row.id);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + row.id,
          { ...body, images: [mine, theirs], version: row.version },
          "put",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await mutate(c, "/api/consignment/products", {
          ...body,
          images: [mine, theirs],
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await mutate(
          other,
          "/api/consignment/products/" + row.id,
          { ...body, version: row.version },
          "put",
        )
      ).status,
      404,
    );
    f.db
      .prepare("UPDATE consignors SET status='suspended' WHERE user_id=?")
      .run(f.customer.id);
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + row.id,
          { ...body, version: row.version },
          "put",
        )
      ).status,
      403,
    );
  } finally {
    f.db.close();
  }
});

test("category dropdown endpoint exposes public and own draft categories without requiring admin access or leaking another shop's drafts", async () => {
  const f = fixture();
  try {
    shop(f.db, f.customer);
    shop(f.db, f.other);
    const c = await login(f.app, f.customer),
      draft = addProduct(f.db),
      secret = addProduct(f.db);
    f.db
      .prepare(
        "UPDATE products SET active=0,consignor_id=?,category=? WHERE id=?",
      )
      .run(f.customer.id, "หมวดของฉันรออนุมัติ", draft.id);
    f.db
      .prepare(
        "UPDATE products SET active=0,consignor_id=?,category=? WHERE id=?",
      )
      .run(f.other.id, "หมวดส่วนตัวร้านอื่น", secret.id);
    assert.equal(
      (await request(f.app).get("/api/consignment/product-categories")).status,
      401,
    );
    assert.equal(
      (await c.agent.get("/api/admin/product-categories")).status,
      403,
    );
    const categories = await c.agent.get("/api/consignment/product-categories");
    assert.equal(categories.status, 200);
    assert.ok(categories.body.includes(f.product.category));
    assert.ok(categories.body.includes("หมวดของฉันรออนุมัติ"));
    assert.ok(!categories.body.includes("หมวดส่วนตัวร้านอื่น"));
    const pending = addUser(f.db);
    shop(f.db, pending, "pending");
    assert.equal(
      (
        await (
          await login(f.app, pending)
        ).agent.get("/api/consignment/product-categories")
      ).status,
      403,
    );
  } finally {
    f.db.close();
  }
});

test("gallery edits roll back with product status when audit persistence fails", async () => {
  const f = fixture();
  try {
    shop(f.db, f.customer);
    const c = await login(f.app, f.customer),
      mine = await upload(c),
      second = await upload(c, "gold"),
      body = productInput([mine]);
    assert.equal(
      (await mutate(c, "/api/consignment/products", body)).status,
      201,
    );
    const row = f.db
      .prepare("SELECT * FROM products WHERE consignor_id=?")
      .get(f.customer.id);
    f.db.exec(
      "CREATE TRIGGER reject_gallery_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;",
    );
    assert.equal(
      (
        await mutate(
          c,
          "/api/consignment/products/" + row.id,
          {
            ...body,
            image: second,
            images: [second, mine],
            version: row.version,
          },
          "put",
        )
      ).status,
      500,
    );
    assert.deepEqual(
      f.db.prepare("SELECT * FROM products WHERE id=?").get(row.id),
      row,
    );
  } finally {
    f.db.close();
  }
});
