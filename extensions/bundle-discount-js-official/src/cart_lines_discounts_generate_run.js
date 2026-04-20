const DiscountClass = {
  Product: "PRODUCT",
};

const ProductDiscountSelectionStrategy = {
  All: "ALL",
};

/**
  * @typedef {import("../generated/api").CartInput} RunInput
  * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
  * @typedef {import("../generated/api").ProductDiscountCandidate} ProductDiscountCandidate
  */

/**
 * @typedef {{
 *   version?: number;
 *   bundleId?: string;
 *   offers?: Array<{
 *     id?: string;
 *     title?: string;
 *     quantity?: number;
 *     discountType?: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE" | string;
 *     discountValue?: number;
 *     items?: Array<{
 *       itemIndex?: number;
 *       quantity?: number;
 *       label?: string;
 *     }>;
 *   }>;
 * }} FunctionConfig
 */

/**
 * @typedef {{
 *   lineId: string;
  *   offerId: string;
  *   itemIndex: number;
  *   quantity: number;
  *   unitPrice: number;
 * }} CartLineMatch
 */

/**
 * @typedef {{
 *   lineId: string;
 *   groupId: string;
 *   offerTitle: string;
 *   discountType: string;
 *   discountValue: number;
 *   itemIndex: number;
 *   quantity: number;
 *   unitPrice: number;
 * }} StaticCartLineMatch
 */

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseConfig(metafield) {
  if (!metafield) return null;

  const jsonValue = metafield.jsonValue;
  if (jsonValue && typeof jsonValue === "object") {
    return jsonValue;
  }

  if (typeof metafield.value === "string" && metafield.value.length > 0) {
    try {
      return JSON.parse(metafield.value);
    } catch (error) {
      console.error("Failed to parse bundle discount metafield", error);
    }
  }

  return null;
}

function extractBundleLines(input, bundleId) {
  return input.cart.lines.reduce((matches, line) => {
    const lineBundleId = line.bundleId?.value;
    const offerId = line.bundleOfferId?.value;
    const itemIndex = parseNumber(line.bundleItemIndex?.value);

    if (!lineBundleId || !offerId || !itemIndex || lineBundleId !== bundleId) {
      return matches;
    }

    matches.push({
      lineId: line.id,
      offerId,
      itemIndex,
      quantity: Number(line.quantity || 0),
      unitPrice: parseNumber(line.cost?.amountPerQuantity?.amount),
    });

    return matches;
  }, []);
}

function extractStaticBundleLines(input) {
  return input.cart.lines.reduce((matches, line) => {
    const groupId = line.bundleGroupId?.value;
    const itemIndex = parseNumber(line.bundleItemIndex?.value);
    const discountType = String(line.bundleDiscountType?.value || "PERCENTAGE");
    const discountValue = parseNumber(line.bundleDiscountValue?.value);
    const offerTitle = String(line.bundleOfferTitle?.value || "Bundle discount");

    if (!groupId || !itemIndex) {
      return matches;
    }

    matches.push({
      lineId: line.id,
      groupId,
      offerTitle,
      discountType,
      discountValue,
      itemIndex,
      quantity: Number(line.quantity || 0),
      unitPrice: parseNumber(line.cost?.amountPerQuantity?.amount),
    });

    return matches;
  }, []);
}

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );

  if (!hasProductDiscountClass) {
    return {operations: []};
  }

  const config = parseConfig(input.discount?.metafield);
  const cartLines =
    config?.bundleId && Array.isArray(config.offers) && config.offers.length > 0
      ? extractBundleLines(input, config.bundleId)
      : [];
  const staticCartLines = extractStaticBundleLines(input);

  /** @type {ProductDiscountCandidate[]} */
  const candidates = [];

  if (config?.bundleId && Array.isArray(config.offers) && config.offers.length > 0) {
    for (const offer of config.offers) {
      if (!offer?.id || !Array.isArray(offer.items) || offer.items.length === 0) {
        continue;
      }

      const offerLines = cartLines.filter((line) => line.offerId === offer.id);
      if (offerLines.length === 0) {
        continue;
      }

      const availablePerItem = new Map();
      for (const line of offerLines) {
        availablePerItem.set(
          line.itemIndex,
          (availablePerItem.get(line.itemIndex) || 0) + line.quantity,
        );
      }

      let bundleInstances = Number.MAX_SAFE_INTEGER;
      for (const item of offer.items) {
        const itemIndex = parseNumber(item?.itemIndex);
        const requiredQuantity = parseNumber(item?.quantity);
        if (!itemIndex || requiredQuantity <= 0) continue;

        const available = availablePerItem.get(itemIndex) || 0;
        bundleInstances = Math.min(bundleInstances, Math.floor(available / requiredQuantity));
      }

      if (!Number.isFinite(bundleInstances) || bundleInstances <= 0) {
        continue;
      }

      const remainingPerItem = new Map();
      for (const item of offer.items) {
        const itemIndex = parseNumber(item?.itemIndex);
        const requiredQuantity = parseNumber(item?.quantity);
        if (!itemIndex || requiredQuantity <= 0) continue;
        remainingPerItem.set(itemIndex, bundleInstances * requiredQuantity);
      }

      const eligibleLines = offerLines.reduce((lines, line) => {
        const remaining = remainingPerItem.get(line.itemIndex) || 0;
        const eligibleQuantity = Math.min(remaining, line.quantity);

        if (eligibleQuantity > 0) {
          remainingPerItem.set(line.itemIndex, remaining - eligibleQuantity);
          lines.push({
            line,
            eligibleQuantity,
            subtotal: line.unitPrice * eligibleQuantity,
          });
        }

        return lines;
      }, []);

      if (eligibleLines.length === 0) {
        continue;
      }

      const offerTitle = offer.title || "Bundle discount";
      const discountType = String(offer.discountType || "PERCENTAGE");
      const discountValue = parseNumber(offer.discountValue);

      if (discountType === "PERCENTAGE") {
        candidates.push({
          targets: eligibleLines.map(({line, eligibleQuantity}) => ({
            cartLine: {
              id: line.lineId,
              quantity: eligibleQuantity,
            },
          })),
          message: offerTitle,
          value: {
            percentage: {
              value: discountValue,
            },
          },
        });
        continue;
      }

      const eligibleSubtotal = eligibleLines.reduce((sum, entry) => sum + entry.subtotal, 0);
      if (eligibleSubtotal <= 0) {
        continue;
      }

      const totalDiscount =
        discountType === "FIXED_PRICE"
          ? Math.max(eligibleSubtotal - discountValue * bundleInstances, 0)
          : Math.min(discountValue * bundleInstances, eligibleSubtotal);

      if (totalDiscount <= 0) {
        continue;
      }

      let remainingDiscount = roundCurrency(totalDiscount);
      for (let index = 0; index < eligibleLines.length; index += 1) {
        const {line, eligibleQuantity, subtotal} = eligibleLines[index];
        const lineDiscount =
          index === eligibleLines.length - 1
            ? remainingDiscount
            : roundCurrency(totalDiscount * (subtotal / eligibleSubtotal));

        remainingDiscount = roundCurrency(Math.max(remainingDiscount - lineDiscount, 0));

        if (lineDiscount <= 0) continue;

        candidates.push({
          targets: [
            {
              cartLine: {
                id: line.lineId,
                quantity: eligibleQuantity,
              },
            },
          ],
          message: offerTitle,
          value: {
            fixedAmount: {
              amount: lineDiscount,
              appliesToEachItem: false,
            },
          },
        });
      }
    }
  }

  const staticGroups = new Map();
  for (const line of staticCartLines) {
    const group = staticGroups.get(line.groupId) || {
      offerTitle: line.offerTitle,
      discountType: line.discountType,
      discountValue: line.discountValue,
      lines: [],
    };
    group.lines.push(line);
    staticGroups.set(line.groupId, group);
  }

  for (const group of staticGroups.values()) {
    const eligibleLines = group.lines.map((line) => ({
      line,
      eligibleQuantity: line.quantity,
      subtotal: line.unitPrice * line.quantity,
    }));

    if (eligibleLines.length === 0) continue;

    const offerTitle = group.offerTitle || "Bundle discount";
    const discountType = String(group.discountType || "PERCENTAGE");
    const discountValue = parseNumber(group.discountValue);

    if (discountType === "PERCENTAGE") {
      candidates.push({
        targets: eligibleLines.map(({line, eligibleQuantity}) => ({
          cartLine: {
            id: line.lineId,
            quantity: eligibleQuantity,
          },
        })),
        message: offerTitle,
        value: {
          percentage: {
            value: discountValue,
          },
        },
      });
      continue;
    }

    const eligibleSubtotal = eligibleLines.reduce((sum, entry) => sum + entry.subtotal, 0);
    if (eligibleSubtotal <= 0) continue;

    const totalDiscount =
      discountType === "FIXED_PRICE"
        ? Math.max(eligibleSubtotal - discountValue, 0)
        : Math.min(discountValue, eligibleSubtotal);

    if (totalDiscount <= 0) continue;

    let remainingDiscount = roundCurrency(totalDiscount);
    for (let index = 0; index < eligibleLines.length; index += 1) {
      const {line, eligibleQuantity, subtotal} = eligibleLines[index];
      const lineDiscount =
        index === eligibleLines.length - 1
          ? remainingDiscount
          : roundCurrency(totalDiscount * (subtotal / eligibleSubtotal));

      remainingDiscount = roundCurrency(Math.max(remainingDiscount - lineDiscount, 0));

      if (lineDiscount <= 0) continue;

      candidates.push({
        targets: [
          {
            cartLine: {
              id: line.lineId,
              quantity: eligibleQuantity,
            },
          },
        ],
        message: offerTitle,
        value: {
          fixedAmount: {
            amount: lineDiscount,
            appliesToEachItem: false,
          },
        },
      });
    }
  }

  if (candidates.length === 0) {
    return {operations: []};
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
