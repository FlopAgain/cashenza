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
import { loadShopProducts } from "../utils/volume-bundles.server";
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
  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("q")?.trim() || "";
  const requestedPage = Math.max(1, Number(url.searchParams.get("page") || 1));

  const [products, bundles] = await Promise.all([
    loadShopProducts(admin),
    prisma.bundle.findMany({
      where: { shop: session.shop, bundleType: "CROSS_SELL" },
      orderBy: [{ productHandle: "asc" }, { updatedAt: "desc" }],
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
    }),
  ]);

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

  const productMap = new Map(products.map((product) => [product.handle, product]));
  const groupsMap = new Map<string, { product: any; bundles: typeof bundlesWithStatus }>();

  for (const bundle of bundlesWithStatus) {
    const handle = bundle.productHandle || "missing-product";
    const existingGroup = groupsMap.get(handle);
    if (existingGroup) {
      existingGroup.bundles.push(bundle);
      continue;
    }

    groupsMap.set(handle, {
      product: productMap.get(handle) || {
        id: handle,
        title: bundle.productTitle || handle,
        handle,
        featuredImage: null,
        variantsCount: 0,
        availableStock: 0,
        status: "UNKNOWN",
        collections: [],
      },
      bundles: [bundle],
    });
  }

  const groups = Array.from(groupsMap.values());
  const normalizedQuery = searchQuery.toLowerCase();
  const filteredGroups = normalizedQuery
    ? groups.filter((group) =>
        [
          group.product.title,
          group.product.handle,
          ...(group.product.collections || []).flatMap((collection: any) => [
            collection.title,
            collection.handle,
          ]),
          ...group.bundles.map((bundle) => bundle.title),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
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

  if (!["duplicate", "toggle", "activate", "delete"].includes(intent)) return null;

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

  if (intent === "delete") {
    if (bundle.automaticDiscountId) {
      await deleteBundleAutomaticDiscount(admin, bundle.automaticDiscountId);
    }
    await prisma.bundle.delete({ where: { id: bundle.id } });
    return redirect("/app/cross-sell-bundles");
  }

  if (intent === "toggle" || intent === "activate") {
    const nextStatus = intent === "activate" ? "ACTIVE" : bundle.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    let deactivatedBundles: Array<{ id: string; automaticDiscountId: string | null }> = [];

    await prisma.$transaction(async (tx) => {
      if (nextStatus === "ACTIVE" && bundle.productHandle) {
        deactivatedBundles = await deactivateOtherActiveBundlesForProduct(tx, {
          shop: session.shop,
          productHandle: bundle.productHandle,
          bundleType: "CROSS_SELL",
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

    const savedBundle = await prisma.bundle.findUnique({
      where: { id: bundle.id },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (savedBundle) {
      const automaticDiscountId = await syncBundleAutomaticDiscount(admin, savedBundle as any);
      await prisma.bundle.update({
        where: { id: savedBundle.id },
        data: { automaticDiscountId } as any,
      });
    }

    return redirect("/app/cross-sell-bundles");
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

  return redirect(`/app/bundles/${duplicatedBundle.id}?duplicated=1`);
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
  return resolveBundleSyncLabel({
    automaticDiscountId: bundle.automaticDiscountId,
    shopifyDiscountStatus: bundle.shopifyDiscountStatus,
  });
}

export default function CrossSellBundlesIndexPage() {
  const { groups, searchQuery, pagination, summary } = useLoaderData<typeof loader>();

  function buildPageHref(page: number) {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    params.set("page", String(page));
    return `/app/cross-sell-bundles?${params.toString()}`;
  }

  return (
    <s-page heading="Cross-sell bundles">
      <s-button slot="primary-action" href="/app">
        Back to dashboard
      </s-button>

      <Link to="/app/bundles/new" style={styles.primaryLink}>
        Add new bundle
      </Link>

      <section style={styles.hero}>
        <div>
          <span style={styles.badge}>Custom bundle combinations</span>
          <h1 style={styles.title}>Manage the bundles that combine the current page product with additional products.</h1>
          <p style={styles.text}>
            Cross-sell bundles are the advanced merchandising layer. A product can show one
            cross-sell bundle alongside one volume bundle when both are active.
          </p>
        </div>
        <div style={styles.metricRow}>
          <MetricCard label="Products" value={String(summary.totalProducts)} />
          <MetricCard label="Cross-sell enabled" value={String(summary.enabledCount)} />
        </div>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Product coverage</h2>
            <p style={styles.sectionText}>
              Search products, manage cross-sell bundles, and quickly spot product stock and discount status.
            </p>
          </div>
        </div>

        <Form method="get" style={styles.searchBar}>
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search by product title, handle, or collection"
            style={styles.searchInput}
          />
          <button type="submit" style={styles.secondaryAction}>
            Search
          </button>
          {searchQuery ? (
            <Link to="/app/cross-sell-bundles" style={styles.clearLink}>
              Clear
            </Link>
          ) : null}
        </Form>

        {groups.length === 0 ? (
          <div style={styles.emptyState}>
            <h3 style={styles.emptyTitle}>
              {searchQuery ? "No matching cross-sell bundles found" : "No cross-sell bundles yet"}
            </h3>
            <p style={styles.emptyText}>
              {searchQuery
                ? "Try another keyword, collection, or clear the search."
                : "Start with one high-intent product and create a richer bundle with the page product plus additional products and discounts."}
            </p>
            <Link to="/app/bundles/new" style={styles.buttonLink}>
              Add new bundle
            </Link>
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
                          ? "At least one active cross-sell bundle is available for this product."
                          : "No active cross-sell bundle is currently available for this product."
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
                              label={formatSyncStatus(bundle)}
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
                              title={`${bundle.offers.length} offer${bundle.offers.length === 1 ? "" : "s"} are configured in this cross-sell bundle.`}
                            />
                            <InlineStat
                              label="Updated"
                              value={new Date(bundle.updatedAt).toLocaleDateString("fr-FR")}
                              title={`Last updated on ${new Date(bundle.updatedAt).toLocaleDateString("fr-FR")}.`}
                            />
                            <InlineStat
                              label="Discount"
                              value={formatDiscountLabel(bundle)}
                              title={`Main configured discount: ${formatDiscountLabel(bundle)}.`}
                            />
                          </div>
                        </div>

                        <div style={styles.actions}>
                          <Link
                            to={`/app/bundles/${bundle.id}?returnTo=/app/cross-sell-bundles`}
                            style={styles.buttonLink}
                          >
                            Edit
                          </Link>
                          <BundlePostButton
                            bundleId={bundle.id}
                            intent={bundle.status === "ACTIVE" ? "toggle" : "activate"}
                            label={bundle.status === "ACTIVE" ? "Deactivate" : "Activate"}
                          />
                          <Form method="post" style={styles.inlineForm}>
                            <input type="hidden" name="intent" value="duplicate" />
                            <input type="hidden" name="bundleId" value={bundle.id} />
                            <button type="submit" style={styles.secondaryAction}>
                              Duplicate
                            </button>
                          </Form>
                          <BundlePostButton
                            bundleId={bundle.id}
                            intent="delete"
                            label="Delete"
                            danger
                            confirm="Delete this cross-sell bundle and its Shopify discount?"
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
                    <Link to={buildPageHref(pagination.page - 1)} style={styles.buttonLink}>
                      Previous
                    </Link>
                  ) : null}
                  {pagination.page < pagination.totalPages ? (
                    <Link to={buildPageHref(pagination.page + 1)} style={styles.buttonLink}>
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

const styles: Record<string, CSSProperties> = {
  hero: {
    padding: "24px",
    borderRadius: "26px",
    background: "linear-gradient(135deg, #f5f0e8 0%, #e4efe4 52%, #dce8f6 100%)",
    border: "1px solid #d8ddd2",
    marginBottom: "20px",
    display: "grid",
    gap: "18px",
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
  searchInput: {
    flex: "1 1 280px",
    minHeight: "42px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #ccd5c8",
    background: "#ffffff",
    fontSize: "14px",
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
  productHeader: {
    display: "grid",
    gridTemplateColumns: "58px minmax(0, 1fr)",
    gap: "12px",
    alignItems: "center",
  },
  productImage: {
    width: "58px",
    height: "58px",
    borderRadius: "14px",
    objectFit: "cover",
    background: "#f2f4ef",
  },
  productImageFallback: {
    width: "58px",
    height: "58px",
    borderRadius: "14px",
    background: "#f2f4ef",
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
  bundleTitle: {
    margin: "0 0 8px",
    fontSize: "17px",
    color: "#172315",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "start",
  },
  identity: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
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
  actions: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap",
  },
  inlineForm: {
    margin: 0,
    display: "inline-flex",
    alignItems: "center",
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
    lineHeight: 1,
    boxSizing: "border-box",
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
