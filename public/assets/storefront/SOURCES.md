# Storefront reference crops

The five original reference-*.webp files are cropped directly from the image supplied by the owner: `1-2129.jpg` (592 × 1280 px). These originals do not use AI generation. Sharp performs deterministic crop, atlas assembly and WebP conversion only.

- reference-hero.webp: original store hero, 455 × 378 px.
- reference-promotion.webp: original promotion panel, 447 × 141 px.
- reference-categories.webp: four original illustrated category circles assembled as a 360 × 84 px atlas.
- reference-category-photos.webp: four original category photos assembled as a 396 × 80 px atlas.
- reference-contact.webp: original contact ribbon, 449 × 72 px.

The reference palette sidebar is omitted. Headline text has an accessible HTML equivalent and image call-to-action areas remain real navigable links. Source-resolution limits apply when enlarged.

## High-resolution v2 iteration

The owner subsequently authorized Imagegen to enhance each original section. The hd-v2 WebP siblings are faithful AI reconstructions from the originals, not recovered original pixels. Larger and smaller variants serve responsive HTML images and CSS image-set atlases. Original reference files remain intact. Exact built-in prompts, output dimensions and provenance are recorded in docs/STOREFRONT-IMAGE-ENHANCEMENT.md in the repository. PNG masters are retained locally under output/image-enhancement/masters/.

## Additional category illustrations v3

The eight new category circles were created using built-in Imagegen from the existing v2 illustrated circles as a style reference. Makeup, skincare, shoes, watches, eyewear, home goods, tech accessories and collectibles share one 4-column × 2-row atlas. Original artwork remains intact. Delivery WebP sizes are 1600 × 800 and 800 × 400; Sharp only resizes/encodes the generated image. The exact prompt and master provenance are in docs/CATEGORY-ART-V3.md.

## Food quick-category icon v9

Built-in Imagegen generated the burger, drink and fries icon on 26 October 2026 using user reference 2141.jpg and the v2 illustrated atlas. `category-food-v9.webp` (400px) and `category-food-small-v9.webp` (200px) serve only the quick-category strip. Exact prompt, local master and provenance are in docs/CATEGORY-FOOD-V9.md and docs/CATEGORY-FOOD-V9-PROMPT.json. Existing assets are preserved.

## Beauty and gadgets v4

Two additional standalone illustrations generated with built-in Imagegen use the v3 atlas as their style reference: beauty (mirror, brush, lipstick) and gadgets (headphones, portable speaker). Each has 400px and 200px WebP deliveries; PNG masters remain locally at output/image-enhancement/masters/. Exact prompts and provenance are in docs/CATEGORY-ART-V4.md. Earlier artwork is preserved.

## Beauty and gadget browse photos v8

Built-in Imagegen produced two new realistic product photos on 26 October 2026, using user reference 2140.jpg and the v2 photo atlas as style inputs. Only browse cards use the new `browse-beauty-photo[-small]-v8.webp` and `browse-gadgets-photo[-small]-v8.webp` images (800×646 / 400×323). Quick-category circles retain v4 illustrations. PNG masters and exact prompts are documented in docs/BROWSE-PHOTOS-V8.md and docs/BROWSE-PHOTOS-V8-PROMPTS.json. No prior assets were overwritten.
