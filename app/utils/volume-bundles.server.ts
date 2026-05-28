import prisma from "../db.server";
import { reconcileBundleAutomaticDiscountState, syncBundleAutomaticDiscount } from "./bundle-discount.server";
import { loadReusableBundleAppearance } from "./bundle-appearance.server";
import { loadProductSnapshots } from "./product-snapshots.server";
import {
  normalizeBundleDatabaseStatus,
  resolveBundleOperationalStatus,
  resolveBundleSyncLabel,
} from "./bundle-status";

export type VolumeBundleProductCard = {
  id: string;
  title: string;
  handle: string;
  featuredImage: string | null;
  variantsCount: number;
  availableStock: number;
  enabled: boolean;
  hasCrossSellBundle: boolean;
  hasActiveCrossSellBundle: boolean;
  activeCrossSellBundleId: string | null;
  activeCrossSellBundleTitle: string | null;
  activeCrossSellBundleStatus: "ACTIVE" | "EXPIRED" | "SCHEDULED" | "UNKNOWN" | "MISSING" | null;
  volumeBundleId: string | null;
  volumeBundleStatus: "ACTIVE" | "INACTIVE" | "ARCHIVED" | null;
  volumeBundleOfferCount: number;
  volumeBundleBestSellerQuantity: number | null;
  volumeBundleAutomaticDiscountId: string | null;
};

export async function loadShopProducts(
  admin: { graphql: (query: string) => Promise<Response> },
): Promise<
  Array<{
    id: string;
    title: string;
    handle: string;
    featuredImage: string | null;
    variantsCount: number;
    availableStock: number;
    status: string;
    collections: Array<{
      title: string;
      handle: string;
    }>;
  }>
> {
  const response = await admin.graphql(
    `#graphql
      query DashboardProducts {
        products(first: 250, sortKey: TITLE) {
          nodes {
            id
            title
            handle
            status
            featuredImage {
              url
            }
            variantsCount {
              count
            }
            totalInventory
            collections(first: 10) {
              nodes {
                title
                handle
              }
            }
          }
        }
      }`,
  );

  const json = await response.json();
  const nodes = json.data?.products?.nodes || [];

  return nodes.map((product: any) => ({
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: String(product.status || "UNKNOWN"),
    featuredImage: product.featuredImage?.url || null,
    variantsCount: Number(product.variantsCount?.count || 0),
    availableStock: Number(product.totalInventory || 0),
    collections: (product.collections?.nodes || []).map((collection: any) => ({
      title: String(collection.title || ""),
      handle: String(collection.handle || ""),
    })),
  }));
}

export async function loadVolumeBundleProducts(params: {
  shop: string;
  admin: { graphql: (query: string) => Promise<Response> };
}) {
  const [simpleSettings, products, crossSellBundles, volumeBundles] = await Promise.all([
    prisma.simpleBundleProductSetting.findMany({
      where: { shop: params.shop },
      select: { productHandle: true, enabled: true },
    }),
    loadShopProducts(params.admin),
    prisma.bundle.findMany({
      where: {
        shop: params.shop,
        bundleType: "CROSS_SELL",
        productHandle: { not: null },
      },
      select: {
        id: true,
        title: true,
        status: true,
        productHandle: true,
        automaticDiscountId: true,
      },
    }),
    prisma.bundle.findMany({
      where: {
        shop: params.shop,
        bundleType: "VOLUME",
        productHandle: { not: null },
      },
      select: {
        id: true,
        productHandle: true,
        status: true,
        automaticDiscountId: true,
        bestSellerOfferId: true,
        offers: {
          select: { id: true, quantity: true, isBestSeller: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const settingsMap = new Map(
    simpleSettings.map((setting) => [setting.productHandle, setting.enabled]),
  );
  const crossSellBundleEntries = await Promise.all(
    crossSellBundles
      .filter((bundle): bundle is typeof bundle & { productHandle: string } => Boolean(bundle.productHandle))
      .map(async (bundle) => {
        const reconciled = await reconcileBundleAutomaticDiscountState(params.admin, {
          id: bundle.id,
          status: bundle.status,
          automaticDiscountId: bundle.automaticDiscountId,
        });

        return [
          bundle.productHandle,
          {
            id: bundle.id,
            title: bundle.title,
            status: resolveBundleOperationalStatus({
              bundleStatus: normalizeBundleDatabaseStatus(reconciled.bundleStatus),
              automaticDiscountId: reconciled.automaticDiscountId,
              shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
            }),
            syncLabel: resolveBundleSyncLabel({
              automaticDiscountId: reconciled.automaticDiscountId,
              shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
            }),
            bundleStatus: reconciled.bundleStatus,
            automaticDiscountId: reconciled.automaticDiscountId,
            shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
          },
        ] as const;
      }),
  );
  const crossSellBundleMap = new Map(crossSellBundleEntries);
  const volumeBundleEntries = await Promise.all(
    volumeBundles
      .filter((bundle): bundle is typeof bundle & { productHandle: string } => Boolean(bundle.productHandle))
      .map(async (bundle) => {
        const reconciled = await reconcileBundleAutomaticDiscountState(params.admin, bundle);

        return [
          bundle.productHandle,
          {
            id: bundle.id,
            status: resolveBundleOperationalStatus({
              bundleStatus: normalizeBundleDatabaseStatus(reconciled.bundleStatus),
              automaticDiscountId: reconciled.automaticDiscountId,
              shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
            }),
            syncLabel: resolveBundleSyncLabel({
              automaticDiscountId: reconciled.automaticDiscountId,
              shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
            }),
            automaticDiscountId: reconciled.automaticDiscountId,
            shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
            offerCount: bundle.offers.length,
            bestSellerQuantity:
              bundle.offers.find(
                (offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller,
              )?.quantity || null,
          },
        ] as const;
      }),
  );

  const volumeBundleMap = new Map(volumeBundleEntries);

  const productsWithState: VolumeBundleProductCard[] = products
    .map((product) => ({
      ...product,
      enabled: settingsMap.get(product.handle) ?? true,
      hasCrossSellBundle: Boolean(crossSellBundleMap.get(product.handle)),
      hasActiveCrossSellBundle: crossSellBundleMap.get(product.handle)?.status === "ACTIVE",
      activeCrossSellBundleId: crossSellBundleMap.get(product.handle)?.id || null,
      activeCrossSellBundleTitle: crossSellBundleMap.get(product.handle)?.title || null,
      activeCrossSellBundleStatus:
        crossSellBundleMap.get(product.handle)?.shopifyDiscountStatus || null,
      volumeBundleId: volumeBundleMap.get(product.handle)?.id || null,
      volumeBundleStatus:
        volumeBundleMap.get(product.handle)?.status === "ACTIVE"
          ? ("ACTIVE" as const)
          : ("INACTIVE" as const),
      volumeBundleOfferCount: volumeBundleMap.get(product.handle)?.offerCount || 0,
      volumeBundleBestSellerQuantity:
        volumeBundleMap.get(product.handle)?.bestSellerQuantity || null,
      volumeBundleAutomaticDiscountId:
        volumeBundleMap.get(product.handle)?.automaticDiscountId || null,
    }))
    .sort((left, right) => {
      const leftRank = left.volumeBundleId ? (left.volumeBundleStatus === "ACTIVE" ? 0 : 1) : 2;
      const rightRank = right.volumeBundleId ? (right.volumeBundleStatus === "ACTIVE" ? 0 : 1) : 2;
      if (leftRank !== rightRank) return leftRank - rightRank;

      return left.title.localeCompare(right.title, "fr");
    });

  return {
    products: productsWithState,
    enabledCount: productsWithState.filter((product) => product.volumeBundleStatus === "ACTIVE").length,
    overriddenCount: productsWithState.filter(
      (product) => product.enabled && product.hasActiveCrossSellBundle,
    ).length,
  };
}

export async function saveVolumeBundleVisibility(params: {
  shop: string;
  productHandle: string;
  productId?: string;
  productTitle?: string;
  enabled: boolean;
}) {
  return prisma.simpleBundleProductSetting.upsert({
    where: {
      shop_productHandle: {
        shop: params.shop,
        productHandle: params.productHandle,
      },
    },
    update: {
      enabled: params.enabled,
      productId: params.productId || null,
      productTitle: params.productTitle || null,
    },
    create: {
      shop: params.shop,
      productHandle: params.productHandle,
      productId: params.productId || null,
      productTitle: params.productTitle || null,
      enabled: params.enabled,
    },
  });
}

export async function bulkSaveVolumeBundleVisibility(params: {
  shop: string;
  admin: { graphql: (query: string) => Promise<Response> };
  enabled: boolean;
}) {
  const products = await loadShopProducts(params.admin);

  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      await tx.simpleBundleProductSetting.upsert({
        where: {
          shop_productHandle: {
            shop: params.shop,
            productHandle: product.handle,
          },
        },
        update: {
          enabled: params.enabled,
          productId: product.id,
          productTitle: product.title,
        },
        create: {
          shop: params.shop,
          productHandle: product.handle,
          productId: product.id,
          productTitle: product.title,
          enabled: params.enabled,
        },
      });
    }
  });
}

export async function ensureDefaultVolumeBundleForProduct(params: {
  shop: string;
  admin: { graphql: (query: string) => Promise<Response> };
  productHandle: string;
  reuseExisting?: boolean;
  status?: "ACTIVE" | "DRAFT";
}) {
  const productHandle = params.productHandle.trim();
  if (!productHandle) return null;

  if (params.reuseExisting !== false) {
    const existingBundle = await prisma.bundle.findFirst({
      where: {
        shop: params.shop,
        bundleType: "VOLUME",
        productHandle,
      },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (existingBundle) {
      const normalizedBundle = await normalizeVolumeBundleOfferItems(existingBundle.id);
      const bundleForDiscount = normalizedBundle || existingBundle;
      const automaticDiscountId = await syncBundleAutomaticDiscount(
        params.admin,
        bundleForDiscount as any,
      );

      return prisma.bundle.update({
        where: { id: existingBundle.id },
        data: {
          status: "ACTIVE",
          automaticDiscountId,
        } as any,
        include: {
          offers: {
            orderBy: { sortOrder: "asc" },
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      });
    }
  }

  const snapshots = await loadProductSnapshots(params.admin, [productHandle]);
  const product = snapshots.get(productHandle);
  if (!product) return null;

  const selectedVariant = product.variants.find((entry) => entry.availableForSale) || product.variants[0];
  const appearance = await loadReusableBundleAppearance({
    shop: params.shop,
    productHandle,
  });

  const createdBundle = await prisma.$transaction(async (tx) => {
    const bundle = await tx.bundle.create({
      data: {
        shop: params.shop,
        bundleType: "VOLUME",
        title: `${product.title} volume bundle`,
        productId: product.id,
        productTitle: product.title,
        productHandle,
        status: params.status || "ACTIVE",
        showVariantPicker: true,
        showVariantThumbnails: false,
        designPreset: appearance.designPreset,
        timerPreset: appearance.timerPreset,
        effectsPreset: appearance.effectsPreset,
        primaryColor: appearance.primaryColor,
        textColor: appearance.textColor,
        heading: appearance.heading,
        subheading: appearance.subheading,
        eyebrow: appearance.eyebrow,
        headingSize: appearance.headingSize,
        subheadingSize: appearance.subheadingSize,
        offerTitleSize: appearance.offerTitleSize,
        offerPriceSize: appearance.offerPriceSize,
        cardGap: appearance.cardGap,
        cardPadding: appearance.cardPadding,
        offerRadius: appearance.offerRadius,
        bestSellerBadgePreset: appearance.bestSellerBadgePreset,
        bestSellerPngBadgePreset: appearance.bestSellerPngBadgePreset,
        bestSellerBadgeColor: appearance.bestSellerBadgeColor,
        bestSellerBadgeText: appearance.bestSellerBadgeText,
        saveBadgeColor: appearance.saveBadgeColor,
        saveBadgeText: appearance.saveBadgeText,
        saveBadgePrefix: appearance.saveBadgePrefix,
        showTimer: appearance.showTimer,
        timerEnd: appearance.timerEnd || null,
        timerPrefix: appearance.timerPrefix,
        timerExpiredText: appearance.timerExpiredText,
        timerBackgroundColor: appearance.timerBackgroundColor,
        timerTextColor: appearance.timerTextColor,
      } as any,
    });

    let bestSellerOfferId: string | null = null;
    const defaults = [
      {
        title: "Single",
        subtitle: "Standard price",
        quantity: 1,
        discountType: "PERCENTAGE" as const,
        discountValue: 0,
      },
      {
        title: "2 units",
        subtitle: "Buy 2 and save 10%",
        quantity: 2,
        discountType: "PERCENTAGE" as const,
        discountValue: 10,
      },
      {
        title: "3 units",
        subtitle: "Buy 3 and save 15%",
        quantity: 3,
        discountType: "PERCENTAGE" as const,
        discountValue: 15,
      },
    ];

    for (let index = 0; index < defaults.length; index += 1) {
      const offer = defaults[index];
      const createdOffer = await tx.bundleOffer.create({
        data: {
          bundleId: bundle.id,
          title: offer.title,
          subtitle: offer.subtitle,
          quantity: offer.quantity,
          discountType: offer.discountType,
          discountValue: offer.discountValue,
          isBestSeller: index === 1,
          sortOrder: index,
          items: {
            create: Array.from({ length: offer.quantity }, (_, itemIndex) => ({
              productId: product.handle,
              productTitle: product.title,
              variantId: selectedVariant?.id || null,
              variantTitle: selectedVariant?.title || null,
              quantity: 1,
              allowVariantSelection: true,
              showVariantThumbnails: false,
              sortOrder: itemIndex,
            })),
          },
        },
      });

      if (index === 1) {
        bestSellerOfferId = createdOffer.id;
      }
    }

    return tx.bundle.update({
      where: { id: bundle.id },
      data: { bestSellerOfferId } as any,
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
  });

  const automaticDiscountId = await syncBundleAutomaticDiscount(params.admin, createdBundle as any);
  return prisma.bundle.update({
    where: { id: createdBundle.id },
    data: { automaticDiscountId } as any,
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

export async function normalizeVolumeBundleOfferItems(bundleId: string) {
  const bundle = await prisma.bundle.findUnique({
    where: { id: bundleId },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!bundle || bundle.bundleType !== "VOLUME") {
    return bundle;
  }

  const needsNormalization = bundle.offers.some((offer) => {
    if (offer.items.length !== offer.quantity) return true;
    return offer.items.some((item) => Number(item.quantity || 1) !== 1);
  });

  if (!needsNormalization) {
    return bundle;
  }

  await prisma.$transaction(async (tx) => {
    for (const offer of bundle.offers) {
      const template = offer.items[0];
      if (!template) continue;

      await tx.bundleOfferItem.deleteMany({ where: { offerId: offer.id } });
      await tx.bundleOfferItem.createMany({
        data: Array.from({ length: offer.quantity }, (_, itemIndex) => ({
          offerId: offer.id,
          productId: template.productId,
          productTitle: template.productTitle,
          variantId: template.variantId,
          variantTitle: template.variantTitle,
          quantity: 1,
          allowVariantSelection: template.allowVariantSelection,
          showVariantThumbnails: template.showVariantThumbnails,
          sortOrder: itemIndex,
        })),
      });
    }
  });

  return prisma.bundle.findUnique({
    where: { id: bundleId },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}
