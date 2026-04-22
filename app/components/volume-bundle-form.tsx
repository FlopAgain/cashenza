import { useEffect, useState, type CSSProperties } from "react";
import { Form } from "react-router";

import type { BundleAppearanceDraft, ProductSnapshotDraft } from "../utils/bundle-configurator";
import { createDefaultAppearance } from "../utils/bundle-configurator";

export type VolumeOfferDraft = {
  title: string;
  subtitle: string;
  quantity: number;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
  discountValue: number;
};

export type VolumeBundleDraft = {
  title: string;
  status: "DRAFT" | "ACTIVE";
  itemCount: number;
  hasBestSeller: boolean;
  bestSellerIndex: number;
  allowVariantSelection: boolean;
  showVariantThumbnails: boolean;
  variantId: string;
  variantTitle: string;
  offers: VolumeOfferDraft[];
  appearance: BundleAppearanceDraft;
};

type Props = {
  product: ProductSnapshotDraft;
  draft: VolumeBundleDraft;
  submitLabel: string;
  isSubmitting: boolean;
  showVisibilityToggle?: boolean;
  showDeleteAction?: boolean;
  aside?: React.ReactNode;
};

const MAX_OFFERS = 10;

function createDefaultVolumeOffer(index: number): VolumeOfferDraft {
  const quantity = index + 1;
  return {
    title: quantity === 1 ? "Single" : `${quantity} units`,
    subtitle:
      quantity === 1
        ? "Standard price"
        : `Buy ${quantity} and save ${quantity === 2 ? 10 : 15}%`,
    quantity,
    discountType: "PERCENTAGE",
    discountValue: quantity === 1 ? 0 : quantity === 2 ? 10 : 15,
  };
}

function ensureOfferLength(values: VolumeOfferDraft[], targetLength: number) {
  const next = values.slice(0, targetLength);
  while (next.length < targetLength) {
    next.push(createDefaultVolumeOffer(next.length));
  }
  return next.map((offer, index) => ({
    ...offer,
    quantity: index + 1,
  }));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function parseVariantPrice(snapshot: ProductSnapshotDraft, variantId: string) {
  const variant =
    snapshot.variants.find((entry) => entry.id === variantId) ||
    snapshot.variants.find((entry) => entry.availableForSale) ||
    snapshot.variants[0];
  return Number(variant?.price || 0);
}

function getDiscountedTotal(
  unitPrice: number,
  offer: VolumeOfferDraft,
) {
  const initialTotal = unitPrice * offer.quantity;
  let discountedTotal = initialTotal;

  if (offer.discountType === "PERCENTAGE") {
    discountedTotal = initialTotal * (1 - offer.discountValue / 100);
  } else if (offer.discountType === "FIXED_AMOUNT") {
    discountedTotal = initialTotal - offer.discountValue;
  } else {
    discountedTotal = offer.discountValue;
  }

  return {
    initialTotal,
    discountedTotal: Math.max(0, discountedTotal),
  };
}

export function VolumeBundleForm({
  product,
  draft,
  submitLabel,
  isSubmitting,
  showDeleteAction,
  aside,
}: Props) {
  const [title, setTitle] = useState(draft.title);
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">(draft.status);
  const [itemCount, setItemCount] = useState(draft.itemCount);
  const [hasBestSeller, setHasBestSeller] = useState(draft.hasBestSeller);
  const [bestSellerIndex, setBestSellerIndex] = useState(draft.bestSellerIndex);
  const [allowVariantSelection, setAllowVariantSelection] = useState(draft.allowVariantSelection);
  const [showVariantThumbnails, setShowVariantThumbnails] = useState(draft.showVariantThumbnails);
  const [variantId, setVariantId] = useState(draft.variantId);
  const [variantTitle, setVariantTitle] = useState(draft.variantTitle);
  const [offers, setOffers] = useState<VolumeOfferDraft[]>(
    ensureOfferLength(draft.offers, draft.itemCount),
  );

  useEffect(() => {
    setTitle(draft.title);
    setStatus(draft.status);
    setItemCount(draft.itemCount);
    setHasBestSeller(draft.hasBestSeller);
    setBestSellerIndex(draft.bestSellerIndex);
    setAllowVariantSelection(draft.allowVariantSelection);
    setShowVariantThumbnails(draft.showVariantThumbnails);
    setVariantId(draft.variantId);
    setVariantTitle(draft.variantTitle);
    setOffers(ensureOfferLength(draft.offers, draft.itemCount));
  }, [draft]);

  const currentVariant =
    product.variants.find((entry) => entry.id === variantId) ||
    product.variants.find((entry) => entry.availableForSale) ||
    product.variants[0];
  const unitPrice = parseVariantPrice(product, variantId);

  function updateOffer(index: number, patch: Partial<VolumeOfferDraft>) {
    setOffers((current) =>
      current.map((offer, offerIndex) =>
        offerIndex === index ? { ...offer, ...patch, quantity: offerIndex + 1 } : offer,
      ),
    );
  }

  function handleItemCountChange(nextCount: number) {
    const sanitized = Math.max(1, Math.min(MAX_OFFERS, nextCount));
    setItemCount(sanitized);
    setOffers((current) => ensureOfferLength(current, sanitized));
    setBestSellerIndex((current) => Math.min(current, sanitized));
  }

  return (
    <Form method="post">
      <input type="hidden" name="offersJson" value={JSON.stringify(offers.slice(0, itemCount))} />
      <input type="hidden" name="itemCount" value={itemCount} />

      <div style={styles.layout}>
        <section style={styles.mainColumn}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Volume bundle settings</h3>
            <p style={styles.copy}>
              This builder controls the same-product quantity ladder for <strong>{product.title}</strong>.
              Offer 1 is the single-product baseline, then each next offer increases the quantity of the same product.
            </p>

            <div style={styles.gridTwo}>
              <label style={styles.field}>
                <span style={styles.label}>Bundle title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={styles.input}
                />
              </label>

                <label style={styles.field}>
                  <span style={styles.label}>Shopify discount status</span>
                  <select
                    name="status"
                    value={status}
                    onChange={(event) =>
                    setStatus(event.target.value === "ACTIVE" ? "ACTIVE" : "DRAFT")
                  }
                  style={styles.input}
                >
                  <option value="DRAFT">Inactive</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Number of offers</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_OFFERS}
                  value={itemCount}
                  onChange={(event) => handleItemCountChange(Number(event.target.value))}
                  style={styles.input}
                />
              </label>
            </div>

            <div style={styles.bestSellerRow}>
              <label style={styles.checkboxField}>
                <input
                  type="checkbox"
                  name="hasBestSeller"
                  checked={hasBestSeller}
                  onChange={(event) => setHasBestSeller(event.currentTarget.checked)}
                />
                <span>Enable best seller highlight</span>
              </label>

              {hasBestSeller ? (
                <label style={styles.field}>
                  <span style={styles.label}>Best seller offer</span>
                  <select
                    name="bestSellerIndex"
                    value={bestSellerIndex}
                    onChange={(event) => setBestSellerIndex(Number(event.target.value))}
                    style={styles.input}
                  >
                    {Array.from({ length: itemCount }, (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        Offer {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <input type="hidden" name="bestSellerIndex" value={bestSellerIndex} />
              )}
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Storefront behavior</h3>

            <div style={styles.gridTwo}>
              <label style={styles.checkboxField}>
                <input
                  type="checkbox"
                  name="allowVariantSelection"
                  checked={allowVariantSelection}
                  onChange={(event) => setAllowVariantSelection(event.currentTarget.checked)}
                />
                <span>Allow customers to choose the variant</span>
              </label>

              <label style={styles.checkboxField}>
                <input
                  type="checkbox"
                  name="showVariantThumbnails"
                  checked={showVariantThumbnails}
                  onChange={(event) => setShowVariantThumbnails(event.currentTarget.checked)}
                />
                <span>Show variant thumbnails</span>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Fixed variant when selection is disabled</span>
                <select
                  name="variantId"
                  value={variantId}
                  onChange={(event) => {
                    const selected = product.variants.find((entry) => entry.id === event.target.value);
                    setVariantId(event.target.value);
                    setVariantTitle(selected?.title || "");
                  }}
                  style={{
                    ...styles.input,
                    ...(allowVariantSelection ? styles.inputDisabled : {}),
                  }}
                  disabled={allowVariantSelection}
                >
                  {product.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.title} - {formatMoney(Number(variant.price || 0))}
                      {variant.availableForSale ? "" : " | Sold out"}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="variantTitle" value={variantTitle} />
              </label>
            </div>
          </div>

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Offers</h3>
            <div style={styles.stack}>
              {offers.slice(0, itemCount).map((offer, index) => {
                const pricing = getDiscountedTotal(unitPrice, offer);

                return (
                  <div key={index} style={styles.offerCard}>
                    <div style={styles.offerHeader}>
                      <h4 style={styles.offerTitle}>Offer {index + 1} · Quantity {offer.quantity}</h4>
                      {hasBestSeller && bestSellerIndex === index + 1 ? (
                        <span style={styles.bestSellerPill}>Best seller</span>
                      ) : null}
                    </div>

                    <div style={styles.gridTwo}>
                      <label style={styles.field}>
                        <span style={styles.label}>Offer title</span>
                        <input
                          value={offer.title}
                          onChange={(event) => updateOffer(index, { title: event.target.value })}
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.field}>
                        <span style={styles.label}>Subtitle</span>
                        <input
                          value={offer.subtitle}
                          onChange={(event) => updateOffer(index, { subtitle: event.target.value })}
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.field}>
                        <span style={styles.label}>Discount type</span>
                        <select
                          value={offer.discountType}
                          onChange={(event) =>
                            updateOffer(index, {
                              discountType:
                                event.target.value === "FIXED_AMOUNT"
                                  ? "FIXED_AMOUNT"
                                  : event.target.value === "FIXED_PRICE"
                                    ? "FIXED_PRICE"
                                    : "PERCENTAGE",
                            })
                          }
                          style={styles.input}
                        >
                          <option value="PERCENTAGE">Percentage (%)</option>
                          <option value="FIXED_AMOUNT">Fixed amount</option>
                          <option value="FIXED_PRICE">Fixed final price</option>
                        </select>
                      </label>

                      <label style={styles.field}>
                        <span style={styles.label}>
                          {offer.discountType === "FIXED_AMOUNT"
                            ? "Discount amount"
                            : offer.discountType === "FIXED_PRICE"
                              ? "Final bundle price"
                              : "Discount (%)"}
                        </span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={offer.discountValue}
                          onChange={(event) =>
                            updateOffer(index, {
                              discountValue: Number(event.target.value || 0),
                            })
                          }
                          style={styles.input}
                        />
                      </label>
                    </div>

                    <div style={styles.pricingPanel}>
                      <div style={styles.priceCard}>
                        <span style={styles.metaLabel}>Initial total</span>
                        <strong style={styles.priceValue}>{formatMoney(pricing.initialTotal)}</strong>
                      </div>
                      <div style={styles.priceCard}>
                        <span style={styles.metaLabel}>Discounted total</span>
                        <strong style={styles.priceValue}>{formatMoney(pricing.discountedTotal)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </section>

        <aside style={styles.sidebar}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Product anchor</h3>
            <div style={styles.productCard}>
              {product.featuredImage ? (
                <img src={product.featuredImage} alt={product.title} style={styles.image} />
              ) : null}
              <div>
                <strong>{product.title}</strong>
                <div style={styles.metaText}>Handle: {product.handle}</div>
                <div style={styles.metaText}>
                  Variant used by default: {currentVariant?.title || "No variant"}
                </div>
              </div>
            </div>
          </div>

          {aside}

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Save volume bundle</h3>
            <button type="submit" style={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
          </div>

          {showDeleteAction ? (
            <div style={styles.card}>
              <button type="submit" name="intent" value="delete" style={styles.deleteButton}>
                Delete volume bundle
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </Form>
  );
}

export function createDefaultVolumeBundleDraft(
  product: ProductSnapshotDraft,
): VolumeBundleDraft {
  const selectedVariant =
    product.variants.find((entry) => entry.availableForSale) || product.variants[0];

  return {
    title: `${product.title} volume bundle`,
    status: "ACTIVE",
    itemCount: 3,
    hasBestSeller: true,
    bestSellerIndex: 2,
    allowVariantSelection: true,
    showVariantThumbnails: false,
    variantId: selectedVariant?.id || "",
    variantTitle: selectedVariant?.title || "",
    offers: ensureOfferLength([], 3),
    appearance: createDefaultAppearance(),
  };
}

const styles: Record<string, CSSProperties> = {
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.9fr)",
    gap: "20px",
    alignItems: "start",
  },
  mainColumn: { display: "grid", gap: "20px" },
  sidebar: { display: "grid", gap: "20px" },
  card: {
    padding: "20px",
    border: "1px solid #d8d8d8",
    borderRadius: "18px",
    background: "#ffffff",
    display: "grid",
    gap: "16px",
  },
  cardTitle: { margin: 0, fontSize: "20px" },
  copy: { margin: 0, fontSize: "14px", lineHeight: 1.6, color: "#5f6b72" },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  bestSellerRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "6px",
  },
  field: { display: "grid", gap: "6px" },
  label: { fontWeight: 600, fontSize: "14px" },
  input: {
    minHeight: "44px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #cfcfcf",
    fontSize: "14px",
    background: "#ffffff",
  },
  inputDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
    background: "#f3f4f5",
  },
  checkboxField: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minHeight: "44px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #e5e7ea",
    background: "#fafafa",
  },
  stack: { display: "grid", gap: "12px" },
  offerCard: {
    padding: "16px",
    borderRadius: "14px",
    border: "1px solid #e6e6e6",
    background: "#fafafa",
    display: "grid",
    gap: "14px",
  },
  offerHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  },
  offerTitle: { margin: 0, fontSize: "16px" },
  bestSellerPill: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#1d3124",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 700,
  },
  pricingPanel: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  priceCard: {
    display: "grid",
    gap: "6px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e4e4e4",
    background: "#ffffff",
  },
  metaLabel: {
    fontWeight: 600,
    fontSize: "12px",
    color: "#687076",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  priceValue: { fontSize: "22px", lineHeight: 1.1 },
  actions: { display: "flex", justifyContent: "flex-start" },
  primaryButton: {
    minHeight: "48px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "none",
    background: "#1d3124",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  deleteButton: {
    width: "100%",
    minHeight: "44px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "1px solid #cf3d3d",
    background: "#ffffff",
    color: "#cf3d3d",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  productCard: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  image: {
    width: "72px",
    height: "72px",
    objectFit: "cover",
    borderRadius: "16px",
    border: "1px solid #e1e4e8",
  },
  metaText: { fontSize: "13px", color: "#5f6b72", marginTop: "4px" },
};
