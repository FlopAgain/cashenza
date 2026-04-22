import prisma from "../db.server";
import { reconcileBundleAutomaticDiscountState, syncBundleAutomaticDiscount } from "./bundle-discount.server";
import { loadProductSnapshots } from "./product-snapshots.server";

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
  }>
> {
  const response = await admin.graphql(
    `#graphql
      query DashboardProducts {
        products(first: 100, query: "status:active") {
          nodes {
            id
            title
            handle
            featuredImage {
              url
            }
            variantsCount {
              count
            }
            totalInventory
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
    featuredImage: product.featuredImage?.url || null,
    variantsCount: Number(product.variantsCount?.count || 0),
    availableStock: Number(product.totalInventory || 0),
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
            status: reconciled.shopifyDiscountStatus,
            bundleStatus: reconciled.bundleStatus,
            automaticDiscountId: reconciled.automaticDiscountId,
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
            status: reconciled.bundleStatus,
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
      activeCrossSellBundleStatus: crossSellBundleMap.get(product.handle)?.status || null,
      volumeBundleId: volumeBundleMap.get(product.handle)?.id || null,
      volumeBundleStatus:
        volumeBundleMap.get(product.handle)?.status === "ACTIVE" &&
        Boolean(volumeBundleMap.get(product.handle)?.automaticDiscountId) &&
        volumeBundleMap.get(product.handle)?.shopifyDiscountStatus === "ACTIVE"
          ? ("ACTIVE" as const)
          : ("INACTIVE" as const),
      volumeBundleOfferCount: volumeBundleMap.get(product.handle)?.offerCount || 0,
      volumeBundleBestSellerQuantity:
        volumeBundleMap.get(product.handle)?.bestSellerQuantity || null,
      volumeBundleAutomaticDiscountId:
        volumeBundleMap.get(product.handle)?.automaticDiscountId || null,
    }))
    .sort((left, right) => {
      const leftRank = left.volumeBundleStatus === "ACTIVE" ? 0 : 1;
      const rightRank = right.volumeBundleStatus === "ACTIVE" ? 0 : 1;
      if (leftRank !== rightRank) return leftRank - rightRank;

      if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;

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
}) {
  const productHandle = params.productHandle.trim();
  if (!productHandle) return null;

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
    return normalizeVolumeBundleOfferItems(existingBundle.id);
  }

  const snapshots = await loadProductSnapshots(params.admin, [productHandle]);
  const product = snapshots.get(productHandle);
  if (!product) return null;

  const selectedVariant = product.variants.find((entry) => entry.availableForSale) || product.variants[0];

  const createdBundle = await prisma.$transaction(async (tx) => {
    const bundle = await tx.bundle.create({
      data: {
        shop: params.shop,
        bundleType: "VOLUME",
        title: `${product.title} volume bundle`,
        productId: product.id,
        productTitle: product.title,
        productHandle,
        status: "ACTIVE",
        showVariantPicker: true,
        showVariantThumbnails: false,
        designPreset: "soft",
        timerPreset: "soft",
        effectsPreset: "none",
        primaryColor: "#8db28a",
        textColor: "#1a2118",
        heading: "Choose your bundle",
        subheading: "Pick the offer that fits your customer best.",
        eyebrow: "Bundle and save",
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
        timerEnd: null,
        timerPrefix: "Offer ends in",
        timerExpiredText: "Offer expired",
        timerBackgroundColor: "#1a2118",
        timerTextColor: "#ffffff",
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
