# Cashenza V2 Product Spec

## Positioning

Cashenza V2 is built around two bundle types:

- `Volume bundle`: 1x, 2x, 3x, Nx of the same product shown on the current product page.
- `Cross-sell bundle`: current product alone, then current product plus one or more different products.

The goal is to remove configuration ambiguity:

- Admin configures bundle logic and commerce rules.
- Theme editor configures presentation only.

## Core Principles

1. Single source of truth for bundle content: the admin.
2. Theme editor only controls design, copy defaults, colors, spacing, timer style, and badges.
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

## Theme editor

Theme editor no longer defines bundle composition.

It only controls:

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
- keep theme editor style-only direction

Phase 2:

- move more bundle content definition into admin-only flows
- reduce legacy theme fallback logic

Phase 3:

- full analytics instrumentation
- diagnostics center
- final cleanup of legacy naming and fallback structures
