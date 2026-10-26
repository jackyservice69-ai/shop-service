# Beauty and gadgets browse photos v8 — local

Generated with built-in Imagegen on 26 October 2026. User reference: 2140.jpg. The existing `category-photos-hd-v2.webp` atlas supplied the style reference: warm photorealistic product photography in blush pink, cream and champagne gold. This replaces only the beauty/gadget pictures in “หมวดหมู่ที่น่าช้อป”. The four other photos and the illustrated quick-category strip retain their original assets.

- Beauty: gold-rimmed vanity mirror, pink makeup brush and lipstick on pink marble/cream satin.
- Gadgets: blush-pink over-ear headphones and an ivory/pink portable speaker on a cream marble surface.
- No text, fake labels, buttons or circular illustration backdrops are baked into either photo.

Source PNG masters: 1402×1122, copied into `output/imagegen/browse-photos-v8/beauty.png` and `gadgets.png`. Original tool outputs remain in the generated-images directory. Sharp performs only a very small center crop to match the existing 99:80 tile, resize and WebP encoding at quality 91.

Web assets: `public/assets/storefront/browse-beauty-photo-v8.webp` and `browse-gadgets-photo-v8.webp` (800×646), plus `browse-beauty-photo-small-v8.webp` and `browse-gadgets-photo-small-v8.webp` (400×323). Scoped browse-card CSS provides a normal URL fallback and 1x/2x image-set; image clipping/radius belongs to the existing HTML card.

Exact prompts: `BROWSE-PHOTOS-V8-PROMPTS.json`. No old image is overwritten. Category labels, aliases and product-filter destinations remain intact. Verification uses the existing home/browse regression scenario plus local mobile/desktop captures. This work does not push or deploy.
