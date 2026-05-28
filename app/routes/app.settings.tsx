import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import { syncBundleAutomaticDiscount } from "../utils/bundle-discount.server";
import { syncAntiFlashGuardOnPublishedTheme } from "../utils/theme-placement.server";

type ActionData = {
  success?: string;
  warning?: string;
  details?: string[];
  error?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireStarterPlan(request);

  const [settings, bundles] = await Promise.all([
    prisma.appSettings.findUnique({
      where: { shop: session.shop },
    }),
    prisma.bundle.findMany({
      where: {
        shop: session.shop,
        bundleType: { in: ["CROSS_SELL", "VOLUME"] as any },
      },
      select: {
        id: true,
        title: true,
        status: true,
        automaticDiscountId: true,
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const activeBundles = bundles.filter((bundle) => bundle.status === "ACTIVE");
  const syncedBundles = activeBundles.filter((bundle) => Boolean(bundle.automaticDiscountId));

    return {
      settings: settings ?? {
      appDisplayName: "Cashenza Bundlify",
      supportEmail: "",
      defaultAddToCartLabel: "Add selected bundle",
      defaultSaveBadgeLabel: "Save",
      defaultTimerPrefix: "Offer ends in",
      antiFlashGuardEnabled: true,
    },
    stats: {
      totalBundles: bundles.length,
      activeBundles: activeBundles.length,
      syncedBundles: syncedBundles.length,
      unsyncedBundles: Math.max(activeBundles.length - syncedBundles.length, 0),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "save");

  if (intent === "resync") {
    const activeBundles = await prisma.bundle.findMany({
      where: {
        shop: session.shop,
        bundleType: { in: ["CROSS_SELL", "VOLUME"] as any },
        status: "ACTIVE",
      },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    let syncedCount = 0;
    for (const bundle of activeBundles as any[]) {
      const automaticDiscountId = await syncBundleAutomaticDiscount(admin, bundle);
      await prisma.bundle.update({
        where: { id: bundle.id },
        data: { automaticDiscountId } as any,
      });
      syncedCount += 1;
    }

    return {
      success: `${syncedCount} active bundle discount${syncedCount > 1 ? "s were" : " was"} resynced.`,
    } satisfies ActionData;
  }

  const appDisplayName = String(formData.get("appDisplayName") || "").trim();
  const supportEmail = String(formData.get("supportEmail") || "").trim();
  const defaultAddToCartLabel = String(formData.get("defaultAddToCartLabel") || "").trim();
  const defaultSaveBadgeLabel = String(formData.get("defaultSaveBadgeLabel") || "").trim();
  const defaultTimerPrefix = String(formData.get("defaultTimerPrefix") || "").trim();
  const antiFlashGuardEnabled = formData.get("antiFlashGuardEnabled") === "on";

  if (!appDisplayName || !defaultAddToCartLabel || !defaultSaveBadgeLabel || !defaultTimerPrefix) {
    return {
      error: "Display name, add to cart label, save badge label, and timer prefix are required.",
    } satisfies ActionData;
  }

  await prisma.appSettings.upsert({
    where: { shop: session.shop },
    update: {
      appDisplayName,
      supportEmail: supportEmail || null,
      defaultAddToCartLabel,
      defaultSaveBadgeLabel,
      defaultTimerPrefix,
      antiFlashGuardEnabled,
    },
    create: {
      shop: session.shop,
      appDisplayName,
      supportEmail: supportEmail || null,
      defaultAddToCartLabel,
      defaultSaveBadgeLabel,
      defaultTimerPrefix,
      antiFlashGuardEnabled,
    },
  });

  const guardSync = await syncAntiFlashGuardOnPublishedTheme({
    admin,
    enabled: antiFlashGuardEnabled,
  });

  return {
    success: "Cashenza Bundlify settings saved.",
    warning: guardSync.status === "error" ? guardSync.message : undefined,
    details:
      guardSync.status === "error" || guardSync.status === "skipped"
        ? [guardSync.message, ...guardSync.details]
        : undefined,
  } satisfies ActionData;
};

export default function SettingsPage() {
  const { settings, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <s-page heading="Cashenza Bundlify settings">
      {actionData?.success ? <s-banner tone="success">{actionData.success}</s-banner> : null}
      {actionData?.warning ? <s-banner tone="warning">{actionData.warning}</s-banner> : null}
      {actionData?.error ? <s-banner tone="critical">{actionData.error}</s-banner> : null}
      {actionData?.details?.length ? (
        <div style={styles.noticeDetails}>
          {actionData.details.map((detail) => (
            <span key={detail}>{detail}</span>
          ))}
        </div>
      ) : null}

      <div style={styles.layout}>
        <section style={styles.mainColumn}>
          <Form method="post">
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Brand & merchant copy</h2>
              <div style={styles.gridTwo}>
                <label style={styles.field}>
                  <span style={styles.label}>App display name</span>
                  <input
                    name="appDisplayName"
                    defaultValue={settings.appDisplayName}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Support email</span>
                  <input
                    name="supportEmail"
                    defaultValue={settings.supportEmail || ""}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Default add to cart label</span>
                  <input
                    name="defaultAddToCartLabel"
                    defaultValue={settings.defaultAddToCartLabel}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Default save badge label</span>
                  <input
                    name="defaultSaveBadgeLabel"
                    defaultValue={settings.defaultSaveBadgeLabel}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Default timer prefix</span>
                  <input
                    name="defaultTimerPrefix"
                    defaultValue={settings.defaultTimerPrefix}
                    style={styles.input}
                  />
                </label>
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Storefront loading</h2>
              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  name="antiFlashGuardEnabled"
                  defaultChecked={settings.antiFlashGuardEnabled ?? true}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxCopy}>
                  <span style={styles.checkboxTitleRow}>
                    Enable anti flash guard
                    <span
                      style={styles.infoIcon}
                      title="Masks the theme native buttons while a bundle is loading. This can add a very small extra loading delay before native buttons reappear when no bundle is present."
                    >
                      i
                    </span>
                  </span>
                  <span style={styles.checkboxDescription}>
                    Hide native theme purchase controls during bundle loading to avoid a visible button flash.
                  </span>
                </span>
              </label>
            </div>

            <div style={styles.actionsRow}>
              <button type="submit" style={styles.primaryButton} disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save settings"}
              </button>
            </div>
          </Form>
        </section>

        <aside style={styles.sidebar}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Discount sync health</h2>
            <div style={styles.stack}>
              <StatRow label="Total configured bundles" value={String(stats.totalBundles)} />
              <StatRow label="Active bundles" value={String(stats.activeBundles)} />
              <StatRow label="Synced automatic discounts" value={String(stats.syncedBundles)} />
              <StatRow label="Needs attention" value={String(stats.unsyncedBundles)} />
            </div>

            <Form method="post">
              <input type="hidden" name="intent" value="resync" />
              <button type="submit" style={styles.secondaryButton} disabled={isSubmitting}>
                {isSubmitting ? "Resyncing..." : "Resync active discounts"}
              </button>
            </Form>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Why this matters</h2>
            <ul style={styles.list}>
              <li>Support gets easier when you can verify sync for both volume and cross-sell bundles.</li>
              <li>Global labels prepare the app for future style-only presentation overrides.</li>
              <li>This page keeps launch-critical merchant defaults in one predictable place.</li>
            </ul>
          </div>
        </aside>
      </div>
    </s-page>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 0.9fr)",
    gap: "20px",
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: "20px",
  },
  sidebar: {
    display: "grid",
    gap: "20px",
  },
  card: {
    padding: "20px",
    borderRadius: "20px",
    border: "1px solid #dbe1d5",
    background: "#ffffff",
    display: "grid",
    gap: "16px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#162314",
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  field: {
    display: "grid",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#344332",
  },
  input: {
    minHeight: "44px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #ccd4c6",
    background: "#ffffff",
    fontSize: "14px",
  },
  checkboxRow: {
    display: "grid",
    gridTemplateColumns: "auto minmax(0, 1fr)",
    gap: "12px",
    alignItems: "start",
    padding: "14px",
    borderRadius: "16px",
    border: "1px solid #dbe1d5",
    background: "#f7faf5",
    cursor: "pointer",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    marginTop: "2px",
    accentColor: "#162314",
  },
  checkboxCopy: {
    display: "grid",
    gap: "4px",
    color: "#263522",
  },
  checkboxTitleRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: 800,
  },
  checkboxDescription: {
    color: "#596755",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  infoIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    background: "#162314",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "help",
    lineHeight: 1,
  },
  noticeDetails: {
    display: "grid",
    gap: "4px",
    marginBottom: "12px",
    padding: "12px 14px",
    borderRadius: "14px",
    border: "1px solid #ead7a6",
    background: "#fff8e8",
    color: "#655123",
    fontSize: "13px",
  },
  actionsRow: {
    display: "flex",
    justifyContent: "flex-start",
  },
  primaryButton: {
    minHeight: "46px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "none",
    background: "#162314",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "46px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "1px solid #162314",
    background: "#ffffff",
    color: "#162314",
    fontWeight: 700,
    cursor: "pointer",
  },
  stack: {
    display: "grid",
    gap: "10px",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: "14px",
    background: "#f5f8f3",
  },
  statLabel: {
    fontSize: "13px",
    color: "#526150",
    fontWeight: 600,
  },
  list: {
    margin: 0,
    paddingLeft: "18px",
    display: "grid",
    gap: "10px",
    color: "#556352",
  },
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
