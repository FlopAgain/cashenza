import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  buildDuplicatedBundleData,
  buildDuplicatedOfferData,
  isDuplicatedBestSellerOffer,
} from "../utils/duplicate-bundle.server";
import { loadAnalyticsSnapshot } from "../utils/analytics.server";

type BundleCard = {
  id: string;
  title: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  productHandle: string | null;
  updatedAt: string | Date;
  automaticDiscountId: string | null;
  offers: Array<{
    id: string;
    title: string;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
    discountValue: number;
  }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const analyticsPromise = loadAnalyticsSnapshot({
    shop: session.shop,
    admin,
  });

  const [
    bundles,
    activeBundles,
    draftBundles,
    archivedBundles,
    analytics,
  ] =
    await Promise.all([
      prisma.bundle.findMany({
        where: { shop: session.shop, bundleType: "CROSS_SELL" },
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
      prisma.bundle.count({ where: { shop: session.shop, bundleType: "CROSS_SELL", status: "ACTIVE" } }),
      prisma.bundle.count({ where: { shop: session.shop, bundleType: "CROSS_SELL", status: "DRAFT" } }),
      prisma.bundle.count({ where: { shop: session.shop, bundleType: "CROSS_SELL", status: "ARCHIVED" } }),
      analyticsPromise,
    ]);
  const totalCrossSellBundles = activeBundles + draftBundles + archivedBundles;

  return {
    shop: session.shop,
    bundles,
    stats: {
      total: totalCrossSellBundles,
      active: activeBundles,
      draft: draftBundles,
      archived: archivedBundles,
      simpleEnabled: analytics.volumeEnabled,
    },
    analytics,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "duplicate") {
    const bundleId = String(formData.get("bundleId") || "").trim();
    if (!bundleId) {
      throw new Response("Bundle not found", { status: 404 });
    }

    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, shop: session.shop, bundleType: "CROSS_SELL" },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (!bundle) {
      throw new Response("Bundle not found", { status: 404 });
    }

    const duplicatedBundle = await prisma.$transaction(async (tx) => {
      const createdBundle = await tx.bundle.create({
        data: buildDuplicatedBundleData(bundle as any) as any,
      });

      let duplicatedBestSellerOfferId: string | null = null;

      for (const offer of bundle.offers) {
        const createdOffer = await tx.bundleOffer.create({
          data: {
            bundleId: createdBundle.id,
            ...buildDuplicatedOfferData(offer as any),
          },
        });

        if (isDuplicatedBestSellerOffer(bundle, offer)) {
          duplicatedBestSellerOfferId = createdOffer.id;
        }
      }

      if (duplicatedBestSellerOfferId) {
        await tx.bundle.update({
          where: { id: createdBundle.id },
          data: { bestSellerOfferId: duplicatedBestSellerOfferId } as any,
        });
      }

      return createdBundle;
    });

    return redirect(`/app/cross-sell-bundles/${duplicatedBundle.id}?duplicated=1`);
  }

  return null;
};

function formatDiscountLabel(bundle: BundleCard) {
  const bestOffer = bundle.offers.find((offer) => offer.discountValue > 0);
  if (!bestOffer) return "No discount";

  if (bestOffer.discountType === "PERCENTAGE") {
    return `${bestOffer.discountValue}% off`;
  }

  if (bestOffer.discountType === "FIXED_AMOUNT") {
    return `${bestOffer.discountValue} off`;
  }

  return `Fixed price ${bestOffer.discountValue}`;
}

function formatSyncStatus(bundle: BundleCard) {
  return bundle.automaticDiscountId ? "Synced" : "Needs sync";
}

export default function Index() {
  const { shop, bundles, stats, analytics } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Cashenza Bundlify">
      <Link to="/app/cross-sell-bundles/new" style={styles.primaryLink}>
        Create cross-sell bundle
      </Link>

      <section style={styles.hero}>
        <div style={styles.heroContent}>
          <div style={styles.logoRow}>
            <img src="/cashenza-square.svg" alt="Cashenza" style={styles.logo} />
            <span style={styles.badge}>Conversion-focused bundle builder</span>
          </div>
          <h1 style={styles.heroTitle}>Build volume and cross-sell bundles that stay clear, premium, and conversion-first.</h1>
            <p style={styles.heroText}>
            Cashenza Bundlify is moving toward one clear model: volume bundles for repeated quantities,
            cross-sell bundles for product combinations, and theme styling kept separate from bundle logic.
          </p>
          <div style={styles.heroActionGroups}>
            <div style={styles.heroActionGroup}>
              <div style={styles.heroActionGroupLabel}>Volume bundles</div>
              <div style={styles.heroActionGroupBody}>
                <Link to="/app/volume-bundles" style={styles.heroButtonLink}>Manage volume bundles</Link>
                <p style={styles.heroActionGroupText}>
                  Increase average order value with tiered quantity offers on the same product, using a simple structure that is easy for merchants to understand and manage.
                </p>
              </div>
            </div>
            <div style={styles.heroActionGroup}>
              <div style={styles.heroActionGroupLabel}>Cross-sell bundles</div>
              <div style={styles.heroActionGroupBody}>
                <div style={styles.heroActionGroupButtons}>
                  <Link to="/app/cross-sell-bundles/new" style={styles.heroButtonLink}>Create your first cross-sell bundle</Link>
                  <Link to="/app/cross-sell-bundles" style={styles.heroButtonLink}>Manage cross-sell bundles</Link>
                </div>
                <p style={styles.heroActionGroupText}>
                  Build complementary product bundles that raise perceived value and convert more effectively.
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
            <MetricCard label="Cross-sell bundles" value={String(stats.total)} tone="dark" />
            <MetricCard label="Cross-sell active" value={String(stats.active)} tone="green" />
            <MetricCard label="Cross-sell draft" value={String(stats.draft)} tone="cream" />
            <MetricCard label="Volume enabled" value={String(stats.simpleEnabled)} tone="muted" />
          </div>

          <div style={styles.diagnosticsCard}>
            <div>
              <div style={styles.diagnosticsLabel}>Diagnostics</div>
              <div style={styles.diagnosticsTitle}>Quick checks when something feels off</div>
              <p style={styles.diagnosticsText}>
                Open diagnostics to review sync health, duplicate actives, and fallback usage without digging through code.
              </p>
            </div>
            <Link to="/app/diagnostics" style={styles.heroButtonLink}>Open diagnostics</Link>
          </div>
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

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Merchant flow</h2>
            <p style={styles.sectionText}>
              Keep setup friction low. This is the V2 product logic merchants should understand immediately.
            </p>
          </div>
        </div>

        <div style={styles.stepGrid}>
          <StepCard
            index="01"
            title="Activate volume bundles"
            text="Use the dedicated volume bundles page to decide where the same-product quantity ladder should appear."
          />
          <StepCard
            index="02"
            title="Create a cross-sell bundle"
            text="Build advanced combinations when you want the page product plus one or more different products."
          />
          <StepCard
            index="03"
            title="Publish and test"
            text="Open the storefront, verify variant picks, and confirm the cart discount stays correct end to end."
          />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Saved cross-sell bundles</h2>
            <p style={styles.sectionText}>
              Your latest cross-sell configurations, sync status, and quick actions in one place.
            </p>
          </div>
          <div style={styles.heroActions}>
            <Link to="/app/cross-sell-bundles/new" style={styles.heroButtonLink}>New cross-sell bundle</Link>
            <Link to="/app/cross-sell-bundles" style={styles.heroButtonLink}>View all cross-sell bundles</Link>
          </div>
        </div>

        {bundles.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={styles.emptyTitle}>No cross-sell bundles yet</h3>
            <p style={styles.emptyText}>
              Start with one high-intent product and create a richer bundle with the page product plus additional products and discounts.
            </p>
            <Link to="/app/cross-sell-bundles/new" style={styles.heroButtonLink}>
              Open cross-sell configurator
            </Link>
          </div>
        ) : (
          <div style={styles.bundleGrid}>
            {bundles.map((bundle) => (
              <article key={bundle.id} style={styles.bundleCard}>
                <div style={styles.bundleCardTop}>
                  <div>
                    <div style={styles.bundleStatusRow}>
                      <StatusPill label={bundle.status} />
                      <StatusPill
                        label={formatSyncStatus(bundle)}
                        kind={bundle.automaticDiscountId ? "success" : "warning"}
                      />
                    </div>
                    <h3 style={styles.bundleTitle}>{bundle.title}</h3>
                    <p style={styles.bundleHandle}>
                      Product handle: {bundle.productHandle || "Missing handle"}
                    </p>
                  </div>
                  <div style={styles.bundleMetaBox}>
                    <span style={styles.bundleMetaLabel}>Offer highlight</span>
                    <strong>{formatDiscountLabel(bundle)}</strong>
                  </div>
                </div>

                <div style={styles.bundleStatsRow}>
                  <InlineStat label="Offers" value={String(bundle.offers.length)} />
                  <InlineStat
                    label="Updated"
                    value={new Date(bundle.updatedAt).toLocaleDateString("fr-FR")}
                  />
                </div>

                <div style={styles.bundleActions}>
                  <Link to={`/app/cross-sell-bundles/${bundle.id}`} style={styles.heroButtonLink}>
                    Edit
                  </Link>
                  <Form method="post">
                    <input type="hidden" name="intent" value="duplicate" />
                    <input type="hidden" name="bundleId" value={bundle.id} />
                    <button type="submit" style={styles.secondaryAction}>
                      Duplicate
                    </button>
                  </Form>
                </div>
              </article>
            ))}
          </div>
        )}
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

function InlineStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={styles.inlineStat}>
      <span style={styles.inlineStatLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
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
  heroActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    width: "fit-content",
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
  bundleGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },
  bundleCard: {
    padding: "18px",
    borderRadius: "22px",
    border: "1px solid #dfe4db",
    background: "#ffffff",
    display: "grid",
    gap: "14px",
  },
  bundleCardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "start",
  },
  bundleStatusRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "10px",
  },
  bundleTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#172315",
  },
  bundleHandle: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "#5f6c5b",
    wordBreak: "break-word",
  },
  bundleMetaBox: {
    minWidth: "110px",
    padding: "12px",
    borderRadius: "16px",
    background: "#f2f6ef",
    color: "#21311f",
    display: "grid",
    gap: "4px",
  },
  bundleMetaLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    opacity: 0.65,
    fontWeight: 700,
  },
  bundleStatsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  },
  inlineStat: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "999px",
    background: "#f5f7f2",
  },
  inlineStatLabel: {
    fontSize: "12px",
    color: "#5e6b59",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  bundleActions: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
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
  primaryLink: {
    minHeight: "38px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid #162314",
    background: "#162314",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
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

