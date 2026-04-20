import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useActionData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { CSSProperties } from "react";

import { BundleConfiguratorForm } from "../components/bundle-configurator-form";
import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import { syncBundleAutomaticDiscount } from "../utils/bundle-discount.server";
import {
  createDefaultAppearance,
  createDefaultBundleDraft,
  createDefaultItem,
  createDefaultOffer,
  ensureLength,
  safeParseJson,
  type BundleAppearanceDraft,
  type BundleDraftPayload,
  type BundleItemDraft,
  type BundleOfferDraft,
  MAX_ITEMS,
} from "../utils/bundle-configurator";

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

  const errors: string[] = [];
  if (!title) errors.push("Bundle title is required.");
  items.forEach((item, index) => {
    if (!item.productHandle.trim()) {
      errors.push(`Article ${index + 1} requires a product handle.`);
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
  } satisfies BundleDraftPayload;

  if (errors.length) {
    return { errors, draft } satisfies ActionData;
  }

  let savedBundleId = "";

  await prisma.$transaction(async (tx) => {
    const bundle = await tx.bundle.create({
      data: {
        shop: session.shop,
        title,
        productId: items[0].productHandle,
        productTitle: items[0].label,
        productHandle: items[0].productHandle,
        status,
        showVariantPicker: items.some((item) => item.allowVariantSelection),
        showVariantThumbnails: items.some((item) => item.showVariantThumbnails),
        designPreset: appearance.designPreset,
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
              productTitle: item.label.trim() || `Article ${itemIndex + 1}`,
              variantId: null,
              variantTitle: null,
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

export default function NewBundlePage() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();

  return (
    <s-page heading="New bundle configurator">
      <s-button slot="primary-action" href="/app">
        Back to dashboard
      </s-button>

      {actionData?.success ? (
        <s-banner tone="success">Bundle created successfully.</s-banner>
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
        submitLabel="Save bundle"
        isSubmitting={navigation.state === "submitting"}
        aside={
          <div style={asideCard}>
            <h3 style={asideTitle}>How this works</h3>
            <ul style={asideList}>
              <li>Each offer automatically includes the first N articles.</li>
              <li>Use Style, Timer, and Discounts as real product tabs.</li>
              <li>These settings are now saved with the bundle itself.</li>
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
