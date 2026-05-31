import prisma from "../db.server";
import {
  createDefaultAppearance,
  type BundleAppearanceDraft,
} from "./bundle-configurator";

const APPEARANCE_SELECT = {
  designPreset: true,
  timerPreset: true,
  effectsPreset: true,
  primaryColor: true,
  textColor: true,
  eyebrow: true,
  heading: true,
  subheading: true,
  headingSize: true,
  subheadingSize: true,
  offerTitleSize: true,
  offerPriceSize: true,
  cardGap: true,
  cardPadding: true,
  offerRadius: true,
  bestSellerBadgePreset: true,
  bestSellerPngBadgePreset: true,
  bestSellerBadgeColor: true,
  bestSellerBadgeText: true,
  saveBadgeColor: true,
  saveBadgeText: true,
  saveBadgePrefix: true,
  showTimer: true,
  timerEnd: true,
  timerPrefix: true,
  timerExpiredText: true,
  timerBackgroundColor: true,
  timerTextColor: true,
  timerPrefixColor: true,
} as const;

type BundleAppearanceRecord = {
  [Key in keyof typeof APPEARANCE_SELECT]: Key extends "timerEnd"
    ? string | null
    : BundleAppearanceDraft[Key];
};

export function bundleAppearanceToDraft(
  bundle: BundleAppearanceRecord | null | undefined,
): BundleAppearanceDraft {
  const defaults = createDefaultAppearance();
  if (!bundle) return defaults;

  return {
    ...defaults,
    designPreset: bundle.designPreset ?? defaults.designPreset,
    timerPreset: bundle.timerPreset ?? defaults.timerPreset,
    effectsPreset: bundle.effectsPreset ?? defaults.effectsPreset,
    primaryColor: bundle.primaryColor ?? defaults.primaryColor,
    textColor: bundle.textColor ?? defaults.textColor,
    eyebrow: bundle.eyebrow ?? defaults.eyebrow,
    heading: bundle.heading ?? defaults.heading,
    subheading: bundle.subheading ?? defaults.subheading,
    headingSize: bundle.headingSize ?? defaults.headingSize,
    subheadingSize: bundle.subheadingSize ?? defaults.subheadingSize,
    offerTitleSize: bundle.offerTitleSize ?? defaults.offerTitleSize,
    offerPriceSize: bundle.offerPriceSize ?? defaults.offerPriceSize,
    cardGap: bundle.cardGap ?? defaults.cardGap,
    cardPadding: bundle.cardPadding ?? defaults.cardPadding,
    offerRadius: bundle.offerRadius ?? defaults.offerRadius,
    bestSellerBadgePreset: bundle.bestSellerBadgePreset ?? defaults.bestSellerBadgePreset,
    bestSellerPngBadgePreset:
      bundle.bestSellerPngBadgePreset ?? defaults.bestSellerPngBadgePreset,
    bestSellerBadgeColor: bundle.bestSellerBadgeColor ?? defaults.bestSellerBadgeColor,
    bestSellerBadgeText: bundle.bestSellerBadgeText ?? defaults.bestSellerBadgeText,
    saveBadgeColor: bundle.saveBadgeColor ?? defaults.saveBadgeColor,
    saveBadgeText: bundle.saveBadgeText ?? defaults.saveBadgeText,
    saveBadgePrefix: bundle.saveBadgePrefix ?? defaults.saveBadgePrefix,
    showTimer: bundle.showTimer ?? defaults.showTimer,
    timerEnd: bundle.timerEnd || defaults.timerEnd,
    timerPrefix: bundle.timerPrefix ?? defaults.timerPrefix,
    timerExpiredText: bundle.timerExpiredText ?? defaults.timerExpiredText,
    timerBackgroundColor: bundle.timerBackgroundColor ?? defaults.timerBackgroundColor,
    timerTextColor: bundle.timerTextColor ?? defaults.timerTextColor,
    timerPrefixColor: bundle.timerPrefixColor ?? defaults.timerPrefixColor,
  };
}

export async function loadReusableBundleAppearance(params: {
  shop: string;
  productHandle: string;
}): Promise<BundleAppearanceDraft> {
  const productHandle = params.productHandle.trim();
  if (!productHandle) return createDefaultAppearance();

  const bundle = await prisma.bundle.findFirst({
    where: {
      shop: params.shop,
      productHandle,
    },
    select: APPEARANCE_SELECT,
    orderBy: { updatedAt: "desc" },
  });

  return bundleAppearanceToDraft(bundle as BundleAppearanceRecord | null);
}
