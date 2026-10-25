# Wallet card v7 — 26 October 2026

The owner requested a background cropped to fit the card, a gold-gradient chip, removal of the gold-coin icon and restoration of the baht sign with a new amount font. This iteration is local only.

## Imagegen background

Built-in Imagegen edited `public/assets/iya-refresh-v5/wallet-background.webp`, with the owner's screenshot used only as a card-bounds reference. The selected output removes the baked-in rim, bevel, double border and external white padding. The pearlescent pink botanical surface extends to all four square raster edges. The website supplies its own single border and rounded clipping; layout dimensions and padding remain unchanged.

Saved derivative: `public/assets/wallet/wallet-surface-v7.webp` (1100×666). Selected original PNG: `output/imagegen/wallet-v7/wallet-surface-v7.png`. Exact instructions are in `WALLET-CARD-V7-PROMPT.json`. No logo, member name, amount, QR or bank details were generated into the background.

## Live amount and chip

`WalletCard` retains live balance and account-holder bindings. It replaces the coin image with the baht symbol and retains two decimal places and an accessible THB balance label. Only the amount uses the self-hosted Manrope Latin 600 face (`public/fonts/manrope-latin-600.woff2`, about 14KB), with Noto Sans Thai providing the baht glyph when needed. Labels and the rest of the site retain their existing font. Google Fonts is the source; SIL OFL 1.1 is preserved in `public/fonts/OFL-Manrope.txt`. No remote font request is needed at runtime.

The existing SVG chip remains crisp and at its original position. Its rectangle now uses a bronze-to-gold-to-pale-highlight linear gradient, with a React-generated unique ID and existing etched paths. No CSS shadows, invented card numbers, expiry, CVV, NFC or financial behavior were added.

## Verification

Build and two affected browser flows passed: the topup/full-wallet purchase/exact refund flow, and the responsive home/wallet workflow with wallet/bank accessibility checks. The latter verifies removal of the coin, restored baht sign, amount font and SVG gradient. Local screenshots are `output/playwright/wallet-v7-preview-mobile.png` and `wallet-v7-preview-desktop.png`. No real transfers or production customer data were used.
