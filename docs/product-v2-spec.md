# Cashenza V2 Product Spec

## Positioning

Cashenza V2 is built around two bundle types:

- `Volume bundle`: 1x, 2x, 3x, Nx of the same product shown on the current product page.
- `Cross-sell bundle`: current product alone, then current product plus one or more different products.

The goal is to remove configuration ambiguity:

- Admin configures bundle logic and commerce rules.
- First setup is admin-first: the merchant selects a product, creates a bundle, and Cashenza creates the Shopify discount plus the storefront placement.
- Theme editor settings are optional later presentation overrides only, not the installation path.

## Core Principles

1. Single source of truth for bundle content: the admin.
2. The dashboard owns first bundle creation and automatic product-page placement.
3. Cart and discount logic must remain Shopify-native and robust.
4. Every storefront bundle experience must degrade gracefully when product forms, cart drawers, or theme selectors are non-standard.

## Bundle Types

### Volume bundle

Shown on a product page for the current product only.

Offers:

- Offer 1: 1x current product, no discount
- Offer 2: 2x current product, optional discount
- Offer 3: 3x current product, optional discount
- ...
- Offer N: Nx current product, optional discount

Variant logic:

- If variant selection is allowed, the customer chooses the variant for the repeated product.
- If variant selection is disabled, the merchant can choose the fixed variant used in the bundle.

### Cross-sell bundle

Shown on a product page anchored to the current product.

Offers:

- Offer 1: current product only, no discount
- Offer 2+: current product + one or more different products

Variant logic:

- Same variant-selection rules as volume bundle.
- The first item must always be the page product.

## Admin

### Dashboard

Top-level areas:

1. Overview
2. Volume bundles
3. Cross-sell bundles
4. Analytics
5. Diagnostics

### Volume bundles dashboard

Purpose:

- decide on which product pages the default quantity ladder is active

Capabilities:

- search products
- paginate products
- toggle volume bundle visibility per product
- bulk enable / bulk disable
- show when a cross-sell bundle overrides the volume bundle

### Cross-sell bundles dashboard

Purpose:

- manage custom bundles with specific products and discounts

Capabilities:

- create
- edit
- duplicate
- archive
- draft / active states
- only one active cross-sell bundle per product page

### Cross-sell bundle configurator

Tabs:

1. Offers
2. Style
3. Timer
4. Discounts

Offers tab:

- anchored product = product page product
- items
- fixed or selectable variants
- initial price
- discounted price

## Storefront placement

The theme app extension no longer defines bundle composition and must not create
bundles or discounts.

The app proxy used by the storefront is read-only for setup. It can fetch bundle
configuration, product snapshots, and analytics endpoints, but it must not create
or update Shopify discounts and must not create bundles in the database.

After the first bundle is created in the admin, Cashenza should place the
storefront block automatically once on the default product template. The block
must stay hidden on products without an active Cashenza bundle.

The admin should also provide a placement/repair action for the default product
template. This action should insert or repair the app block without forcing the
merchant to open the Shopify theme editor.

The placement/repair action depends on `read_themes` and `write_themes`. Because
Shopify requires an exemption for direct theme file writes, the admin must expose
a clear readiness state before promising automatic placement.

Theme writes are guarded by:

- `CASHENZA_ENABLE_THEME_WRITES=true`

Placement updates `templates/product.json` with one global Cashenza mount point.
The storefront endpoint and widget decide visibility from the current product
handle and the active bundles in the database.

Important coexistence rule: a product can have one active volume bundle and one
active cross-sell bundle at the same time. The widget must render both in a
compact layout while exposing only one coherent add-to-cart / buy-now flow.

Future theme editor overrides may control:

- widget copy defaults
- design preset
- colors
- typography
- spacing
- border radius
- timer preset and style
- best seller badge preset
- save badge style

These settings should apply consistently to both volume bundles and cross-sell bundles.

## Analytics

Analytics must be business-oriented, not event-noise-oriented.

### Required metrics

- bundle impressions
- offer selection rate
- bundle add-to-cart rate
- checkout reach rate
- conversion rate
- bundle revenue
- incremental revenue
- discount cost
- net uplift after discount
- top performing bundle
- underperforming bundle
- performance by device
- performance by market

### Breakdown dimensions

- bundle type
- product page
- specific bundle
- offer
- date range

## Diagnostics

Diagnostics should explain failures in merchant language:

- bundle not displayed
- wrong product attached
- cart drawer not opening
- quantity mismatch
- bundle items unavailable
- duplicate tracking events
- discount not applied

## Migration Strategy

Phase 1:

- rename current UX to `Volume bundle` and `Cross-sell bundle`
- keep existing cart/discount engine
- move first setup toward the admin-first product picker and automatic storefront placement

Phase 2:

- move all bundle content definition into admin-only flows
- reduce legacy theme fallback logic

Phase 3:

- full analytics instrumentation
- diagnostics center
- final cleanup of legacy naming and fallback structures
