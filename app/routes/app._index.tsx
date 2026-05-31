import type { CSSProperties } from "react";
import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import { loadAnalyticsSnapshot, type AnalyticsSnapshot } from "../utils/analytics.server";
import { loadDiagnosticsSnapshot, type DiagnosticsSnapshot } from "../utils/diagnostics.server";
import {
  reconcileBundleAutomaticDiscountState,
  syncBundleAutomaticDiscount,
} from "../utils/bundle-discount.server";
import {
  normalizeBundleDatabaseStatus,
} from "../utils/bundle-status";
import { loadReusableBundleAppearance } from "../utils/bundle-appearance.server";
import {
  getThemePlacementReadiness,
  inspectCurrentProductTemplatePlacement,
  placeBundleBlockOnProductTemplate,
  resolveThemePlacementScopes,
} from "../utils/theme-placement.server";
import {
  ensureDefaultVolumeBundleForProduct,
  loadShopProducts,
} from "../utils/volume-bundles.server";

const emptyAnalyticsSnapshot: AnalyticsSnapshot = {
  volumeEnabled: 0,
  volumeConfigured: 0,
  volumeActive: 0,
  volumeDraft: 0,
  volumeSynced: 0,
  averageOffersPerVolume: "0.0",
  crossSellActive: 0,
  crossSellDraft: 0,
  crossSellArchived: 0,
  crossSellSynced: 0,
  overriddenProducts: 0,
  averageOffersPerCrossSell: "0.0",
  totalCrossSellBundles: 0,
  totalCrossSellOffers: 0,
  syncCoverageRate: "0%",
};

function buildDiagnosticsFallback(error: unknown): DiagnosticsSnapshot {
  const message = error instanceof Error ? error.message : "Unknown diagnostics error";

  return {
    summary: {
      healthy: 0,
      warning: 0,
      critical: 1,
    },
    items: [
      {
        id: "diagnostics-unavailable",
        severity: "critical",
        title: "Diagnostics temporarily unavailable",
        summary:
          "Cashenza could not load diagnostics right now. This is usually caused by a temporary database or Shopify API interruption.",
        details: [message],
      },
    ],
  };
}

async function safeLoadDashboardData<T>({
  label,
  promise,
  fallback,
}: {
  label: string;
  promise: Promise<T>;
  fallback: T | ((error: unknown) => T);
}) {
  try {
    return await promise;
  } catch (error) {
    console.error(`Dashboard ${label} failed`, error);
    return typeof fallback === "function" ? (fallback as (error: unknown) => T)(error) : fallback;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const themeScopes = await resolveThemePlacementScopes({
    admin,
    fallbackScopes: session.scope,
  });
  const readiness = getThemePlacementReadiness({ scopes: themeScopes });
  const bundleCount = await prisma.bundle.count({
    where: {
      shop: session.shop,
      automaticDiscountId: {
        not: null,
      },
    },
  });

  if (bundleCount === 0) {
    const [products, inspection] = await Promise.all([
      loadShopProducts(admin),
      inspectCurrentProductTemplatePlacement({
        admin,
        scopes: themeScopes,
      }),
    ]);

    return {
      needsFirstBundleSetup: true,
      shop: session.shop,
      readiness,
      inspection,
      products,
      bundles: [],
      stats: null,
      analytics: null,
      diagnostics: null,
    };
  }

  const analyticsPromise = safeLoadDashboardData({
    label: "analytics snapshot",
    promise: loadAnalyticsSnapshot({
      shop: session.shop,
      admin,
    }),
    fallback: emptyAnalyticsSnapshot,
  });
  const diagnosticsPromise = safeLoadDashboardData({
    label: "diagnostics snapshot",
    promise: loadDiagnosticsSnapshot({
      shop: session.shop,
      admin,
    }),
    fallback: buildDiagnosticsFallback,
  });
  const inspectionPromise = inspectCurrentProductTemplatePlacement({
    admin,
    scopes: themeScopes,
  });

  const [rawBundles, analytics, diagnostics, inspection] = await Promise.all([
    safeLoadDashboardData({
      label: "bundle list",
      promise: prisma.bundle.findMany({
        where: { shop: session.shop },
        orderBy: { updatedAt: "desc" },
        include: {
          offers: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              discountType: true,
              discountValue: true,
            },
          },
        },
        take: 12,
      }),
      fallback: [],
    }),
    analyticsPromise,
    diagnosticsPromise,
    inspectionPromise,
  ]);

  const bundles = await Promise.all(
    rawBundles.map(async (bundle) => {
      const reconciled = await safeLoadDashboardData({
        label: `bundle discount reconciliation ${bundle.id}`,
        promise: reconcileBundleAutomaticDiscountState(admin, {
          id: bundle.id,
          status: bundle.status,
          automaticDiscountId: bundle.automaticDiscountId,
        }),
        fallback: {
          bundleStatus: bundle.status,
          automaticDiscountId: bundle.automaticDiscountId,
          shopifyDiscountStatus: "UNKNOWN",
        },
      });

      return {
        ...bundle,
        status: normalizeBundleDatabaseStatus(reconciled.bundleStatus),
        automaticDiscountId: reconciled.automaticDiscountId,
        shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
      };
    }),
  );

  const activeBundles = bundles.filter((bundle) => bundle.status === "ACTIVE").length;
  const productPagesWithBundles = new Set(
    bundles
      .map((bundle) => bundle.productHandle)
      .filter((handle): handle is string => Boolean(handle)),
  ).size;
  const activeShopifyDiscounts = bundles.filter(
    (bundle) => bundle.shopifyDiscountStatus === "ACTIVE",
  ).length;
  const volumeActive = bundles.filter(
    (bundle) => bundle.bundleType === "VOLUME" && bundle.status === "ACTIVE",
  ).length;
  const volumeDraft = bundles.filter(
    (bundle) => bundle.bundleType === "VOLUME" && bundle.status === "DRAFT",
  ).length;
  const crossSellActive = bundles.filter(
    (bundle) => bundle.bundleType === "CROSS_SELL" && bundle.status === "ACTIVE",
  ).length;
  const crossSellDraft = bundles.filter(
    (bundle) => bundle.bundleType === "CROSS_SELL" && bundle.status === "DRAFT",
  ).length;

  return {
    needsFirstBundleSetup: false,
    shop: session.shop,
    readiness,
    inspection,
    products: [],
    bundles,
    stats: {
      productPagesWithBundles,
      activeShopifyDiscounts,
      volumeActive,
      volumeDraft,
      crossSellActive,
      crossSellDraft,
    },
    analytics,
    diagnostics,
  };
};

async function createFirstCrossSellBundleForProduct({
  shop,
  admin,
  productHandle,
}: {
  shop: string;
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  productHandle: string;
}) {
  const productTitle = productHandle;
  const appearance = await loadReusableBundleAppearance({ shop, productHandle });
  const bundle = await prisma.bundle.create({
    data: {
      shop,
      bundleType: "CROSS_SELL",
      title: `${productTitle} cross-sell bundle`,
      productId: productHandle,
      productTitle,
      productHandle,
      status: "DRAFT",
      showVariantPicker: true,
      showVariantThumbnails: false,
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
      timerEnd: null,
      timerPrefix: appearance.timerPrefix,
      timerExpiredText: appearance.timerExpiredText,
      timerBackgroundColor: appearance.timerBackgroundColor,
      timerTextColor: appearance.timerTextColor,
      timerPrefixColor: appearance.timerPrefixColor,
      offers: {
        create: [
          {
            title: "Offer 1",
            subtitle: "Current product only",
            quantity: 1,
            discountType: "PERCENTAGE",
            discountValue: 0,
            isBestSeller: false,
            sortOrder: 0,
            items: {
              create: [
                {
                  productId: productHandle,
                  productTitle,
                  quantity: 1,
                  allowVariantSelection: true,
                  showVariantThumbnails: false,
                  sortOrder: 0,
                },
              ],
            },
          },
        ],
      },
    } as any,
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  const automaticDiscountId = await syncBundleAutomaticDiscount(admin, bundle as any);
  return prisma.bundle.update({
    where: { id: bundle.id },
    data: { automaticDiscountId } as any,
  });
}

async function loadAntiFlashGuardEnabled(shop: string) {
  const settings = await prisma.appSettings.findUnique({
    where: { shop },
    select: { antiFlashGuardEnabled: true },
  });

  return (settings as { antiFlashGuardEnabled?: boolean } | null)?.antiFlashGuardEnabled ?? true;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "inspect-placement") {
    const themeScopes = await resolveThemePlacementScopes({
      admin,
      fallbackScopes: session.scope,
    });

    return {
      readiness: getThemePlacementReadiness({ scopes: themeScopes }),
      inspection: await inspectCurrentProductTemplatePlacement({
        admin,
        scopes: themeScopes,
      }),
      placementAttempt: null,
    };
  }

  if (intent === "explain-product-placement") {
    const themeScopes = await resolveThemePlacementScopes({
      admin,
      fallbackScopes: session.scope,
    });

    return {
      readiness: getThemePlacementReadiness({ scopes: themeScopes }),
      inspection: await inspectCurrentProductTemplatePlacement({
        admin,
        scopes: themeScopes,
      }),
      placementAttempt: {
        status: "blocked" as const,
        message: "Use the first setup flow to place the bundle block.",
        details: [
          "Cashenza places the bundle widget once on the default product template.",
          "The storefront widget stays hidden on products without an active bundle.",
        ],
      },
    };
  }

  if (intent === "repair-placement") {
    const themeScopes = await resolveThemePlacementScopes({
      admin,
      fallbackScopes: session.scope,
    });
    const antiFlashGuardEnabled = await loadAntiFlashGuardEnabled(session.shop);

    return {
      readiness: getThemePlacementReadiness({ scopes: themeScopes }),
      inspection: await inspectCurrentProductTemplatePlacement({
        admin,
        scopes: themeScopes,
      }),
      placementAttempt: await placeBundleBlockOnProductTemplate({
        admin,
        scopes: themeScopes,
        antiFlashGuardEnabled,
      }),
    };
  }

  if (intent === "place-product-block") {
    const themeScopes = await resolveThemePlacementScopes({
      admin,
      fallbackScopes: session.scope,
    });
    const productId = String(formData.get("productId") || "").trim();
    const antiFlashGuardEnabled = await loadAntiFlashGuardEnabled(session.shop);

    return {
      placementAttempt: productId
        ? await placeBundleBlockOnProductTemplate({
            admin,
            scopes: themeScopes,
            antiFlashGuardEnabled,
          })
        : {
            status: "blocked" as const,
            message: "Choose a product before placing the bundle block.",
            details: ["Choose a product if you also want to create the first bundle for it."],
          },
    };
  }

  if (intent === "create-volume-and-place" || intent === "create-cross-sell-and-place") {
    const themeScopes = await resolveThemePlacementScopes({
      admin,
      fallbackScopes: session.scope,
    });
    const [productId = "", productHandle = ""] = String(formData.get("productComposite") || "")
      .split("::")
      .map((value) => value.trim());
    const antiFlashGuardEnabled = await loadAntiFlashGuardEnabled(session.shop);

    if (!productId || !productHandle) {
      return {
        placementAttempt: {
          status: "blocked" as const,
          message: "Choose a product before creating the first bundle.",
          details: ["Cashenza needs both the product ID and handle."],
        },
      };
    }

    const placementAttempt = await placeBundleBlockOnProductTemplate({
      admin,
      scopes: themeScopes,
      antiFlashGuardEnabled,
    });

    if (placementAttempt.status !== "placed" && placementAttempt.status !== "skipped") {
      return {
        placementAttempt,
      };
    }

    try {
      const bundle =
        intent === "create-cross-sell-and-place"
          ? await createFirstCrossSellBundleForProduct({
              shop: session.shop,
              admin,
              productHandle,
            })
          : await ensureDefaultVolumeBundleForProduct({
              shop: session.shop,
              admin,
              productHandle,
            });

      if (!bundle?.automaticDiscountId) {
        throw new Error("The Shopify automatic discount was not created.");
      }

      if (intent === "create-cross-sell-and-place") {
        return redirect(`/app/bundles/${bundle.id}`);
      }

      return redirect(`/app/bundles/${bundle.id}`);
    } catch (error) {
      return {
        placementAttempt: {
          status: "error" as const,
          message:
            intent === "create-cross-sell-and-place"
              ? "Cashenza placed the block but could not create the first cross-sell bundle."
              : "Cashenza placed the block but could not create the default volume bundle.",
          details: [error instanceof Error ? error.message : "Unknown bundle creation error"],
        },
      };
    }
  }

  return null;
};

function formatPlacementAttemptTitle(status: string) {
  if (status === "placed") return "Placement complete";
  if (status === "skipped") return "Placement skipped";
  if (status === "error") return "Placement failed";
  if (status === "ready_for_write") return "Placement ready";
  return "Placement blocked";
}

function formatPlacementInspectionTitle(status: string) {
  if (status === "already_placed") return "Bundle block already placed";
  if (status === "needs_placement") return "Bundle block needs placement";
  if (status === "missing_scope") return "Theme inspection needs permissions";
  if (status === "template_missing") return "Product JSON template not found";
  if (status === "template_invalid") return "Product template is not safe to edit";
  if (status === "unsupported") return "Theme structure needs manual review";
  if (status === "theme_missing") return "Published theme not found";
  return "Placement inspection unavailable";
}

function formatProductStatus(status: string) {
  if (status === "ACTIVE") return "Active";
  if (status === "DRAFT") return "Draft";
  if (status === "ARCHIVED") return "Archived";
  return status || "Unknown";
}

function formatProductStock(stock: number) {
  if (stock <= 0) return "out";
  return `${stock} available`;
}

function getProductStatusBadgeStyle(status: string): CSSProperties {
  if (status === "ACTIVE") return { ...styles.productStatusBadge, ...styles.productStatusActive };
  if (status === "DRAFT") return { ...styles.productStatusBadge, ...styles.productStatusDraft };
  if (status === "ARCHIVED") return { ...styles.productStatusBadge, ...styles.productStatusArchived };
  return styles.productStatusBadge;
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [selectedProductComposite, setSelectedProductComposite] = useState(
    data.products[0] ? `${data.products[0].id}::${data.products[0].handle}` : "",
  );
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [productPage, setProductPage] = useState(1);
  const productPageSize = 4;
  const normalizedProductSearch = productSearchQuery.trim().toLowerCase();
  const filteredProducts =
    data.needsFirstBundleSetup && normalizedProductSearch
      ? data.products.filter((product) =>
          `${product.title} ${product.handle} ${product.status}`
            .toLowerCase()
            .includes(normalizedProductSearch),
        )
      : data.products;
  const totalProductPages = Math.max(1, Math.ceil(filteredProducts.length / productPageSize));
  const safeProductPage = Math.min(productPage, totalProductPages);
  const visibleProducts = filteredProducts.slice(
    (safeProductPage - 1) * productPageSize,
    safeProductPage * productPageSize,
  );
  const [selectedProductId = "", selectedProductHandle = ""] = selectedProductComposite.split("::");
  const firstSetupContinueHref =
    selectedProductHandle
      ? `/app/bundles/new?productHandle=${encodeURIComponent(selectedProductHandle)}&productId=${encodeURIComponent(selectedProductId)}`
      : "/app/bundles/new";
  if (data.needsFirstBundleSetup) {
    return (
      <s-page heading="Cashenza Bundlify">
        <section style={styles.onboardingShell}>
          <div style={styles.logoRow}>
            <img src="/cashenza-square.svg" alt="Cashenza" style={styles.logo} />
            <span style={styles.badge}>First setup required</span>
          </div>
          <h1 style={styles.heroTitle}>Create the first bundle before using the rest of the app.</h1>
          <p style={styles.heroText}>
            Pick a product, create the first volume or cross-sell bundle and matching Shopify discount, then let Cashenza
            place the storefront block once on the default product template. The widget stays hidden on products
            without an active bundle. The classic dashboard unlocks after this setup is complete.
          </p>

          <section style={styles.onboardingPanel}>
            <div>
              <h2 style={styles.sectionTitle}>First bundle setup</h2>
              <p style={styles.sectionText}>
                This is the only available action during installation so the merchant starts from a coherent bundle,
                discount, and global product-page placement. Choose volume for repeated quantities of the same product,
                or cross-sell to start a package of complementary products.
              </p>
            </div>

            {data.products.length === 0 ? (
              <div style={styles.emptyState}>
                <h2 style={styles.emptyTitle}>No active products found</h2>
                <p style={styles.emptyText}>
                  Create or publish a product in Shopify before starting the first bundle flow.
                </p>
              </div>
            ) : (
              <Form method="post" style={styles.productPickerForm}>
                <input type="hidden" name="productId" value={selectedProductId} />
                <input type="hidden" name="productComposite" value={selectedProductComposite} />
                <div style={styles.productPickerHeader}>
                  <label style={styles.fieldLabel}>
                    Search products
                    <input
                      type="search"
                      value={productSearchQuery}
                      onChange={(event) => {
                        setProductSearchQuery(event.currentTarget.value);
                        setProductPage(1);
                      }}
                      placeholder="Search by product title, handle, or status"
                      style={styles.searchInput}
                    />
                  </label>
                  <div style={styles.productCount}>
                    {filteredProducts.length} of {data.products.length} products
                  </div>
                </div>

                <div style={styles.paginationRow}>
                  <button
                    type="button"
                    onClick={() => setProductPage((current) => Math.max(1, current - 1))}
                    disabled={safeProductPage <= 1}
                    style={{
                      ...styles.secondaryAction,
                      ...(safeProductPage <= 1 ? styles.disabledButton : {}),
                    }}
                  >
                    Previous
                  </button>
                  <span style={styles.pageIndicator}>
                    Page {safeProductPage} / {totalProductPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProductPage((current) => Math.min(totalProductPages, current + 1))}
                    disabled={safeProductPage >= totalProductPages}
                    style={{
                      ...styles.secondaryAction,
                      ...(safeProductPage >= totalProductPages ? styles.disabledButton : {}),
                    }}
                  >
                    Next
                  </button>
                </div>

                <div style={styles.productList}>
                  {visibleProducts.map((product) => {
                    const composite = `${product.id}::${product.handle}`;
                    const selected = composite === selectedProductComposite;

                    return (
                      <label
                        key={product.id}
                        style={{
                          ...styles.productRow,
                          ...(selected ? styles.productRowSelected : {}),
                        }}
                      >
                        <input
                          type="radio"
                          name="selectedProduct"
                          value={composite}
                          checked={selected}
                          onChange={() => setSelectedProductComposite(composite)}
                          style={styles.radio}
                        />
                        <span style={styles.productThumb}>
                          {product.featuredImage ? (
                            <img src={product.featuredImage} alt="" style={styles.productImage} />
                          ) : (
                            <span style={styles.productImageFallback}>No image</span>
                          )}
                        </span>
                        <span style={styles.productInfo}>
                          <strong style={styles.productTitle}>{product.title}</strong>
                          <span style={styles.productHandle}>Handle: {product.handle}</span>
                        </span>
                        <span style={styles.productBadges}>
                          <span style={getProductStatusBadgeStyle(product.status)}>
                            {formatProductStatus(product.status)}
                          </span>
                          <span style={styles.productMetricBadge}>
                            Stock {formatProductStock(product.availableStock)}
                          </span>
                          <span style={styles.productMetricBadge}>Variants {product.variantsCount}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>

                {filteredProducts.length === 0 ? (
                  <div style={styles.placementResult}>
                    <strong>No product matches this search</strong>
                    <span>Clear the search or try another product title, handle, or status.</span>
                  </div>
                ) : null}

                <div style={styles.productActions}>
                  <Link
                    to={firstSetupContinueHref}
                    aria-disabled={!selectedProductHandle}
                    style={{
                      ...styles.primaryButton,
                      ...(!selectedProductHandle ? styles.disabledButton : {}),
                    }}
                  >
                    Continue
                  </Link>
                </div>
              </Form>
            )}

            {actionData && "placementAttempt" in actionData && actionData.placementAttempt ? (
              <div style={styles.placementResult}>
                <strong>{formatPlacementAttemptTitle(actionData.placementAttempt.status)}</strong>
                <span>{actionData.placementAttempt.message}</span>
                {actionData.placementAttempt.details.length > 0 ? (
                  <ul style={styles.compactList}>
                    {actionData.placementAttempt.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </section>
      </s-page>
    );
  }

  const shop = data.shop;
  const stats = data.stats!;
  const analytics = data.analytics!;
  const diagnostics = data.diagnostics!;
  const latestReadiness =
    actionData && "readiness" in actionData && actionData.readiness
      ? actionData.readiness
      : data.readiness;
  const latestInspection =
    actionData && "inspection" in actionData && actionData.inspection
      ? actionData.inspection
      : data.inspection;
  const placementAttempt =
    actionData && "placementAttempt" in actionData ? actionData.placementAttempt : null;
  const criticalAlerts = [
    ...(latestInspection.status === "needs_placement"
      ? [
          {
            id: "theme-placement-needs-repair",
            title: "Bundle block needs placement. Run Repair storefront placement.",
          },
        ]
      : []),
    ...diagnostics.items
      .filter((item) => item.severity === "critical")
      .map((item) => ({
        id: item.id,
        title: item.title,
      })),
  ];

  return (
    <s-page heading="Cashenza Bundlify">
      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <div style={styles.logoRow}>
            <img src="/cashenza-square.svg" alt="Cashenza" style={styles.logo} />
            <span style={styles.badge}>Conversion-focused bundle builder</span>
          </div>
          <h1 style={styles.heroTitle}>Build volume and cross-sell bundles that stay clear, premium, and conversion-first.</h1>
            <p style={styles.heroText}>
            Cashenza Bundlify have one clear model: volume bundles for repeated quantities,
            cross-sell bundles for product combinations.
          </p>
          <div style={styles.heroActionGroups}>
            <div style={styles.heroActionGroup}>
              <div style={styles.heroActionGroupLabel}>Bundles</div>
              <div style={styles.heroActionGroupBody}>
                <div style={styles.heroActionGroupButtons}>
                  <Link to="/app/bundles/new" style={styles.heroButtonLink}>Add new bundle</Link>
                  <Link to="/app/bundles" style={styles.heroButtonLink}>Manage bundles</Link>
                </div>
                <p style={styles.heroActionGroupText}>
                  Start from the admin, choose a product, then create the matching bundle and Shopify discount.
                </p>
              </div>
            </div>
            <div style={styles.heroActionGroup}>
              <div style={styles.heroActionGroupLabel}>Growth</div>
              <div style={styles.heroActionGroupBody}>
                <div style={styles.heroActionGroupButtons}>
                  <Link to="/app/analytics" style={styles.heroButtonLink}>Open analytics</Link>
                  <Link to="/app/billing" style={styles.heroButtonLink}>Go Pro</Link>
                </div>
                <p style={styles.heroActionGroupText}>
                  Unlock the full feature set at a low price, and track growth with analytics designed to help your numbers scale.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.heroPanel}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Store</div>
            <div style={styles.metricValueSmall}>{shop}</div>
          </div>
          <div style={styles.metricGrid}>
            <MetricCard
              label="Product pages with bundles"
              value={String(stats.productPagesWithBundles)}
              tone="dark"
            />
            <MetricCard
              label="Active Shopify discounts"
              value={String(stats.activeShopifyDiscounts)}
              tone="green"
            />
            <MetricCard label="Volume active" value={String(stats.volumeActive)} tone="green" />
            <MetricCard label="Volume draft" value={String(stats.volumeDraft)} tone="muted" />
            <MetricCard
              label="Cross-sells active"
              value={String(stats.crossSellActive)}
              tone="cream"
            />
            <MetricCard
              label="Cross-sells drafts"
              value={String(stats.crossSellDraft)}
              tone="muted"
            />
          </div>

        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Merchant flow</h2>
            <p style={styles.sectionText}>
              Keep setup friction low. Bundles are configured from the admin first, then rendered on product pages by the theme extension.
            </p>
          </div>
        </div>

        <div style={styles.stepGrid}>
          <StepCard
            index="01"
            title="Create the first bundle from Cashenza"
            text="Select a product, choose volume or cross-sell, then save the bundle and its matching Shopify discount from the admin."
          />
          <StepCard
            index="02"
            title="Place the storefront block automatically"
            text="After the first bundle is saved, Cashenza places the storefront layer once on the default product template and only shows configured bundles."
          />
          <StepCard
            index="03"
            title="Replace the native purchase flow"
            text="The bundle widget provides its own variant selectors, add to cart, and buy now buttons so the page does not show duplicated purchase controls."
          />
          <StepCard
            index="04"
            title="Publish and test"
            text="Open the storefront, verify variant picks, and confirm the cart discount stays correct end to end."
          />
        </div>
      </section>

      <section style={styles.dashboardSplit}>
        <div style={styles.placementCompact}>
          <div>
            <span style={styles.cardLabel}>Automatic placement</span>
            <h2 style={styles.placementTitle}>Storefront block placement</h2>
            <p style={styles.placementText}>
              Cashenza inserts or repairs the bundle widget once on the default product template. The widget stays hidden until the current product has an active bundle.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="repair-placement" />
            <button type="submit" style={styles.repairPlacementButton}>
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                style={styles.buttonIcon}
              >
                <path
                  d="M21 7.2a6.2 6.2 0 0 1-7.7 7.7L6.1 22 2 17.9l7.1-7.2A6.2 6.2 0 0 1 16.8 3l-3.2 3.2 4.2 4.2L21 7.2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Repair storefront placement</span>
            </button>
          </Form>
          <div style={styles.placementStatusGrid}>
            <div style={styles.readinessBox}>
              <strong>
                {latestReadiness.status === "ready"
                  ? "Permissions ready"
                  : "Permissions missing"}
              </strong>
              <span>{latestReadiness.message}</span>
              {latestReadiness.missingScopes.length > 0 ? (
                <span>Missing scopes: {latestReadiness.missingScopes.join(", ")}</span>
              ) : null}
            </div>
            <div style={styles.readinessBox}>
              <strong>{formatPlacementInspectionTitle(latestInspection.status)}</strong>
              <span>{latestInspection.message}</span>
            </div>
          </div>
          {placementAttempt ? (
            <div style={styles.placementResult}>
              <strong>{formatPlacementAttemptTitle(placementAttempt.status)}</strong>
              <span>{placementAttempt.message}</span>
              {placementAttempt.details.length > 0 ? (
                <ul style={styles.compactList}>
                  {placementAttempt.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={styles.alertsPanel}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Alerts</h2>
              <p style={styles.sectionText}>Issues that need the merchant&apos;s attention</p>
            </div>
            <Link to="/app/diagnostics" style={styles.heroButtonLink}>Open diagnostics</Link>
          </div>

          {criticalAlerts.length === 0 ? (
            <div style={styles.alertsEmpty}>No critical alerts right now.</div>
          ) : (
            <div style={styles.alertsStack}>
              {criticalAlerts.map((item) => (
                <article key={item.id} style={styles.alertCard}>
                  <strong>{item.title}</strong>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Analytics snapshot</h2>
            <p style={styles.sectionText}>
              A quick overview of bundle coverage and sync health. Open the dedicated analytics page for the full V2 split between volume and cross-sell performance.
            </p>
          </div>
        </div>

        <div style={styles.metricGrid}>
          <MetricCard label="Volume enabled" value={String(analytics.volumeEnabled)} tone="green" />
          <MetricCard label="Volume configured" value={String(analytics.volumeConfigured)} tone="dark" />
          <MetricCard label="Cross-sell active" value={String(analytics.crossSellActive)} tone="cream" />
          <MetricCard label="Overridden PDPs" value={String(analytics.overriddenProducts)} tone="muted" />
        </div>

        <div style={{ ...styles.metricGrid, marginTop: 16 }}>
          <MetricCard label="Cross-sell drafts" value={String(analytics.crossSellDraft)} tone="muted" />
          <MetricCard label="Avg offers / volume" value={analytics.averageOffersPerVolume} tone="green" />
          <MetricCard label="Cross-sell synced" value={String(analytics.crossSellSynced)} tone="dark" />
          <MetricCard label="Avg offers / cross-sell" value={analytics.averageOffersPerCrossSell} tone="cream" />
        </div>
      </section>

    </s-page>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "dark" | "green" | "cream" | "muted";
}) {
  const toneStyles =
    tone === "dark"
      ? styles.metricDark
      : tone === "green"
        ? styles.metricGreen
        : tone === "cream"
          ? styles.metricCream
          : styles.metricMuted;

  return (
    <div style={{ ...styles.metricCard, ...toneStyles }}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function StepCard({
  index,
  title,
  text,
}: {
  index: string;
  title: string;
  text: string;
}) {
  return (
    <article style={styles.stepCard}>
      <div style={styles.stepIndex}>{index}</div>
      <h3 style={styles.stepTitle}>{title}</h3>
      <p style={styles.stepText}>{text}</p>
    </article>
  );
}

function PitchCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <article style={styles.pitchCard}>
      <h3 style={styles.pitchTitle}>{title}</h3>
      <p style={styles.pitchText}>{text}</p>
    </article>
  );
}

function StatusPill({
  label,
  kind = "default",
}: {
  label: string;
  kind?: "default" | "success" | "warning";
}) {
  const style =
    kind === "success"
      ? styles.statusSuccess
      : kind === "warning"
        ? styles.statusWarning
        : styles.statusDefault;

  return <span style={{ ...styles.statusPill, ...style }}>{label}</span>;
}

const styles: Record<string, CSSProperties> = {
  onboardingShell: {
    display: "grid",
    gap: "20px",
    padding: "28px",
    borderRadius: "28px",
    background: "linear-gradient(135deg, #f5f0e8 0%, #e4efe4 52%, #dce8f6 100%)",
    border: "1px solid #d8ddd2",
  },
  onboardingPanel: {
    display: "grid",
    gap: "16px",
    padding: "20px",
    borderRadius: "22px",
    background: "#ffffff",
    border: "1px solid rgba(24, 34, 22, 0.1)",
    maxWidth: "860px",
  },
  onboardingForm: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) auto",
    gap: "12px",
    alignItems: "end",
  },
  onboardingFormSecondary: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) auto",
    gap: "12px",
    alignItems: "end",
    paddingTop: "12px",
    borderTop: "1px solid #edf0e9",
  },
  fieldLabel: {
    display: "grid",
    gap: "6px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#253621",
  },
  productPickerForm: {
    display: "grid",
    gap: "12px",
  },
  productPickerHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) auto",
    gap: "12px",
    alignItems: "center",
  },
  searchInput: {
    minHeight: "44px",
    borderRadius: "12px",
    border: "1px solid #cfd8ca",
    padding: "0 12px",
    background: "#ffffff",
    color: "#172315",
    fontSize: "14px",
  },
  productCount: {
    color: "#596755",
    fontSize: "13px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  productList: {
    display: "grid",
    gap: "10px",
  },
  productRow: {
    display: "grid",
    gridTemplateColumns: "auto 52px minmax(0, 1fr) auto",
    gap: "12px",
    alignItems: "center",
    padding: "12px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid rgba(23, 35, 21, 0.12)",
    cursor: "pointer",
  },
  productRowSelected: {
    borderColor: "#172315",
    boxShadow: "0 0 0 2px rgba(23, 35, 21, 0.08)",
  },
  radio: {
    width: "16px",
    height: "16px",
  },
  productThumb: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    overflow: "hidden",
    background: "#eef3ea",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  productImageFallback: {
    padding: "6px",
    color: "#687564",
    fontSize: "10px",
    fontWeight: 800,
    textAlign: "center",
  },
  productInfo: {
    display: "grid",
    gap: "4px",
    minWidth: 0,
  },
  productTitle: {
    color: "#172315",
    fontSize: "15px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  productHandle: {
    color: "#596755",
    fontSize: "12px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  productBadges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    justifyContent: "flex-end",
  },
  productStatusBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "28px",
    padding: "0 10px",
    borderRadius: "999px",
    background: "#eef3ea",
    color: "#4f614b",
    fontSize: "12px",
    fontWeight: 800,
  },
  productStatusActive: {
    background: "#dff7df",
    color: "#176b2c",
  },
  productStatusDraft: {
    background: "#e2f0ff",
    color: "#235b87",
  },
  productStatusArchived: {
    background: "#eeeeee",
    color: "#5c5c5c",
  },
  productMetricBadge: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "28px",
    padding: "0 10px",
    borderRadius: "999px",
    background: "#f3f5f0",
    color: "#4f614b",
    fontSize: "12px",
    fontWeight: 800,
  },
  paginationRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  pageIndicator: {
    color: "#596755",
    fontSize: "13px",
    fontWeight: 800,
  },
  productActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    justifyContent: "flex-end",
  },
  secondaryStrongButton: {
    minHeight: "44px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid #162314",
    background: "#ffffff",
    color: "#162314",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  select: {
    minHeight: "44px",
    borderRadius: "12px",
    border: "1px solid #cfd8ca",
    padding: "0 12px",
    background: "#ffffff",
    color: "#172315",
    fontSize: "14px",
  },
  primaryButton: {
    minHeight: "44px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid #162314",
    background: "#162314",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  placementResult: {
    display: "grid",
    gap: "6px",
    padding: "12px",
    borderRadius: "16px",
    background: "#f7faf5",
    border: "1px solid #dbe4d4",
    color: "#263823",
  },
  compactList: {
    margin: 0,
    paddingLeft: "18px",
    color: "#52604f",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.9fr)",
    gap: "20px",
    padding: "24px",
    borderRadius: "28px",
    background:
      "linear-gradient(135deg, #f5f0e8 0%, #e4efe4 52%, #dce8f6 100%)",
    border: "1px solid #d8ddd2",
    marginBottom: "20px",
  },
  heroContent: {
    display: "grid",
    gap: "14px",
    alignContent: "start",
  },
  logoRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
  },
  logo: {
    width: "52px",
    height: "52px",
    objectFit: "contain",
    borderRadius: "14px",
    boxShadow: "0 8px 18px rgba(16, 20, 14, 0.14)",
    flex: "0 0 auto",
  },
  heroPanel: {
    display: "grid",
    gap: "14px",
    alignContent: "start",
  },
  badge: {
    display: "inline-flex",
    width: "fit-content",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#122312",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  heroTitle: {
    margin: 0,
    fontSize: "36px",
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    color: "#162313",
  },
  heroText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#31412f",
    maxWidth: "60ch",
  },
  heroActionGroups: {
    display: "grid",
    gap: "12px",
    width: "fit-content",
  },
  heroActionGroup: {
    display: "grid",
    gap: "8px",
    padding: "12px",
    borderRadius: "18px",
    border: "1px solid rgba(22, 35, 20, 0.08)",
    background: "rgba(255,255,255,0.6)",
  },
  heroActionGroupBody: {
    display: "flex",
    alignItems: "flex-start",
    gap: "14px",
    justifyContent: "space-between",
  },
  heroActionGroupButtons: {
    display: "grid",
    gap: "10px",
    minWidth: "220px",
    flex: "0 0 auto",
  },
  heroActionGroupLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
    color: "#5a6757",
  },
  heroActionGroupText: {
    margin: 0,
    fontSize: "13px",
    lineHeight: 1.45,
    color: "#435344",
    maxWidth: "32ch",
    flex: "1 1 auto",
  },
  diagnosticsCard: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "14px",
    padding: "16px",
    borderRadius: "20px",
    background: "#fff",
    border: "1px solid #dbe2d5",
    alignItems: "center",
  },
  diagnosticsLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontWeight: 800,
    color: "#5b7158",
  },
  diagnosticsTitle: {
    marginTop: "6px",
    fontSize: "16px",
    fontWeight: 800,
    color: "#172315",
  },
  diagnosticsText: {
    margin: "6px 0 0",
    fontSize: "13px",
    lineHeight: 1.55,
    color: "#5f6c5b",
  },
  heroButtonLink: {
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #ccd5c8",
    background: "#ffffff",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    display: "grid",
    gap: "16px",
    marginBottom: "20px",
  },
  dashboardSplit: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "16px",
    alignItems: "stretch",
    marginBottom: "20px",
  },
  placementCompact: {
    display: "grid",
    gap: "14px",
    alignContent: "start",
    padding: "18px",
    borderRadius: "22px",
    background: "#f7efe1",
    border: "1px solid #e6dac5",
  },
  alertsPanel: {
    display: "grid",
    gap: "16px",
    alignContent: "start",
    padding: "18px",
    borderRadius: "22px",
    background: "#ffffff",
    border: "1px solid #dce2d8",
  },
  placementHorizontal: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) minmax(320px, 1.4fr) auto",
    gap: "14px",
    alignItems: "center",
    padding: "18px",
    borderRadius: "22px",
    background: "#f7efe1",
    border: "1px solid #e6dac5",
    marginBottom: "20px",
  },
  cardLabel: {
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#172315",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  placementTitle: {
    margin: "8px 0 0",
    fontSize: "20px",
    color: "#172315",
  },
  placementText: {
    margin: "6px 0 0",
    color: "#5b5348",
    lineHeight: 1.5,
    fontSize: "13px",
  },
  placementStatusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "10px",
  },
  placementActions: {
    display: "grid",
    gap: "10px",
    justifyItems: "stretch",
  },
  repairPlacementButton: {
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #ccd5c8",
    background: "#ffffff",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    width: "fit-content",
  },
  buttonIcon: {
    flex: "0 0 auto",
  },
  readinessBox: {
    display: "grid",
    gap: "6px",
    padding: "12px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(23, 35, 21, 0.08)",
    color: "#4b4236",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    gap: "16px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#172315",
  },
  sectionText: {
    margin: "6px 0 0",
    color: "#556351",
    fontSize: "14px",
  },
  alertsStack: {
    display: "grid",
    gap: "12px",
  },
  alertCard: {
    padding: "16px 18px",
    borderRadius: "18px",
    border: "1px solid #efc1c1",
    background: "#fff1f1",
    color: "#5b1717",
  },
  alertsEmpty: {
    padding: "16px 18px",
    borderRadius: "18px",
    border: "1px solid #dce2d8",
    background: "#ffffff",
    color: "#51604f",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
  },
  metricCard: {
    padding: "16px",
    borderRadius: "20px",
    border: "1px solid rgba(24, 34, 22, 0.08)",
    background: "#ffffff",
    display: "grid",
    gap: "8px",
  },
  metricDark: {
    background: "#172315",
    color: "#ffffff",
  },
  metricGreen: {
    background: "#dff0df",
  },
  metricCream: {
    background: "#f7efe1",
  },
  metricMuted: {
    background: "#eef2f4",
  },
  metricLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    opacity: 0.72,
    fontWeight: 700,
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1,
  },
  metricValueSmall: {
    fontSize: "16px",
    lineHeight: 1.4,
    fontWeight: 700,
    wordBreak: "break-word",
  },
  stepGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  stepCard: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #e1e5dd",
    background: "#ffffff",
    display: "grid",
    gap: "10px",
  },
  stepIndex: {
    fontSize: "12px",
    fontWeight: 800,
    color: "#4f7b54",
    letterSpacing: "0.08em",
  },
  stepTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#182617",
  },
  stepText: {
    margin: 0,
    color: "#5a6757",
    lineHeight: 1.55,
    fontSize: "14px",
  },
  emptyState: {
    padding: "26px",
    borderRadius: "22px",
    border: "1px solid #dbe0d5",
    background: "#fafbf8",
    display: "grid",
    gap: "10px",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "22px",
    color: "#182617",
  },
  emptyText: {
    margin: 0,
    fontSize: "14px",
    color: "#5a6757",
    maxWidth: "62ch",
  },
  secondaryAction: {
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #ccd5c8",
    background: "#ffffff",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  pitchGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  pitchCard: {
    padding: "18px",
    borderRadius: "20px",
    background: "#152115",
    color: "#eef4eb",
    display: "grid",
    gap: "10px",
  },
  pitchTitle: {
    margin: 0,
    fontSize: "18px",
  },
  pitchText: {
    margin: 0,
    lineHeight: 1.55,
    fontSize: "14px",
    color: "#d7e1d3",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "28px",
    padding: "0 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    width: "fit-content",
  },
  statusDefault: {
    background: "#eef2ed",
    color: "#334130",
  },
  statusSuccess: {
    background: "#dff0df",
    color: "#1d4a25",
  },
  statusWarning: {
    background: "#f7ead0",
    color: "#765000",
  },
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

