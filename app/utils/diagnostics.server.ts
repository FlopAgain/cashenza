import prisma from "../db.server";
import { loadBundleStatusSnapshot } from "./bundle-status.server";
import { loadShopProducts } from "./volume-bundles.server";

export type DiagnosticSeverity = "healthy" | "warning" | "critical";

export type DiagnosticItem = {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  summary: string;
  details: string[];
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type LiveWidgetIssue = {
  kind: "outside-product-page" | "duplicate-product-page";
  pagePath: string;
  blockId: string;
};

async function fetchStorefrontHtml(shop: string, path: string) {
  const response = await fetch(`https://${shop}${path}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Cashenza-Bundlify-Diagnostics",
    },
  });

  if (!response.ok) {
    throw new Error(`Storefront request failed for ${path}: ${response.status}`);
  }

  return response.text();
}

function extractWidgetBlockIds(html: string) {
  const matches = html.matchAll(/id="bundle-widget-([^"]+)"/g);
  return Array.from(matches, (match) => match[1]).filter(Boolean);
}

async function loadLiveWidgetPlacementIssues(params: {
  shop: string;
  admin: AdminGraphqlClient;
  productHandles: string[];
}) {
  const staticPaths = ["/", "/collections/all", "/cart"];
  const productPaths = params.productHandles.map((handle) => `/products/${handle}`);
  const issues: LiveWidgetIssue[] = [];

  for (const path of staticPaths) {
    try {
      const html = await fetchStorefrontHtml(params.shop, path);
      const blockIds = extractWidgetBlockIds(html);
      blockIds.forEach((blockId) => {
        issues.push({
          kind: "outside-product-page",
          pagePath: path,
          blockId,
        });
      });
    } catch {
      // Best effort: diagnostics should stay usable even if a storefront fetch fails.
    }
  }

  for (const path of productPaths) {
    try {
      const html = await fetchStorefrontHtml(params.shop, path);
      const blockIds = extractWidgetBlockIds(html);
      if (blockIds.length > 1) {
        blockIds.forEach((blockId) => {
          issues.push({
            kind: "duplicate-product-page",
            pagePath: path,
            blockId,
          });
        });
      }
    } catch {
      // Best effort
    }
  }

  return issues;
}

export async function loadDiagnosticsSnapshot(params: {
  shop: string;
  admin: AdminGraphqlClient;
}) {
  const [settings, crossSellBundles, volumeBundles, duplicateGroups, products] =
    await Promise.all([
      prisma.appSettings.findUnique({
        where: { shop: params.shop },
        select: {
          supportEmail: true,
        },
      }),
      prisma.bundle.findMany({
        where: {
          shop: params.shop,
          bundleType: "CROSS_SELL",
        },
        select: {
          id: true,
          title: true,
          status: true,
          productHandle: true,
          automaticDiscountId: true,
          offers: {
            select: {
              id: true,
              items: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      }),
      prisma.bundle.findMany({
        where: {
          shop: params.shop,
          bundleType: "VOLUME",
        },
        select: {
          id: true,
          title: true,
          status: true,
          productHandle: true,
          automaticDiscountId: true,
          offers: {
            select: {
              id: true,
              quantity: true,
              items: {
                select: {
                  id: true,
                  quantity: true,
                },
              },
            },
          },
        },
      }),
      prisma.bundle.groupBy({
        by: ["productHandle"],
        where: {
          shop: params.shop,
          bundleType: "CROSS_SELL",
          status: "ACTIVE",
          productHandle: { not: null },
        },
        _count: {
          _all: true,
        },
      }),
      loadShopProducts(params.admin),
    ]);

  const [crossSellStatuses, volumeStatuses] = await Promise.all([
    Promise.all(
      crossSellBundles.map(async (bundle) => ({
        bundle,
        status: await loadBundleStatusSnapshot(params.admin, bundle),
      })),
    ),
    Promise.all(
      volumeBundles.map(async (bundle) => ({
        bundle,
        status: await loadBundleStatusSnapshot(params.admin, bundle),
      })),
    ),
  ]);

  const activeCrossSellHandles = crossSellStatuses
    .filter((entry) => entry.status.operationalStatus === "ACTIVE" && entry.bundle.productHandle)
    .map((entry) => entry.bundle.productHandle as string);
  const activeVolumeHandles = volumeStatuses
    .filter((entry) => entry.status.operationalStatus === "ACTIVE" && entry.bundle.productHandle)
    .map((entry) => entry.bundle.productHandle as string);
  const sampleHandles = [
    ...new Set(
      [...activeCrossSellHandles, ...activeVolumeHandles, ...products.slice(0, 20).map((product) => product.handle)]
        .filter(Boolean),
    ),
  ];

  const liveWidgetIssues = await loadLiveWidgetPlacementIssues({
    shop: params.shop,
    admin: params.admin,
    productHandles: sampleHandles,
  });

  const duplicateHandles = duplicateGroups.filter(
    (group) => group.productHandle && group._count._all > 1,
  );
  const missingCrossSellDiscounts = crossSellStatuses.filter(
    (entry) =>
      entry.status.operationalStatus === "ACTIVE" &&
      entry.status.shopifyDiscountStatus === "MISSING",
  );
  const invalidCrossSell = crossSellStatuses.filter(
    (entry) =>
      entry.status.operationalStatus === "ACTIVE" &&
      (!entry.bundle.productHandle ||
        entry.bundle.offers.length === 0 ||
        entry.bundle.offers.some((offer) => offer.items.length === 0)),
  );
  const missingVolumeDiscounts = volumeStatuses.filter(
    (entry) =>
      entry.status.operationalStatus === "ACTIVE" &&
      entry.status.shopifyDiscountStatus === "MISSING",
  );
  const invalidVolume = volumeStatuses.filter(
    (entry) =>
      entry.status.operationalStatus === "ACTIVE" &&
      (!entry.bundle.productHandle ||
        entry.bundle.offers.length === 0 ||
        entry.bundle.offers.some((offer) => {
          if (offer.items.length !== offer.quantity) return true;
          return offer.items.some((item) => Number(item.quantity || 0) !== 1);
        })),
  );

  const items: DiagnosticItem[] = [];

  items.push({
    id: "support-email",
    severity: settings?.supportEmail ? "healthy" : "warning",
    title: settings?.supportEmail ? "Support contact is configured" : "Support email is missing",
    summary: settings?.supportEmail
      ? "Merchants have a support contact configured in settings."
      : "Add a support email before launch so merchants have a reliable contact point.",
    details: settings?.supportEmail
      ? [`Support email: ${settings.supportEmail}`]
      : ["Open Settings and add your support email."],
  });

  items.push({
    id: "widget-placement",
    severity: liveWidgetIssues.length === 0 ? "healthy" : "critical",
    title:
      liveWidgetIssues.length === 0
        ? "Bundle widget placement looks valid"
        : "Bundle widget placement needs attention",
    summary:
      liveWidgetIssues.length === 0
        ? "The bundle appears only once and only on product pages."
        : `${liveWidgetIssues.length} widget placement issue(s) were detected. The bundle should appear once, only on a product page.`,
    details:
      liveWidgetIssues.length === 0
        ? ["No invalid widget placement was detected on the scanned storefront pages."]
        : liveWidgetIssues.map((issue) =>
            issue.kind === "outside-product-page"
              ? `Outside product page - Page: ${issue.pagePath} | Block: ${issue.blockId}`
              : `Duplicate on product page - Page: ${issue.pagePath} | Block: ${issue.blockId}`,
          ),
  });

  items.push({
    id: "cross-sell-sync",
    severity: missingCrossSellDiscounts.length === 0 ? "healthy" : "warning",
    title:
      missingCrossSellDiscounts.length === 0
        ? "All active cross-sell bundles are synced"
        : "Some active cross-sell bundles need discount sync",
    summary:
      missingCrossSellDiscounts.length === 0
        ? "Automatic discounts look healthy for active cross-sell bundles."
        : `${missingCrossSellDiscounts.length} active cross-sell bundle(s) are missing their Shopify discount.`,
    details:
      missingCrossSellDiscounts.length === 0
        ? ["No action needed right now."]
        : missingCrossSellDiscounts.map(
            ({ bundle }) => `${bundle.title} (${bundle.productHandle || "missing handle"})`,
          ),
  });

  items.push({
    id: "volume-sync",
    severity: missingVolumeDiscounts.length === 0 ? "healthy" : "warning",
    title:
      missingVolumeDiscounts.length === 0
        ? "All active volume bundles are synced"
        : "Some active volume bundles need discount sync",
    summary:
      missingVolumeDiscounts.length === 0
        ? "Automatic discounts look healthy for active volume bundles."
        : `${missingVolumeDiscounts.length} active volume bundle(s) are missing their Shopify discount.`,
    details:
      missingVolumeDiscounts.length === 0
        ? ["No action needed right now."]
        : missingVolumeDiscounts.map(
            ({ bundle }) => `${bundle.title} (${bundle.productHandle || "missing handle"})`,
          ),
  });

  items.push({
    id: "cross-sell-duplicates",
    severity: duplicateHandles.length === 0 ? "healthy" : "critical",
    title:
      duplicateHandles.length === 0
        ? "Cross-sell bundle priority is clean"
        : "Multiple active cross-sell bundles share the same product page",
    summary:
      duplicateHandles.length === 0
        ? "There is at most one active cross-sell bundle per product page."
        : `${duplicateHandles.length} product handle(s) currently have more than one active cross-sell bundle.`,
    details:
      duplicateHandles.length === 0
        ? ["No conflicting active cross-sell bundles detected."]
        : duplicateHandles.map(
            (group) => `${group.productHandle} has ${group._count._all} active cross-sell bundles`,
          ),
  });

  items.push({
    id: "cross-sell-shape",
    severity: invalidCrossSell.length === 0 ? "healthy" : "critical",
    title:
      invalidCrossSell.length === 0
        ? "Cross-sell bundle structure looks valid"
        : "Some active cross-sell bundles are incomplete",
    summary:
      invalidCrossSell.length === 0
        ? "Every active cross-sell bundle has a product handle, offers, and items."
        : `${invalidCrossSell.length} active cross-sell bundle(s) are missing a handle, offers, or items.`,
    details:
      invalidCrossSell.length === 0
        ? ["No incomplete active cross-sell bundles detected."]
        : invalidCrossSell.map(
            ({ bundle }) => `${bundle.title} (${bundle.productHandle || "missing handle"})`,
          ),
  });

  items.push({
    id: "volume-shape",
    severity: invalidVolume.length === 0 ? "healthy" : "critical",
    title:
      invalidVolume.length === 0
        ? "Volume bundle quantity ladders look valid"
        : "Some volume bundles have an invalid quantity ladder",
    summary:
      invalidVolume.length === 0
        ? "Each active volume bundle follows the expected repeated-item ladder."
        : `${invalidVolume.length} active volume bundle(s) do not match the expected 1x / 2x / 3x ladder shape.`,
    details:
      invalidVolume.length === 0
        ? ["No invalid volume bundle ladders detected."]
        : invalidVolume.map(
            ({ bundle }) => `${bundle.title} (${bundle.productHandle || "missing handle"})`,
          ),
  });

  const summary = {
    healthy: items.filter((item) => item.severity === "healthy").length,
    warning: items.filter((item) => item.severity === "warning").length,
    critical: items.filter((item) => item.severity === "critical").length,
  };

  return {
    summary,
    items,
  };
}
