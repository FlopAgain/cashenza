import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requireStarterPlan } from "../utils/billing.server";
import { loadAnalyticsSnapshot } from "../utils/analytics.server";
import { loadStorefrontAnalytics } from "../utils/bundle-analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const [analytics, storefront] = await Promise.all([
    loadAnalyticsSnapshot({
      shop: session.shop,
      admin,
    }),
    loadStorefrontAnalytics({
      shop: session.shop,
    }),
  ]);

  return { analytics, storefront };
};

export default function AnalyticsPage() {
  const { analytics, storefront } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Analytics">
      <s-button slot="primary-action" href="/app">
        Back to dashboard
      </s-button>

      <section style={styles.hero}>
        <div>
          <span style={styles.badge}>V2 analytics foundation</span>
          <h1 style={styles.title}>Track volume bundles and cross-sell bundles with a clearer operational view.</h1>
          <p style={styles.text}>
            This page now combines reliable admin health metrics with first-party storefront
            event tracking from the bundle widget. The structure is ready for deeper revenue
            and profitability analytics next.
          </p>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Storefront signals · last {storefront.windowDays} days</h2>
        <div style={styles.metricGrid}>
          <MetricCard label="Impressions" value={String(storefront.totals.impressions)} tone="dark" />
          <MetricCard label="Offer selections" value={String(storefront.totals.selections)} tone="green" />
          <MetricCard label="Add to cart" value={String(storefront.totals.addToCart)} tone="cream" />
          <MetricCard label="Buy now" value={String(storefront.totals.buyNow)} tone="muted" />
        </div>
        <div style={{ ...styles.metricGrid, marginTop: 14 }}>
          <MetricCard label="Selection rate" value={storefront.rates.selectionRate} tone="green" />
          <MetricCard label="ATC rate" value={storefront.rates.addToCartRate} tone="dark" />
          <MetricCard label="Buy now rate" value={storefront.rates.buyNowRate} tone="cream" />
          <MetricCard label="Failure rate" value={storefront.rates.failureRate} tone="muted" />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Bundle health snapshot</h2>
        <div style={styles.metricGrid}>
          <MetricCard label="Volume enabled" value={String(analytics.volumeEnabled)} tone="green" />
          <MetricCard label="Volume configured" value={String(analytics.volumeConfigured)} tone="dark" />
          <MetricCard label="Cross-sell active" value={String(analytics.crossSellActive)} tone="cream" />
          <MetricCard label="Cross-sell draft" value={String(analytics.crossSellDraft)} tone="muted" />
        </div>
        <div style={{ ...styles.metricGrid, marginTop: 14 }}>
          <MetricCard label="Volume synced" value={String(analytics.volumeSynced)} tone="green" />
          <MetricCard label="Cross-sell synced" value={String(analytics.crossSellSynced)} tone="dark" />
          <MetricCard label="Overridden PDPs" value={String(analytics.overriddenProducts)} tone="cream" />
          <MetricCard label="Sync coverage" value={analytics.syncCoverageRate} tone="muted" />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>By bundle type · last {storefront.windowDays} days</h2>
        <div style={styles.panelGrid}>
          <PanelCard
            title="Volume bundles"
            lines={[
              `Configured: ${analytics.volumeConfigured}`,
              `Active: ${analytics.volumeActive}`,
              `Inactive: ${analytics.volumeDraft}`,
              `Impressions: ${storefront.byType.volume.impressions}`,
              `Add to cart: ${storefront.byType.volume.addToCart}`,
              `Avg offers per volume bundle: ${analytics.averageOffersPerVolume}`,
            ]}
          />
          <PanelCard
            title="Cross-sell bundles"
            lines={[
              `Active: ${analytics.crossSellActive}`,
              `Draft: ${analytics.crossSellDraft}`,
              `Archived: ${analytics.crossSellArchived}`,
              `Impressions: ${storefront.byType.crossSell.impressions}`,
              `Add to cart: ${storefront.byType.crossSell.addToCart}`,
              `Avg offers per cross-sell bundle: ${analytics.averageOffersPerCrossSell}`,
            ]}
          />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Top bundles · last {storefront.windowDays} days</h2>
        <div style={styles.panelGrid}>
          {storefront.topBundles.length ? (
            storefront.topBundles.map((bundle) => (
              <PanelCard
                key={bundle.bundleId || bundle.title}
                title={bundle.title}
                lines={[
                  `Product handle: ${bundle.productHandle || "Unknown"}`,
                  `Add to cart: ${bundle.addToCartCount}`,
                ]}
                dark
              />
            ))
          ) : (
            <PanelCard
              title="No storefront events yet"
              lines={[
                "Publish a bundle and interact with the storefront widget to populate these rankings.",
              ]}
            />
          )}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Next analytics milestones</h2>
        <div style={styles.panelGrid}>
          <PanelCard
            title="Phase 1"
            lines={[
              "Checkout reach rate",
              "Product-page level comparisons",
              "Offer-level winner detection",
            ]}
            dark
          />
          <PanelCard
            title="Phase 2"
            lines={[
              "Bundle revenue",
              "Incremental revenue after discount",
              "Discount cost by bundle type",
            ]}
            dark
          />
          <PanelCard
            title="Phase 3"
            lines={[
              "Market breakdown",
              "Device breakdown",
              "Net uplift and profitability ranking",
            ]}
            dark
          />
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

function PanelCard({
  title,
  lines,
  dark = false,
}: {
  title: string;
  lines: string[];
  dark?: boolean;
}) {
  return (
    <article style={dark ? styles.darkPanel : styles.panel}>
      <h3 style={dark ? styles.panelTitleDark : styles.panelTitle}>{title}</h3>
      <ul style={styles.list}>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    padding: "24px",
    borderRadius: "26px",
    background: "linear-gradient(135deg, #172315 0%, #264227 100%)",
    color: "#f4f8f2",
    marginBottom: "20px",
  },
  badge: {
    display: "inline-flex",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.12)",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  title: {
    margin: "14px 0 10px",
    fontSize: "34px",
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
  },
  text: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    maxWidth: "68ch",
  },
  section: {
    display: "grid",
    gap: "14px",
    marginBottom: "20px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "24px",
    color: "#192517",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
  panelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "14px",
  },
  panel: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #dce2d8",
    background: "#ffffff",
  },
  darkPanel: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #223120",
    background: "#162216",
    color: "#e7eee4",
  },
  panelTitle: {
    margin: "0 0 10px",
    fontSize: "18px",
    color: "#1a2618",
  },
  panelTitleDark: {
    margin: "0 0 10px",
    fontSize: "18px",
    color: "#f1f6ee",
  },
  list: {
    margin: 0,
    paddingLeft: "18px",
    display: "grid",
    gap: "10px",
  },
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
