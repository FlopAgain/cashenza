import prisma from "../db.server";

export type DiagnosticSeverity = "healthy" | "warning" | "critical";

export type DiagnosticItem = {
  id: string;
  severity: DiagnosticSeverity;
  title: string;
  summary: string;
  details: string[];
};

export async function loadDiagnosticsSnapshot(params: { shop: string }) {
  const [settings, activeCrossSellBundles, volumeBundles, simpleSettings, duplicateGroups] =
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
          status: "ACTIVE",
        },
        select: {
          id: true,
          title: true,
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
          productHandle: true,
          status: true,
          automaticDiscountId: true,
          offers: {
            select: {
              id: true,
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
      prisma.simpleBundleProductSetting.findMany({
        where: {
          shop: params.shop,
          enabled: true,
        },
        select: {
          productHandle: true,
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
    ]);

  const duplicateHandles = duplicateGroups.filter(
    (group) => group.productHandle && group._count._all > 1,
  );
  const unsyncedCrossSell = activeCrossSellBundles.filter((bundle) => !bundle.automaticDiscountId);
  const invalidCrossSell = activeCrossSellBundles.filter(
    (bundle) =>
      !bundle.productHandle ||
      bundle.offers.length === 0 ||
      bundle.offers.some((offer) => offer.items.length === 0),
  );
  const unsyncedVolume = volumeBundles.filter(
    (bundle) => bundle.status === "ACTIVE" && !bundle.automaticDiscountId,
  );
  const invalidVolume = volumeBundles.filter(
    (bundle) =>
      !bundle.productHandle ||
      bundle.offers.length === 0 ||
      bundle.offers.some(
        (offer, index) =>
          offer.items.length !== 1 || Number(offer.items[0]?.quantity || 0) !== index + 1,
      ),
  );
  const configuredVolumeHandleSet = new Set(
    volumeBundles
      .map((bundle) => bundle.productHandle)
      .filter((handle): handle is string => Boolean(handle)),
  );
  const enabledWithoutConfiguredVolume = simpleSettings.filter(
    (setting) => !configuredVolumeHandleSet.has(setting.productHandle),
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
    id: "cross-sell-sync",
    severity: unsyncedCrossSell.length === 0 ? "healthy" : "warning",
    title:
      unsyncedCrossSell.length === 0
        ? "All active cross-sell bundles are synced"
        : "Some active cross-sell bundles need discount sync",
    summary:
      unsyncedCrossSell.length === 0
        ? "Automatic discounts look healthy for active cross-sell bundles."
        : `${unsyncedCrossSell.length} active cross-sell bundle(s) are missing an automatic discount ID.`,
    details:
      unsyncedCrossSell.length === 0
        ? ["No action needed right now."]
        : unsyncedCrossSell.map((bundle) => `${bundle.title} (${bundle.productHandle || "missing handle"})`),
  });

  items.push({
    id: "volume-sync",
    severity: unsyncedVolume.length === 0 ? "healthy" : "warning",
    title:
      unsyncedVolume.length === 0
        ? "All active volume bundles are synced"
        : "Some active volume bundles need discount sync",
    summary:
      unsyncedVolume.length === 0
        ? "Automatic discounts look healthy for active volume bundles."
        : `${unsyncedVolume.length} active volume bundle(s) are missing an automatic discount ID.`,
    details:
      unsyncedVolume.length === 0
        ? ["No action needed right now."]
        : unsyncedVolume.map((bundle) => `${bundle.title} (${bundle.productHandle || "missing handle"})`),
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
        : invalidCrossSell.map((bundle) => `${bundle.title} (${bundle.productHandle || "missing handle"})`),
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
        ? "Each offer contains exactly one repeated item with the expected quantity."
        : `${invalidVolume.length} volume bundle(s) do not match the expected 1x / 2x / 3x ladder shape.`,
    details:
      invalidVolume.length === 0
        ? ["No invalid volume bundle ladders detected."]
        : invalidVolume.map((bundle) => `${bundle.title} (${bundle.productHandle || "missing handle"})`),
  });

  items.push({
    id: "volume-fallback",
    severity: enabledWithoutConfiguredVolume.length === 0 ? "healthy" : "warning",
    title:
      enabledWithoutConfiguredVolume.length === 0
        ? "Enabled volume pages are backed by configured bundles"
        : "Some enabled volume pages still rely on fallback behavior",
    summary:
      enabledWithoutConfiguredVolume.length === 0
        ? "Every enabled product page has a real admin-configured volume bundle."
        : `${enabledWithoutConfiguredVolume.length} enabled product page(s) still rely on the legacy fallback instead of a configured volume bundle.`,
    details:
      enabledWithoutConfiguredVolume.length === 0
        ? ["No action needed right now."]
        : enabledWithoutConfiguredVolume.map((setting) => setting.productHandle),
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
