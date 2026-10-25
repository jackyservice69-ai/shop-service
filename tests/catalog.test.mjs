import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { fixture } from "./helpers.mjs";

function catalogFixture(t) {
  const f = fixture();
  t.after(() => f.db.close());
  f.db.prepare("UPDATE products SET active=0").run();
  const insert = f.db.prepare(
    "INSERT INTO products(id,name,description,category,price,cost,stock,image,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  );
  for (let i = 0; i < 48; i++)
    insert.run(
      `catalog-${String(i).padStart(2, "0")}`,
      `Catalog ${String(47 - i).padStart(2, "0")}`,
      "Real fixture product",
      i % 2 ? "น้ำหอม" : "กระเป๋า",
      1000 + i * 100,
      777,
      i % 3 ? 5 : 0,
      "/assets/bag.svg",
      1,
      "2026-10-01T00:00:00.000Z",
    );
  insert.run(
    "catalog-hidden",
    "Catalog hidden",
    "Private",
    "กระเป๋า",
    1500,
    999,
    10,
    "/assets/bag.svg",
    0,
    "2026-10-24T00:00:00.000Z",
  );
  return f;
}

test("catalog filters the complete dataset before pagination and reports matching totals", async (t) => {
  const f = catalogFixture(t);
  const filters =
    "q=Catalog&category=" +
    encodeURIComponent("กระเป๋า") +
    "&minPrice=1000&maxPrice=5700&inStock=1&sort=price-desc";
  const first = await request(f.app).get("/api/products?" + filters);
  assert.equal(first.status, 200);
  assert.equal(first.body.total, 16);
  assert.equal(first.body.size, 12);
  assert.equal(first.body.page, 1);
  assert.deepEqual(
    first.body.items.map((p) => p.id),
    [46, 44, 40, 38, 34, 32, 28, 26, 22, 20, 16, 14].map((i) => `catalog-${i}`),
  );
  const second = await request(f.app).get(
    "/api/products?" + filters + "&page=2",
  );
  assert.equal(second.status, 200);
  assert.equal(second.body.total, 16);
  assert.equal(second.body.page, 2);
  assert.deepEqual(
    second.body.items.map((p) => p.id),
    ["catalog-10", "catalog-08", "catalog-04", "catalog-02"],
  );
  const clamped = await request(f.app).get(
    "/api/products?" + filters + "&page=99",
  );
  assert.equal(clamped.body.page, 2);
  const bounded = await request(f.app).get(
    "/api/products?minPrice=1200&maxPrice=1200",
  );
  assert.deepEqual(
    bounded.body.items.map((p) => p.id),
    ["catalog-02"],
  );
});

test("catalog supports whitelisted stable sorting and preserves the default public contract", async (t) => {
  const f = catalogFixture(t);
  const expected = {
    newest: ["catalog-00", "catalog-01", "catalog-02"],
    "price-asc": ["catalog-00", "catalog-01", "catalog-02"],
    "price-desc": ["catalog-47", "catalog-46", "catalog-45"],
    name: ["catalog-47", "catalog-46", "catalog-45"],
  };
  for (const [sort, ids] of Object.entries(expected)) {
    const response = await request(f.app)
      .get("/api/products")
      .query({ sort, size: 3 });
    assert.equal(response.status, 200);
    assert.equal(response.body.total, 48);
    assert.deepEqual(
      response.body.items.map((p) => p.id),
      ids,
    );
  }
  f.db
    .prepare(
      "UPDATE products SET price=1000,name='Equal' WHERE id IN ('catalog-01','catalog-02')",
    )
    .run();
  for (const sort of ["price-asc", "name"]) {
    const response = await request(f.app)
      .get("/api/products")
      .query({ ids: "catalog-02,catalog-01", sort });
    assert.deepEqual(
      response.body.items.map((p) => p.id),
      ["catalog-01", "catalog-02"],
    );
  }
  const normal = await request(f.app).get("/api/products");
  assert.equal(normal.status, 200);
  assert.deepEqual(Object.keys(normal.body).sort(), [
    "items",
    "page",
    "size",
    "total",
  ]);
  assert.equal(normal.body.items.length, 12);
  assert.ok(
    normal.body.items.every(
      (p) =>
        !["cost", "active", "version", "seller_id"].some((key) => key in p),
    ),
  );
  assert.deepEqual(
    Object.keys(normal.body.items[0]).sort(),
    [
      "id",
      "name",
      "description",
      "category",
      "price",
      "stock",
      "image",
      "images",
      "created_at",
      "rating_average",
      "review_count",
    ].sort(),
  );
});

test("cart ids hydration, inactive exclusion, zero/empty filters and unknown categories remain safe", async (t) => {
  const f = catalogFixture(t);
  const hydration = await request(f.app)
    .get("/api/products")
    .query({ ids: `catalog-47,catalog-02,catalog-hidden,${f.product.id}` });
  assert.equal(hydration.status, 200);
  assert.equal(hydration.body.total, 2);
  assert.deepEqual(
    hydration.body.items.map((p) => p.id),
    ["catalog-02", "catalog-47"],
  );
  for (const query of [
    "",
    "minPrice=&maxPrice=&inStock=&sort=",
    "minPrice=0&maxPrice=100000000&inStock=0",
  ]) {
    const result = await request(f.app).get("/api/products?" + query);
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 48);
  }
  for (const category of ["unknown", "' OR 1=1 --"]) {
    const result = await request(f.app)
      .get("/api/products")
      .query({ category });
    assert.equal(result.status, 200);
    assert.equal(result.body.total, 0);
    assert.deepEqual(result.body.items, []);
  }
  const zero = await request(f.app).get("/api/products?maxPrice=0");
  assert.equal(zero.status, 200);
  assert.equal(zero.body.total, 0);
});

test("catalog rejects malformed, unsafe, repeated and array filter inputs with 400", async (t) => {
  const f = catalogFixture(t);
  const invalid = [
    "-1",
    "1.5",
    "Infinity",
    "NaN",
    "1e3",
    "0x10",
    "100000001",
    "9007199254740992",
    "abc",
    " ",
    "1 OR 1=1",
  ];
  const queries = invalid.flatMap((value) => [
    "minPrice=" + encodeURIComponent(value),
    "maxPrice=" + encodeURIComponent(value),
  ]);
  queries.push(
    "minPrice=2&maxPrice=1",
    "minPrice=1&minPrice=2",
    "maxPrice=1&maxPrice=1",
    "minPrice[]=1",
    "maxPrice[range]=1",
    "inStock=2",
    "inStock=true",
    "inStock=-1",
    "inStock=1&inStock=0",
    "inStock[]=1",
    "sort=price",
    "sort=__proto__",
    "sort=constructor",
    "sort=price-asc%3BDROP%20TABLE%20products",
    "sort=name&sort=newest",
    "sort[]=name",
    "category=a&category=b",
    "category[]=a",
  );
  for (const query of queries) {
    const response = await request(f.app).get("/api/products?" + query);
    assert.equal(response.status, 400, query);
    assert.equal(typeof response.body.error, "string");
    assert.equal(response.body.items, undefined);
  }
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM products WHERE active=1").get().n,
    48,
  );
});
