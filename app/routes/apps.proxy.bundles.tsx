import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { syncBundleAutomaticDiscount } from "../utils/bundle-discount.server";

type ProductSnapshot = {
  id: string;
  handle: string;
  title: string;
  featuredImage: string | null;
  variants: Array<{
    id: string;
    title: string;
    price: string;
    featuredImage: string | null;
    availableForSale: boolean;
  }>;
};

async function loadProductSnapshots(
  admin: NonNullable<Awaited<ReturnType<typeof authenticate.public.appProxy>>["admin"]>,
  handles: string[],
) {
  const uniqueHandles = [...new Set(handles.filter(Boolean))];
  const snapshots = new Map<string, ProductSnapshot>();

  for (const handle of uniqueHandles) {
    const response = await admin.graphql(
      `#graphql
        query ProductByHandle($handle: String!) {
          productByHandle(handle: $handle) {
            id
            handle
            title
            featuredImage {
              url
            }
            variants(first: 50) {
              nodes {
                id
                title
                price
                availableForSale
                image {
                  url
                }
              }
            }
          }
        }`,
      { variables: { handle } },
    );

    const json = await response.json();
    const product = json.data?.productByHandle;

    if (!product) continue;

    snapshots.set(handle, {
      id: product.id,
      handle: product.handle,
      title: product.title,
      featuredImage: product.featuredImage?.url || null,
      variants: (product.variants?.nodes || []).map((variant: any) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        featuredImage: variant.image?.url || null,
        availableForSale: variant.availableForSale,
      })),
    });
  }

  return snapshots;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const productHandle = url.searchParams.get("product_handle")?.trim() || "";
    const limit = Math.max(1, Math.min(20, Number(url.searchParams.get("limit") || 10)));
    let session:
      | Awaited<ReturnType<typeof authenticate.public.appProxy>>["session"]
      | null = null;
    let admin:
      | Awaited<ReturnType<typeof authenticate.public.appProxy>>["admin"]
      | null = null;
    let authError: string | null = null;

    try {
      const authResult = await authenticate.public.appProxy(request);
      session = authResult.session;
      admin = authResult.admin;
    } catch (error) {
      authError =
        error instanceof Error ? error.message : "Unknown app proxy auth error";
    }

    const shop =
      session?.shop ||
      url.searchParams.get("shop")?.trim() ||
      request.headers.get("x-shopify-shop-domain")?.trim() ||
      "";

    const bundles = await prisma.bundle.findMany({
      where: {
        ...(shop ? { shop } : {}),
        status: "ACTIVE",
        ...(productHandle ? { productHandle } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      take: limit,
    });

    if (admin) {
      for (const bundle of bundles as any[]) {
        if (bundle.status !== "ACTIVE") continue;

        try {
          const automaticDiscountId = await syncBundleAutomaticDiscount(admin, bundle);
          if (automaticDiscountId !== bundle.automaticDiscountId) {
            bundle.automaticDiscountId = automaticDiscountId;
            await prisma.bundle.update({
              where: { id: bundle.id },
              data: { automaticDiscountId } as any,
            });
          }
        } catch (error) {
          authError =
            authError ||
            (error instanceof Error
              ? `Automatic discount sync failed: ${error.message}`
              : "Automatic discount sync failed");
        }
      }
    }

    let snapshots = new Map<string, ProductSnapshot>();
    if (admin) {
      try {
        const productHandles = bundles.flatMap((bundle) =>
          bundle.offers.flatMap((offer) => offer.items.map((item) => item.productId)),
        );
        snapshots = await loadProductSnapshots(admin, productHandles);
      } catch (error) {
        authError =
          authError ||
          (error instanceof Error
            ? `Snapshot load failed: ${error.message}`
            : "Snapshot load failed");
      }
    }

    return Response.json({
      ok: true,
      shop: shop || null,
      productHandle: productHandle || null,
      productSnapshotsLoaded: Boolean(admin),
      authError,
      bundles: bundles.map((bundle) => ({
      id: bundle.id,
      title: bundle.title,
      productHandle: bundle.productHandle,
      bestSellerOfferId: bundle.bestSellerOfferId,
      showVariantPicker: bundle.showVariantPicker,
      showVariantThumbnails: bundle.showVariantThumbnails,
      appearance: {
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
      },
      offers: bundle.offers.map((offer) => ({
          id: offer.id,
          title: offer.title,
          subtitle: offer.subtitle,
          quantity: offer.quantity,
          discountType: offer.discountType,
          discountValue: offer.discountValue,
          isBestSeller: offer.isBestSeller,
          items: offer.items.map((item) => ({
            id: item.id,
            label: item.productTitle,
            productHandle: item.productId,
            product: snapshots.get(item.productId) || null,
            variantId: item.variantId,
            variantTitle: item.variantTitle,
            allowVariantSelection: item.allowVariantSelection,
            showVariantThumbnails: item.showVariantThumbnails,
            quantity: item.quantity,
          })),
        })),
      })),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown proxy error",
      },
      { status: 200 },
    );
  }
};
