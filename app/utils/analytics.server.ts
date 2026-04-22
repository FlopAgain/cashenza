import prisma from "../db.server";
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
    volumeConfigured,
    volumeActive,
    volumeDraft,
    volumeSynced,
    totalVolumeOffers,
    activeBundles,
    draftBundles,
    archivedBundles,
    syncedCrossSellBundles,
    totalCrossSellOffers,
    volumeBundleSummary,
  ] = await Promise.all([
    prisma.bundle.count({
      where: { shop: params.shop, bundleType: "VOLUME" },
    }),
    prisma.bundle.count({
      where: { shop: params.shop, bundleType: "VOLUME", status: "ACTIVE" },
    }),
    prisma.bundle.count({
      where: { shop: params.shop, bundleType: "VOLUME", status: "DRAFT" },
    }),
    prisma.bundle.count({
      where: {
        shop: params.shop,
        bundleType: "VOLUME",
        automaticDiscountId: { not: null },
      },
    }),
    prisma.bundleOffer.count({
      where: { bundle: { shop: params.shop, bundleType: "VOLUME" } },
    }),
    prisma.bundle.count({
      where: { shop: params.shop, bundleType: "CROSS_SELL", status: "ACTIVE" },
    }),
    prisma.bundle.count({
      where: { shop: params.shop, bundleType: "CROSS_SELL", status: "DRAFT" },
    }),
    prisma.bundle.count({
      where: { shop: params.shop, bundleType: "CROSS_SELL", status: "ARCHIVED" },
    }),
    prisma.bundle.count({
      where: {
        shop: params.shop,
        bundleType: "CROSS_SELL",
        automaticDiscountId: { not: null },
      },
    }),
    prisma.bundleOffer.count({
      where: { bundle: { shop: params.shop, bundleType: "CROSS_SELL" } },
    }),
    volumeBundleSummaryPromise,
  ]);

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
