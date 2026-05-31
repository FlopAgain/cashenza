export type BundleItemDraft = {
  productHandle: string;
  allowVariantSelection: boolean;
  showVariantThumbnails: boolean;
  variantId: string;
  variantTitle: string;
};

export type BundleOfferDraft = {
  title: string;
  subtitle: string;
  quantity: number;
  itemQuantities: number[];
  showQuantitySelector: boolean;
  quantityOptions: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
  discountValue: number;
};

export type ProductSnapshotVariantDraft = {
  id: string;
  title: string;
  price: string;
  featuredImage: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
};

export type ProductSnapshotDraft = {
  id: string;
  handle: string;
  title: string;
  featuredImage: string | null;
  variants: ProductSnapshotVariantDraft[];
};

export type BundleAppearanceDraft = {
  designPreset: string;
  timerPreset: string;
  effectsPreset: string;
  primaryColor: string;
  textColor: string;
  eyebrow: string;
  heading: string;
  subheading: string;
  headingSize: number;
  subheadingSize: number;
  offerTitleSize: number;
  offerPriceSize: number;
  cardGap: number;
  cardPadding: number;
  offerRadius: number;
  bestSellerBadgePreset: string;
  bestSellerPngBadgePreset: string;
  bestSellerBadgeColor: string;
  bestSellerBadgeText: string;
  saveBadgeColor: string;
  saveBadgeText: string;
  saveBadgePrefix: string;
  showTimer: boolean;
  timerEnd: string;
  timerPrefix: string;
  timerExpiredText: string;
  timerBackgroundColor: string;
  timerTextColor: string;
  timerPrefixColor: string;
};

export type BundleDraftPayload = {
  title: string;
  status: "DRAFT" | "ACTIVE";
  itemCount: number;
  bestSellerIndex: number;
  items: BundleItemDraft[];
  offers: BundleOfferDraft[];
  appearance: BundleAppearanceDraft;
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
};

export const MAX_ITEMS = 10;

export function getCrossSellOfferTitle(index: number) {
  return `Offer ${index + 1}`;
}

export function getCrossSellOfferSubtitle(index: number) {
  if (index === 0) return "Current product only";

  return `Current product + ${index} more item${index > 1 ? "s" : ""}`;
}

export function getCrossSellOfferCompositionLabel(index: number) {
  if (index === 0) return "Current product only";

  return `${index + 1} bundled items`;
}

export function getCrossSellItemLabel(index: number) {
  if (index === 0) return "Anchored product";

  return `Added product ${index}`;
}

export function createDefaultItem(index: number): BundleItemDraft {
  return {
    productHandle: "",
    allowVariantSelection: true,
    showVariantThumbnails: false,
    variantId: "",
    variantTitle: "",
  };
}

export function createDefaultOffer(index: number): BundleOfferDraft {
  return {
    title: getCrossSellOfferTitle(index),
    subtitle: getCrossSellOfferSubtitle(index),
    quantity: index + 1,
    itemQuantities: Array.from({ length: index + 1 }, () => 1),
    showQuantitySelector: false,
    quantityOptions: "",
    discountType: "PERCENTAGE",
    discountValue: index === 0 ? 0 : index === 1 ? 10 : 15,
  };
}

export function getCrossSellOfferItemCount(
  offer: Partial<Pick<BundleOfferDraft, "itemQuantities">> | null | undefined,
  fallbackIndex = 0,
) {
  const explicitCount = Array.isArray(offer?.itemQuantities)
    ? offer.itemQuantities.length
    : 0;
  const fallbackCount = Math.max(1, fallbackIndex + 1);

  return Math.max(1, Math.min(MAX_ITEMS, explicitCount || fallbackCount));
}

export function getMaxCrossSellItemSlots(
  offers: Array<Partial<Pick<BundleOfferDraft, "itemQuantities">>>,
) {
  return Math.max(
    1,
    offers.reduce(
      (max, offer, index) => Math.max(max, getCrossSellOfferItemCount(offer, index)),
      1,
    ),
  );
}

export function normalizeQuantity(value: number | string | null | undefined, fallback = 1) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(1, Math.min(99, Math.floor(parsed)));
}

export function createDefaultAppearance(): BundleAppearanceDraft {
  return {
    designPreset: "soft",
    timerPreset: "split-flap",
    effectsPreset: "fade in",
    primaryColor: "#8db28a",
    textColor: "#1a2118",
    eyebrow: "Bundle and save",
    heading: "Choose your bundle",
    subheading: "Pick the offer that fits your customer best.",
    headingSize: 28,
    subheadingSize: 16,
    offerTitleSize: 22,
    offerPriceSize: 24,
    cardGap: 12,
    cardPadding: 18,
    offerRadius: 24,
    bestSellerBadgePreset: "pill",
    bestSellerPngBadgePreset: "none",
    bestSellerBadgeColor: "#ffffff",
    bestSellerBadgeText: "#1a2118",
    saveBadgeColor: "#f1c500",
    saveBadgeText: "#1a2118",
    saveBadgePrefix: "Save",
    showTimer: false,
    timerEnd: "",
    timerPrefix: "Offer ends in",
    timerExpiredText: "Offer expired",
    timerBackgroundColor: "#1a2118",
    timerTextColor: "#ffffff",
    timerPrefixColor: "#6b7280",
  };
}

export function createDefaultBundleDraft(): BundleDraftPayload {
  return {
    title: "",
    status: "DRAFT",
    itemCount: 3,
    bestSellerIndex: 2,
    items: ensureLength([], 3, createDefaultItem),
    offers: ensureLength([], 3, createDefaultOffer),
    appearance: createDefaultAppearance(),
    productSnapshots: {},
  };
}

export function ensureLength<T>(
  values: T[],
  targetLength: number,
  factory: (index: number) => T,
) {
  const next = values.slice(0, targetLength);

  while (next.length < targetLength) {
    next.push(factory(next.length));
  }

  return next;
}

export function safeParseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeTimerEndValue(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  // `datetime-local` returns a local wall-clock value without timezone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    const localDate = new Date(raw);
    if (!Number.isNaN(localDate.getTime())) {
      return localDate.toISOString();
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return raw;
}
