import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requireStarterPlan } from "../utils/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireStarterPlan(request);
  return null;
};

export default function AdditionalPage() {
  return (
    <s-page heading="Cashenza custom-bundle launch plan">
      <section style={styles.hero}>
        <div>
          <span style={styles.badge}>Beta-to-market checklist</span>
          <h1 style={styles.title}>Turn the app into a product merchants trust enough to pay for.</h1>
          <p style={styles.text}>
            The bundle engine is now working. The next phase is product
            packaging, production hardening, and App Store readiness.
          </p>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Launch progress</h2>
        <div style={styles.grid}>
          <PlanCard
            title="Shipped already"
            items={[
              "True Settings page added",
              "Discount sync health exposed in admin",
              "Duplicate bundle action added",
              "Admin onboarding and empty states improved",
              "Starter billing flow added",
            ]}
            tone="success"
          />
          <PlanCard
            title="Next product tasks"
            items={[
              "Add bundle sync diagnostics",
              "Audit sold-out and deleted-product edge cases",
              "Finalize production support email and policy URLs",
              "Capture final listing assets",
            ]}
            tone="default"
          />
          <PlanCard
            title="Go-to-market assets"
            items={[
              "Finalize app icon and listing screenshots",
              "Write App Store copy and FAQs",
              "Capture 5 listing screenshots",
              "Prepare launch support workflow",
              "Prepare support and feedback loop",
            ]}
            tone="dark"
          />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Recommended pricing</h2>
        <div style={styles.priceGrid}>
          <PriceCard
            name="Starter"
            price="$8/mo"
            text="Unlimited bundles, variants per article, badges, timer, and all main storefront designs."
          />
          <PriceCard
            name="Growth"
            price="$19.99/mo"
            text="Advanced merchandising, future analytics, and premium support positioning."
          />
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Competitive positioning</h2>
        <div style={styles.darkPanel}>
          <ul style={styles.list}>
            <li>Faster to configure than heavyweight bundle apps.</li>
            <li>Cleaner storefront presentation with premium presets.</li>
            <li>Better per-article variant handling for visual products.</li>
            <li>More aggressive launch pricing to win early installs.</li>
          </ul>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Launch docs now ready</h2>
        <div style={styles.grid}>
          <PlanCard
            title="App Store copy"
            items={[
              "Listing copy drafted",
              "FAQ drafted",
              "Pricing copy drafted",
            ]}
            tone="success"
          />
          <PlanCard
            title="Operational docs"
            items={[
              "Release checklist added",
              "Support playbook added",
              "Submission notes added",
            ]}
            tone="success"
          />
          <PlanCard
            title="Still to produce"
            items={[
              "App icon",
              "5 final screenshots",
              "Privacy policy and terms URLs",
            ]}
            tone="dark"
          />
        </div>
      </section>
    </s-page>
  );
}

function PlanCard({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "success" | "dark";
}) {
  const toneStyle =
    tone === "success"
      ? styles.cardSuccess
      : tone === "dark"
        ? styles.cardDark
        : styles.card;

  return (
    <article style={toneStyle}>
      <h3 style={tone === "dark" ? styles.cardTitleDark : styles.cardTitle}>{title}</h3>
      <ul style={styles.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function PriceCard({
  name,
  price,
  text,
}: {
  name: string;
  price: string;
  text: string;
}) {
  return (
    <article style={styles.priceCard}>
      <div style={styles.priceName}>{name}</div>
      <div style={styles.priceValue}>{price}</div>
      <p style={styles.textMuted}>{text}</p>
    </article>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    padding: "24px",
    borderRadius: "26px",
    background: "linear-gradient(135deg, #172315 0%, #2e4c2f 100%)",
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
    maxWidth: "64ch",
  },
  textMuted: {
    margin: 0,
    color: "#596756",
    fontSize: "14px",
    lineHeight: 1.6,
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "14px",
  },
  priceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  card: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #dce2d8",
    background: "#ffffff",
  },
  cardSuccess: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #cfe1ca",
    background: "#f3faf0",
  },
  cardDark: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #223120",
    background: "#162216",
    color: "#e7eee4",
  },
  priceCard: {
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid #dce2d8",
    background: "#f9faf7",
    display: "grid",
    gap: "8px",
  },
  cardTitle: {
    margin: "0 0 10px",
    fontSize: "18px",
    color: "#1a2618",
  },
  cardTitleDark: {
    margin: "0 0 10px",
    fontSize: "18px",
    color: "#f1f6ee",
  },
  priceName: {
    fontSize: "13px",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#4d6e4d",
  },
  priceValue: {
    fontSize: "30px",
    fontWeight: 800,
    color: "#142014",
  },
  darkPanel: {
    padding: "18px",
    borderRadius: "20px",
    background: "#162216",
    color: "#e7eee4",
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
