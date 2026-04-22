import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { requireStarterPlan } from "../utils/billing.server";
import { loadVolumeBundleProducts } from "../utils/volume-bundles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q")?.trim() || "";
  const requestedPage = Math.max(1, Number(url.searchParams.get("page") || 1));

  const { products, enabledCount, overriddenCount } = await loadVolumeBundleProducts({
    shop: session.shop,
    admin,
  });

  const normalizedQuery = searchQuery.toLowerCase();
  const filteredProducts = normalizedQuery
    ? products.filter((product) =>
        `${product.title} ${product.handle}`.toLowerCase().includes(normalizedQuery),
      )
    : products;

  const perPage = 4;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));
  const page = Math.min(requestedPage, totalPages);
  const paginatedProducts = filteredProducts.slice((page - 1) * perPage, page * perPage);

  return {
    products: paginatedProducts,
    searchQuery,
    pagination: {
      page,
      totalPages,
      totalItems: filteredProducts.length,
      perPage,
    },
    summary: {
      enabledCount,
      overriddenCount,
      totalProducts: products.length,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return null;
};

export default function VolumeBundlesIndexPage() {
  const { products, searchQuery, pagination, summary } = useLoaderData<typeof loader>();

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
            product. If a cross-sell bundle is active on the same page, it overrides the
            volume bundle on the storefront.
          </p>
        </div>
        <div style={styles.metricRow}>
          <MetricCard label="Products" value={String(summary.totalProducts)} />
          <MetricCard label="Volume enabled" value={String(summary.enabledCount)} />
          <MetricCard label="Overridden by cross-sell" value={String(summary.overriddenCount)} />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Product coverage</h2>
            <p style={styles.sectionText}>
              Search products, enable or disable the volume bundle, and quickly spot pages
              where an active cross-sell bundle already takes priority.
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

        {products.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={styles.emptyTitle}>
              {searchQuery ? "No matching products found" : "No active products found"}
            </h3>
            <p style={styles.emptyText}>
              {searchQuery
                ? "Try another keyword or clear the search."
                : "Publish at least one product in Shopify to manage volume bundle visibility here."}
            </p>
          </div>
        ) : (
          <>
            <div style={styles.grid}>
              {products.map((product) => (
                <article key={product.id} style={styles.card}>
                  <div style={styles.cardTop}>
                    <div style={styles.identity}>
                      {product.featuredImage ? (
                        <img src={product.featuredImage} alt={product.title} style={styles.image} />
                      ) : (
                        <div style={styles.imagePlaceholder}>No image</div>
                      )}
                      <div>
                        <h3 style={styles.cardTitle}>{product.title}</h3>
                        <p style={styles.handle}>Handle: {product.handle}</p>
                      </div>
                    </div>
                    <div style={styles.badgeRow}>
                      {product.hasActiveCrossSellBundle || product.volumeBundleStatus === "ACTIVE" ? (
                        <StatusPill label="Bundle ON" kind="success" />
                      ) : (
                        <StatusPill label="Bundle OFF" kind="warning" />
                      )}
                      {product.hasActiveCrossSellBundle || product.volumeBundleStatus === "ACTIVE" ? (
                        <InlineStat
                          label="Mode"
                          value={product.hasCrossSellBundle ? "Cross-sell" : "Volume bundle"}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div style={styles.statsRow}>
                    <InlineStat label="Variants" value={String(product.variantsCount)} />
                    {product.hasCrossSellBundle || product.volumeBundleAutomaticDiscountId ? (
                      <InlineStat
                        label="Status"
                        value={
                          product.hasActiveCrossSellBundle
                            ? product.activeCrossSellBundleStatus === "ACTIVE"
                              ? "Active"
                              : "Inactive"
                            : product.volumeBundleStatus === "ACTIVE"
                              ? "Active"
                              : "Inactive"
                        }
                      />
                    ) : null}
                    <InlineStat
                      label="Stock"
                      value={
                        product.availableStock > 0
                          ? `${product.availableStock} available`
                          : "Out of stock"
                      }
                    />
                    {product.volumeBundleBestSellerQuantity ? (
                      <InlineStat
                        label="Best seller"
                        value={`${product.volumeBundleBestSellerQuantity} items`}
                      />
                    ) : null}
                  </div>

                  <div style={styles.cardActions}>
                    {product.hasCrossSellBundle && product.activeCrossSellBundleId ? (
                      <Link
                        to={`/app/cross-sell-bundles/${product.activeCrossSellBundleId}`}
                        style={styles.paginationLink}
                      >
                        Go to this cross-sell bundle
                      </Link>
                      ) : (
                      <Link
                        to={`/app/volume-bundles/${product.handle}?returnTo=/app/volume-bundles`}
                        style={styles.paginationLink}
                      >
                        {product.volumeBundleStatus === "ACTIVE"
                          ? "Edit volume bundle"
                          : "Configure volume bundle"}
                      </Link>
                    )}
                    {product.volumeBundleStatus === "ACTIVE" && !product.hasCrossSellBundle ? (
                      <Link
                        to={`/app/volume-bundles/${product.handle}/style?returnTo=/app/volume-bundles`}
                        style={styles.paginationLink}
                      >
                        Edit style
                      </Link>
                    ) : null}
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
  toggleForm: {
    margin: 0,
  },
  cardActions: {
    display: "flex",
    justifyContent: "flex-start",
    gap: "10px",
    flexWrap: "wrap",
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
    padding: "8px 14px",
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
