import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fixture, login, mutate } from "./helpers.mjs";

test("product multi-image create/read/update uses first photo and retains legacy clients", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      images = [];
    for (const format of ["png", "jpeg"]) {
      const buffer = await sharp({
        create: {
          width: 64,
          height: 64,
          channels: 3,
          background: format === "png" ? "pink" : "gold",
        },
      })
        [format]()
        .toBuffer();
      const r = await a.agent
        .post("/api/admin/media/product")
        .set("x-csrf-token", a.csrf)
        .attach("image", buffer, {
          filename: "test." + format,
          contentType: "image/" + format,
        });
      assert.equal(r.status, 201);
      images.push(r.body.url);
    }
    const value = {
      name: "รูปสินค้าหลายรูป",
      description: "รายละเอียด",
      category: "หมวดใหม่",
      price: 10000,
      cost: 100,
      stock: 3,
      image: "/assets/placeholder.svg",
      images,
      active: true,
    };
    const created = await mutate(a, "/api/admin/products", value);
    assert.equal(created.status, 201);
    let product = (await a.agent.get("/api/admin/products")).body.items.find(
      (p) => p.id === created.body.id,
    );
    assert.deepEqual(product.images, images);
    assert.equal(product.image, images[0]);
    const publicProduct = (await a.agent.get("/api/products?ids=" + product.id))
      .body.items[0];
    assert.deepEqual(publicProduct.images, images);
    assert.equal(publicProduct.cost, undefined);
    assert.ok(
      (await a.agent.get("/api/admin/product-categories")).body.includes(
        "หมวดใหม่",
      ),
    );
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/products/" + product.id,
          {
            ...value,
            images: [images[1], images[0]],
            version: product.version,
          },
          "put",
        )
      ).status,
      200,
    );
    product = (await a.agent.get("/api/admin/products")).body.items.find(
      (p) => p.id === product.id,
    );
    assert.equal(product.image, images[1]);
    const { images: omit, ...legacy } = value;
    assert.equal(
      (
        await mutate(
          a,
          "/api/admin/products/" + product.id,
          { ...legacy, image: images[0], version: product.version },
          "put",
        )
      ).status,
      200,
    );
    assert.deepEqual(
      (await a.agent.get("/api/products?ids=" + product.id)).body.items[0]
        .images,
      [images[0]],
    );
  } finally {
    f.db.close();
  }
});

test("product image lists reject duplicates, excess, unsafe URLs and wrong media without changing products", async () => {
  const f = fixture();
  try {
    const a = await login(f.app, f.admin),
      value = {
        name: "invalid",
        description: "",
        category: "test",
        price: 100,
        cost: 0,
        stock: 1,
        image: "/assets/bag.svg",
        active: true,
      };
    for (const images of [
      [],
      ["javascript:alert(1)"],
      ["/assets/a.png", "/assets/a.png"],
      Array.from({ length: 9 }, (_, i) => `/assets/${i}.jpg`),
      ["/api/media/" + "a".repeat(32)],
    ])
      assert.equal(
        (await mutate(a, "/api/admin/products", { ...value, images })).status,
        400,
      );
    assert.equal(
      f.db.prepare("SELECT COUNT(*) n FROM products WHERE name='invalid'").get()
        .n,
      0,
    );
    const c = await login(f.app, f.customer);
    assert.equal(
      (await c.agent.get("/api/admin/product-categories")).status,
      403,
    );
  } finally {
    f.db.close();
  }
});
