import { useState } from "react";
import type { Product } from "./api";

export function ProductGallery({ product }: { product: Product }) {
  const images = product.images?.length ? product.images : [product.image];
  const [active, setActive] = useState(0);
  const current = images[active] || product.image;
  return (
    <div className="product-gallery">
      <img
        key={current}
        className="detail-image"
        src={current}
        alt={`${product.name} รูปที่ ${active + 1}`}
        onError={(event) => {
          const image = event.currentTarget;
          if (image.dataset.fallback) return;
          image.dataset.fallback = "true";
          image.src = "/assets/placeholder.svg";
        }}
      />
      {images.length > 1 && (
        <div className="product-gallery-thumbnails" aria-label="เลือกรูปสินค้า">
          {images.map((image, index) => (
            <button
              type="button"
              key={image}
              aria-label={`ดูรูปสินค้า ${index + 1}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
            >
              <img src={image} alt="" width={64} height={64} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
