import test from "node:test";
import assert from "node:assert/strict";

import {
  assertNoUserErrors,
  buildDiscountConfig,
  bundleDiscountTitle,
  syncBundleAutomaticDiscount,
} from "../app/utils/bundle-discount.server.ts";

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}

test("buildDiscountConfig produces a function payload that keeps offer ordering", () => {
  const config = buildDiscountConfig({
    id: "bundle-1",
    title: "Spring",
    status: "ACTIVE",
    automaticDiscountId: null,
    offers: [
      {
        id: "offer-1",
        title: "Offer 1",
        quantity: 1,
        discountType: "PERCENTAGE",
        discountValue: 10,
        items: [{ sortOrder: 0, quantity: 1, productId: "p1", productTitle: "Product 1" }],
      },
    ],
  });

  assert.equal(config.bundleId, "bundle-1");
  assert.equal(config.offers[0].items[0].itemIndex, 1);
  assert.equal(config.offers[0].discountValue, 10);
});

test("assertNoUserErrors throws a readable message", () => {
  assert.throws(
    () =>
      assertNoUserErrors(
        {
          userErrors: [{ field: ["automaticAppDiscount", "title"], message: "is invalid" }],
        },
        "Updating bundle discount",
      ),
    /Updating bundle discount failed: automaticAppDiscount.title: is invalid/,
  );
});

test("syncBundleAutomaticDiscount deletes inactive discounts and returns null for drafts", async () => {
  const calls: string[] = [];
  const admin = {
    async graphql(query: string) {
      calls.push(query);

      if (query.includes("shopifyFunctions")) {
        return jsonResponse({
          data: {
            shopifyFunctions: {
              nodes: [
                {
                  id: "gid://shopify/Function/1",
                  title: "bundle-discount-js",
                  apiType: "DISCOUNT",
                },
              ],
            },
          },
        });
      }

      return jsonResponse({
        data: {
          discountAutomaticDelete: {
            deletedAutomaticDiscountId: "gid://shopify/DiscountAutomaticNode/1",
            userErrors: [],
          },
        },
      });
    },
  };

  const result = await syncBundleAutomaticDiscount(admin, {
    id: "bundle-1",
    title: "Draft bundle",
    status: "DRAFT",
    automaticDiscountId: "gid://shopify/DiscountAutomaticNode/1",
    offers: [],
  });

  assert.equal(result, null);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /discountAutomaticDelete/);
});

test("syncBundleAutomaticDiscount recreates the discount when update fails", async () => {
  const admin = {
    async graphql(query: string) {
      if (query.includes("shopifyFunctions")) {
        return jsonResponse({
          data: {
            shopifyFunctions: {
              nodes: [
                {
                  id: "gid://shopify/Function/1",
                  title: "bundle-discount-js",
                  apiType: "DISCOUNT",
                },
              ],
            },
          },
        });
      }

      if (query.includes("discountAutomaticAppUpdate")) {
        return jsonResponse({
          data: {
            discountAutomaticAppUpdate: {
              automaticAppDiscount: null,
              userErrors: [{ message: "discount missing" }],
            },
          },
        });
      }

      if (query.includes("discountAutomaticDelete")) {
        return jsonResponse({
          data: {
            discountAutomaticDelete: {
              deletedAutomaticDiscountId: "gid://shopify/DiscountAutomaticNode/1",
              userErrors: [],
            },
          },
        });
      }

      if (query.includes("discountAutomaticAppCreate")) {
        return jsonResponse({
          data: {
            discountAutomaticAppCreate: {
              automaticAppDiscount: {
                discountId: "gid://shopify/DiscountAutomaticNode/2",
                title: bundleDiscountTitle("Live bundle"),
              },
              userErrors: [],
            },
          },
        });
      }

      throw new Error("Unexpected graphql call");
    },
  };

  const result = await syncBundleAutomaticDiscount(admin, {
    id: "bundle-1",
    title: "Live bundle",
    status: "ACTIVE",
    automaticDiscountId: "gid://shopify/DiscountAutomaticNode/1",
    offers: [
      {
        id: "offer-1",
        title: "Offer 1",
        quantity: 1,
        discountType: "PERCENTAGE",
        discountValue: 10,
        items: [{ sortOrder: 0, quantity: 1, productId: "p1", productTitle: "Product 1" }],
      },
    ],
  });

  assert.equal(result, "gid://shopify/DiscountAutomaticNode/2");
});
