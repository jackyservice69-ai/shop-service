# Contact banner palette v6

The owner requested recoloring `pastel-contact reference-contact` to match the current Hero and promotion art. The existing contact image was edited with the built-in Imagegen tool, using `hero-compact-v6.webp` and `promotion-compact-v6.webp` as palette/lighting references. Exact instructions are saved in [CONTACT-PALETTE-V6-PROMPT.json](CONTACT-PALETTE-V6-PROMPT.json).

The image retains IYA HIEW, the English tagline, the original Thai line, the heart doodle, outlined shopping bag and empty space for the real contact button. Its colors are warmer luminous pink, brighter pale mint and champagne-gold accents. No generated button, new offer or new contact destination was added.

Saved web assets:

- `public/assets/storefront/contact-palette-v6.webp` — 2169×723.
- `public/assets/storefront/contact-palette-small-v6.webp` — 1084×361.
- Selected generated PNG, retained locally: `output/imagegen/contact-v6/contact-palette-v6.png`.

Imagegen retained the ultra-wide design inside the central approximately 350px band of a 2172×724 canvas. The existing 449:72 contact frame uses a centered, contained image viewport with object-fit cover to omit only the generated exterior white bands, retaining its original display size and illustration/text proportions. The stored source is not cropped or distorted. The real HTML LINE button, referral link, visibility settings, responsive layout and forced-colors text fallback stay with their existing owners.

Build and the affected browser workflow passed, including 320/412/1440px widths, the original contact aspect ratio, image decoding, unchanged LINE destination and 44px minimum contact target. Desktop rendered evidence: `output/playwright/contact-palette-v6-1440.png`. This work remains local; no push or production update was performed.
