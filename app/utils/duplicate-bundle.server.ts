type SourceBundleItem = {
  productId: string;
  productTitle: string | null;
  variantId: string | null;
  variantTitle: string | null;
  quantity: number;
  allowVariantSelection: boolean;
  showVariantThumbnails: boolean;
  sortOrder: number;
};

type SourceBundleOffer = {
  id: string;
  title: string;
  subtitle: string | null;
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
  discountValue: number;
  isBestSeller: boolean;
  sortOrder: number;
  items: SourceBundleItem[];
};

type SourceBundle = {
  shop: string;
  title: string;
  productId: string;
  productTitle: string | null;
  productHandle: string | null;
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
  timerEnd: string | null;
  timerPrefix: string;
  timerExpiredText: string;
  timerBackgroundColor: string;
  timerTextColor: string;
  showVariantPicker: boolean;
  showVariantThumbnails: boolean;
  bestSellerOfferId: string | null;
  offers: SourceBundleOffer[];
};

export function buildDuplicatedBundleData(bundle: SourceBundle) {
  return {
    shop: bundle.shop,
    title: `${bundle.title} Copy`,
    productId: bundle.productId,
    productTitle: bundle.productTitle,
    productHandle: bundle.productHandle,
    status: "DRAFT" as const,
    automaticDiscountId: null,
    showVariantPicker: bundle.showVariantPicker,
    showVariantThumbnails: bundle.showVariantThumbnails,
    designPreset: bundle.designPreset,
    primaryColor: bundle.primaryColor,
    textColor: bundle.textColor,
    eyebrow: bundle.eyebrow,
    heading: bundle.heading,
    subheading: bundle.subheading,
    headingSize: bundle.headingSize,
    subheadingSize: bundle.subheadingSize,
    offerTitleSize: bundle.offerTitleSize,
    offerPriceSize: bundle.offerPriceSize,
    cardGap: bundle.cardGap,
    cardPadding: bundle.cardPadding,
    offerRadius: bundle.offerRadius,
    bestSellerBadgeColor: bundle.bestSellerBadgeColor,
    bestSellerBadgeText: bundle.bestSellerBadgeText,
    saveBadgeColor: bundle.saveBadgeColor,
    saveBadgeText: bundle.saveBadgeText,
    saveBadgePrefix: bundle.saveBadgePrefix,
    showTimer: bundle.showTimer,
    timerEnd: bundle.timerEnd,
    timerPrefix: bundle.timerPrefix,
    timerExpiredText: bundle.timerExpiredText,
    timerBackgroundColor: bundle.timerBackgroundColor,
    timerTextColor: bundle.timerTextColor,
  };
}

export function buildDuplicatedOfferData(offer: SourceBundleOffer) {
  return {
    title: offer.title,
    subtitle: offer.subtitle,
    quantity: offer.quantity,
    discountType: offer.discountType,
    discountValue: offer.discountValue,
    isBestSeller: offer.isBestSeller,
    sortOrder: offer.sortOrder,
    items: {
      create: offer.items.map((item) => ({
        productId: item.productId,
        productTitle: item.productTitle,
        variantId: item.variantId,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        allowVariantSelection: item.allowVariantSelection,
        showVariantThumbnails: item.showVariantThumbnails,
        sortOrder: item.sortOrder,
      })),
    },
  };
}

export function isDuplicatedBestSellerOffer(
  originalBundle: Pick<SourceBundle, "bestSellerOfferId">,
  originalOffer: Pick<SourceBundleOffer, "id" | "isBestSeller">,
) {
  return (
    originalBundle.bestSellerOfferId === originalOffer.id || originalOffer.isBestSeller
  );
}
