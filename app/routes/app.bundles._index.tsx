import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import {
  deleteBundleAutomaticDiscount,
  syncBundleAutomaticDiscount,
} from "../utils/bundle-discount.server";
import { deactivateOtherActiveBundlesForProduct } from "../utils/multi-bundle-activation.server";
import {
  loadVolumeBundleProducts,
  normalizeVolumeBundleOfferItems,
} from "../utils/volume-bundles.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const productCoverage = await loadVolumeBundleProducts({
    shop: session.shop,
    admin,
  });

  return {
    productCoverage,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "toggle-bundle" || intent === "delete-bundle") {
    const bundleId = String(formData.get("bundleId") || "").trim();
    if (!bundleId) {
      return { bundleAction: { status: "error" as const, message: "Bundle not found." } };
    }

    const bundle = await prisma.bundle.findFirst({
      where: { id: bundleId, shop: session.shop },
      include: {
        offers: {
          orderBy: { sortOrder: "asc" },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (!bundle) {
      return { bundleAction: { status: "error" as const, message: "Bundle not found." } };
    }

    if (intent === "delete-bundle") {
      if (bundle.automaticDiscountId) {
        await deleteBundleAutomaticDiscount(admin, bundle.automaticDiscountId);
      }

      await prisma.bundle.delete({ where: { id: bundle.id } });

      return {
        bundleAction: {
          status: "success" as const,
          message: "Bundle and Shopify discount deleted.",
        },
      };
    }

    const nextStatus = bundle.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    let deactivatedBundles: Array<{ id: string; automaticDiscountId: string | null }> = [];

    await prisma.$transaction(async (tx) => {
      if (nextStatus === "ACTIVE" && bundle.productHandle) {
        deactivatedBundles = await deactivateOtherActiveBundlesForProduct(tx, {
          shop: session.shop,
          productHandle: bundle.productHandle,
          bundleType: bundle.bundleType as "CROSS_SELL" | "VOLUME",
          keepBundleId: bundle.id,
        });
      }

      await tx.bundle.update({
        where: { id: bundle.id },
        data: { status: nextStatus } as any,
      });
    });

    for (const deactivatedBundle of deactivatedBundles) {
      if (!deactivatedBundle.automaticDiscountId) continue;
      await deleteBundleAutomaticDiscount(admin, deactivatedBundle.automaticDiscountId);
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

    const bundleForDiscount =
      savedBundle?.bundleType === "VOLUME"
        ? (await normalizeVolumeBundleOfferItems(savedBundle.id)) || savedBundle
        : savedBundle;

    if (!bundleForDiscount) {
      return { bundleAction: { status: "error" as const, message: "Bundle not found after update." } };
    }

    const automaticDiscountId = await syncBundleAutomaticDiscount(admin, bundleForDiscount as any);
    await prisma.bundle.update({
      where: { id: bundle.id },
      data: { automaticDiscountId } as any,
    });

    return {
      bundleAction: {
        status: "success" as const,
        message:
          nextStatus === "ACTIVE"
            ? "Bundle activated and Shopify discount synced."
            : "Bundle deactivated and Shopify discount expired.",
      },
    };
  }

  return null;
};

export default function BundlesIndex() {
  const { productCoverage } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? productCoverage.products.filter((product) =>
        `${product.title} ${product.handle} ${product.activeCrossSellBundleTitle || ""}`
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : productCoverage.products;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedProducts = filteredProducts.slice(
    (safePage - 1) * perPage,
    safePage * perPage,
  );

  return (
    <s-page heading="Bundles">
      <section style={styles.grid}>
        <Link to="/app/bundles/new" style={styles.cardLink}>
          <strong>Add new bundle</strong>
          <span>Select a product, choose volume or cross-sell, then open the configurator.</span>
        </Link>
        <Link to="/app/volume-bundles" style={styles.cardLink}>
          <strong>Manage volume bundles</strong>
          <span>Same-product quantity offers and volume ladders.</span>
        </Link>
        <Link to="/app/cross-sell-bundles" style={styles.cardLink}>
          <strong>Manage cross-sell bundles</strong>
          <span>Product combinations and complementary offers.</span>
        </Link>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Product coverage</h2>
            <p style={styles.sectionText}>
              First unified view of products, bundle mode, Shopify discount status, stock, and next actions.
            </p>
          </div>
        </div>

        {actionData?.bundleAction ? (
          <div
            style={
              actionData.bundleAction.status === "success"
                ? styles.successNotice
                : styles.errorNotice
            }
          >
            {actionData.bundleAction.message}
          </div>
        ) : null}

        <div style={styles.productToolbar}>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.currentTarget.value);
              setPage(1);
            }}
            placeholder="Search by product title, handle, or bundle title"
            style={styles.searchInput}
          />
          <span style={styles.paginationText}>
            {filteredProducts.length} / {productCoverage.products.length} products
          </span>
        </div>

        <PaginationControls
          safePage={safePage}
          totalPages={totalPages}
          setPage={setPage}
        />

        <div style={styles.productGrid}>
          {paginatedProducts.map((product) => {
            const hasVolumeBundle = Boolean(product.volumeBundleId);
            const volumeIsActive = product.volumeBundleStatus === "ACTIVE";
            const hasCrossSellBundle = Boolean(product.activeCrossSellBundleId);
            const crossSellIsActive = product.activeCrossSellBundleStatus === "ACTIVE";
            const bundleIsOn = volumeIsActive || hasCrossSellBundle;
            const discountPills = (
              <div style={styles.discountPillRow}>
                {hasVolumeBundle ? (
                  <span
                    style={styles.pill}
                    title={`Volume bundle Shopify discount is ${volumeIsActive ? "active" : "expired / inactive"}.`}
                  >
                    Volume discount {volumeIsActive ? "ACTIVE" : "EXPIRED"}
                  </span>
                ) : null}
                {hasCrossSellBundle ? (
                  <span
                    style={styles.pill}
                    title={`Cross-sell bundle Shopify discount status: ${product.activeCrossSellBundleStatus || "UNKNOWN"}.`}
                  >
                    Cross-sell discount {product.activeCrossSellBundleStatus || "UNKNOWN"}
                  </span>
                ) : null}
              </div>
            );
            const metricPills = (
              <div style={styles.metricPillRow}>
                <span
                  style={styles.pill}
                  title={`${product.availableStock} units are currently available across this product inventory.`}
                >
                  Stock {product.availableStock} available
                </span>
                <span
                  style={styles.pill}
                  title={`${product.variantsCount} Shopify variant${product.variantsCount === 1 ? "" : "s"} are available for this product.`}
                >
                  Variants {product.variantsCount}
                </span>
              </div>
            );

            return (
              <article key={product.id} style={styles.productCard}>
                <span
                  style={bundleIsOn ? styles.pillOn : styles.pillOff}
                  title={
                    bundleIsOn
                      ? "At least one active Cashenza bundle is available for this product."
                      : "No active Cashenza bundle is currently available for this product."
                  }
                >
                  Bundle {bundleIsOn ? "ON" : "OFF"}
                </span>
                <div style={styles.productHeader}>
                  {product.featuredImage ? (
                    <img src={product.featuredImage} alt="" style={styles.productImage} />
                  ) : (
                    <div style={styles.productImageFallback} />
                  )}
                  <div>
                    <h3 style={styles.productTitle}>{product.title}</h3>
                    <p style={styles.productHandle}>Handle: {product.handle}</p>
                  </div>
                </div>

              {discountPills}
              {metricPills}

              <div style={styles.bundleActionGrid}>
                <div style={styles.bundleActionColumn}>
                  <span style={styles.actionColumnLabel}>Volume bundle</span>
                  <Link
                    to={
                      product.volumeBundleId
                        ? `/app/bundles/${product.volumeBundleId}`
                        : `/app/bundles/new?productHandle=${encodeURIComponent(product.handle)}&productId=${encodeURIComponent(product.id)}`
                    }
                    style={styles.secondaryLink}
                  >
                    {product.volumeBundleId ? "Edit volume bundle" : "Configure volume bundle"}
                  </Link>
                  {hasVolumeBundle ? (
                    <BundleActionButton
                      bundleId={product.volumeBundleId as string}
                      active={volumeIsActive}
                      label={volumeIsActive ? "Deactivate volume bundle" : "Reactivate volume bundle"}
                    />
                  ) : null}
                  {hasVolumeBundle ? (
                    <BundleDeleteButton
                      bundleId={product.volumeBundleId as string}
                      label="Delete volume bundle"
                    />
                  ) : null}
                </div>

                <div style={styles.bundleActionColumn}>
                  <span style={styles.actionColumnLabel}>Cross-sell bundle</span>
                  {hasCrossSellBundle ? (
                    <Link to={`/app/bundles/${product.activeCrossSellBundleId}`} style={styles.secondaryLink}>
                      Edit cross-sell bundle
                    </Link>
                  ) : (
                    <Link to={`/app/bundles/new?productHandle=${encodeURIComponent(product.handle)}&productId=${encodeURIComponent(product.id)}`} style={styles.secondaryLink}>
                      Configure cross-sell bundle
                    </Link>
                  )}
                  {hasCrossSellBundle ? (
                    <BundleActionButton
                      bundleId={product.activeCrossSellBundleId as string}
                      active={crossSellIsActive}
                      label={
                        crossSellIsActive
                          ? "Deactivate cross-sell bundle"
                          : "Reactivate cross-sell bundle"
                      }
                    />
                  ) : null}
                  {hasCrossSellBundle ? (
                    <BundleDeleteButton
                      bundleId={product.activeCrossSellBundleId as string}
                      label="Delete cross-sell bundle"
                    />
                  ) : null}
                </div>
              </div>
            </article>
            );
          })}
        </div>

        <PaginationControls
          safePage={safePage}
          totalPages={totalPages}
          setPage={setPage}
        />
      </section>
    </s-page>
  );
}

function PaginationControls({
  safePage,
  totalPages,
  setPage,
}: {
  safePage: number;
  totalPages: number;
  setPage: Dispatch<SetStateAction<number>>;
}) {
  return (
    <div style={styles.paginationBar}>
      <button
        type="button"
        onClick={() => setPage((current) => Math.max(1, current - 1))}
        disabled={safePage <= 1}
        style={{
          ...styles.paginationButton,
          ...(safePage <= 1 ? styles.disabledButton : {}),
        }}
      >
        Previous
      </button>
      <span style={styles.paginationText}>
        Page {safePage} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        disabled={safePage >= totalPages}
        style={{
          ...styles.paginationButton,
          ...(safePage >= totalPages ? styles.disabledButton : {}),
        }}
      >
        Next
      </button>
    </div>
  );
}

function BundleActionButton({
  bundleId,
  active,
  label,
}: {
  bundleId: string;
  active: boolean;
  label: string;
}) {
  return (
    <Form method="post" style={styles.inlineForm}>
      <input type="hidden" name="intent" value="toggle-bundle" />
      <input type="hidden" name="bundleId" value={bundleId} />
      <button
        type="submit"
        style={active ? styles.warningButton : styles.secondaryButton}
      >
        {label}
      </button>
    </Form>
  );
}

function BundleDeleteButton({ bundleId, label }: { bundleId: string; label: string }) {
  return (
    <Form
      method="post"
      style={styles.inlineForm}
      onSubmit={(event) => {
        if (!window.confirm("Delete this bundle and its Shopify discount? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="delete-bundle" />
      <input type="hidden" name="bundleId" value={bundleId} />
      <button type="submit" style={styles.dangerButton}>
        {label}
      </button>
    </Form>
  );
}

const styles: Record<string, CSSProperties> = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "14px",
    marginBottom: "20px",
  },
  section: {
    display: "grid",
    gap: "14px",
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
  productToolbar: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  searchInput: {
    flex: "1 1 320px",
    minHeight: "42px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #ccd5c8",
    background: "#ffffff",
    color: "#172315",
    fontSize: "14px",
  },
  paginationBar: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    paddingTop: "4px",
  },
  paginationButton: {
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #cfc5b1",
    background: "#ffffff",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },
  paginationText: {
    color: "#5e6b59",
    fontSize: "13px",
    fontWeight: 700,
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },
  productCard: {
    position: "relative",
    display: "grid",
    gap: "12px",
    padding: "18px 16px 16px",
    borderRadius: "22px",
    background: "#ffffff",
    border: "1px solid #dfe5dc",
    minWidth: 0,
  },
  productHeader: {
    display: "grid",
    gridTemplateColumns: "58px minmax(0, 1fr)",
    gap: "12px",
    alignItems: "center",
    paddingRight: "110px",
    minWidth: 0,
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
  productTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#172315",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  productHandle: {
    margin: "4px 0 0",
    color: "#64715f",
    fontSize: "13px",
  },
  discountPillRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
    alignContent: "flex-start",
  },
  metricPillRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
    alignContent: "flex-start",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "24px",
    padding: "0 9px",
    borderRadius: "999px",
    background: "#f2f5ef",
    color: "#334130",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1,
    alignSelf: "flex-start",
    whiteSpace: "nowrap",
  },
  pillOn: {
    position: "absolute",
    top: "16px",
    right: "16px",
    display: "inline-flex",
    alignItems: "center",
    minHeight: "26px",
    padding: "0 10px",
    borderRadius: "999px",
    background: "#dff0df",
    color: "#1d4a25",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1,
  },
  pillOff: {
    position: "absolute",
    top: "16px",
    right: "16px",
    display: "inline-flex",
    alignItems: "center",
    minHeight: "26px",
    padding: "0 10px",
    borderRadius: "999px",
    background: "#f7ead0",
    color: "#765000",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1,
  },
  cardLink: {
    display: "grid",
    gap: "8px",
    padding: "20px",
    borderRadius: "22px",
    background: "#ffffff",
    border: "1px solid #dfe5dc",
    color: "#172315",
    textDecoration: "none",
  },
  card: {
    display: "grid",
    gap: "10px",
    padding: "20px",
    borderRadius: "22px",
    background: "#f7efe1",
    border: "1px solid #e6dac5",
    color: "#172315",
  },
  cardLabel: {
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#172315",
    color: "#ffffff",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  cardTitle: {
    margin: 0,
    fontSize: "20px",
  },
  cardText: {
    margin: 0,
    color: "#5b5348",
    lineHeight: 1.55,
    fontSize: "14px",
  },
  readinessBox: {
    display: "grid",
    gap: "6px",
    padding: "12px",
    borderRadius: "16px",
    background: "rgba(255,255,255,0.62)",
    border: "1px solid rgba(23, 35, 21, 0.08)",
    color: "#4b4236",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  attemptBox: {
    display: "grid",
    gap: "6px",
    padding: "12px",
    borderRadius: "16px",
    background: "#ffffff",
    border: "1px solid rgba(23, 35, 21, 0.12)",
    color: "#4b4236",
    fontSize: "13px",
    lineHeight: 1.45,
  },
  compactList: {
    margin: 0,
    paddingLeft: "18px",
    display: "grid",
    gap: "4px",
  },
  bundleActionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    alignItems: "start",
    minWidth: 0,
  },
  bundleActionColumn: {
    display: "grid",
    gap: "7px",
    alignContent: "start",
    padding: "10px",
    borderRadius: "14px",
    background: "#f8faf6",
    border: "1px solid #e3e8df",
    minWidth: 0,
  },
  actionColumnLabel: {
    color: "#596755",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  inlineForm: {
    margin: 0,
    display: "flex",
  },
  secondaryButton: {
    minHeight: "36px",
    padding: "0 10px",
    borderRadius: "999px",
    border: "1px solid #cfc5b1",
    background: "#ffffff",
    color: "#172315",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    whiteSpace: "normal",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
  warningButton: {
    minHeight: "36px",
    padding: "0 10px",
    borderRadius: "999px",
    border: "1px solid #e3b65a",
    background: "#fff8e8",
    color: "#765000",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    whiteSpace: "normal",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
  dangerButton: {
    minHeight: "36px",
    padding: "0 10px",
    borderRadius: "999px",
    border: "1px solid #d78a8a",
    background: "#fff5f5",
    color: "#9b1c1c",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    whiteSpace: "normal",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
  },
  successNotice: {
    padding: "12px 14px",
    borderRadius: "16px",
    background: "#e6f4e7",
    border: "1px solid #bddfc1",
    color: "#1d4a25",
    fontSize: "14px",
    fontWeight: 700,
  },
  errorNotice: {
    padding: "12px 14px",
    borderRadius: "16px",
    background: "#fff1f1",
    border: "1px solid #e8b7b7",
    color: "#9b1c1c",
    fontSize: "14px",
    fontWeight: 700,
  },
  secondaryLink: {
    minHeight: "36px",
    padding: "0 10px",
    borderRadius: "999px",
    border: "1px solid #cfc5b1",
    background: "#ffffff",
    color: "#172315",
    fontSize: "12px",
    fontWeight: 800,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    textAlign: "center",
    whiteSpace: "normal",
    lineHeight: 1.15,
    overflowWrap: "anywhere",
  },
};

export const headers: HeadersFunction = () => ({});
