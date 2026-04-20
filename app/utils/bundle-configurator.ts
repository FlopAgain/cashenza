export type BundleItemDraft = {
  label: string;
  productHandle: string;
  allowVariantSelection: boolean;
  showVariantThumbnails: boolean;
};

export type BundleOfferDraft = {
  title: string;
  subtitle: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
  discountValue: number;
};

export type BundleAppearanceDraft = {
  designPreset: string;
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
};

export type BundleDraftPayload = {
  title: string;
  status: "DRAFT" | "ACTIVE";
  itemCount: number;
  bestSellerIndex: number;
  items: BundleItemDraft[];
  offers: BundleOfferDraft[];
  appearance: BundleAppearanceDraft;
};

export const MAX_ITEMS = 10;

export function createDefaultItem(index: number): BundleItemDraft {
  return {
    label: `Article ${index + 1}`,
    productHandle: "",
    allowVariantSelection: true,
    showVariantThumbnails: false,
  };
}

export function createDefaultOffer(index: number): BundleOfferDraft {
  return {
    title: index === 0 ? "Offer 1" : `Offer ${index + 1}`,
    subtitle: index === 0 ? "Base offer" : `Save more on ${index + 1} articles`,
    discountType: "PERCENTAGE",
    discountValue: index === 0 ? 0 : index === 1 ? 10 : 15,
  };
}

export function createDefaultAppearance(): BundleAppearanceDraft {
  return {
    designPreset: "soft",
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
