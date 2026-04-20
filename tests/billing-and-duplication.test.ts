import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStarterBillingFailureResponse,
  isBillingTestMode,
} from "../app/utils/billing-helpers.ts";
import {
  buildDuplicatedBundleData,
  buildDuplicatedOfferData,
  isDuplicatedBestSellerOffer,
} from "../app/utils/duplicate-bundle.server.ts";

test("isBillingTestMode is true outside production", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  assert.equal(isBillingTestMode(), true);
  process.env.NODE_ENV = "production";
  assert.equal(isBillingTestMode(), false);
  process.env.NODE_ENV = original;
});

test("buildStarterBillingFailureResponse redirects to /app/billing on failure", async () => {
  const onFailure = buildStarterBillingFailureResponse((url, init) =>
    new Response("redirect", {
      status: 302,
      headers: {
        Location: url,
        "X-Target": init?.target || "",
      },
    }),
  );

  const response = await onFailure();
  assert.equal(response.headers.get("Location"), "/app/billing");
  assert.equal(response.headers.get("X-Target"), "_parent");
});

test("duplicated bundles are reset to draft and keep merchandising settings", () => {
  const duplicated = buildDuplicatedBundleData({
    shop: "bundle-dev.myshopify.com",
    title: "Spring Bundle",
    productId: "product-1",
    productTitle: "Spring Product",
    productHandle: "spring-product",
    designPreset: "soft",
    primaryColor: "#112233",
    textColor: "#445566",
    eyebrow: "Bundle",
    heading: "Choose",
    subheading: "Save",
    headingSize: 30,
    subheadingSize: 16,
    offerTitleSize: 20,
    offerPriceSize: 24,
    cardGap: 12,
    cardPadding: 18,
    offerRadius: 22,
    bestSellerBadgeColor: "#fff",
    bestSellerBadgeText: "#000",
    saveBadgeColor: "#ff0",
    saveBadgeText: "#111",
    saveBadgePrefix: "Save",
    showTimer: true,
    timerEnd: "2026-04-30T23:59",
    timerPrefix: "Ends in",
    timerExpiredText: "Expired",
    timerBackgroundColor: "#000",
    timerTextColor: "#fff",
    showVariantPicker: true,
    showVariantThumbnails: false,
    bestSellerOfferId: "offer-2",
    offers: [],
  });

  assert.equal(duplicated.title, "Spring Bundle Copy");
  assert.equal(duplicated.status, "DRAFT");
  assert.equal(duplicated.automaticDiscountId, null);
  assert.equal(duplicated.primaryColor, "#112233");
  assert.equal(duplicated.showTimer, true);
});

test("duplicated offers preserve nested item configuration and best seller detection", () => {
  const duplicatedOffer = buildDuplicatedOfferData({
    id: "offer-2",
    title: "Offer 2",
    subtitle: "Best value",
    quantity: 2,
    discountType: "FIXED_AMOUNT",
    discountValue: 12,
    isBestSeller: true,
    sortOrder: 1,
    items: [
      {
        productId: "product-1",
        productTitle: "Product 1",
        variantId: "variant-1",
        variantTitle: "Blue",
        quantity: 1,
        allowVariantSelection: true,
        showVariantThumbnails: true,
        sortOrder: 0,
      },
    ],
  });

  assert.equal(duplicatedOffer.discountType, "FIXED_AMOUNT");
  assert.equal(duplicatedOffer.items.create[0].variantTitle, "Blue");
  assert.equal(
    isDuplicatedBestSellerOffer(
      { bestSellerOfferId: "offer-2" },
      { id: "offer-2", isBestSeller: false },
    ),
    true,
  );
});
