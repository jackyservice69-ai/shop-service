# Storefront image enhancement v2

The owner authorized new Imagegen edits on 25 October 2026 after the reference-crop deployment. Built-in image_gen was used in edit mode, one call per original asset. This is faithful AI reconstruction from small references; it is not recovery of the original high-resolution pixels. No external API key or CLI image-generation path was used.

The published v1 reference files are preserved. New files stay local until a separate production update is requested. The layout, real CTA links, shop settings and catalog data are unchanged.

## Saved deliverables

| Section | Main WebP | Dimensions |
|---|---|---|
| Hero | public/assets/storefront/hero-hd-v2.webp | 1376 × 1143 |
| Promotion | public/assets/storefront/promotion-hd-v2.webp | 1788 × 564 |
| Category icons | public/assets/storefront/categories-hd-v2.webp | 2048 × 512; four 512 px cells |
| Category photos | public/assets/storefront/category-photos-hd-v2.webp | 2048 × 414; four 512 px cells |
| Contact | public/assets/storefront/contact-hd-v2.webp | 2169 × 348 |

Smaller siblings use `-hd-small-v2.webp`. Hero, promotion and contact use native `srcset`/`sizes`; atlas backgrounds use a WebP fallback and `image-set` at 1x/2x. Hero retains high fetch priority; below-fold banners remain lazy. PNG masters are copied to output/image-enhancement/masters/ locally, with generated originals retained in the Codex image directory.

Sharp removes blank generated padding and assembles the two generated 2×2 grids into the existing four-column sprite order. This is delivery processing, not a new composition. No CSS shadows or purple UI colors are added.

## Final prompt set

### hero

Edit target: `public/assets/storefront/reference-hero.webp`

```text
Edit target: the attached existing storefront hero. This is a faithful high-resolution restoration, not a redesign. Reconstruct the SAME pink pastel Thai shopping banner with the exact same composition, same soft pink/cream/mint background, hearts, clouds, tiny crown, kraft parcel on lower right, pink handbag, perfume, heart shirt and existing handwritten parcel label. Increase clarity of the linework, object edges and type; remove JPEG blur and artifacts. Preserve the full original canvas ratio 455:378, all placements and proportions. Output at least 1800 px wide if possible.
Exact existing Thai headline, same positions and colors: "ของที่ชอบ" and "ให้เราหิ้วมาให้". Same small pill: "YOUR EVERYDAY PERSONAL SHOPPER". Same speech bubble: "ของแท้" then "พร้อมหิ้วทุกประเภท". Same body copy: "รวมของน่ารัก ของน่าใช้ และของที่คุณเล็งไว้" then "สั่งง่าย จ่ายสะดวก ติดตามได้ทุกขั้นตอน". Same button "เลือกช้อปของที่ชอบ". Bottom icon captions "ตรวจสลิปอัตโนมัติ", "จ่ายได้หลายช่องทาง", "จัดส่งทั่วไทย". Thai must be spelled exactly and sharply, with no invented characters. Preserve the original white outline lettering and friendly rounded type. Keep the original layout; no added objects, no watermark, no new slogans, no new colors. Fill the canvas edge to edge.
```

### promotion

Edit target: `public/assets/storefront/reference-promotion.webp`

```text
Edit target: attached original pastel promotion strip. Faithfully restore this exact existing banner at high resolution; do not invent a different design. Keep the soft blush pink background, mint patches, scattered hearts and gold sparkles, sale tag at left, and the same pink gift box/ribbon and percent tag at right. Preserve exact placement, framing and original panoramic 447:141 ratio, edge to edge, about 2000 px wide.
Render the original Thai text perfectly sharp and verbatim: headline "โปรโมชั่นสุดพิเศษ"; body "ลดจัดเต็ม ช้อปได้มากกว่า"; pill button "ดูโปรโมชั่นทั้งหมด" with right arrow. Preserve original rose-magenta headline, dark body text, pale pink button, rounded corners. Do not add prices, percentages other than the existing % sign, logos, watermarks or any new objects. Only improve fidelity, resolution and clean edges.
```

### categories

Edit target: `public/assets/storefront/reference-categories.webp`

```text
Edit target: attached strip containing FOUR original category icons. Restore the same four illustrations at much higher resolution, keeping their design and colors unchanged. For export only arrange them in a precise 2 by 2 grid of equal square cells, edge to edge, at least 1536 x 1536 px. Top-left: the same pink handbag with two handles and small gold fasteners in a pale blush circular disk with tiny sparkles. Top-right: same rectangular pink perfume with gold cap in pink circular disk. Bottom-left: same fine gold necklace and gold heart pendant in pale cream/yellow disk. Bottom-right: same white short-sleeve shirt with rose-pink trim in pale mint disk. All four circles have equal size, identical margins, each centered in its own grid cell on a white background; no dividing lines. These are the exact existing icons enhanced, not new icon concepts. Preserve the full object and circle, no cuts. No text, letters, captions, watermarks or additional objects.
```

### categoryPhotos

Edit target: `public/assets/storefront/reference-category-photos.webp`

```text
Edit target: attached original strip of FOUR small category photographs. Restore the same photo content with crisp professional detail and faithful warm pastel colors. For export only arrange the four photos in a precise 2 by 2 grid with no gutters and equal rectangular cells, each cell 99:80 aspect ratio. Whole canvas 99:80, about 1980 x 1600 pixels. Top-left: same composition of black structured handbag in front left, blush tote behind, warm cream boutique backdrop. Top-right: same cluster of clear and rose/magenta glass perfume bottles with gold caps on blush surface. Bottom-left: same delicate gold chains and rings on ivory satin, closeup still life. Bottom-right: same pink and white garments hanging close together on a rail; no people or faces. Preserve the existing subjects, framing, object count, lighting direction and style; enhance detail without introducing brands, logos, text, new products, watermarks or decoration. Not a new composition.
```

### contact

Edit target: `public/assets/storefront/reference-contact.webp`

```text
Edit target: attached very wide blush-pink shop contact ribbon. Restore this EXACT original ribbon with the same composition and lettering, sharp and high resolution, no redesign. The active ribbon must retain its original 449:72 aspect ratio, approximately 2048 x 328 px. If your output canvas cannot be that wide, place this complete wide ribbon centered vertically on a larger plain ivory canvas, with perfectly blank padding above and below for later cropping; never expand or rearrange the ribbon.
Same pink background, mint rounded corner patches, small gold sparkles, outlined heart on left, same pink shopping bag on far right. Preserve all positions. Exact text left of center: "IYA HIEW"; beneath it "YOUR EVERYDAY PERSONAL SHOPPER"; Thai tagline "ให้ทุกความชอบใกล้คุณมากขึ้น" with tiny pink heart. Same pill CTA at approximately 62% from left: "ติดต่อเรา" and right arrow. Keep clean friendly type and original ink/rose colors. No additional text, watermark, logo substitution or new objects. Improve sharpness and details only.
```
