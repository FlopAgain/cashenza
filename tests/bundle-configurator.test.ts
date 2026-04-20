import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultBundleDraft,
  createDefaultOffer,
  ensureLength,
  safeParseJson,
} from "../app/utils/bundle-configurator.ts";

test("createDefaultBundleDraft builds a 3-offer draft with best seller on offer 2", () => {
  const draft = createDefaultBundleDraft();

  assert.equal(draft.itemCount, 3);
  assert.equal(draft.bestSellerIndex, 2);
  assert.equal(draft.items.length, 3);
  assert.equal(draft.offers.length, 3);
  assert.equal(draft.appearance.designPreset, "soft");
});

test("createDefaultOffer applies the expected starter discount ladder", () => {
  assert.deepEqual(createDefaultOffer(0), {
    title: "Offer 1",
    subtitle: "Base offer",
    discountType: "PERCENTAGE",
    discountValue: 0,
  });

  assert.equal(createDefaultOffer(1).discountValue, 10);
  assert.equal(createDefaultOffer(2).discountValue, 15);
});

test("ensureLength trims and pads using the provided factory", () => {
  assert.deepEqual(ensureLength([1, 2, 3, 4], 2, (index) => index), [1, 2]);
  assert.deepEqual(ensureLength([1], 3, (index) => index + 10), [1, 11, 12]);
});

test("safeParseJson returns fallback on invalid or blank values", () => {
  assert.deepEqual(safeParseJson("", { ok: true }), { ok: true });
  assert.deepEqual(safeParseJson("{bad json", { ok: true }), { ok: true });
  assert.deepEqual(safeParseJson('{"ok":false}', { ok: true }), { ok: false });
});
