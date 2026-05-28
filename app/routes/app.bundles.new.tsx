import type { CSSProperties } from "react";
import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import prisma from "../db.server";
import { requireStarterPlan } from "../utils/billing.server";
import { syncBundleAutomaticDiscount } from "../utils/bundle-discount.server";
import { loadReusableBundleAppearance } from "../utils/bundle-appearance.server";
import { loadProductSnapshots } from "../utils/product-snapshots.server";
import {
  placeBundleBlockOnProductTemplate,
  resolveThemePlacementScopes,
} from "../utils/theme-placement.server";
import {
  ensureDefaultVolumeBundleForProduct,
  loadShopProducts,
} from "../utils/volume-bundles.server";

type BundleTypeChoice = "volume" | "cross-sell";

async function loadAntiFlashGuardEnabled(shop: string) {
  const settings = await prisma.appSettings.findUnique({
    where: { shop },
    select: { antiFlashGuardEnabled: true },
  });

  return (settings as { antiFlashGuardEnabled?: boolean } | null)?.antiFlashGuardEnabled ?? true;
}

async function hasActiveBundleForProduct(params: {
  shop: string;
  productHandle: string;
  bundleType: "VOLUME" | "CROSS_SELL";
}) {
  return Boolean(
    await prisma.bundle.findFirst({
      where: {
        shop: params.shop,
        productHandle: params.productHandle,
        bundleType: params.bundleType,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  );
}

async function createDefaultCrossSellBundleForProduct(params: {
  shop: string;
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
  productHandle: string;
  status: "ACTIVE" | "DRAFT";
}) {
  const snapshots = await loadProductSnapshots(params.admin, [params.productHandle]);
  const product = snapshots.get(params.productHandle);
  if (!product) return null;

  const appearance = await loadReusableBundleAppearance({
    shop: params.shop,
    productHandle: params.productHandle,
  });
  const selectedVariant = product.variants.find((variant) => variant.availableForSale) || product.variants[0];

  const bundle = await prisma.bundle.create({
    data: {
      shop: params.shop,
      bundleType: "CROSS_SELL",
      title: `${product.title} cross-sell bundle`,
      productId: product.id,
      productTitle: product.title,
      productHandle: params.productHandle,
      status: params.status,
      showVariantPicker: true,
      showVariantThumbnails: false,
      designPreset: appearance.designPreset,
      timerPreset: appearance.timerPreset,
      effectsPreset: appearance.effectsPreset,
      primaryColor: appearance.primaryColor,
      textColor: appearance.textColor,
      eyebrow: appearance.eyebrow,
      heading: appearance.heading,
      subheading: appearance.subheading,
      headingSize: appearance.headingSize,
      subheadingSize: appearance.subheadingSize,
      offerTitleSize: appearance.offerTitleSize,
      offerPriceSize: appearance.offerPriceSize,
      cardGap: appearance.cardGap,
      cardPadding: appearance.cardPadding,
      offerRadius: appearance.offerRadius,
      bestSellerBadgePreset: appearance.bestSellerBadgePreset,
      bestSellerPngBadgePreset: appearance.bestSellerPngBadgePreset,
      bestSellerBadgeColor: appearance.bestSellerBadgeColor,
      bestSellerBadgeText: appearance.bestSellerBadgeText,
      saveBadgeColor: appearance.saveBadgeColor,
      saveBadgeText: appearance.saveBadgeText,
      saveBadgePrefix: appearance.saveBadgePrefix,
      showTimer: appearance.showTimer,
      timerEnd: appearance.timerEnd || null,
      timerPrefix: appearance.timerPrefix,
      timerExpiredText: appearance.timerExpiredText,
      timerBackgroundColor: appearance.timerBackgroundColor,
      timerTextColor: appearance.timerTextColor,
      offers: {
        create: [
          {
            title: "Offer 1",
            subtitle: "Current product only",
            quantity: 1,
            discountType: "PERCENTAGE",
            discountValue: 0,
            sortOrder: 0,
            items: {
              create: [
                {
                  productId: params.productHandle,
                  productTitle: product.title,
                  variantId: selectedVariant?.id || null,
                  variantTitle: selectedVariant?.title || null,
                  quantity: 1,
                  allowVariantSelection: true,
                  showVariantThumbnails: false,
                  sortOrder: 0,
                },
              ],
            },
          },
          {
            title: "Offer 2",
            subtitle: "Current product + 1 more item",
            quantity: 2,
            discountType: "PERCENTAGE",
            discountValue: 10,
            isBestSeller: true,
            sortOrder: 1,
            items: {
              create: Array.from({ length: 2 }, (_, itemIndex) => ({
                  productId: params.productHandle,
                  productTitle: product.title,
                  variantId: selectedVariant?.id || null,
                  variantTitle: selectedVariant?.title || null,
                  quantity: 1,
                  allowVariantSelection: itemIndex === 0,
                  showVariantThumbnails: false,
                  sortOrder: itemIndex,
                })),
            },
          },
        ],
      },
    } as any,
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  const bestSellerOfferId = bundle.offers.find((offer) => offer.sortOrder === 1)?.id || null;
  const savedBundle = await prisma.bundle.update({
    where: { id: bundle.id },
    data: { bestSellerOfferId } as any,
    include: {
      offers: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  const automaticDiscountId = await syncBundleAutomaticDiscount(params.admin, savedBundle as any);

  return prisma.bundle.update({
    where: { id: savedBundle.id },
    data: { automaticDiscountId } as any,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await requireStarterPlan(request);
  const url = new URL(request.url);
  const productHandle = url.searchParams.get("productHandle")?.trim() || "";
  const productId = url.searchParams.get("productId")?.trim() || "";

  if (productHandle) {
    const products = await loadShopProducts(admin);
    const selectedProduct = products.find((product) => product.handle === productHandle) || null;
    return {
      step: "type" as const,
      products: [],
      selectedProduct,
      productHandle,
      productId: productId || selectedProduct?.id || "",
    };
  }

  return {
    step: "product" as const,
    products: await loadShopProducts(admin),
    selectedProduct: null,
    productHandle: "",
    productId: "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireStarterPlan(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "create-bundle") return null;

  const productHandle = String(formData.get("productHandle") || "").trim();
  const productId = String(formData.get("productId") || "").trim();
  const bundleType = String(formData.get("bundleType") || "").trim() as BundleTypeChoice;

  if (!productHandle || !["volume", "cross-sell"].includes(bundleType)) {
    return {
      placementAttempt: {
        status: "blocked" as const,
        message: "Choose a product and bundle type before creating the bundle.",
        details: ["Cashenza needs a product and a bundle type to keep Shopify discounts coherent."],
      },
    };
  }

  const themeScopes = await resolveThemePlacementScopes({
    admin,
    fallbackScopes: session.scope,
  });
  const antiFlashGuardEnabled = await loadAntiFlashGuardEnabled(session.shop);
  const placementAttempt = await placeBundleBlockOnProductTemplate({
    admin,
    scopes: themeScopes,
    productId: productId || undefined,
    antiFlashGuardEnabled,
  });

  if (placementAttempt.status !== "placed" && placementAttempt.status !== "skipped") {
    return { placementAttempt };
  }

  const prismaBundleType = bundleType === "volume" ? "VOLUME" : "CROSS_SELL";
  const status = (await hasActiveBundleForProduct({
    shop: session.shop,
    productHandle,
    bundleType: prismaBundleType,
  }))
    ? "DRAFT"
    : "ACTIVE";

  try {
    const bundle =
      bundleType === "volume"
        ? await ensureDefaultVolumeBundleForProduct({
            shop: session.shop,
            admin,
            productHandle,
            reuseExisting: false,
            status,
          })
        : await createDefaultCrossSellBundleForProduct({
            shop: session.shop,
            admin,
            productHandle,
            status,
          });

    if (!bundle?.id || !bundle.automaticDiscountId) {
      throw new Error("The bundle or Shopify automatic discount was not created.");
    }

    return redirect(`/app/bundles/${bundle.id}`);
  } catch (error) {
    return {
      placementAttempt: {
        status: "error" as const,
        message: "Cashenza could not create the bundle.",
        details: [error instanceof Error ? error.message : "Unknown bundle creation error"],
      },
    };
  }
};

export default function NewBundleGateway() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [selectedProductComposite, setSelectedProductComposite] = useState(
    data.products[0] ? `${data.products[0].id}::${data.products[0].handle}` : "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const isSubmitting = navigation.state === "submitting";

  if (data.step === "type") {
    return (
      <s-page heading="Choose bundle type">
        <section style={styles.hero}>
          <Link to="/app/bundles/new" style={styles.backLink}>Back to product selection</Link>
          <span style={styles.eyebrow}>Selected product</span>
          <h1 style={styles.title}>{data.selectedProduct?.title || data.productHandle}</h1>
          <p style={styles.text}>
            Choose the bundle model to create. Cashenza places the storefront block once, creates the matching
            Shopify discount, then opens the configurator.
          </p>
        </section>

        {actionData?.placementAttempt ? (
          <div style={styles.errorNotice}>
            <strong>{formatPlacementAttemptTitle(actionData.placementAttempt.status)}</strong>
            <span>{actionData.placementAttempt.message}</span>
            {actionData.placementAttempt.details.length ? (
              <ul style={styles.compactList}>
                {actionData.placementAttempt.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <section style={styles.typeGrid}>
          <BundleTypeCard
            title="Volume bundle"
            label="Same product, higher quantity"
            description="Use this when the offer sells 2, 3, 10, or N units of the selected product."
            image="/volume_bundle_example.png"
            bundleType="volume"
            productHandle={data.productHandle}
            productId={data.productId}
            disabled={isSubmitting}
          />
          <BundleTypeCard
            title="Cross-sell bundle"
            label="Multiple products package"
            description="Use this when the offer combines the selected product with complementary products."
            image="/crosssell_bundle_example.png"
            bundleType="cross-sell"
            productHandle={data.productHandle}
            productId={data.productId}
            disabled={isSubmitting}
          />
        </section>
      </s-page>
    );
  }

  const pageSize = 4;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? data.products.filter((product) =>
        `${product.title} ${product.handle} ${product.status}`.toLowerCase().includes(normalizedSearch),
      )
    : data.products;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const [selectedProductId = "", selectedProductHandle = ""] = selectedProductComposite.split("::");
  const continueHref =
    selectedProductHandle
      ? `/app/bundles/new?productHandle=${encodeURIComponent(selectedProductHandle)}&productId=${encodeURIComponent(selectedProductId)}`
      : "/app/bundles/new";

  return (
    <s-page heading="Add new bundle">
      <section style={styles.hero}>
        <span style={styles.eyebrow}>Step 1 of 3</span>
        <h1 style={styles.title}>Select the product that will host the bundle.</h1>
        <p style={styles.text}>
          The bundle will only render on this product page when its Shopify discount is active. A product can later
          host one active volume bundle and one active cross-sell bundle at the same time.
        </p>
      </section>

      <section style={styles.panel}>
        {data.products.length === 0 ? (
          <div style={styles.errorNotice}>
            <strong>No active products found</strong>
            <span>Create or publish a product in Shopify before creating a bundle.</span>
          </div>
        ) : (
          <>
            <div style={styles.productPickerHeader}>
              <label style={styles.fieldLabel}>
                Search products
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.currentTarget.value);
                    setPage(1);
                  }}
                  placeholder="Search by product title, handle, or status"
                  style={styles.searchInput}
                />
              </label>
              <div style={styles.productCount}>
                {filteredProducts.length} of {data.products.length} products
              </div>
            </div>

            <PaginationControls
              safePage={safePage}
              totalPages={totalPages}
              setPage={setPage}
            />

            <div style={styles.productList}>
              {visibleProducts.map((product) => {
                const composite = `${product.id}::${product.handle}`;
                const selected = composite === selectedProductComposite;

                return (
                  <label
                    key={product.id}
                    style={{
                      ...styles.productRow,
                      ...(selected ? styles.productRowSelected : {}),
                    }}
                  >
                    <input
                      type="radio"
                      name="selectedProduct"
                      value={composite}
                      checked={selected}
                      onChange={() => setSelectedProductComposite(composite)}
                      style={styles.radio}
                    />
                    <span style={styles.productThumb}>
                      {product.featuredImage ? (
                        <img src={product.featuredImage} alt="" style={styles.productImage} />
                      ) : (
                        <span style={styles.productImageFallback}>No image</span>
                      )}
                    </span>
                    <span style={styles.productInfo}>
                      <strong style={styles.productTitle}>{product.title}</strong>
                      <span style={styles.productHandle}>Handle: {product.handle}</span>
                    </span>
                    <span style={styles.productBadges}>
                      <span style={getStatusBadgeStyle(product.status)}>{formatProductStatus(product.status)}</span>
                      <span style={styles.metricBadge}>Stock {formatStock(product.availableStock)}</span>
                      <span style={styles.metricBadge}>Variants {product.variantsCount}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <PaginationControls
              safePage={safePage}
              totalPages={totalPages}
              setPage={setPage}
            />

            <div style={styles.productActions}>
              <Link
                to={continueHref}
                style={{
                  ...styles.primaryButton,
                  ...(!selectedProductHandle ? styles.disabledButton : {}),
                }}
                aria-disabled={!selectedProductHandle}
              >
                Continue
              </Link>
            </div>
          </>
        )}
      </section>
    </s-page>
  );
}

function BundleTypeCard({
  title,
  label,
  description,
  image,
  bundleType,
  productHandle,
  productId,
  disabled,
}: {
  title: string;
  label: string;
  description: string;
  image: string;
  bundleType: BundleTypeChoice;
  productHandle: string;
  productId: string;
  disabled: boolean;
}) {
  return (
    <article style={styles.typeCard}>
      <img src={image} alt="" style={styles.typeImage} />
      <div style={styles.typeBody}>
        <span style={styles.cardLabel}>{label}</span>
        <h2 style={styles.cardTitle}>{title}</h2>
        <p style={styles.cardText}>{description}</p>
      </div>
      <Form method="post">
        <input type="hidden" name="intent" value="create-bundle" />
        <input type="hidden" name="bundleType" value={bundleType} />
        <input type="hidden" name="productHandle" value={productHandle} />
        <input type="hidden" name="productId" value={productId} />
        <button type="submit" disabled={disabled} style={styles.primaryButton}>
          {disabled ? "Creating..." : `Create ${title.toLowerCase()}`}
        </button>
      </Form>
    </article>
  );
}

function PaginationControls({
  safePage,
  totalPages,
  setPage,
}: {
  safePage: number;
  totalPages: number;
  setPage: (next: (current: number) => number) => void;
}) {
  return (
    <div style={styles.paginationRow}>
      <button
        type="button"
        onClick={() => setPage((current) => Math.max(1, current - 1))}
        disabled={safePage <= 1}
        style={{ ...styles.secondaryButton, ...(safePage <= 1 ? styles.disabledButton : {}) }}
      >
        Previous
      </button>
      <span style={styles.pageIndicator}>Page {safePage} / {totalPages}</span>
      <button
        type="button"
        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
        disabled={safePage >= totalPages}
        style={{ ...styles.secondaryButton, ...(safePage >= totalPages ? styles.disabledButton : {}) }}
      >
        Next
      </button>
    </div>
  );
}

function formatPlacementAttemptTitle(status: string) {
  if (status === "placed") return "Placement complete";
  if (status === "skipped") return "Placement skipped";
  if (status === "error") return "Placement failed";
  if (status === "ready_for_write") return "Placement ready";
  return "Placement blocked";
}

function formatProductStatus(status: string) {
  if (status === "ACTIVE") return "Active";
  if (status === "DRAFT") return "Draft";
  if (status === "ARCHIVED") return "Archived";
  return status || "Unknown";
}

function formatStock(stock: number) {
  if (stock <= 0) return "out";
  return `${stock} available`;
}

function getStatusBadgeStyle(status: string): CSSProperties {
  if (status === "ACTIVE") return { ...styles.statusBadge, ...styles.statusActive };
  if (status === "DRAFT") return { ...styles.statusBadge, ...styles.statusDraft };
  if (status === "ARCHIVED") return { ...styles.statusBadge, ...styles.statusArchived };
  return styles.statusBadge;
}

const styles: Record<string, CSSProperties> = {
  hero: {
    display: "grid",
    gap: "10px",
    padding: "26px",
    borderRadius: "28px",
    background: "linear-gradient(135deg, #f5f0e8 0%, #e2efe1 100%)",
    border: "1px solid #d9dfd2",
    marginBottom: "18px",
  },
  eyebrow: {
    width: "fit-content",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#172315",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  title: {
    maxWidth: "800px",
    margin: 0,
    color: "#172315",
    fontSize: "34px",
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
  },
  text: {
    maxWidth: "760px",
    margin: 0,
    color: "#4c5b49",
    fontSize: "15px",
    lineHeight: 1.6,
  },
  panel: {
    display: "grid",
    gap: "14px",
    padding: "18px",
    borderRadius: "22px",
    background: "#f7efe1",
    border: "1px solid #e6dac5",
  },
  typeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: "18px",
  },
  typeCard: {
    display: "grid",
    gap: "14px",
    padding: "18px",
    borderRadius: "26px",
    background: "#ffffff",
    border: "1px solid #dfe5dc",
  },
  typeImage: {
    width: "100%",
    maxHeight: "390px",
    objectFit: "contain",
    borderRadius: "20px",
    background: "#f5f7f2",
  },
  typeBody: {
    display: "grid",
    gap: "8px",
  },
  cardLabel: {
    width: "fit-content",
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#eef3ea",
    color: "#4f614b",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  cardTitle: {
    margin: 0,
    color: "#172315",
    fontSize: "24px",
  },
  cardText: {
    margin: 0,
    color: "#596755",
    lineHeight: 1.55,
    fontSize: "14px",
  },
  productPickerHeader: {
    display: "grid",
    gridTemplateColumns: "minmax(260px, 1fr) auto",
    gap: "12px",
    alignItems: "center",
  },
  fieldLabel: {
    display: "grid",
    gap: "6px",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 800,
  },
  searchInput: {
    minHeight: "42px",
    padding: "0 14px",
    borderRadius: "14px",
    border: "1px solid #d4c8b6",
    background: "#ffffff",
    color: "#172315",
  },
  productCount: {
    color: "#596755",
    fontSize: "13px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  productList: {
    display: "grid",
    gap: "10px",
  },
  productRow: {
    display: "grid",
    gridTemplateColumns: "auto 52px minmax(0, 1fr) auto",
    gap: "12px",
    alignItems: "center",
    padding: "12px",
    borderRadius: "18px",
    background: "#ffffff",
    border: "1px solid rgba(23, 35, 21, 0.12)",
    cursor: "pointer",
  },
  productRowSelected: {
    borderColor: "#172315",
    boxShadow: "0 0 0 2px rgba(23, 35, 21, 0.08)",
  },
  radio: {
    width: "16px",
    height: "16px",
  },
  productThumb: {
    width: "52px",
    height: "52px",
    borderRadius: "14px",
    overflow: "hidden",
    background: "#eef3ea",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  productImageFallback: {
    color: "#657360",
    fontSize: "11px",
    fontWeight: 800,
  },
  productInfo: {
    display: "grid",
    gap: "4px",
    minWidth: 0,
  },
  productTitle: {
    color: "#172315",
    fontSize: "15px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  productHandle: {
    color: "#596755",
    fontSize: "12px",
  },
  productBadges: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  metricBadge: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#f1f5ee",
    color: "#4d5f49",
    fontSize: "12px",
    fontWeight: 800,
  },
  statusBadge: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#eef3ea",
    color: "#4d5f49",
    fontSize: "12px",
    fontWeight: 800,
  },
  statusActive: {
    background: "#d7f5dd",
    color: "#13632c",
  },
  statusDraft: {
    background: "#e1f0ff",
    color: "#175d92",
  },
  statusArchived: {
    background: "#ececec",
    color: "#5f5f5f",
  },
  paginationRow: {
    display: "flex",
    gap: "12px",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },
  pageIndicator: {
    color: "#596755",
    fontSize: "13px",
    fontWeight: 800,
  },
  productActions: {
    display: "flex",
    justifyContent: "flex-end",
  },
  primaryButton: {
    minHeight: "42px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "1px solid #172315",
    background: "#172315",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: 800,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "40px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid #b8c6b3",
    background: "#ffffff",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 800,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    cursor: "pointer",
  },
  disabledButton: {
    opacity: 0.45,
    cursor: "not-allowed",
    pointerEvents: "none",
  },
  errorNotice: {
    display: "grid",
    gap: "6px",
    padding: "14px",
    borderRadius: "16px",
    background: "#fff6ef",
    border: "1px solid #f1d0b4",
    color: "#4b2d18",
    marginBottom: "14px",
  },
  compactList: {
    margin: 0,
    paddingLeft: "18px",
    display: "grid",
    gap: "4px",
  },
  backLink: {
    color: "#172315",
    fontSize: "13px",
    fontWeight: 800,
    textDecoration: "none",
  },
};

export const headers: HeadersFunction = () => ({});
