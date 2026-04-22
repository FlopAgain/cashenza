import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import { reconcileBundleAutomaticDiscountState } from "../utils/bundle-discount.server";
import {
  buildDuplicatedBundleData,
  buildDuplicatedOfferData,
  isDuplicatedBestSellerOffer,
} from "../utils/duplicate-bundle.server";

type BundleCard = {
  id: string;
  title: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  productHandle: string | null;
  updatedAt: string | Date;
  automaticDiscountId: string | null;
  shopifyDiscountStatus: "ACTIVE" | "EXPIRED" | "SCHEDULED" | "UNKNOWN" | "MISSING";
  offers: Array<{
    id: string;
    title: string;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
    discountValue: number;
  }>;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);

  const bundles = await prisma.bundle.findMany({
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
  });

  const bundlesWithStatus = await Promise.all(
    bundles.map(async (bundle) => ({
      ...bundle,
      shopifyDiscountStatus: (await reconcileBundleAutomaticDiscountState(admin, {
        id: bundle.id,
        status: bundle.status,
        automaticDiscountId: bundle.automaticDiscountId,
      })).shopifyDiscountStatus,
    })),
  );

  return { bundles: bundlesWithStatus };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "duplicate") return null;

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

export default function CrossSellBundlesIndexPage() {
  const { bundles } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Cross-sell bundles">
      <Link to="/app/cross-sell-bundles/new" style={styles.primaryLink}>
        New cross-sell bundle
      </Link>

      <section style={styles.hero}>
        <div>
          <span style={styles.badge}>Custom bundle combinations</span>
          <h1 style={styles.title}>Manage the bundles that combine the current page product with additional products.</h1>
          <p style={styles.text}>
            Cross-sell bundles are the advanced merchandising layer. They replace the
            default volume bundle on the same product page when active.
          </p>
        </div>
      </section>

      {bundles.length === 0 ? (
        <div style={styles.emptyState}>
          <h3 style={styles.emptyTitle}>No cross-sell bundles yet</h3>
          <p style={styles.emptyText}>
            Start with one high-intent product and create a richer bundle with the page
            product plus additional products and discounts.
          </p>
          <Link to="/app/cross-sell-bundles/new" style={styles.buttonLink}>
            Open cross-sell configurator
          </Link>
        </div>
      ) : (
        <div style={styles.grid}>
          {bundles.map((bundle) => (
            <article key={bundle.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.statusRow}>
                    <StatusPill
                      label={
                        bundle.shopifyDiscountStatus === "ACTIVE"
                          ? "ACTIVE"
                          : bundle.shopifyDiscountStatus === "EXPIRED"
                            ? "EXPIRED"
                            : bundle.shopifyDiscountStatus === "SCHEDULED"
                              ? "SCHEDULED"
                              : "INACTIVE"
                      }
                      kind={bundle.shopifyDiscountStatus === "ACTIVE" ? "success" : "warning"}
                    />
                    <StatusPill
                      label={formatSyncStatus(bundle)}
                      kind={bundle.automaticDiscountId ? "success" : "warning"}
                    />
                  </div>
                  <h3 style={styles.cardTitle}>{bundle.title}</h3>
                  <p style={styles.handle}>
                    Product handle: {bundle.productHandle || "Missing handle"}
                  </p>
                </div>
                <div style={styles.metaBox}>
                  <span style={styles.metaLabel}>Offer highlight</span>
                  <strong>{formatDiscountLabel(bundle)}</strong>
                </div>
              </div>

              <div style={styles.statsRow}>
                <InlineStat label="Offers" value={String(bundle.offers.length)} />
                <InlineStat
                  label="Updated"
                  value={new Date(bundle.updatedAt).toLocaleDateString("fr-FR")}
                />
              </div>

              <div style={styles.actions}>
                  <Link
                    to={`/app/cross-sell-bundles/${bundle.id}?returnTo=/app/cross-sell-bundles`}
                    style={styles.buttonLink}
                  >
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
    </s-page>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
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
    padding: "24px",
    borderRadius: "26px",
    background: "linear-gradient(135deg, #f5f0e8 0%, #e4efe4 52%, #dce8f6 100%)",
    border: "1px solid #d8ddd2",
    marginBottom: "20px",
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
  title: {
    margin: "14px 0 10px",
    fontSize: "34px",
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
    color: "#162313",
  },
  text: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#31412f",
    maxWidth: "64ch",
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    padding: "18px",
    borderRadius: "22px",
    border: "1px solid #dfe4db",
    background: "#ffffff",
    display: "grid",
    gap: "14px",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "start",
  },
  statusRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "10px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#172315",
  },
  handle: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "#5f6c5b",
    wordBreak: "break-word",
  },
  metaBox: {
    minWidth: "110px",
    padding: "12px",
    borderRadius: "16px",
    background: "#f2f6ef",
    color: "#21311f",
    display: "grid",
    gap: "4px",
  },
  metaLabel: {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    opacity: 0.65,
    fontWeight: 700,
  },
  statsRow: {
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
  actions: {
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
  buttonLink: {
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
