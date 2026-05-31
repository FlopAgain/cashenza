import type { LoaderFunctionArgs } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import type { ProductSnapshotDraft } from "../utils/bundle-configurator";
import { loadProductSnapshots } from "../utils/product-snapshots.server";
import { normalizeVolumeBundleOfferItems } from "../utils/volume-bundles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const url = new URL(request.url);
    const productHandle = url.searchParams.get("product_handle")?.trim() || "";
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

    const crossSellBundles = await prisma.bundle.findMany({
      where: {
        ...(shop ? { shop } : {}),
        bundleType: "CROSS_SELL",
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
      take: 1,
    });

    const volumeBundle = productHandle
      ? await prisma.bundle.findFirst({
          where: {
            ...(shop ? { shop } : {}),
            bundleType: "VOLUME",
            status: "ACTIVE",
            productHandle,
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
        })
      : null;
    let resolvedVolumeBundle = volumeBundle;
    if (resolvedVolumeBundle?.bundleType === "VOLUME") {
      resolvedVolumeBundle = await normalizeVolumeBundleOfferItems(resolvedVolumeBundle.id);
    }

    const finalSelectedBundles = [
      ...(resolvedVolumeBundle ? [resolvedVolumeBundle] : []),
      ...crossSellBundles,
    ];

    let snapshots = new Map<string, ProductSnapshotDraft | null>();
    if (admin) {
      try {
        const productHandles = finalSelectedBundles.flatMap((bundle) =>
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
      simpleBundleEnabled: true,
      productSnapshotsLoaded: Boolean(admin),
      authError,
      bundles: finalSelectedBundles.map((bundle, bundleIndex) => ({
        id: bundle.id,
        bundleType: bundle.bundleType,
        hideBaseOffer: finalSelectedBundles.length > 1 && bundleIndex > 0,
        title: bundle.title,
        productHandle: bundle.productHandle,
        bestSellerOfferId: bundle.bestSellerOfferId,
        showVariantPicker: bundle.showVariantPicker,
        showVariantThumbnails: bundle.showVariantThumbnails,
        appearance: {
          designPreset: bundle.designPreset,
          timerPreset: (bundle as any).timerPreset || "soft",
          effectsPreset: (bundle as any).effectsPreset || "fade in",
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
          bestSellerBadgePreset: bundle.bestSellerBadgePreset,
          bestSellerPngBadgePreset: (bundle as any).bestSellerPngBadgePreset || "none",
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
          timerPrefixColor: (bundle as any).timerPrefixColor || "#6b7280",
        },
        offers: bundle.offers.map((offer) => ({
          id: offer.id,
          title: offer.title,
          subtitle: offer.subtitle,
          quantity: offer.quantity,
          showQuantitySelector: Boolean((offer as any).showQuantitySelector),
          quantityOptions: (offer as any).quantityOptions || "",
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
