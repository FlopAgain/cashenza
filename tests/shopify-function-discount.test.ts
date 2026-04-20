import test from "node:test";
import assert from "node:assert/strict";

import { cartLinesDiscountsGenerateRun } from "../extensions/bundle-discount-js-official/src/cart_lines_discounts_generate_run.js";

test("shopify function applies percentage discount to a configured admin bundle", () => {
  const result = cartLinesDiscountsGenerateRun({
    discount: {
      discountClasses: ["PRODUCT"],
      metafield: {
        value: JSON.stringify({
          bundleId: "bundle-1",
          offers: [
            {
              id: "offer-2",
              title: "Offer 2",
              quantity: 2,
              discountType: "PERCENTAGE",
              discountValue: 10,
              items: [
                { itemIndex: 1, quantity: 1 },
                { itemIndex: 2, quantity: 1 },
              ],
            },
          ],
        }),
        jsonValue: {
          bundleId: "bundle-1",
          offers: [
            {
              id: "offer-2",
              title: "Offer 2",
              quantity: 2,
              discountType: "PERCENTAGE",
              discountValue: 10,
              items: [
                { itemIndex: 1, quantity: 1 },
                { itemIndex: 2, quantity: 1 },
              ],
            },
          ],
        },
      },
    },
    cart: {
      lines: [
        {
          id: "line-1",
          quantity: 1,
          cost: { amountPerQuantity: { amount: "40.00" }, subtotalAmount: { amount: "40.00" } },
          bundleId: { value: "bundle-1" },
          bundleOfferId: { value: "offer-2" },
          bundleItemIndex: { value: "1" },
        },
        {
          id: "line-2",
          quantity: 1,
          cost: { amountPerQuantity: { amount: "60.00" }, subtotalAmount: { amount: "60.00" } },
          bundleId: { value: "bundle-1" },
          bundleOfferId: { value: "offer-2" },
          bundleItemIndex: { value: "2" },
        },
      ],
    },
  } as any);

  const candidates = (result.operations[0] as any).productDiscountsAdd.candidates;
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].value.percentage.value, 10);
  assert.equal(candidates[0].targets.length, 2);
});

test("shopify function preserves static fixed-price bundles across multiple lines", () => {
  const result = cartLinesDiscountsGenerateRun({
    discount: {
      discountClasses: ["PRODUCT"],
      metafield: null,
    },
    cart: {
      lines: [
        {
          id: "line-red",
          quantity: 2,
          cost: { amountPerQuantity: { amount: "30.00" }, subtotalAmount: { amount: "60.00" } },
          bundleGroupId: { value: "static-group-1" },
          bundleItemIndex: { value: "1" },
          bundleDiscountType: { value: "FIXED_PRICE" },
          bundleDiscountValue: { value: "50" },
          bundleOfferTitle: { value: "Default trio" },
        },
        {
          id: "line-blue",
          quantity: 1,
          cost: { amountPerQuantity: { amount: "40.00" }, subtotalAmount: { amount: "40.00" } },
          bundleGroupId: { value: "static-group-1" },
          bundleItemIndex: { value: "2" },
          bundleDiscountType: { value: "FIXED_PRICE" },
          bundleDiscountValue: { value: "50" },
          bundleOfferTitle: { value: "Default trio" },
        },
      ],
    },
  } as any);

  const candidates = (result.operations[0] as any).productDiscountsAdd.candidates;
  assert.equal(candidates.length, 2);
  assert.equal(
    candidates.reduce((sum: number, candidate: any) => sum + candidate.value.fixedAmount.amount, 0),
    50,
  );
});
