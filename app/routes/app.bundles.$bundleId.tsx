import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData, useNavigation } from "react-router";
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

type LoadedBundle = {
  id: string;
  shop: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  title: string;
  productHandle: string | null;
  bestSellerOfferId: string | null;
  designPreset: string;
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
    items: Array<{
      productId: string;
      productTitle: string | null;
      allowVariantSelection: boolean;
      showVariantThumbnails: boolean;
    }>;
  }>;
};

function bundleToDraft(bundle: LoadedBundle): BundleDraftPayload {
  const itemCount = bundle.offers.length || 1;
  const items =
    bundle.offers[bundle.offers.length - 1]?.items.map((item, index) => ({
      label: item.productTitle || `Article ${index + 1}`,
      productHandle: item.productId,
      allowVariantSelection: item.allowVariantSelection,
      showVariantThumbnails: item.showVariantThumbnails,
    })) || ensureLength([], itemCount, createDefaultItem);
  const offers = bundle.offers.map((offer) => ({
    title: offer.title,
    subtitle: offer.subtitle || "",
    discountType: offer.discountType,
    discountValue: Number(offer.discountValue || 0),
  }));
  const matchedBestSellerIndex = bundle.offers.findIndex(
    (offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller,
  );

  return {
    title: bundle.title,
    status: bundle.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    itemCount,
    bestSellerIndex: matchedBestSellerIndex >= 0 ? matchedBestSellerIndex + 1 : 1,
    items: ensureLength(items, itemCount, createDefaultItem),
    offers: ensureLength(offers, itemCount, createDefaultOffer),
    appearance: {
      ...createDefaultAppearance(),
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
      timerEnd: bundle.timerEnd || "",
      timerPrefix: bundle.timerPrefix,
      timerExpiredText: bundle.timerExpiredText,
      timerBackgroundColor: bundle.timerBackgroundColor,
      timerTextColor: bundle.timerTextColor,
    },
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await requireStarterPlan(request);
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

  return {
    shop: session.shop,
    bundleId: bundle.id,
    draft: bundleToDraft(bundle),
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
  if (String(formData.get("intent") || "save") === "delete") {
    if ((existingBundle as any).automaticDiscountId) {
      try {
        await deleteBundleAutomaticDiscount(admin, (existingBundle as any).automaticDiscountId);
      } catch {
        // Best-effort cleanup before the local bundle is removed.
      }
    }

    await prisma.bundle.delete({ where: { id: bundleId } });
    return redirect("/app");
  }

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

  if (errors.length) return { errors, draft } satisfies ActionData;

  await prisma.$transaction(async (tx) => {
    await tx.bundleOfferItem.deleteMany({ where: { offer: { bundleId } } });
    await tx.bundleOffer.deleteMany({ where: { bundleId } });

    await tx.bundle.update({
      where: { id: bundleId },
      data: {
        title,
        productId: items[0].productHandle,
        productTitle: items[0].label,
        productHandle: items[0].productHandle,
        status,
        bestSellerOfferId: null,
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

    let bestSellerOfferId: string | null = null;
    for (let offerIndex = 0; offerIndex < itemCount; offerIndex += 1) {
      const offer = offers[offerIndex];
      const offerItems = items.slice(0, offerIndex + 1);
      const createdOffer = await tx.bundleOffer.create({
        data: {
          bundleId,
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
      if (bestSellerIndex === offerIndex + 1) bestSellerOfferId = createdOffer.id;
    }

    if (bestSellerOfferId) {
      await tx.bundle.update({
        where: { id: bundleId },
        data: { bestSellerOfferId } as any,
      });
    }
  });

  const warnings: string[] = [];
  const savedBundle = (await prisma.bundle.findUnique({
    where: { id: bundleId },
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

  return { success: true, warnings, draft } satisfies ActionData;
};

export default function EditBundlePage() {
  const { shop, draft, duplicated } = useLoaderData<typeof loader>();
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();
  const activeDraft = actionData?.draft ?? draft;
  const proxyUrl = `https://${shop}/apps/custom-bundles/bundles?product_handle=${encodeURIComponent(
    activeDraft.items[0]?.productHandle || "",
  )}`;

  return (
    <s-page heading="Edit bundle">
      <s-button slot="primary-action" href="/app">
        Back to dashboard
      </s-button>

      {actionData?.success ? (
        <s-banner tone="success">Bundle updated successfully.</s-banner>
      ) : null}

      {duplicated ? (
        <s-banner tone="success">
          Bundle duplicated successfully. Review it, adjust anything you want, then save when ready.
        </s-banner>
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
        draft={activeDraft}
        submitLabel="Save changes"
        isSubmitting={navigation.state === "submitting"}
        showDeleteAction
        aside={
          <div style={asideCard}>
            <h3 style={asideTitle}>Storefront matching</h3>
            <ul style={asideList}>
              <li>Article 1 handle must match the product page handle.</li>
              <li>The bundle must be ACTIVE to be returned by the proxy.</li>
              <li>All merchandising settings now travel with the bundle.</li>
            </ul>
            <p style={helperText}>
              Proxy URL:{" "}
              <a href={proxyUrl} target="_blank" rel="noreferrer">
                {proxyUrl}
              </a>
            </p>
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

const helperText: CSSProperties = {
  margin: "14px 0 0",
  fontSize: "13px",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
