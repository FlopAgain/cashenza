import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  deleteBundleAutomaticDiscount,
  reconcileBundleAutomaticDiscountState,
  syncBundleAutomaticDiscount,
} from "../utils/bundle-discount.server";
import {
  resolveBundleSyncLabel,
  resolveShopifyDiscountStatusLabel,
} from "../utils/bundle-status";
import { deactivateOtherActiveBundlesForProduct } from "../utils/multi-bundle-activation.server";
import {
  loadShopProducts,
  normalizeVolumeBundleOfferItems,
} from "../utils/volume-bundles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q")?.trim() || "";
  const requestedPage = Math.max(1, Number(url.searchParams.get("page") || 1));

  const [products, volumeBundles] = await Promise.all([
    loadShopProducts(admin),
    prisma.bundle.findMany({
      where: { shop: session.shop, bundleType: "VOLUME", productHandle: { not: null } },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, title: true, quantity: true, isBestSeller: true, discountType: true, discountValue: true },
        },
      },
      orderBy: [{ productHandle: "asc" }, { updatedAt: "desc" }],
    }),
  ]);
  const bundlesWithStatus = await Promise.all(
    volumeBundles.map(async (bundle) => ({
      ...bundle,
      shopifyDiscountStatus: (await reconcileBundleAutomaticDiscountState(admin, {
        id: bundle.id,
        status: bundle.status,
        automaticDiscountId: bundle.automaticDiscountId,
      })).shopifyDiscountStatus,
    })),
  );
  const productMap = new Map(products.map((product) => [product.handle, product]));
  const groups = Array.from(
    bundlesWithStatus.reduce((map, bundle) => {
      const handle = bundle.productHandle || "missing-product";
      const group = map.get(handle) || {
        product: productMap.get(handle) || {
          id: handle,
          title: bundle.productTitle || handle,
          handle,
          featuredImage: null,
          variantsCount: 0,
          availableStock: 0,
          status: "UNKNOWN",
        },
        bundles: [] as typeof bundlesWithStatus,
      };
      group.bundles.push(bundle);
      map.set(handle, group);
      return map;
    }, new Map<string, { product: any; bundles: typeof bundlesWithStatus }>()),
  ).map(([, group]) => group);
  const normalizedQuery = searchQuery.toLowerCase();
  const filteredGroups = normalizedQuery
    ? groups.filter((group) =>
        `${group.product.title} ${group.product.handle} ${group.bundles.map((bundle) => bundle.title).join(" ")}`.toLowerCase().includes(normalizedQuery),
      )
    : groups;

  const perPage = 4;
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / perPage));
  const page = Math.min(requestedPage, totalPages);
  const paginatedGroups = filteredGroups.slice((page - 1) * perPage, page * perPage);

  return {
    groups: paginatedGroups,
    searchQuery,
    pagination: {
      page,
      totalPages,
      totalItems: filteredGroups.length,
      perPage,
    },
    summary: {
      enabledCount: bundlesWithStatus.filter((bundle) => bundle.shopifyDiscountStatus === "ACTIVE").length,
      totalProducts: groups.length,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  if (!["toggle", "activate", "delete"].includes(intent)) return null;

  const bundleId = String(formData.get("bundleId") || "").trim();
  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shop: session.shop, bundleType: "VOLUME" },
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  if (!bundle) throw new Response("Bundle not found", { status: 404 });

  if (intent === "delete") {
    if (bundle.automaticDiscountId) {
      await deleteBundleAutomaticDiscount(admin, bundle.automaticDiscountId);
    }
    await prisma.bundle.delete({ where: { id: bundle.id } });
    return redirect("/app/volume-bundles");
  }

  const nextStatus = intent === "activate" ? "ACTIVE" : bundle.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
  let deactivatedBundles: Array<{ id: string; automaticDiscountId: string | null }> = [];

  await prisma.$transaction(async (tx) => {
    if (nextStatus === "ACTIVE" && bundle.productHandle) {
      deactivatedBundles = await deactivateOtherActiveBundlesForProduct(tx, {
        shop: session.shop,
        productHandle: bundle.productHandle,
        bundleType: "VOLUME",
        keepBundleId: bundle.id,
      });
    }

    await tx.bundle.update({
      where: { id: bundle.id },
      data: { status: nextStatus } as any,
    });
  });

  for (const deactivatedBundle of deactivatedBundles) {
    if (deactivatedBundle.automaticDiscountId) {
      await deleteBundleAutomaticDiscount(admin, deactivatedBundle.automaticDiscountId);
    }
  }

  const savedBundle = await normalizeVolumeBundleOfferItems(bundle.id);
  if (savedBundle) {
    const automaticDiscountId = await syncBundleAutomaticDiscount(admin, savedBundle as any);
    await prisma.bundle.update({
      where: { id: savedBundle.id },
      data: { automaticDiscountId } as any,
    });
  }

  return redirect("/app/volume-bundles");
};

export default function VolumeBundlesIndexPage() {
  const { groups, searchQuery, pagination, summary } = useLoaderData<typeof loader>();

  function buildPageHref(page: number) {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    params.set("page", String(page));
    return `/app/volume-bundles?${params.toString()}`;
  }

  return (
    <s-page heading="Volume bundles">
      <s-button slot="primary-action" href="/app">
        Back to dashboard
      </s-button>

      <section style={styles.hero}>
        <div>
          <span style={styles.badge}>Same-product quantity ladder</span>
          <h1 style={styles.title}>Control where the repeated-quantity bundle appears on your product pages.</h1>
          <p style={styles.text}>
            Volume bundles are the default 1x / 2x / 3x / Nx experience for the same
            product.
          </p>
        </div>
        <div style={styles.metricRow}>
          <MetricCard label="Products" value={String(summary.totalProducts)} />
          <MetricCard label="Volume enabled" value={String(summary.enabledCount)} />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Product coverage</h2>
            <p style={styles.sectionText}>
              Search products, manage volume bundles, and quickly spot product stock and discount status.
            </p>
          </div>
        </div>

        <Form method="get" style={styles.searchBar}>
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search by product title or handle"
            style={styles.searchInput}
          />
          <button type="submit" style={styles.secondaryAction}>
            Search
          </button>
          {searchQuery ? (
            <Link to="/app/volume-bundles" style={styles.clearLink}>
              Clear
            </Link>
          ) : null}
        </Form>

        {groups.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={styles.emptyTitle}>
              {searchQuery ? "No matching volume bundles found" : "No volume bundles found"}
            </h3>
            <p style={styles.emptyText}>
              {searchQuery
                ? "Try another keyword or clear the search."
                : "Use Add new bundle from the dashboard or product coverage list to create a volume bundle."}
            </p>
          </div>
        ) : (
          <>
            <div style={styles.grid}>
              {groups.map((group) => (
                <article key={group.product.handle} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={styles.identity}>
                      {group.product.featuredImage ? (
                        <img src={group.product.featuredImage} alt={group.product.title} style={styles.image} />
                      ) : (
                        <div style={styles.imagePlaceholder}>No image</div>
                      )}
                      <div>
                        <h3 style={styles.cardTitle}>{group.product.title}</h3>
                        <p style={styles.handle}>Handle: {group.product.handle}</p>
                      </div>
                    </div>
                    <StatusPill
                      label={group.bundles.some((bundle) => bundle.shopifyDiscountStatus === "ACTIVE") ? "Bundle ON" : "Bundle OFF"}
                      kind={group.bundles.some((bundle) => bundle.shopifyDiscountStatus === "ACTIVE") ? "success" : "warning"}
                      title={
                        group.bundles.some((bundle) => bundle.shopifyDiscountStatus === "ACTIVE")
                          ? "At least one active volume bundle is available for this product."
                          : "No active volume bundle is currently available for this product."
                      }
                    />
                  </div>

                  <div style={styles.statsRow}>
                    <InlineStat
                      label="Variants"
                      value={String(group.product.variantsCount)}
                      title={`${group.product.variantsCount} Shopify variant${group.product.variantsCount === 1 ? "" : "s"} are available for this product.`}
                    />
                    <InlineStat
                      label="Stock"
                      value={
                        group.product.availableStock > 0
                          ? `${group.product.availableStock} available`
                          : "Out of stock"
                      }
                      title={
                        group.product.availableStock > 0
                          ? `${group.product.availableStock} units are currently available across this product inventory.`
                          : "This product is currently out of stock."
                      }
                    />
                  </div>

                  <div style={styles.bundleStack}>
                    {group.bundles.map((bundle) => (
                      <div key={bundle.id} style={styles.bundleRow}>
                        <div>
                          <div style={styles.statusRow}>
                            <StatusPill
                              label={resolveShopifyDiscountStatusLabel(bundle.shopifyDiscountStatus).toUpperCase()}
                              kind={bundle.shopifyDiscountStatus === "ACTIVE" ? "success" : "warning"}
                              title={`Shopify automatic discount status: ${resolveShopifyDiscountStatusLabel(bundle.shopifyDiscountStatus)}.`}
                            />
                            <StatusPill
                              label={resolveBundleSyncLabel({
                                automaticDiscountId: bundle.automaticDiscountId,
                                shopifyDiscountStatus: bundle.shopifyDiscountStatus,
                              })}
                              kind={bundle.automaticDiscountId ? "success" : "warning"}
                              title={
                                bundle.automaticDiscountId
                                  ? "This bundle is linked to a Shopify automatic discount."
                                  : "This bundle is missing its Shopify automatic discount."
                              }
                            />
                          </div>
                          <h4 style={styles.bundleTitle}>{bundle.title}</h4>
                          <div style={styles.statsRow}>
                            <InlineStat
                              label="Offers"
                              value={String(bundle.offers.length)}
                              title={`${bundle.offers.length} offer${bundle.offers.length === 1 ? "" : "s"} are configured in this volume bundle.`}
                            />
                            <InlineStat
                              label="Best seller"
                              value={
                                bundle.offers.find((offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller)?.quantity
                                  ? `${bundle.offers.find((offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller)?.quantity} items`
                                  : "None"
                              }
                              title={
                                bundle.offers.find((offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller)?.quantity
                                  ? `The highlighted best-seller offer contains ${bundle.offers.find((offer) => offer.id === bundle.bestSellerOfferId || offer.isBestSeller)?.quantity} items.`
                                  : "No best-seller offer is selected for this bundle."
                              }
                            />
                          </div>
                        </div>

                        <div style={styles.cardActions}>
                          <Link
                            to={`/app/bundles/${bundle.id}?returnTo=/app/volume-bundles`}
                            style={styles.paginationLink}
                          >
                            Edit
                          </Link>
                          <BundlePostButton
                            bundleId={bundle.id}
                            intent={bundle.status === "ACTIVE" ? "toggle" : "activate"}
                            label={bundle.status === "ACTIVE" ? "Deactivate" : "Activate"}
                          />
                          <BundlePostButton
                            bundleId={bundle.id}
                            intent="delete"
                            label="Delete"
                            danger
                            confirm="Delete this volume bundle and its Shopify discount?"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {pagination.totalPages > 1 ? (
              <div style={styles.paginationBar}>
                <span style={styles.paginationText}>
                  Page {pagination.page} / {pagination.totalPages}
                </span>
                <div style={styles.paginationActions}>
                  {pagination.page > 1 ? (
                    <Link to={buildPageHref(pagination.page - 1)} style={styles.paginationLink}>
                      Previous
                    </Link>
                  ) : null}
                  {pagination.page < pagination.totalPages ? (
                    <Link to={buildPageHref(pagination.page + 1)} style={styles.paginationLink}>
                      Next
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </s-page>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue}>{value}</div>
    </div>
  );
}

function InlineStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div style={styles.inlineStat} title={title || `${label}: ${value}`}>
      <span style={styles.inlineStatLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({
  label,
  kind = "default",
  title,
}: {
  label: string;
  kind?: "default" | "success" | "warning";
  title?: string;
}) {
  const style =
    kind === "success"
      ? styles.statusSuccess
      : kind === "warning"
        ? styles.statusWarning
        : styles.statusDefault;

  return <span style={{ ...styles.statusPill, ...style }} title={title || label}>{label}</span>;
}

function BundlePostButton({
  bundleId,
  intent,
  label,
  danger = false,
  confirm,
}: {
  bundleId: string;
  intent: "toggle" | "activate" | "delete";
  label: string;
  danger?: boolean;
  confirm?: string;
}) {
  return (
    <Form
      method="post"
      style={styles.inlineForm}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="bundleId" value={bundleId} />
      <button type="submit" style={danger ? styles.dangerAction : styles.secondaryAction}>
        {label}
      </button>
    </Form>
  );
}

const styles: Record<string, CSSProperties> = {
  hero: {
    display: "grid",
    gap: "18px",
    padding: "24px",
    borderRadius: "26px",
    background: "linear-gradient(135deg, #eef5eb 0%, #f8f2e5 100%)",
    border: "1px solid #d9e2d5",
    marginBottom: "20px",
  },
  badge: {
    display: "inline-flex",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#162314",
    color: "#ffffff",
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
    color: "#172315",
  },
  text: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    maxWidth: "68ch",
    color: "#445641",
  },
  metricRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  metricCard: {
    padding: "16px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid #dce2d8",
    display: "grid",
    gap: "8px",
  },
  metricLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#5a6757",
    fontWeight: 700,
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: 800,
    lineHeight: 1,
    color: "#172315",
  },
  section: {
    display: "grid",
    gap: "16px",
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
  searchBar: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  bulkActions: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  searchInput: {
    flex: "1 1 280px",
    minHeight: "42px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #ccd5c8",
    background: "#ffffff",
    fontSize: "14px",
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
    lineHeight: 1,
    boxSizing: "border-box",
  },
  dangerAction: {
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #f29a9a",
    background: "#fff6f6",
    color: "#b01818",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
    boxSizing: "border-box",
  },
  clearLink: {
    color: "#445740",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "none",
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
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "16px",
  },
  card: {
    padding: "18px",
    borderRadius: "22px",
    border: "1px solid #dfe4db",
    background: "#ffffff",
    display: "grid",
    gap: "14px",
    alignContent: "start",
    alignItems: "start",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  badgeRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
  },
  image: {
    width: "64px",
    height: "64px",
    objectFit: "cover",
    borderRadius: "16px",
    border: "1px solid #e3e7df",
    background: "#f4f6f1",
  },
  imagePlaceholder: {
    width: "64px",
    height: "64px",
    borderRadius: "16px",
    border: "1px dashed #cdd5c8",
    background: "#f8faf6",
    color: "#66725f",
    display: "grid",
    placeItems: "center",
    fontSize: "12px",
    textAlign: "center",
    padding: "6px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#172315",
  },
  handle: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "#5f6c5b",
    wordBreak: "break-word",
  },
  statsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
  },
  bundleStack: {
    display: "grid",
    gap: "12px",
  },
  bundleRow: {
    display: "grid",
    gap: "12px",
    padding: "14px",
    borderRadius: "18px",
    background: "#f8faf6",
    border: "1px solid #e1e8de",
    alignContent: "start",
  },
  statusRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "8px",
  },
  bundleTitle: {
    margin: "0 0 8px",
    color: "#172315",
    fontSize: "17px",
  },
  inlineStat: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    borderRadius: "999px",
    background: "#f5f7f2",
    width: "fit-content",
    minHeight: "28px",
    boxSizing: "border-box",
  },
  inlineStatLabel: {
    fontSize: "12px",
    color: "#5e6b59",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  toggleForm: {
    margin: 0,
  },
  cardActions: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  inlineForm: {
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: "16px",
    background: "#f4f7f2",
    border: "1px solid #dde4d8",
    fontSize: "14px",
    fontWeight: 600,
    color: "#21311f",
    cursor: "pointer",
  },
  toggleHint: {
    padding: "10px 12px",
    borderRadius: "14px",
    border: "1px dashed #cfd8cd",
    background: "#fbfcfa",
    color: "#5f6b72",
    fontSize: "13px",
    lineHeight: 1.5,
  },
  paginationBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "4px 2px 0",
    flexWrap: "wrap",
  },
  paginationText: {
    fontSize: "13px",
    color: "#5e6b59",
    fontWeight: 600,
  },
  paginationActions: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
  },
  paginationLink: {
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
    lineHeight: 1,
    boxSizing: "border-box",
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
