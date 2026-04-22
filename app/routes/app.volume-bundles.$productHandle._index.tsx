import type { CSSProperties } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  createDefaultVolumeBundleDraft,
  type VolumeBundleDraft,
  VolumeBundleForm,
} from "../components/volume-bundle-form";
import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  deleteBundleAutomaticDiscount,
  reconcileBundleAutomaticDiscountState,
  syncBundleAutomaticDiscount,
} from "../utils/bundle-discount.server";
import {
  createDefaultAppearance,
  normalizeTimerEndValue,
  safeParseJson,
  type BundleAppearanceDraft,
} from "../utils/bundle-configurator";
import { loadProductSnapshots } from "../utils/product-snapshots.server";
import { normalizeVolumeBundleOfferItems } from "../utils/volume-bundles.server";

type ActionData = {
  errors?: string[];
  warnings?: string[];
  success?: boolean;
};

type VolumeOfferInput = {
  title: string;
  subtitle: string;
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
  discountValue: number;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const productHandle = String(params.productHandle || "").trim();
  if (!productHandle) throw new Response("Product not found", { status: 404 });
  const url = new URL(request.url);

  const [snapshots, bundle] = await Promise.all([
    loadProductSnapshots(admin, [productHandle]),
    prisma.bundle.findFirst({
      where: {
        shop: session.shop,
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
    }),
  ]);

  const product = snapshots.get(productHandle);
  if (!product) throw new Response("Product not found", { status: 404 });

  const selectedItem = bundle?.offers[0]?.items[0];
  const selectedBestSellerIndex =
    bundle?.offers.findIndex((offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller) ?? -1;
  const reconciledBundle =
    bundle?.automaticDiscountId && bundle
      ? await reconcileBundleAutomaticDiscountState(admin, {
          id: bundle.id,
          status: bundle.status,
          automaticDiscountId: bundle.automaticDiscountId,
        })
      : null;

  const draft: VolumeBundleDraft = bundle
    ? {
        title: bundle.title,
        status:
          reconciledBundle?.bundleStatus === "ACTIVE"
            ? "ACTIVE"
            : "DRAFT",
        itemCount: bundle.offers.length || 1,
        hasBestSeller: selectedBestSellerIndex >= 0,
        bestSellerIndex: selectedBestSellerIndex >= 0 ? selectedBestSellerIndex + 1 : 1,
        allowVariantSelection: selectedItem?.allowVariantSelection ?? true,
        showVariantThumbnails: selectedItem?.showVariantThumbnails ?? false,
        variantId: selectedItem?.variantId || "",
        variantTitle: selectedItem?.variantTitle || "",
        offers: bundle.offers.map((offer) => ({
          title: offer.title,
          subtitle: offer.subtitle || "",
          quantity: offer.quantity,
          discountType: offer.discountType,
          discountValue: Number(offer.discountValue || 0),
        })),
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
        },
      }
    : createDefaultVolumeBundleDraft(product);

  return {
    product,
    bundleId: bundle?.id || null,
    automaticDiscountId: bundle?.automaticDiscountId || null,
    returnTo: url.searchParams.get("returnTo") || "/app/volume-bundles",
    draft,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const productHandle = String(params.productHandle || "").trim();
  if (!productHandle) throw new Response("Product not found", { status: 404 });

  const existingBundle = await prisma.bundle.findFirst({
    where: {
      shop: session.shop,
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

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent === "delete") {
    if (existingBundle?.automaticDiscountId) {
      try {
        await deleteBundleAutomaticDiscount(admin, existingBundle.automaticDiscountId);
      } catch {
        // best effort
      }
    }

    if (existingBundle) {
      await prisma.bundle.delete({ where: { id: existingBundle.id } });
    }

    return redirect("/app/volume-bundles");
  }

  const title = String(formData.get("title") || "").trim();
  const status = String(formData.get("status") || "DRAFT") === "ACTIVE" ? "ACTIVE" : "DRAFT";
  const itemCount = Math.max(1, Math.min(10, Number(formData.get("itemCount") || 1)));
  const hasBestSeller = String(formData.get("hasBestSeller") || "") === "on";
  const bestSellerIndex = Math.max(1, Math.min(itemCount, Number(formData.get("bestSellerIndex") || 1)));
  const allowVariantSelection = String(formData.get("allowVariantSelection") || "") === "on";
  const showVariantThumbnails = String(formData.get("showVariantThumbnails") || "") === "on";
  const variantId = String(formData.get("variantId") || "").trim();
  const variantTitle = String(formData.get("variantTitle") || "").trim();
  const offers = (() => {
    try {
      return JSON.parse(String(formData.get("offersJson") || "[]")) as VolumeOfferInput[];
    } catch {
      return [] as VolumeOfferInput[];
    }
  })();
  const appearance = {
    ...createDefaultAppearance(),
    ...safeParseJson<Partial<BundleAppearanceDraft>>(formData.get("appearanceJson"), {}),
  };
  appearance.timerEnd = normalizeTimerEndValue(appearance.timerEnd);

  const errors: string[] = [];
  if (!title) errors.push("Bundle title is required.");
  if (!allowVariantSelection && !variantId) {
    errors.push("Choose a fixed variant when customer variant selection is disabled.");
  }
  if (!offers.length) {
    errors.push("At least one offer is required.");
  }

  if (errors.length) {
    return { errors } satisfies ActionData;
  }

  const snapshots = await loadProductSnapshots(admin, [productHandle]);
  const product = snapshots.get(productHandle);
  if (!product) throw new Response("Product not found", { status: 404 });

  const savedBundle = await prisma.$transaction(async (tx) => {
    const bundle =
      existingBundle
        ? await tx.bundle.update({
            where: { id: existingBundle.id },
            data: {
              title,
              productId: product.id,
              productTitle: product.title,
              productHandle,
              status,
              bestSellerOfferId: null,
              showVariantPicker: allowVariantSelection,
              showVariantThumbnails,
              effectsPreset: appearance.effectsPreset,
            } as any,
          })
        : await tx.bundle.create({
            data: {
              shop: session.shop,
              bundleType: "VOLUME",
              title,
              productId: product.id,
              productTitle: product.title,
              productHandle,
              status,
              showVariantPicker: allowVariantSelection,
              showVariantThumbnails,
              effectsPreset: appearance.effectsPreset,
            } as any,
          });

    await tx.bundleOfferItem.deleteMany({ where: { offer: { bundleId: bundle.id } } });
    await tx.bundleOffer.deleteMany({ where: { bundleId: bundle.id } });

    let bestSellerOfferId: string | null = null;
    for (let index = 0; index < offers.slice(0, itemCount).length; index += 1) {
      const offer = offers[index];
      const createdOffer = await tx.bundleOffer.create({
        data: {
          bundleId: bundle.id,
          title: offer.title.trim() || `Offer ${index + 1}`,
          subtitle: offer.subtitle.trim() || null,
          quantity: index + 1,
          discountType: offer.discountType as never,
          discountValue: Number(offer.discountValue || 0),
          isBestSeller: hasBestSeller && bestSellerIndex === index + 1,
          sortOrder: index,
          items: {
            create: Array.from({ length: index + 1 }, (_, itemIndex) => ({
              productId: productHandle,
              productTitle: product.title,
              variantId: allowVariantSelection ? null : variantId || null,
              variantTitle: allowVariantSelection ? null : variantTitle || null,
              quantity: 1,
              allowVariantSelection,
              showVariantThumbnails,
              sortOrder: itemIndex,
            })),
          },
        },
      });

      if (hasBestSeller && bestSellerIndex === index + 1) {
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

  const warnings: string[] = [];
  try {
    const normalizedBundle = await normalizeVolumeBundleOfferItems(savedBundle.id);
    const automaticDiscountId = await syncBundleAutomaticDiscount(admin, (normalizedBundle || savedBundle) as any);
    await prisma.bundle.update({
      where: { id: savedBundle.id },
      data: { automaticDiscountId } as any,
    });
    await reconcileBundleAutomaticDiscountState(admin, {
      id: normalizedBundle?.id || savedBundle.id,
      status: status === "ACTIVE" ? "ACTIVE" : "DRAFT",
      automaticDiscountId,
    });
  } catch (error) {
    warnings.push(
      error instanceof Error ? error.message : "Volume bundle saved, but automatic discount sync failed.",
    );
  }

  return { success: true, warnings } satisfies ActionData;
};

export default function EditVolumeBundlePage() {
  const { product, draft, bundleId, automaticDiscountId, returnTo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  return (
    <s-page heading="Edit volume bundle">
      <s-button slot="primary-action" href={returnTo}>
        Back to volume bundles
      </s-button>

      {actionData?.success ? (
        <s-banner tone="success">Volume bundle saved successfully.</s-banner>
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

      <VolumeBundleForm
      product={product}
      draft={draft}
      submitLabel="Save volume bundle"
      isSubmitting={navigation.state === "submitting"}
      showDeleteAction={Boolean(bundleId)}
      aside={
          <div style={asideCard}>
            <h3 style={asideTitle}>Volume bundle rules</h3>
            <ul style={asideList}>
              <li>Volume bundles are for 1x, 2x, 3x, Nx of the same product only.</li>
              <li>If an active cross-sell bundle exists on the same product page, it still overrides this volume bundle on the storefront.</li>
              <li>Discount sync is {automaticDiscountId ? "currently healthy" : "pending or missing"} for this product.</li>
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
