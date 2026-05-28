# Admin-first bundle refactor

## Direction

Cashenza Bundlify becomes an admin-first bundle app backed by Shopify discounts.
The theme extension is only the storefront rendering layer. It must not create
bundles or discounts from the theme editor.

## Core rules

- One bundle maps to one Shopify automatic app discount.
- A bundle status is derived from the Shopify discount lifecycle: active or expired.
- A product can have at most one volume bundle and at most one cross-sell bundle.
- Volume bundles are same-product bundles: 2, 3, or N times the same product.
- Cross-sell bundles combine the current product with one or more different products.
- Volume and cross-sell bundles can both be active for the same product.
- Duplicate theme app blocks are ignored on the storefront.
- The widget renders only on product pages with a valid product handle.
- Products, variants, stock, availability, and discount state must be reconciled
  against Shopify before the admin UI claims they are active or synced.

## Shopify discount model

Each bundle owns exactly one Shopify automatic app discount:

- status: active or expired
- value: percentage, fixed amount, or fixed final price
- activity dates: start date/time and optional end date/time
- timer mode: real discount expiry or merchant-defined fake timer

The local database stores the bundle configuration and `automaticDiscountId`.
Shopify remains the source of truth for whether the offer is active, expired, or
missing.

## Admin UX target

The dashboard should drive first setup:

1. Select a product.
2. Choose volume bundle or cross-sell bundle.
3. Configure products, variants, discount value, timer, style, effects, and badges.
4. Save the bundle and create/update its Shopify discount.
5. Automatically place the storefront block once on the default product template.

The merchant must not be sent to the Shopify theme editor to place the app block
during first setup. The first-bundle tunnel is the single installation path:
product selection, bundle creation, Shopify discount creation, then automatic
storefront placement.

The admin must also expose a manual placement/repair action for the default
product template. This gives the merchant a way to insert or fix the bundle app block
from Cashenza itself, without returning to the Shopify theme editor.

This requires Shopify theme file access (`read_themes` and `write_themes`). Direct
theme file writes use Shopify's theme file APIs and may require Shopify's
`write_themes` exemption before the public app can rely on this flow.

Implementation guardrails:

- `CASHENZA_ENABLE_THEME_WRITES=true` must be set before Cashenza writes theme files.
- The widget must be hidden by default and render only when the current product has an active bundle.
- Placement writes `templates/product.json` so every product page has one global Cashenza mount point.
- A product can have one volume bundle and one cross-sell bundle active at the same time; the storefront must render both without duplicated purchase controls.

The bundles section becomes one unified product list with search, pagination, and
cards showing:

- product title
- offer title
- bundle on/off for this product
- mode: volume or cross-sell
- stock
- Shopify discount status
- variant count
- expiration date when present
- configure bundle
- edit style
- deactivate offer
- delete offer

## Theme extension target

The storefront app block should fetch configured bundles only. It must never
bootstrap or create default bundles.

The storefront proxy is read-only for commerce setup. It must not create bundles,
create discounts, update discounts, or repair database state. All bundle and
discount writes happen from authenticated admin actions only.

When both bundle types exist for a product, the widget should render both in a
compact, non-duplicative layout and provide its own variant selectors, add to cart,
and buy now buttons.

Automatic placement must target the product information area as close as possible
to the native variant picker, add to cart, and accelerated checkout buttons. Once
the widget is active, it should replace that purchase flow smoothly and avoid
visible duplicated controls across as many Shopify themes as possible.

If automatic placement cannot confidently find the ideal insertion point for a
theme, the admin should report that clearly and offer a retry/repair action
before falling back to manual theme-editor instructions.
