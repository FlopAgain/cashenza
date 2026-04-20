# Cashenza custom-bundle Release Checklist

## Goal
Ship a version that is credible for Shopify App Store review and safe for the first paying merchants.

## Product readiness
- Billing Starter plan works end-to-end
- Dev store billing bypass is limited to development shops only
- Bundle creation works for new bundles
- Bundle editing works for existing bundles
- Bundle duplication works
- Bundle deletion works
- Shopify automatic discount sync works
- Default bundles work on storefront
- Admin-configured bundles work on storefront
- Per-item variant selectors work correctly
- Fixed amount discounts work
- Percentage discounts work
- Fixed price bundles work
- Best seller badge works
- Timer works
- Theme app block settings save correctly

## QA pass
- Test one active bundle with 1 offer
- Test one active bundle with 3 offers
- Test one active bundle with custom items
- Test mixed variants inside one selected bundle
- Test sold-out product behavior
- Test inactive bundle behavior
- Test billing page on a non-bypassed shop
- Test billing page on the dev shop
- Test app install and reopen flow
- Test settings page save flow
- Test duplicate bundle then edit and save

## Technical readiness
- PostgreSQL connection is configured
- `npm run typecheck` passes
- `npm test` passes
- Prisma migrations are deployable
- No dev-only URLs remain in merchant-facing copy
- No debug buttons remain in production UI
- `.env` secrets are not committed

## Shopify App Store submission assets
- App icon exported
- Minimum 5 screenshots prepared
- Short description finalized
- Full description finalized
- Pricing copy finalized
- Support email finalized
- FAQ finalized
- Demo merchant flow documented

## Shopify review readiness
- App purpose is immediately clear on landing page
- Billing is understandable and not misleading
- Theme block can be added without developer help
- Merchant can configure a bundle from admin without guesswork
- Error states are readable and non-technical
- No fake or broken merchant actions remain

## Legal and operational basics
- Privacy policy URL ready
- Terms of service URL ready
- Support contact email ready
- Internal incident/support response process ready
- Backup owner access to hosting and database exists

## First launch plan
- Install on 1 internal dev shop
- Install on 1 clean test shop
- Run full QA on both
- Capture screenshots from the best-looking store
- Submit to Shopify review
- Keep support windows open after submission
