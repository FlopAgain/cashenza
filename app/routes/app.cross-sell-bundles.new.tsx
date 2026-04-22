import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { CSSProperties } from "react";

import { BundleConfiguratorForm } from "../components/bundle-configurator-form";
import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  deleteBundleAutomaticDiscount,
  syncBundleAutomaticDiscount,
} from "../utils/bundle-discount.server";
import {
  createDefaultAppearance,
  createDefaultBundleDraft,
  createDefaultItem,
  createDefaultOffer,
  ensureLength,
  normalizeTimerEndValue,
  safeParseJson,
  type BundleAppearanceDraft,
  type BundleDraftPayload,
  type BundleItemDraft,
  type BundleOfferDraft,
  MAX_ITEMS,
} from "../utils/bundle-configurator";
import { deactivateOtherActiveBundlesForProduct } from "../utils/multi-bundle-activation.server";

type ActionData = {
  errors?: string[];
  warnings?: string[];
  success?: boolean;
  draft?: BundleDraftPayload;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireStarterPlan(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const formData = await request.formData();

  const title = String(formData.get("title") || "").trim();
  const status = String(formData.get("status") || "DRAFT") === "ACTIVE" ? "ACTIVE" : "DRAFT";
  const itemCount = Math.max(1, Math.min(MAX_ITEMS, Number(formData.get("itemCount") || 1)));
  const bestSellerIndex = Math.max(
    1,
    Math.min(itemCount, Number(formData.get("bestSellerIndex") || 1)),
  );

  const items = ensureLength(
    safeParseJson<BundleItemDraft[]>(formData.get("itemsJson"), []),
    itemCount,
    createDefaultItem,
  );
  const offers = ensureLength(
    safeParseJson<BundleOfferDraft[]>(formData.get("offersJson"), []),
    itemCount,
    createDefaultOffer,
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
  items.forEach((item, index) => {
    if (!item.productHandle.trim()) {
      errors.push(`Item ${index + 1} requires a product handle.`);
    }
  });

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

  if (errors.length) {
    return { errors, draft } satisfies ActionData;
  }

  let savedBundleId = "";
  let deactivatedBundles: Array<{ id: string; automaticDiscountId: string | null }> = [];
  const primaryProductHandle = items[0]?.productHandle.trim() || "";

  await prisma.$transaction(async (tx) => {
    if (status === "ACTIVE" && primaryProductHandle) {
      deactivatedBundles = await deactivateOtherActiveBundlesForProduct(tx, {
        shop: session.shop,
        productHandle: primaryProductHandle,
      });
    }

    const bundle = await tx.bundle.create({
      data: {
        shop: session.shop,
        bundleType: "CROSS_SELL",
        title,
        productId: primaryProductHandle,
        productTitle: primaryProductHandle,
        productHandle: primaryProductHandle,
        status,
        showVariantPicker: items.some((item) => item.allowVariantSelection),
        showVariantThumbnails: items.some((item) => item.showVariantThumbnails),
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
    savedBundleId = bundle.id;

    let bestSellerOfferId: string | null = null;

    for (let offerIndex = 0; offerIndex < itemCount; offerIndex += 1) {
      const offer = offers[offerIndex];
      const offerItems = items.slice(0, offerIndex + 1);
      const createdOffer = await tx.bundleOffer.create({
        data: {
          bundleId: bundle.id,
          title: offer.title.trim() || `Offer ${offerIndex + 1}`,
          subtitle: offer.subtitle.trim() || null,
          quantity: offerIndex + 1,
          discountType: offer.discountType as never,
          discountValue: Number(offer.discountValue || 0),
          isBestSeller: bestSellerIndex === offerIndex + 1,
          sortOrder: offerIndex,
          items: {
            create: offerItems.map((item, itemIndex) => ({
              productId: item.productHandle.trim(),
              productTitle: item.productHandle.trim() || `Article ${itemIndex + 1}`,
              variantId:
                item.allowVariantSelection || !item.variantId.trim()
                  ? null
                  : item.variantId.trim(),
              variantTitle:
                item.allowVariantSelection || !item.variantTitle.trim()
                  ? null
                  : item.variantTitle.trim(),
              quantity: 1,
              allowVariantSelection: item.allowVariantSelection,
              showVariantThumbnails: item.showVariantThumbnails,
              sortOrder: itemIndex,
            })),
          },
        },
      });

      if (bestSellerIndex === offerIndex + 1) {
        bestSellerOfferId = createdOffer.id;
      }
    }

    if (bestSellerOfferId) {
      await tx.bundle.update({
        where: { id: bundle.id },
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
    where: { id: savedBundleId },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  })) as any;

  if (savedBundle) {
    try {
      const automaticDiscountId = await syncBundleAutomaticDiscount(admin, savedBundle);
      await prisma.bundle.update({
        where: { id: savedBundle.id },
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
    draft: createDefaultBundleDraft(),
  } satisfies ActionData;
};

export default function NewCrossSellBundlePage() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <s-page heading="New cross-sell bundle">
      <s-button slot="primary-action" href="/app/cross-sell-bundles">
        Back to cross-sell bundles
      </s-button>

      {actionData?.success ? (
        <s-banner tone="success">Cross-sell bundle created successfully.</s-banner>
      ) : null}

      {actionData?.warnings?.length ? (
        <s-banner tone="warning">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {actionData.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </s-banner>
      ) : null}

      {actionData?.errors?.length ? (
        <s-banner tone="critical">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {actionData.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </s-banner>
      ) : null}

      <BundleConfiguratorForm
        draft={actionData?.draft ?? createDefaultBundleDraft()}
        submitLabel="Save cross-sell bundle"
        isSubmitting={navigation.state === "submitting"}
        formAction="/app/cross-sell-bundles/new"
        aside={
          <div style={asideCard}>
            <h3 style={asideTitle}>How this works</h3>
            <ul style={asideList}>
              <li>This builder is for cross-sell bundles anchored to the current product page.</li>
              <li>Offer 1 starts with the page product, then each next offer includes the first N configured items.</li>
              <li>Style, timer, and badge settings stay saved with the bundle while cart discount logic remains Shopify-native.</li>
            </ul>
          </div>
        }
      />
    </s-page>
  );
}

const asideCard: CSSProperties = {
  padding: "20px",
  border: "1px solid #d8d8d8",
  borderRadius: "18px",
  background: "#ffffff",
};

const asideTitle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: "20px",
};

const asideList: CSSProperties = {
  margin: 0,
  paddingLeft: "18px",
  display: "grid",
  gap: "8px",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
