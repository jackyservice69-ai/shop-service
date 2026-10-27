# Retire the original sample catalog

Release schema 17 removes the eight original main-store seed listings by matching
their exact Thai/English names and `/assets/{bag,shoe,cup,headphone,camera,cap,tote,perfume}.svg`
image pairs. Consignor products, renamed products, uploaded main images and galleries
containing other images are excluded.

Unreferenced matches are deleted. Matches referenced by orders, consignments,
reviews or review uploads are disabled instead, preserving transaction history.
The migration runs once inside a transaction and records affected IDs in the
immutable `catalog.demo_retired` audit event. It does not modify wallets or ledger.
Production startup verifies a schema 16-to-17 database backup before opening the
application. A failed backup blocks startup. Reopening schema 17 does not repeat
cleanup. The manual `seed:demo` command remains a development tool; do not execute
it against production.

Seller addresses/service areas remain editable privately by the seller and visible
to authorized consignor administrators. Public shop and product-shop DTOs omit
`serviceArea`; the storefront and product detail seller panel no longer render it.

Verification uses temporary/in-memory databases and synthetic orders only. After
deploy, anonymous GETs must confirm the eight original listings are absent and the
real consignor listing, gallery and public shop still work.
