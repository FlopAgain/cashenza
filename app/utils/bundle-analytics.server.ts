import type { Prisma } from "@prisma/client";

import prisma from "../db.server";

export type AnalyticsEventPayload = {
  bundleType: "CROSS_SELL" | "VOLUME";
  eventType:
    | "BUNDLE_IMPRESSION"
    | "OFFER_SELECTED"
    | "ADD_TO_CART"
    | "BUY_NOW"
    | "ADD_TO_CART_FAILED";
  bundleId?: string | null;
  offerId?: string | null;
  productHandle?: string | null;
  sessionId?: string | null;
  offerPosition?: number | null;
  offerQuantity?: number | null;
  metadata?: Record<string, unknown> | null;
};

function toPrismaJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return value as Prisma.InputJsonValue;
}

export async function trackBundleAnalyticsEvent(shop: string, payload: AnalyticsEventPayload) {
  return prisma.bundleAnalyticsEvent.create({
    data: {
      shop,
      bundleType: payload.bundleType,
      eventType: payload.eventType,
      bundleId: payload.bundleId || null,
      offerId: payload.offerId || null,
      productHandle: payload.productHandle || null,
      sessionId: payload.sessionId || null,
      offerPosition: payload.offerPosition ?? null,
      offerQuantity: payload.offerQuantity ?? null,
      metadata: toPrismaJson(payload.metadata),
    },
  });
}

export async function loadStorefrontAnalytics(params: {
  shop: string;
  since?: Date;
}) {
  const since = params.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const baseWhere = {
    shop: params.shop,
    createdAt: { gte: since },
  } as const;

  const [
    totalImpressions,
    totalSelections,
    totalAddToCart,
    totalBuyNow,
    totalAddFailures,
    volumeImpressions,
    crossSellImpressions,
    volumeAdds,
    crossSellAdds,
    topBundles,
  ] = await Promise.all([
    prisma.bundleAnalyticsEvent.count({
      where: { ...baseWhere, eventType: "BUNDLE_IMPRESSION" },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: { ...baseWhere, eventType: "OFFER_SELECTED" },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: { ...baseWhere, eventType: "ADD_TO_CART" },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: { ...baseWhere, eventType: "BUY_NOW" },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: { ...baseWhere, eventType: "ADD_TO_CART_FAILED" },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: {
        ...baseWhere,
        bundleType: "VOLUME",
        eventType: "BUNDLE_IMPRESSION",
      },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: {
        ...baseWhere,
        bundleType: "CROSS_SELL",
        eventType: "BUNDLE_IMPRESSION",
      },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: {
        ...baseWhere,
        bundleType: "VOLUME",
        eventType: "ADD_TO_CART",
      },
    }),
    prisma.bundleAnalyticsEvent.count({
      where: {
        ...baseWhere,
        bundleType: "CROSS_SELL",
        eventType: "ADD_TO_CART",
      },
    }),
    prisma.bundleAnalyticsEvent.groupBy({
      by: ["bundleId"],
      where: {
        ...baseWhere,
        eventType: "ADD_TO_CART",
        bundleId: { not: null },
      },
      _count: { _all: true },
      orderBy: {
        _count: {
          bundleId: "desc",
        },
      },
      take: 5,
    }),
  ]);

  const topBundleIds = topBundles
    .map((entry) => entry.bundleId)
    .filter((id): id is string => Boolean(id));

  const bundleTitles = topBundleIds.length
    ? await prisma.bundle.findMany({
        where: { id: { in: topBundleIds } },
        select: { id: true, title: true, productHandle: true },
      })
    : [];

  const bundleMap = new Map(bundleTitles.map((bundle) => [bundle.id, bundle]));

  return {
    windowDays: 30,
    totals: {
      impressions: totalImpressions,
      selections: totalSelections,
      addToCart: totalAddToCart,
      buyNow: totalBuyNow,
      addFailures: totalAddFailures,
    },
    byType: {
      volume: {
        impressions: volumeImpressions,
        addToCart: volumeAdds,
      },
      crossSell: {
        impressions: crossSellImpressions,
        addToCart: crossSellAdds,
      },
    },
    rates: {
      selectionRate:
        totalImpressions > 0
          ? `${Math.round((totalSelections / totalImpressions) * 100)}%`
          : "0%",
      addToCartRate:
        totalImpressions > 0
          ? `${Math.round((totalAddToCart / totalImpressions) * 100)}%`
          : "0%",
      buyNowRate:
        totalImpressions > 0
          ? `${Math.round((totalBuyNow / totalImpressions) * 100)}%`
          : "0%",
      failureRate:
        totalAddToCart + totalBuyNow + totalAddFailures > 0
          ? `${Math.round((totalAddFailures / (totalAddToCart + totalBuyNow + totalAddFailures)) * 100)}%`
          : "0%",
    },
    topBundles: topBundles.map((entry) => {
      const bundle = entry.bundleId ? bundleMap.get(entry.bundleId) : null;
      return {
        bundleId: entry.bundleId,
        title: bundle?.title || "Unknown bundle",
        productHandle: bundle?.productHandle || null,
        addToCartCount: entry._count._all,
      };
    }),
  };
}
