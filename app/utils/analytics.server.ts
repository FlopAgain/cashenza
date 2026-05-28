import prisma from "../db.server";
import { reconcileBundleAutomaticDiscountState } from "./bundle-discount.server";
import { loadVolumeBundleProducts } from "./volume-bundles.server";

export type AnalyticsSnapshot = {
  volumeEnabled: number;
  volumeConfigured: number;
  volumeActive: number;
  volumeDraft: number;
  volumeSynced: number;
  averageOffersPerVolume: string;
  crossSellActive: number;
  crossSellDraft: number;
  crossSellArchived: number;
  crossSellSynced: number;
  overriddenProducts: number;
  averageOffersPerCrossSell: string;
  totalCrossSellBundles: number;
  totalCrossSellOffers: number;
  syncCoverageRate: string;
};

export async function loadAnalyticsSnapshot(params: {
  shop: string;
  admin: { graphql: (query: string) => Promise<Response> };
}) {
  const volumeBundleSummaryPromise = loadVolumeBundleProducts({
    shop: params.shop,
    admin: params.admin,
  });

  const [
    rawVolumeBundles,
    totalVolumeOffers,
    rawCrossSellBundles,
    totalCrossSellOffers,
    volumeBundleSummary,
  ] = await Promise.all([
    prisma.bundle.findMany({
      where: { shop: params.shop, bundleType: "VOLUME" },
      select: {
        id: true,
        status: true,
        automaticDiscountId: true,
      },
    }),
    prisma.bundleOffer.count({
      where: { bundle: { shop: params.shop, bundleType: "VOLUME" } },
    }),
    prisma.bundle.findMany({
      where: { shop: params.shop, bundleType: "CROSS_SELL" },
      select: {
        id: true,
        status: true,
        automaticDiscountId: true,
      },
    }),
    prisma.bundleOffer.count({
      where: { bundle: { shop: params.shop, bundleType: "CROSS_SELL" } },
    }),
    volumeBundleSummaryPromise,
  ]);

  const [volumeBundles, crossSellBundles] = await Promise.all([
    Promise.all(
      rawVolumeBundles.map((bundle) =>
        reconcileBundleAutomaticDiscountState(params.admin, bundle),
      ),
    ),
    Promise.all(
      rawCrossSellBundles.map((bundle) =>
        reconcileBundleAutomaticDiscountState(params.admin, bundle),
      ),
    ),
  ]);

  const volumeConfigured = volumeBundles.length;
  const volumeActive = volumeBundles.filter((bundle) => bundle.bundleStatus === "ACTIVE").length;
  const volumeDraft = volumeBundles.filter((bundle) => bundle.bundleStatus === "DRAFT").length;
  const volumeSynced = volumeBundles.filter(
    (bundle) => bundle.automaticDiscountId && bundle.shopifyDiscountStatus !== "MISSING",
  ).length;

  const activeBundles = crossSellBundles.filter(
    (bundle) => bundle.bundleStatus === "ACTIVE",
  ).length;
  const draftBundles = crossSellBundles.filter(
    (bundle) => bundle.bundleStatus === "DRAFT",
  ).length;
  const archivedBundles = crossSellBundles.filter(
    (bundle) => bundle.bundleStatus === "ARCHIVED",
  ).length;
  const syncedCrossSellBundles = crossSellBundles.filter(
    (bundle) => bundle.automaticDiscountId && bundle.shopifyDiscountStatus !== "MISSING",
  ).length;
  const totalCrossSellBundles = activeBundles + draftBundles + archivedBundles;

  return {
    volumeEnabled: volumeBundleSummary.enabledCount,
    volumeConfigured,
    volumeActive,
    volumeDraft,
    volumeSynced,
    averageOffersPerVolume:
      volumeConfigured > 0 ? (totalVolumeOffers / volumeConfigured).toFixed(1) : "0.0",
    crossSellActive: activeBundles,
    crossSellDraft: draftBundles,
    crossSellArchived: archivedBundles,
    crossSellSynced: syncedCrossSellBundles,
    overriddenProducts: volumeBundleSummary.overriddenCount,
    averageOffersPerCrossSell:
      totalCrossSellBundles > 0
        ? (totalCrossSellOffers / totalCrossSellBundles).toFixed(1)
        : "0.0",
    totalCrossSellBundles,
    totalCrossSellOffers,
    syncCoverageRate:
      totalCrossSellBundles > 0
        ? `${Math.round((syncedCrossSellBundles / totalCrossSellBundles) * 100)}%`
        : "0%",
  } satisfies AnalyticsSnapshot;
}
