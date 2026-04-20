# Cashenza custom-bundle Support Playbook

## Goal
Reply fast, diagnose cleanly, and reduce merchant friction during the launch phase.

## Support contact
- Use one visible support email for all merchant communication
- Reply target during launch: within 24 hours
- Reply target for active production issues: same day when possible

## Top support categories
- Bundle not showing on product page
- Bundle discount not applied in cart
- Variant selector not behaving as expected
- Theme block added but styling looks wrong
- Billing and plan access questions

## First response template
Hello,

Thanks for reaching out. I’m looking into this for you now.

To diagnose the issue quickly, please send:
- your shop domain
- the product URL where the bundle should appear
- a screenshot or short screen recording
- the bundle title affected

If the issue is discount-related, please also share a screenshot of the cart after adding the bundle.

Best,
Cashenza custom-bundle support

## Troubleshooting checklist

### Bundle not visible
- Confirm the app block is added to the correct product template
- Confirm the bundle is ACTIVE
- Confirm article 1 handle matches the live product handle
- Confirm the shop is using the intended theme/template

### Discount not applied
- Confirm the bundle was saved after the last changes
- Confirm automatic discount sync completed
- Confirm correct variants and quantities were added
- Confirm the bundle in cart matches the configured offer structure

### Variant issue
- Confirm variant selection is enabled for the relevant bundle items
- Confirm the issue only affects selected offer logic, not hidden offers
- Confirm the product actually has variants available

### Billing issue
- Confirm whether the shop is a development shop or a live merchant shop
- Confirm whether Starter subscription is active
- Confirm whether the shop is intentionally bypassed in development

## Internal severity guide
- P1: Merchant cannot use the app at all
- P2: Bundle visible but core conversion flow is broken
- P3: Styling or non-blocking admin issue
- P4: Feature request or UX improvement

## Launch-phase product feedback tags
- onboarding
- billing
- discount-sync
- variant-selection
- design-preset
- storefront-visibility
- performance

## What to log internally for each issue
- date
- shop domain
- merchant impact
- exact reproduction steps
- affected product URL
- affected bundle title
- fix shipped
- follow-up needed

