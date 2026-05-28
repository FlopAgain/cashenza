import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { BundleConfiguratorForm } from "../components/bundle-configurator-form";
import { ConfiguratorSubmissionSpinner } from "../components/configurator-submission-spinner";
import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  deleteBundleAutomaticDiscount,
  reconcileBundleAutomaticDiscountState,
  syncBundleAutomaticDiscount,
} from "../utils/bundle-discount.server";
import {
  normalizeBundleDatabaseStatus,
  resolveBundleOperationalStatus,
  resolveShopifyDiscountStatusLabel,
} from "../utils/bundle-status";
import {
  createDefaultAppearance,
  createDefaultItem,
  createDefaultOffer,
  ensureLength,
  getCrossSellOfferItemCount,
  getMaxCrossSellItemSlots,
  normalizeQuantity,
  normalizeTimerEndValue,
  safeParseJson,
  type BundleAppearanceDraft,
  type BundleDraftPayload,
  type BundleItemDraft,
  type BundleOfferDraft,
  MAX_ITEMS,
} from "../utils/bundle-configurator";
import {
  loadProductSnapshots,
  snapshotsToRecord,
} from "../utils/product-snapshots.server";
import { deactivateOtherActiveBundlesForProduct } from "../utils/multi-bundle-activation.server";
import {
  loadShopProducts,
  normalizeVolumeBundleOfferItems,
} from "../utils/volume-bundles.server";

type ActionData = {
  errors?: string[];
  warnings?: string[];
  success?: boolean;
  expirationSynced?: boolean;
  draft?: BundleDraftPayload;
  shopifyDiscountStatus?: "ACTIVE" | "EXPIRED" | "MISSING" | "UNKNOWN";
};

type LoadedBundle = {
  id: string;
  shop: string;
  bundleType: "CROSS_SELL" | "VOLUME";
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  title: string;
  productHandle: string | null;
  bestSellerOfferId: string | null;
  designPreset: string;
  timerPreset: string;
  effectsPreset: string;
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
  bestSellerBadgePreset: string;
  bestSellerPngBadgePreset: string;
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
  offers: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
    discountValue: number;
    isBestSeller: boolean;
    quantity: number;
    showQuantitySelector: boolean;
    quantityOptions: string | null;
    items: Array<{
      productId: string;
      productTitle: string | null;
      variantId: string | null;
      variantTitle: string | null;
      quantity: number;
      allowVariantSelection: boolean;
      showVariantThumbnails: boolean;
    }>;
  }>;
};

function bundleToDraft(bundle: LoadedBundle): BundleDraftPayload {
  const itemCount = bundle.offers.length || 1;
  const items =
    bundle.offers[bundle.offers.length - 1]?.items.map((item) => ({
      productHandle: item.productId,
      allowVariantSelection: item.allowVariantSelection,
      showVariantThumbnails: item.showVariantThumbnails,
      variantId: item.variantId || "",
      variantTitle: item.variantTitle || "",
    })) || ensureLength([], itemCount, createDefaultItem);
  const offers = bundle.offers.map((offer, offerIndex) => ({
    title: offer.title,
    subtitle: offer.subtitle || "",
    discountType: offer.discountType,
    discountValue: Number(offer.discountValue || 0),
    quantity: normalizeQuantity(offer.quantity, offerIndex + 1),
    itemQuantities: ensureLength(
      offer.items.map((item) => normalizeQuantity(item.quantity, 1)),
      offerIndex + 1,
      () => 1,
    ),
    showQuantitySelector: Boolean((offer as any).showQuantitySelector),
    quantityOptions: (offer as any).quantityOptions || "",
  }));
  const matchedBestSellerIndex = bundle.offers.findIndex(
    (offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller,
  );

  return {
    title: bundle.title,
    status: bundle.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    itemCount,
    bestSellerIndex: matchedBestSellerIndex >= 0 ? matchedBestSellerIndex + 1 : 0,
    items: ensureLength(items, itemCount, createDefaultItem),
    offers: ensureLength(offers, itemCount, createDefaultOffer),
    productSnapshots: {},
    appearance: {
      ...createDefaultAppearance(),
      designPreset: bundle.designPreset,
      timerPreset: bundle.timerPreset,
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
      bestSellerPngBadgePreset: bundle.bestSellerPngBadgePreset,
      bestSellerBadgeColor: bundle.bestSellerBadgeColor,
      bestSellerBadgeText: bundle.bestSellerBadgeText,
      saveBadgeColor: bundle.saveBadgeColor,
      saveBadgeText: bundle.saveBadgeText,
      saveBadgePrefix: bundle.saveBadgePrefix,
      showTimer: bundle.showTimer,
      timerEnd: bundle.timerEnd || "",
      timerPrefix: bundle.timerPrefix,
      timerExpiredText: bundle.timerExpiredText,
      timerBackgroundColor: bundle.timerBackgroundColor,
      timerTextColor: bundle.timerTextColor,
    },
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const url = new URL(request.url);
  const bundleId = params.bundleId;
  if (!bundleId) throw new Response("Bundle not found", { status: 404 });

  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shop: session.shop },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!bundle) throw new Response("Bundle not found", { status: 404 });

  const volumeBundle =
    bundle.bundleType === "CROSS_SELL" && bundle.productHandle
      ? await prisma.bundle.findFirst({
          where: {
            shop: session.shop,
            bundleType: "VOLUME",
            productHandle: bundle.productHandle,
          },
          select: {
            id: true,
            title: true,
            status: true,
            automaticDiscountId: true,
          },
          orderBy: { updatedAt: "desc" },
        })
      : null;

  const volumeBundleStatus =
    volumeBundle?.automaticDiscountId
      ? await reconcileBundleAutomaticDiscountState(admin, {
          id: volumeBundle.id,
          status: volumeBundle.status,
          automaticDiscountId: volumeBundle.automaticDiscountId,
        })
      : null;
  const volumeBundleBaseOffer =
    volumeBundle &&
    volumeBundleStatus &&
    resolveBundleOperationalStatus({
      bundleStatus: normalizeBundleDatabaseStatus(volumeBundleStatus.bundleStatus),
      automaticDiscountId: volumeBundleStatus.automaticDiscountId,
      shopifyDiscountStatus: volumeBundleStatus.shopifyDiscountStatus,
    }) === "ACTIVE"
      ? { id: volumeBundle.id, title: volumeBundle.title }
      : null;

  const reconciledBundle = await reconcileBundleAutomaticDiscountState(admin, {
    id: bundle.id,
    status: bundle.status,
    automaticDiscountId: bundle.automaticDiscountId,
  });

  let productSnapshots: Record<string, any> = {};
  let productOptions: Awaited<ReturnType<typeof loadShopProducts>> = [];
  try {
    const handles = bundle.offers.flatMap((offer) => offer.items.map((item) => item.productId));
    const [snapshots, products] = await Promise.all([
      loadProductSnapshots(admin, handles),
      loadShopProducts(admin),
    ]);
    productSnapshots = snapshotsToRecord(snapshots);
    productOptions = products;
  } catch {
    productSnapshots = {};
    productOptions = [];
  }

  return {
    shop: session.shop,
    bundleId: bundle.id,
    shopifyDiscountStatus: reconciledBundle.shopifyDiscountStatus,
    bundleType: bundle.bundleType,
    volumeBundleBaseOffer,
    productOptions,
    returnTo: url.searchParams.get("returnTo") || "/app/bundles",
    draft: {
      ...bundleToDraft({
        ...(bundle as any),
        status: reconciledBundle.shopifyDiscountStatus === "ACTIVE" ? "ACTIVE" : "DRAFT",
      }),
      productSnapshots,
    },
    duplicated: url.searchParams.get("duplicated") === "1",
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const bundleId = params.bundleId;
  if (!bundleId) throw new Response("Bundle not found", { status: 404 });

  const existingBundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shop: session.shop },
  });
  if (!existingBundle) throw new Response("Bundle not found", { status: 404 });

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");
  if (intent === "delete") {
    if ((existingBundle as any).automaticDiscountId) {
      try {
        await deleteBundleAutomaticDiscount(admin, (existingBundle as any).automaticDiscountId);
      } catch {
        // Best-effort cleanup before the local bundle is removed.
      }
    }

    await prisma.bundle.delete({ where: { id: bundleId } });
    return redirect("/app/bundles");
  }

  const title = String(formData.get("title") || "").trim();
  const status = String(formData.get("status") || "DRAFT") === "ACTIVE" ? "ACTIVE" : "DRAFT";
  const itemCount = Math.max(1, Math.min(MAX_ITEMS, Number(formData.get("itemCount") || 1)));
  const bestSellerIndexRaw = String(formData.get("bestSellerIndex") || "0").trim();
  const bestSellerIndex =
    bestSellerIndexRaw === "0" || bestSellerIndexRaw.toLowerCase() === "none"
      ? 0
      : Math.max(1, Math.min(itemCount, Number(bestSellerIndexRaw || 1)));
  const offers = ensureLength(
    safeParseJson<BundleOfferDraft[]>(formData.get("offersJson"), []),
    itemCount,
    createDefaultOffer,
  );
  const items = ensureLength(
    safeParseJson<BundleItemDraft[]>(formData.get("itemsJson"), []),
    existingBundle.bundleType === "VOLUME" ? 1 : getMaxCrossSellItemSlots(offers),
    createDefaultItem,
  );
  const appearance = {
    ...createDefaultAppearance(),
    ...safeParseJson<Partial<BundleAppearanceDraft>>(
      formData.get("appearanceJson"),
      {},
    ),
  };
  appearance.timerEnd = normalizeTimerEndValue(appearance.timerEnd);

  const errors: string[] = [];
  if (!title) errors.push("Bundle title is required.");
  if (intent === "sync-discount-expiration" && !appearance.timerEnd) {
    errors.push("Set an end date before syncing the Shopify discount expiration.");
  }
  if (existingBundle.bundleType === "VOLUME") {
    if (!items[0]?.productHandle.trim()) {
      errors.push("Volume bundle requires a product handle.");
    }
  } else {
    items.forEach((item, index) => {
      if (!item.productHandle.trim()) {
        errors.push(`Item ${index + 1} requires a product handle.`);
      }
    });
  }

  const draft = {
    title,
    status,
    itemCount,
    bestSellerIndex,
    items,
    offers,
    appearance,
    productSnapshots: {},
  } satisfies BundleDraftPayload;

  if (errors.length) return { errors, draft } satisfies ActionData;

  let deactivatedBundles: Array<{ id: string; automaticDiscountId: string | null }> = [];
  const primaryProductHandle =
    existingBundle.bundleType === "VOLUME"
      ? existingBundle.productHandle || items[0]?.productHandle.trim() || ""
      : items[0]?.productHandle.trim() || "";
  const volumeItem = {
    ...(items[0] || createDefaultItem(0)),
    productHandle: primaryProductHandle,
  };

  await prisma.$transaction(async (tx) => {
    if (status === "ACTIVE" && primaryProductHandle) {
      deactivatedBundles = await deactivateOtherActiveBundlesForProduct(tx, {
        shop: session.shop,
        productHandle: primaryProductHandle,
        bundleType: existingBundle.bundleType as "CROSS_SELL" | "VOLUME",
        keepBundleId: bundleId,
      });
    }

    await tx.bundleOfferItem.deleteMany({ where: { offer: { bundleId } } });
    await tx.bundleOffer.deleteMany({ where: { bundleId } });

    await tx.bundle.update({
      where: { id: bundleId },
      data: {
        bundleType: existingBundle.bundleType,
        title,
        productId: primaryProductHandle,
        productTitle: primaryProductHandle,
        productHandle: primaryProductHandle,
        status,
        bestSellerOfferId: null,
        showVariantPicker:
          existingBundle.bundleType === "VOLUME"
            ? volumeItem.allowVariantSelection
            : items.some((item) => item.allowVariantSelection),
        showVariantThumbnails:
          existingBundle.bundleType === "VOLUME"
            ? volumeItem.showVariantThumbnails
            : items.some((item) => item.showVariantThumbnails),
        designPreset: appearance.designPreset,
        timerPreset: appearance.timerPreset,
        effectsPreset: appearance.effectsPreset,
        primaryColor: appearance.primaryColor,
        textColor: appearance.textColor,
        eyebrow: appearance.eyebrow,
        heading: appearance.heading,
        subheading: appearance.subheading,
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
    for (let offerIndex = 0; offerIndex < itemCount; offerIndex += 1) {
      const offer = offers[offerIndex];
      const crossSellOfferItemCount =
        existingBundle.bundleType === "VOLUME"
          ? 1
          : getCrossSellOfferItemCount(offer, offerIndex);
      const offerQuantity =
        existingBundle.bundleType === "VOLUME"
          ? offerIndex === 0 && offer.showQuantitySelector
            ? 1
            : normalizeQuantity(offer.quantity, offerIndex + 1)
          : Array.from({ length: crossSellOfferItemCount }, (_, itemIndex) =>
              normalizeQuantity(offer.itemQuantities?.[itemIndex], 1),
            ).reduce((sum, quantity) => sum + quantity, 0);
      const offerItems =
        existingBundle.bundleType === "VOLUME"
          ? Array.from({ length: offerQuantity }, () => volumeItem)
          : items.slice(0, crossSellOfferItemCount);
      const createdOffer = await tx.bundleOffer.create({
        data: {
          bundleId,
          title: offer.title.trim() || `Offer ${offerIndex + 1}`,
          subtitle: offer.subtitle.trim() || null,
          quantity: offerQuantity,
          showQuantitySelector: offerIndex === 0 && Boolean(offer.showQuantitySelector),
          quantityOptions:
            offerIndex === 0 && offer.showQuantitySelector
              ? String(offer.quantityOptions || "").trim()
              : null,
          discountType: offer.discountType as never,
          discountValue: Number(offer.discountValue || 0),
          isBestSeller: bestSellerIndex > 0 && bestSellerIndex === offerIndex + 1,
          sortOrder: offerIndex,
          items: {
            create: offerItems.map((item, itemIndex) => ({
              productId: item.productHandle.trim(),
              productTitle:
                existingBundle.bundleType === "VOLUME"
                  ? existingBundle.productTitle || item.productHandle.trim()
                  : item.productHandle.trim() || `Article ${itemIndex + 1}`,
              variantId:
                item.allowVariantSelection || !item.variantId.trim()
                  ? null
                  : item.variantId.trim(),
              variantTitle:
                item.allowVariantSelection || !item.variantTitle.trim()
                  ? null
                  : item.variantTitle.trim(),
              quantity:
                existingBundle.bundleType === "VOLUME"
                  ? 1
                  : normalizeQuantity(offer.itemQuantities?.[itemIndex], 1),
              allowVariantSelection: item.allowVariantSelection,
              showVariantThumbnails: item.showVariantThumbnails,
              sortOrder: itemIndex,
            })),
          },
        },
      });
      if (bestSellerIndex > 0 && bestSellerIndex === offerIndex + 1) {
        bestSellerOfferId = createdOffer.id;
      }
    }

    if (bestSellerOfferId) {
      await tx.bundle.update({
        where: { id: bundleId },
        data: { bestSellerOfferId } as any,
      });
    }
  });

  const warnings: string[] = [];

  if (deactivatedBundles.length > 0) {
    warnings.push(
      deactivatedBundles.length === 1
        ? "Another active cross-sell bundle for this product was automatically moved to draft."
        : `${deactivatedBundles.length} other active cross-sell bundles for this product were automatically moved to draft.`,
    );
  }

  for (const bundle of deactivatedBundles) {
    if (!bundle.automaticDiscountId) continue;

    try {
      await deleteBundleAutomaticDiscount(admin, bundle.automaticDiscountId);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Previous active bundle cleanup failed: ${error.message}`
          : "Previous active bundle cleanup failed.",
      );
    }
  }

  const savedBundle = (await prisma.bundle.findUnique({
    where: { id: bundleId },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  })) as any;

  let bundleForDiscount = savedBundle;
  if (savedBundle?.bundleType === "VOLUME") {
    bundleForDiscount = (await normalizeVolumeBundleOfferItems(savedBundle.id)) || savedBundle;
  }

  if (bundleForDiscount) {
    try {
      const automaticDiscountId = await syncBundleAutomaticDiscount(admin, bundleForDiscount);
      await prisma.bundle.update({
        where: { id: bundleId },
        data: { automaticDiscountId } as any,
      });
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : "Bundle saved, but automatic discount sync failed.",
      );
    }
  }

  return {
    success: true,
    warnings,
    expirationSynced: intent === "sync-discount-expiration",
    draft,
    shopifyDiscountStatus: status === "ACTIVE" ? "ACTIVE" : "EXPIRED",
  } satisfies ActionData;
};

export default function EditBundlePage() {
  const {
    bundleId,
    bundleType,
    draft,
    duplicated,
    returnTo,
    shopifyDiscountStatus,
    volumeBundleBaseOffer,
    productOptions,
  } =
    useLoaderData<typeof loader>();
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const showActionFeedback = !isSubmitting;
  const activeDraft = actionData?.draft ?? draft;
  const displayedShopifyDiscountStatus =
    actionData?.shopifyDiscountStatus ?? shopifyDiscountStatus;
  const isVolumeBundle = bundleType === "VOLUME";
  const bundleKindLabel = isVolumeBundle ? "volume bundle" : "cross-sell bundle";
  const mode = isVolumeBundle ? "volume" : "cross-sell";

  return (
    <s-page heading={`Edit ${bundleKindLabel}`}>
      <div style={styles.pageActions}>
        <a href={returnTo} style={styles.backLink}>
          Back to bundles
        </a>
      </div>

      {isSubmitting ? <ConfiguratorSubmissionSpinner /> : null}

      {showActionFeedback && actionData?.success ? (
        <s-banner tone="success">
          {actionData.expirationSynced
            ? "Shopify discount expiration updated from the timer end date."
            : `${isVolumeBundle ? "Volume bundle" : "Cross-sell bundle"} updated successfully.`}
        </s-banner>
      ) : null}

      {duplicated ? (
        <s-banner tone="success">
          Bundle duplicated successfully. Review it, adjust anything you want, then save when ready.
        </s-banner>
      ) : null}

      {displayedShopifyDiscountStatus === "MISSING" ? (
        <s-banner tone="warning">
          Shopify discount is missing for this {bundleKindLabel}. Save the bundle to recreate the discount, or delete the bundle if you no longer want to use it.
        </s-banner>
      ) : null}

      {displayedShopifyDiscountStatus !== "MISSING" && displayedShopifyDiscountStatus !== "ACTIVE" ? (
        <s-banner tone="warning">
          Shopify discount status is currently {resolveShopifyDiscountStatusLabel(displayedShopifyDiscountStatus)}.
        </s-banner>
      ) : null}

      {showActionFeedback && actionData?.warnings?.length ? (
        <s-banner tone="warning">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {actionData.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </s-banner>
      ) : null}

      {showActionFeedback && actionData?.errors?.length ? (
        <s-banner tone="critical">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {actionData.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </s-banner>
      ) : null}

      <BundleConfiguratorForm
        draft={activeDraft}
        submitLabel={isVolumeBundle ? "Save volume bundle" : "Save cross-sell changes"}
        isSubmitting={isSubmitting}
        formAction={`/app/bundles/${bundleId}`}
        mode={mode}
        productOptions={productOptions}
        volumeBundleBaseOffer={isVolumeBundle ? null : volumeBundleBaseOffer}
        showDeleteAction
        dirtyResetSignal={actionData?.success ? actionData : undefined}
      />
    </s-page>
  );
}

const styles = {
  pageActions: {
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: "16px",
  },
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #c7d4bf",
    color: "#1d3124",
    background: "#ffffff",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
  },
} as const;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
