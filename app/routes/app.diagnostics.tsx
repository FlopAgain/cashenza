import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requireStarterPlan } from "../utils/billing.server";
import { loadDiagnosticsSnapshot } from "../utils/diagnostics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireStarterPlan(request);
  const diagnostics = await loadDiagnosticsSnapshot({
    shop: session.shop,
  });

  return { diagnostics };
};

export default function DiagnosticsPage() {
  const { diagnostics } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Diagnostics">
      <s-button slot="primary-action" href="/app">
        Back to dashboard
      </s-button>

      <section style={styles.hero}>
        <div>
          <span style={styles.badge}>Merchant-friendly checks</span>
          <h1 style={styles.title}>See what needs attention before a bundle issue reaches support.</h1>
          <p style={styles.text}>
            Diagnostics turns bundle health into plain-language checks: sync issues,
            duplicate active bundles, invalid structures, and legacy fallback reliance.
          </p>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Overview</h2>
        <div style={styles.metricGrid}>
          <MetricCard label="Healthy" value={String(diagnostics.summary.healthy)} tone="green" />
          <MetricCard label="Warnings" value={String(diagnostics.summary.warning)} tone="cream" />
          <MetricCard label="Critical" value={String(diagnostics.summary.critical)} tone="dark" />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Checks</h2>
        <div style={styles.stack}>
          {diagnostics.items.map((item) => (
            <article
              key={item.id}
              style={{
                ...styles.card,
                ...(item.severity === "healthy"
                  ? styles.cardHealthy
                  : item.severity === "warning"
                    ? styles.cardWarning
                    : styles.cardCritical),
              }}
            >
              <div style={styles.cardHeader}>
                <div>
                  <div style={styles.cardTitle}>{item.title}</div>
                  <p style={styles.cardSummary}>{item.summary}</p>
                </div>
                <span
                  style={{
                    ...styles.statusPill,
                    ...(item.severity === "healthy"
                      ? styles.statusHealthy
                      : item.severity === "warning"
                        ? styles.statusWarning
                        : styles.statusCritical),
                  }}
                >
                  {item.severity}
                </span>
              </div>
              <ul style={styles.list}>
                {item.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </article>
          ))}
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
  tone: "dark" | "green" | "cream";
}) {
  const toneStyles =
    tone === "dark" ? styles.metricDark : tone === "green" ? styles.metricGreen : styles.metricCream;

  return (
    <div style={{ ...styles.metricCard, ...toneStyles }}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
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
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "12px",
  },
  metricCard: {
    padding: "16px",
    borderRadius: "20px",
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
  stack: {
    display: "grid",
    gap: "14px",
  },
  card: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #dce2d8",
    background: "#ffffff",
    display: "grid",
    gap: "12px",
  },
  cardHealthy: {
    background: "#f3faf0",
    borderColor: "#cfe1ca",
  },
  cardWarning: {
    background: "#fff9eb",
    borderColor: "#eedba5",
  },
  cardCritical: {
    background: "#fff1f1",
    borderColor: "#efc1c1",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "start",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: 800,
    color: "#172315",
  },
  cardSummary: {
    margin: "6px 0 0",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#556351",
    maxWidth: "72ch",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "30px",
    padding: "0 12px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "uppercase",
  },
  statusHealthy: {
    background: "#dff0df",
    color: "#1d4a25",
  },
  statusWarning: {
    background: "#f7ead0",
    color: "#765000",
  },
  statusCritical: {
    background: "#f3d1d1",
    color: "#7e1010",
  },
  list: {
    margin: 0,
    paddingLeft: "18px",
    display: "grid",
    gap: "8px",
    color: "#31412f",
  },
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
