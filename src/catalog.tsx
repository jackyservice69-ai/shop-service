import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import {
  useLocation,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import { ChevronDown, Plus, ShoppingCart } from "lucide-react";
import {
  ApiError,
  money,
  useApp,
  useData,
  type PageData,
  type Product,
} from "./api";
import {
  Badge,
  Empty,
  ErrorBox,
  Field,
  Form,
  Loading,
  Modal,
  PageHeading,
  Pagination,
} from "./ui";
import { ProductReviews, Stars } from "./reviews";
import { ShopInformation } from "./profiles";
import { ProductGallery } from "./product-gallery";
import "./catalog.css";

const MAX_PRICE = 100000000;
const filterKeys = [
  "q",
  "category",
  "minPrice",
  "maxPrice",
  "inStock",
  "sort",
  "page",
];

function baht(value: string) {
  return /^\d+$/.test(value) && Number(value) <= MAX_PRICE
    ? String(Number(value) / 100)
    : value;
}

function priceInput(value: string, path: string) {
  if (!value.trim()) return "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    throw new ApiError("กรุณาตรวจสอบช่วงราคา", 400, [
      { path, message: "ระบุราคาเป็นบาท ตั้งแต่ 0 และทศนิยมไม่เกิน 2 ตำแหน่ง" },
    ]);
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > MAX_PRICE)
    throw new ApiError("กรุณาตรวจสอบช่วงราคา", 400, [
      { path, message: "ระบุราคาไม่เกิน 1,000,000 บาท" },
    ]);
  return String(amount);
}

function imageFallback(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.dataset.fallback) return;
  image.dataset.fallback = "true";
  image.src = "/assets/placeholder.svg";
}

export function CatalogPage() {
  const { publicData, cart, setCart, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const stockId = useId();
  const filterBodyId = useId();
  const filterHeading = useRef<HTMLHeadingElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterBody = useRef<HTMLDivElement>(null);
  const results = useRef<HTMLElement>(null);
  const [mobileFilters, setMobileFilters] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const category = params.get("category") || "";
  const minPrice = params.get("minPrice") || "";
  const maxPrice = params.get("maxPrice") || "";
  const committedInStock = params.get("inStock") === "1";
  const [inStock, setInStock] = useState(committedInStock);
  const [minDraft, setMinDraft] = useState(() => baht(minPrice));
  const [maxDraft, setMaxDraft] = useState(() => baht(maxPrice));
  const committedPrices = useRef({ minPrice, maxPrice });
  const [formVersion, setFormVersion] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const categories: string[] = publicData?.categories || [];
  const activeFilterCount = [
    Boolean(category),
    Boolean(minPrice || maxPrice),
    committedInStock,
    Boolean(params.get("sort") && params.get("sort") !== "newest"),
  ].filter(Boolean).length;
  const query = new URLSearchParams();
  // Forward the full committed state, including invalid links, for server validation.
  for (const key of filterKeys)
    for (const value of params.getAll(key)) query.append(key, value);
  const { data, error, loading, reload } = useData<PageData<Product>>(
    "/products?" + query.toString(),
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    function syncLayout() {
      if (!media.matches && document.activeElement === filterTrigger.current)
        filterHeading.current?.focus();
      // Keep a focused field visible when a desktop window becomes narrow.
      setFiltersOpen(
        media.matches &&
          Boolean(filterBody.current?.contains(document.activeElement)),
      );
      setMobileFilters(media.matches);
    }
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  function toggleFilters() {
    if (filtersOpen) filterTrigger.current?.focus();
    setFiltersOpen((open) => !open);
  }

  function returnToResults() {
    results.current?.focus({ preventScroll: true });
    setFiltersOpen(false);
    results.current?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    setInStock(committedInStock);
  }, [committedInStock, location.key]);

  useEffect(() => {
    const explicitReset = location.state?.resetCatalogFilters === true;
    if (
      explicitReset ||
      navigationType === "POP" ||
      committedPrices.current.minPrice !== minPrice ||
      committedPrices.current.maxPrice !== maxPrice
    ) {
      setMinDraft(baht(minPrice));
      setMaxDraft(baht(maxPrice));
    }
    if (explicitReset || navigationType === "POP")
      setFormVersion((version) => version + 1);
    committedPrices.current = { minPrice, maxPrice };
  }, [minPrice, maxPrice, location.key, navigationType]);

  function commit(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values))
      value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    setParams(next);
  }

  function resetFilters() {
    const next = new URLSearchParams();
    const q = params.get("q");
    if (q) next.set("q", q);
    setMinDraft("");
    setMaxDraft("");
    setInStock(false);
    setFormVersion((version) => version + 1);
    setParams(next);
  }

  const add = (product: Product) => {
    const old = cart.find((item) => item.product.id === product.id);
    if ((old?.quantity || 0) >= product.stock) {
      notify("จำนวนสินค้าในตะกร้าถึงสต็อกที่มีแล้ว");
      return;
    }
    setCart((items) =>
      old
        ? items.map((item) =>
            item.product.id === product.id
              ? { product, quantity: item.quantity + 1 }
              : item,
          )
        : [...items, { product, quantity: 1 }],
    );
    notify("เพิ่ม " + product.name + " ในตะกร้าแล้ว");
  };

  return (
    <div className="catalog-page">
      <PageHeading
        title="เลือกซื้อสินค้า"
        sub="เลือกของที่ชอบ ตามหมวดหมู่และงบของคุณ"
      />
      <div className="catalog-layout">
        <aside
          className="catalog-filters panel"
          aria-labelledby="catalog-filter-heading"
        >
          <div className="catalog-filter-heading">
            <div>
              <h2 id="catalog-filter-heading" ref={filterHeading} tabIndex={-1}>
                กรองสินค้า
              </h2>
              <p className="catalog-filter-count" aria-live="polite">
                {activeFilterCount
                  ? `ใช้ตัวกรอง ${activeFilterCount} รายการ`
                  : "สินค้าทั้งหมด"}
              </p>
            </div>
            <button
              ref={filterTrigger}
              type="button"
              className="button secondary catalog-filter-toggle"
              aria-expanded={filtersOpen}
              aria-controls={filterBodyId}
              onClick={toggleFilters}
            >
              {filtersOpen ? "ซ่อนตัวกรอง" : "แสดงตัวกรอง"}
              <ChevronDown size={18} aria-hidden="true" />
            </button>
          </div>
          <div
            id={filterBodyId}
            ref={filterBody}
            className="catalog-filter-body"
            hidden={mobileFilters && !filtersOpen}
          >
            <button
              type="button"
              className="text-button catalog-filter-reset"
              onClick={resetFilters}
            >
              ล้างตัวกรอง
            </button>
            <Form
              key={formVersion}
              noValidate
              submit="ใช้ช่วงราคา"
              onSubmit={async () => {
                const min = priceInput(minDraft, "minPrice");
                const max = priceInput(maxDraft, "maxPrice");
                if (min && max && Number(min) > Number(max))
                  throw new ApiError("กรุณาตรวจสอบช่วงราคา", 400, [
                    {
                      path: "maxPrice",
                      message: "ราคาสูงสุดต้องไม่น้อยกว่าราคาต่ำสุด",
                    },
                  ]);
                commit({ minPrice: min, maxPrice: max });
              }}
            >
              <Field
                label="หมวดหมู่"
                name="category"
                value={category}
                onChange={(event) => commit({ category: event.target.value })}
              >
                <option value="">สินค้าทั้งหมด</option>
                {category && !categories.includes(category) && (
                  <option value={category}>{category}</option>
                )}
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Field>
              <fieldset className="catalog-price-fields">
                <legend>ช่วงราคา (บาท)</legend>
                <Field
                  label="ราคาต่ำสุด"
                  name="minPrice"
                  type="text"
                  inputMode="decimal"
                  value={minDraft}
                  placeholder="0"
                  onChange={(event) => setMinDraft(event.target.value)}
                />
                <Field
                  label="ราคาสูงสุด"
                  name="maxPrice"
                  type="text"
                  inputMode="decimal"
                  value={maxDraft}
                  placeholder="ไม่จำกัด"
                  help="ทศนิยมได้ไม่เกิน 2 ตำแหน่ง"
                  onChange={(event) => setMaxDraft(event.target.value)}
                />
              </fieldset>
              <label className="catalog-stock-filter" htmlFor={stockId}>
                <input
                  id={stockId}
                  type="checkbox"
                  name="inStock"
                  checked={inStock}
                  onChange={(event) => {
                    setInStock(event.target.checked);
                    commit({ inStock: event.target.checked ? "1" : "" });
                  }}
                />
                เฉพาะสินค้าที่มีในสต็อก
              </label>
              <Field
                label="เรียงสินค้า"
                name="sort"
                value={params.get("sort") || "newest"}
                onChange={(event) => commit({ sort: event.target.value })}
              >
                <option value="newest">มาใหม่ล่าสุด</option>
                <option value="price-asc">ราคา: ต่ำไปสูง</option>
                <option value="price-desc">ราคา: สูงไปต่ำ</option>
                <option value="name">ชื่อสินค้า</option>
              </Field>
            </Form>
            <button
              type="button"
              className="button secondary catalog-return-results"
              onClick={returnToResults}
            >
              ดูรายการสินค้า
            </button>
          </div>
        </aside>
        <section
          ref={results}
          className="catalog-results"
          tabIndex={-1}
          aria-label="รายการสินค้า"
          aria-busy={loading}
        >
          <p
            className="catalog-result-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {loading
              ? "กำลังค้นหาสินค้า…"
              : error
                ? "โหลดรายการสินค้าไม่สำเร็จ"
                : `พบ ${data?.total.toLocaleString("th-TH") || 0} รายการ${params.get("q") ? ` สำหรับ “${params.get("q")}”` : ""}`}
          </p>
          {error ? (
            <ErrorBox error={error} retry={reload} />
          ) : loading ? (
            <Loading />
          ) : data?.items.length ? (
            <>
              <div className="product-grid">
                {data.items.map((product) => (
                  <article className="product-card" key={product.id}>
                    <button
                      type="button"
                      className="product-image"
                      onClick={() => setSelected(product)}
                      aria-label={"ดูรายละเอียด " + product.name}
                    >
                      <img
                        src={product.image}
                        alt={product.name}
                        width="400"
                        height="320"
                        loading="lazy"
                        onError={imageFallback}
                      />
                      <span className="product-tag">{product.category}</span>
                      {!product.stock && (
                        <span className="soldout">สินค้าหมด</span>
                      )}
                    </button>
                    <div className="product-copy">
                      <small>{product.category}</small>
                      <button
                        type="button"
                        className="product-title"
                        onClick={() => setSelected(product)}
                      >
                        {product.name}
                      </button>
                      <p>{product.description}</p>
                      <div className="review-summary">
                        <Stars rating={product.rating_average || 0} />
                        <small>{product.review_count || 0} รีวิว</small>
                      </div>
                      <div className="product-purchase">
                        <strong>{money(product.price)}</strong>
                        <button
                          type="button"
                          className="add-cart"
                          aria-label={"เพิ่ม " + product.name + " ลงตะกร้า"}
                          title={product.stock ? "เพิ่มลงตะกร้า" : "สินค้าหมด"}
                          disabled={!product.stock}
                          onClick={() => add(product)}
                        >
                          <Plus size={19} aria-hidden="true" />
                          <span>เพิ่ม</span>
                        </button>
                      </div>
                      <small className="stock-label">
                        <i
                          className={
                            product.stock ? "available" : "unavailable"
                          }
                        />
                        {product.stock
                          ? "พร้อมหิ้ว · เหลือ " + product.stock + " ชิ้น"
                          : "รอเติมสินค้า"}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                data={data}
                onPage={(page) => {
                  const next = new URLSearchParams(params);
                  next.set("page", String(page));
                  setParams(next);
                }}
              />
            </>
          ) : (
            <Empty
              title="ยังไม่พบสินค้า"
              description="ลองเปลี่ยนคำค้น หมวดหมู่ หรือช่วงราคา"
            >
              <button
                type="button"
                className="button secondary"
                onClick={resetFilters}
              >
                ล้างตัวกรอง
              </button>
            </Empty>
          )}
        </section>
      </div>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <ProductGallery product={selected} />
          <Badge status={selected.category} />
          <p>{selected.description}</p>
          {selected.shop && (
            <ShopInformation key={selected.id} shop={selected.shop} />
          )}
          <h2>{money(selected.price)}</h2>
          <p className="muted">คงเหลือ {selected.stock} ชิ้น</p>
          <button
            type="button"
            className="button primary"
            disabled={!selected.stock}
            onClick={() => {
              add(selected);
              setSelected(null);
            }}
          >
            เพิ่มลงตะกร้า <ShoppingCart size={18} aria-hidden="true" />
          </button>
          <ProductReviews productId={selected.id} onChanged={reload} />
        </Modal>
      )}
    </div>
  );
}
