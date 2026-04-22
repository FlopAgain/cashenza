import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { CSSProperties } from "react";

import { VolumeBundleStyleForm } from "../components/volume-bundle-style-form";
import type { VolumeOfferDraft } from "../components/volume-bundle-form";
import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  createDefaultAppearance,
  normalizeTimerEndValue,
  safeParseJson,
  type BundleAppearanceDraft,
} from "../utils/bundle-configurator";
import { loadProductSnapshots } from "../utils/product-snapshots.server";

type ActionData = {
  errors?: string[];
  success?: boolean;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const url = new URL(request.url);
  const productHandle = String(params.productHandle || "").trim();
  if (!productHandle) throw new Response("Product not found", { status: 404 });

  const [snapshots, bundle] = await Promise.all([
    loadProductSnapshots(admin, [productHandle]),
    prisma.bundle.findFirst({
      where: {
        shop: session.shop,
        bundleType: "VOLUME",
        productHandle,
        status: "ACTIVE",
      },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const product = snapshots.get(productHandle);
  if (!product) throw new Response("Product not found", { status: 404 });
  if (!bundle) throw new Response("Active volume bundle not found", { status: 404 });

  const selectedBestSellerIndex = bundle.offers.findIndex(
    (offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller,
  );

  return {
    product,
    productHandle,
    returnTo: url.searchParams.get("returnTo") || `/app/volume-bundles/${productHandle}`,
    bundleId: bundle.id,
    appearance: {
      ...createDefaultAppearance(),
      designPreset: bundle.designPreset,
      timerPreset: bundle.timerPreset,
      effectsPreset: (bundle as any).effectsPreset || "none",
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
    } satisfies BundleAppearanceDraft,
    offers: bundle.offers.map((offer) => ({
      title: offer.title,
      subtitle: offer.subtitle || "",
      quantity: offer.quantity,
      discountType: offer.discountType,
      discountValue: Number(offer.discountValue || 0),
    })) satisfies VolumeOfferDraft[],
    hasBestSeller: selectedBestSellerIndex >= 0,
    bestSellerIndex: selectedBestSellerIndex >= 0 ? selectedBestSellerIndex + 1 : 1,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await requireStarterPlan(request);
  const productHandle = String(params.productHandle || "").trim();
  if (!productHandle) throw new Response("Product not found", { status: 404 });

  const bundle = await prisma.bundle.findFirst({
    where: {
      shop: session.shop,
      bundleType: "VOLUME",
      productHandle,
      status: "ACTIVE",
    },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!bundle) throw new Response("Active volume bundle not found", { status: 404 });

  const formData = await request.formData();
  const appearance = {
    ...createDefaultAppearance(),
    ...safeParseJson<Partial<BundleAppearanceDraft>>(formData.get("appearanceJson"), {}),
  };
  appearance.timerEnd = normalizeTimerEndValue(appearance.timerEnd);

  const offers = safeParseJson<VolumeOfferDraft[]>(formData.get("offersJson"), []).slice(
    0,
    bundle.offers.length,
  );
  const hasBestSeller = String(formData.get("hasBestSeller") || "") === "true";
  const bestSellerIndex = Math.max(
    1,
    Math.min(bundle.offers.length, Number(formData.get("bestSellerIndex") || 1)),
  );

  const errors: string[] = [];
  if (!offers.length) errors.push("At least one offer is required.");
  if (offers.length !== bundle.offers.length) {
    errors.push("Offer count mismatch. Refresh the page and try again.");
  }

  if (errors.length) {
    return { errors } satisfies ActionData;
  }

  await prisma.$transaction(async (tx) => {
    let bestSellerOfferId: string | null = null;

    await tx.bundle.update({
      where: { id: bundle.id },
      data: {
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
        bestSellerOfferId: null,
      } as any,
    });

    for (let index = 0; index < bundle.offers.length; index += 1) {
      const offer = offers[index];
      const originalOffer = bundle.offers[index];
      const isBestSeller = hasBestSeller && bestSellerIndex === index + 1;

      await tx.bundleOffer.update({
        where: { id: originalOffer.id },
        data: {
          title: offer.title.trim() || `Offer ${index + 1}`,
          subtitle: offer.subtitle.trim() || null,
          discountType: offer.discountType as never,
          discountValue: Number(offer.discountValue || 0),
          isBestSeller,
        },
      });

      if (isBestSeller) {
        bestSellerOfferId = originalOffer.id;
      }
    }

    await tx.bundle.update({
      where: { id: bundle.id },
      data: { bestSellerOfferId } as any,
    });
  });

  return { success: true } satisfies ActionData;
};

export default function EditVolumeBundleStylePage() {
  const { product, productHandle, appearance, offers, hasBestSeller, bestSellerIndex, returnTo } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <s-page heading="Edit volume bundle style">
      <s-button slot="primary-action" href={returnTo}>
        Back to volume bundle
      </s-button>

      {actionData?.success ? (
        <s-banner tone="success">Volume bundle style updated successfully.</s-banner>
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

      <VolumeBundleStyleForm
        product={product}
        appearanceDraft={appearance}
        offersDraft={offers}
        hasBestSellerDraft={hasBestSeller}
        bestSellerIndexDraft={bestSellerIndex}
        submitLabel="Save volume bundle style"
        isSubmitting={navigation.state === "submitting"}
        formAction={`/app/volume-bundles/${productHandle}/style`}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
