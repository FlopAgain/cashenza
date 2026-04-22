import { useEffect, useState, type CSSProperties } from "react";
import { Form, useFetcher } from "react-router";

import type {
  BundleAppearanceDraft,
  BundleDraftPayload,
  BundleItemDraft,
  BundleOfferDraft,
  ProductSnapshotDraft,
} from "../utils/bundle-configurator";
import {
  MAX_ITEMS,
  createDefaultItem,
  createDefaultOffer,
  ensureLength,
  getCrossSellItemLabel,
  getCrossSellOfferCompositionLabel,
} from "../utils/bundle-configurator";
import { EFFECTS_PRESETS } from "../constants/bundle-effects-presets";
import { STYLE_PRESETS, STYLE_PRESET_LABELS } from "../constants/bundle-style-presets";
import { BEST_SELLER_PNG_BADGE_ASSETS } from "../constants/best-seller-png-badges";

type Props = {
  draft: BundleDraftPayload;
  submitLabel: string;
  isSubmitting: boolean;
  formAction?: string;
  mode?: "cross-sell" | "volume";
  showDeleteAction?: boolean;
  aside?: React.ReactNode;
};

type TabId = "offers" | "style" | "timer" | "effects" | "discounts";

type ProductSnapshotResponse = {
  ok: boolean;
  handle: string;
  product: ProductSnapshotDraft | null;
  error?: string;
};

type DesignPresetPreviewTheme = {
  shell: CSSProperties;
  header: CSSProperties;
  eyebrow: CSSProperties;
  heading: CSSProperties;
  subheading: CSSProperties;
  offerTitle: CSSProperties;
  offerCopy: CSSProperties;
  titleRow: CSSProperties;
  price: CSSProperties;
  saveBadge: CSSProperties;
  thumb: CSSProperties;
  selectedOffer: CSSProperties;
  secondaryOffer: CSSProperties;
  buttonRow?: CSSProperties;
  button: CSSProperties;
  secondaryButton?: CSSProperties;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "offers", label: "Products & offers" },
  { id: "style", label: "Style" },
  { id: "timer", label: "Timer" },
  { id: "effects", label: "Effects" },
  { id: "discounts", label: "Discounts" },
];

const TIMER_PRESETS = ["soft", "cards", "outline"];

const TIMER_PRESET_LABELS: Record<string, string> = {
  soft: "Soft",
  cards: "Cards",
  outline: "Outline",
};

const TIMER_PRESET_DEFAULTS: Record<
  string,
  {
    prefix: string;
    expiredText: string;
    backgroundColor: string;
    textColor: string;
  }
> = {
  soft: {
    prefix: "Offer ends in",
    expiredText: "Offer expired",
    backgroundColor: "#1a2118",
    textColor: "#ffffff",
  },
  cards: {
    prefix: "Limited time offer",
    expiredText: "Offer closed",
    backgroundColor: "#243323",
    textColor: "#ffffff",
  },
  outline: {
    prefix: "Offer closes in",
    expiredText: "Last chance ended",
    backgroundColor: "#ffffff",
    textColor: "#1f3b24",
  },
};

const BEST_SELLER_BADGE_PRESETS = [
  { value: "pill", label: "Classic pill" },
  { value: "ribbon", label: "Ribbon" },
  { value: "award", label: "Award seal" },
  { value: "award-ribbon", label: "Award ribbon" },
  { value: "banner", label: "Banner" },
  { value: "speech", label: "Speech bubble" },
  { value: "stamp", label: "Stamp" },
];

const BEST_SELLER_PNG_BADGE_PRESETS = [
  { value: "none", label: "None" },
  { value: "orange-ribbon", label: "Orange ribbon" },
  { value: "blue-award", label: "Blue award" },
  { value: "gold-award", label: "Gold award" },
  { value: "pink-banner", label: "Pink banner" },
  { value: "red-speech", label: "Red speech" },
  { value: "red-stamp", label: "Red stamp" },
];

function toDateTimeLocalValue(value: string) {
  if (!value) return "";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 16);
  }

  const offsetMinutes = parsed.getTimezoneOffset();
  const localDate = new Date(parsed.getTime() - offsetMinutes * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function getTimerPreviewValue(value: string) {
  if (!value) return "--:--:--";

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "--:--:--";

  const remaining = target.getTime() - Date.now();
  if (remaining <= 0) return "00:00:00";

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((entry) => String(entry).padStart(2, "0"))
    .join(":");
}

function parseVariantPrice(value: string | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickEffectiveVariant(
  item: BundleItemDraft,
  snapshot: ProductSnapshotDraft | null | undefined,
) {
  if (!snapshot?.variants?.length) return null;

  if (!item.allowVariantSelection && item.variantId) {
    return (
      snapshot.variants.find((variant) => variant.id === item.variantId) ||
      snapshot.variants[0]
    );
  }

  return (
    snapshot.variants.find((variant) => variant.availableForSale) ||
    snapshot.variants[0]
  );
}

function getOfferPricing(
  offer: BundleOfferDraft,
  offerItems: BundleItemDraft[],
  productSnapshots: Record<string, ProductSnapshotDraft | null>,
) {
  const unitPrices = offerItems.map((item) => {
    const snapshot = productSnapshots[item.productHandle.trim()] || null;
    const variant = pickEffectiveVariant(item, snapshot);
    return variant ? parseVariantPrice(variant.price) : null;
  });

  if (unitPrices.some((price) => price == null)) {
    return { initialTotal: null, discountedTotal: null };
  }

  const normalizedPrices = unitPrices as number[];
  const initialTotal = normalizedPrices.reduce((sum, price) => sum + price, 0);
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

export function BundleConfiguratorForm({
  draft,
  submitLabel,
  isSubmitting,
  formAction,
  mode = "cross-sell",
  showDeleteAction,
  aside,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("offers");
  const [title, setTitle] = useState(draft.title);
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">(draft.status);
  const [itemCount, setItemCount] = useState(draft.itemCount);
  const [bestSellerIndex, setBestSellerIndex] = useState(draft.bestSellerIndex);
  const [items, setItems] = useState<BundleItemDraft[]>(draft.items);
  const [offers, setOffers] = useState<BundleOfferDraft[]>(draft.offers);
  const [appearance, setAppearance] = useState<BundleAppearanceDraft>(draft.appearance);
  const [productSnapshots, setProductSnapshots] = useState<
    Record<string, ProductSnapshotDraft | null>
  >(draft.productSnapshots || {});
  const productFetcher = useFetcher<ProductSnapshotResponse>();

  useEffect(() => {
    if (!productFetcher.data?.ok) return;

    const handle = productFetcher.data.handle.trim();
    const product = productFetcher.data.product || null;

    setProductSnapshots((current) => ({ ...current, [handle]: product }));

    if (!product?.variants?.length) return;

    setItems((current) =>
      current.map((item) => {
        if (item.productHandle.trim() !== handle || item.allowVariantSelection) {
          return item;
        }

        const variant =
          product.variants.find((entry) => entry.id === item.variantId) ||
          product.variants.find((entry) => entry.availableForSale) ||
          product.variants[0];

        if (!variant) return item;

        return {
          ...item,
          variantId: variant.id,
          variantTitle: variant.title,
        };
      }),
    );
  }, [productFetcher.data]);

  function handleItemCountChange(nextCount: number) {
    const sanitized = Math.max(1, Math.min(MAX_ITEMS, nextCount));
    setItemCount(sanitized);
    setItems((current) => ensureLength(current, sanitized, createDefaultItem));
    setOffers((current) => ensureLength(current, sanitized, createDefaultOffer));
    setBestSellerIndex((current) => Math.min(current, sanitized));
  }

  function updateItem(index: number, patch: Partial<BundleItemDraft>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function updateOffer(index: number, patch: Partial<BundleOfferDraft>) {
    setOffers((current) =>
      current.map((offer, offerIndex) =>
        offerIndex === index ? { ...offer, ...patch } : offer,
      ),
    );
  }

  function updateAppearance<K extends keyof BundleAppearanceDraft>(
    key: K,
    value: BundleAppearanceDraft[K],
  ) {
    setAppearance((current) => ({ ...current, [key]: value }));
  }

  function applyTimerPreset(preset: string) {
    const defaults = TIMER_PRESET_DEFAULTS[preset] || TIMER_PRESET_DEFAULTS.soft;

    setAppearance((current) => ({
      ...current,
      timerPreset: preset,
      timerPrefix: defaults.prefix,
      timerExpiredText: defaults.expiredText,
      timerBackgroundColor: defaults.backgroundColor,
      timerTextColor: defaults.textColor,
    }));
  }

  function loadProductSnapshot(handle: string) {
    const trimmedHandle = handle.trim();
    if (!trimmedHandle) return;
    productFetcher.load(`/app/api/product-snapshot?handle=${encodeURIComponent(trimmedHandle)}`);
  }

  const visibleItems = items.slice(0, itemCount);
  const visibleOffers = offers.slice(0, itemCount);

  return (
    <FormShell
      mode={mode}
      title={title}
      status={status}
      itemCount={itemCount}
      bestSellerIndex={bestSellerIndex}
      setTitle={setTitle}
      setStatus={setStatus}
      setBestSellerIndex={setBestSellerIndex}
      handleItemCountChange={handleItemCountChange}
      appearance={appearance}
      items={visibleItems}
      offers={visibleOffers}
      productSnapshots={productSnapshots}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
      formAction={formAction}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      updateItem={updateItem}
      updateOffer={updateOffer}
      updateAppearance={updateAppearance}
      applyTimerPreset={applyTimerPreset}
      loadProductSnapshot={loadProductSnapshot}
      isLoadingProduct={productFetcher.state !== "idle"}
      showDeleteAction={showDeleteAction}
      aside={aside}
    />
  );
}

function FormShell(props: {
  mode: "cross-sell" | "volume";
  title: string;
  status: "DRAFT" | "ACTIVE";
  itemCount: number;
  bestSellerIndex: number;
  setTitle: (value: string) => void;
  setStatus: (value: "DRAFT" | "ACTIVE") => void;
  setBestSellerIndex: (value: number) => void;
  handleItemCountChange: (value: number) => void;
  appearance: BundleAppearanceDraft;
  items: BundleItemDraft[];
  offers: BundleOfferDraft[];
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
  isSubmitting: boolean;
  submitLabel: string;
  formAction?: string;
  activeTab: TabId;
  setActiveTab: (value: TabId) => void;
  updateItem: (index: number, patch: Partial<BundleItemDraft>) => void;
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
  updateAppearance: <K extends keyof BundleAppearanceDraft>(
    key: K,
    value: BundleAppearanceDraft[K],
  ) => void;
  applyTimerPreset: (preset: string) => void;
  loadProductSnapshot: (handle: string) => void;
  isLoadingProduct: boolean;
  showDeleteAction?: boolean;
  aside?: React.ReactNode;
}) {
  const {
    mode,
    title,
    status,
    itemCount,
    bestSellerIndex,
    setTitle,
    setStatus,
    setBestSellerIndex,
    handleItemCountChange,
    appearance,
    items,
    offers,
    productSnapshots,
    isSubmitting,
    submitLabel,
    formAction,
    activeTab,
    setActiveTab,
    updateItem,
    updateOffer,
    updateAppearance,
    applyTimerPreset,
    loadProductSnapshot,
    isLoadingProduct,
    showDeleteAction,
    aside,
  } = props;
  const isBestSellerPngPresetSelected = appearance.bestSellerPngBadgePreset !== "none";
  const isOutlineTimerPreset = appearance.timerPreset === "outline";
  const isFadeInEffectsPreset = appearance.effectsPreset === "fade in";
  const isSlideEffectsPreset = appearance.effectsPreset === "slide";
  const settingsTitle = mode === "volume" ? "Volume bundle settings" : "Cross-sell settings";
  const settingsCopy =
    mode === "volume"
      ? "Configure the same-product quantity ladder. Offer 1 is the single-product baseline, then each next offer increases the quantity of the same product."
      : "Item 1 is the anchored product for the current product page. Each next offer expands from that anchor by adding one more bundled item.";
  const offerTitle = mode === "volume" ? "Volume products & offers" : "Products & offers";
  const offerCopy =
    mode === "volume"
      ? "Configure the repeated product, then define how each offer increases quantity and discount level."
      : "Configure the anchored product first, then define how each offer adds one more bundled item and discount level.";

  return (
    <Form method="post" action={formAction}>
      <input type="hidden" name="itemCount" value={itemCount} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
      <input type="hidden" name="offersJson" value={JSON.stringify(offers)} />
      <input
        type="hidden"
        name="appearanceJson"
        value={JSON.stringify(appearance)}
      />

      <div style={styles.layout}>
        <section style={styles.mainColumn}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>{settingsTitle}</h3>
            <p style={styles.sectionCopy}>{settingsCopy}</p>
            <div style={styles.gridTwo}>
              <label style={styles.field}>
                <span style={styles.label}>Cross-sell bundle title</span>
                <input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={styles.input}
                />
              </label>

                <label style={styles.field}>
                  <span style={styles.label}>Status</span>
                  <select
                    name="status"
                    value={status}
                  onChange={(event) =>
                    setStatus(event.target.value === "ACTIVE" ? "ACTIVE" : "DRAFT")
                    }
                    style={styles.input}
                  >
                    <option value="DRAFT">
                      {mode === "cross-sell" ? "Expired (inactive)" : "Draft"}
                    </option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </label>

              <label style={styles.field}>
                <span style={styles.label}>Maximum bundled items</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_ITEMS}
                  value={itemCount}
                  onChange={(event) => handleItemCountChange(Number(event.target.value))}
                  style={styles.input}
                />
              </label>

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
            </div>
          </div>

          <div style={styles.tabBar}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styles.tabButton,
                  ...(activeTab === tab.id ? styles.tabButtonActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "offers" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>{offerTitle}</h3>
              <p style={styles.sectionCopy}>{offerCopy}</p>
              <div style={styles.stack}>
                {offers.map((offer, index) => {
                  const offerItems = items.slice(0, index + 1);
                  const pricing = getOfferPricing(offer, offerItems, productSnapshots);

                  return (
                    <div key={index} style={styles.subcard}>
                      <div style={styles.subcardHeader}>
                        <h4 style={styles.subcardTitle}>
                          Offer {index + 1} · {getCrossSellOfferCompositionLabel(index)}
                        </h4>
                        {bestSellerIndex === index + 1 ? (
                          <span style={styles.bestSellerPill}>Best seller</span>
                        ) : null}
                      </div>

                      <div style={styles.gridTwo}>
                        <label style={styles.field}>
                          <span style={styles.label}>Offer title</span>
                          <input
                            value={offer.title}
                            onChange={(event) =>
                              updateOffer(index, { title: event.target.value })
                            }
                            style={styles.input}
                          />
                        </label>

                        <label style={styles.field}>
                          <span style={styles.label}>Subtitle</span>
                          <input
                            value={offer.subtitle}
                            onChange={(event) =>
                              updateOffer(index, { subtitle: event.target.value })
                            }
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
                          <span style={styles.mutedLabel}>Initial price</span>
                          <strong style={styles.priceValue}>
                            {pricing.initialTotal == null
                              ? "Load linked products"
                              : formatMoney(pricing.initialTotal)}
                          </strong>
                        </div>
                        <div style={styles.priceCard}>
                          <span style={styles.mutedLabel}>Discounted price</span>
                          <strong style={styles.priceValue}>
                            {pricing.discountedTotal == null
                              ? "Load linked products"
                              : formatMoney(pricing.discountedTotal)}
                          </strong>
                        </div>
                      </div>

                      <div style={styles.stack}>
                        {offerItems.map((item, itemIndex) => {
                          const snapshot =
                            productSnapshots[item.productHandle.trim()] || null;
                          const effectiveVariant = pickEffectiveVariant(item, snapshot);
                          const realIndex = itemIndex;

                          return (
                            <div key={`${index}-${realIndex}`} style={styles.offerItemCard}>
                              <div style={styles.offerItemHeader}>
                                <h5 style={styles.offerItemTitle}>
                                  {getCrossSellItemLabel(realIndex)}
                                </h5>
                                {snapshot ? (
                                  <span style={styles.offerItemMeta}>
                                    {snapshot.title}
                                  </span>
                                ) : null}
                              </div>

                              <div style={styles.productPickerRow}>
                                <label style={{ ...styles.field, flex: 1 }}>
                                  <span style={styles.label}>
                                    {realIndex === 0
                                      ? "Anchored product handle"
                                      : "Added product handle"}
                                  </span>
                                  <input
                                    value={item.productHandle}
                                    onChange={(event) =>
                                      updateItem(realIndex, {
                                        productHandle: event.target.value,
                                        variantId: "",
                                        variantTitle: "",
                                      })
                                    }
                                    onBlur={() =>
                                      item.productHandle.trim()
                                        ? loadProductSnapshot(item.productHandle)
                                        : undefined
                                    }
                                    style={styles.input}
                                  />
                                </label>

                                <button
                                  type="button"
                                  onClick={() => loadProductSnapshot(item.productHandle)}
                                  style={styles.secondaryButton}
                                  disabled={!item.productHandle.trim() || isLoadingProduct}
                                >
                                  {isLoadingProduct ? "Loading..." : "Load product"}
                                </button>
                              </div>

                              {snapshot ? (
                                <div style={styles.snapshotBox}>
                                  <strong>{snapshot.title}</strong>
                                  <span style={styles.offerItemMeta}>
                                    {snapshot.variants.length} variants available
                                  </span>
                                </div>
                              ) : (
                                <div style={styles.hintBox}>
                                  {realIndex === 0
                                    ? "Enter the current page product handle first, then load it to select a fixed variant and preview the anchored price."
                                    : "Enter an added product handle, then load it to select a fixed variant and preview the bundled price."}
                                </div>
                              )}

                              <div style={styles.gridTwo}>
                                <label style={styles.checkboxField}>
                                  <input
                                    type="checkbox"
                                    checked={item.allowVariantSelection}
                                    onChange={(event) =>
                                      updateItem(realIndex, {
                                        allowVariantSelection: event.target.checked,
                                        variantId: event.target.checked
                                          ? ""
                                          : item.variantId,
                                        variantTitle: event.target.checked
                                          ? ""
                                          : item.variantTitle,
                                      })
                                    }
                                  />
                                  <span>Allow variant selection</span>
                                </label>

                                <label style={styles.checkboxField}>
                                  <input
                                    type="checkbox"
                                    checked={item.showVariantThumbnails}
                                    onChange={(event) =>
                                      updateItem(realIndex, {
                                        showVariantThumbnails: event.target.checked,
                                      })
                                    }
                                  />
                                  <span>Show variant thumbnails</span>
                                </label>
                              </div>

                              {!item.allowVariantSelection ? (
                                <label style={styles.field}>
                                  <span style={styles.label}>Fixed variant for bundle</span>
                                  <select
                                    value={item.variantId}
                                    onChange={(event) => {
                                      const selectedVariant =
                                        snapshot?.variants.find(
                                          (variant) => variant.id === event.target.value,
                                        ) || null;

                                      updateItem(realIndex, {
                                        variantId: event.target.value,
                                        variantTitle: selectedVariant?.title || "",
                                      });
                                    }}
                                    style={styles.input}
                                    disabled={!snapshot?.variants?.length}
                                  >
                                    <option value="">
                                      {snapshot?.variants?.length
                                        ? "Select a fixed variant"
                                        : "Load the product first"}
                                    </option>
                                    {(snapshot?.variants || []).map((variant) => (
                                      <option key={variant.id} value={variant.id}>
                                        {variant.title} - {formatMoney(parseVariantPrice(variant.price))}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}

                              <div style={styles.variantPreviewRow}>
                                <span style={styles.mutedLabel}>Effective variant</span>
                                <strong>
                                  {snapshot
                                    ? `${snapshot.title} : ${
                                        item.allowVariantSelection
                                          ? effectiveVariant?.title || "Customer chooses on storefront"
                                          : item.variantTitle || effectiveVariant?.title || "No fixed variant selected"
                                      }`
                                    : "Product not loaded"}
                                </strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {activeTab === "style" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Style</h3>
              <div style={styles.gridTwo}>
                <label style={styles.field}>
                  <span style={styles.label}>Design preset</span>
                  <select
                    value={appearance.designPreset}
                    onChange={(event) =>
                      updateAppearance("designPreset", event.target.value)
                    }
                    style={styles.input}
                  >
                    {STYLE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {STYLE_PRESET_LABELS[preset] || preset}
                      </option>
                    ))}
                  </select>
                </label>

                <ColorField
                  label="Primary color"
                  value={appearance.primaryColor}
                  onChange={(value) => updateAppearance("primaryColor", value)}
                />

                <ColorField
                  label="Text color"
                  value={appearance.textColor}
                  onChange={(value) => updateAppearance("textColor", value)}
                />

                <label style={styles.field}>
                  <span style={styles.label}>Eyebrow</span>
                  <input
                    value={appearance.eyebrow}
                    onChange={(event) => updateAppearance("eyebrow", event.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Heading</span>
                  <input
                    value={appearance.heading}
                    onChange={(event) => updateAppearance("heading", event.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Subheading</span>
                  <input
                    value={appearance.subheading}
                    onChange={(event) =>
                      updateAppearance("subheading", event.target.value)
                    }
                    style={styles.input}
                  />
                </label>

                <RangeField
                  label="Heading size"
                  min={20}
                  max={44}
                  value={appearance.headingSize}
                  onChange={(value) => updateAppearance("headingSize", value)}
                />

                <RangeField
                  label="Subheading size"
                  min={12}
                  max={24}
                  value={appearance.subheadingSize}
                  onChange={(value) => updateAppearance("subheadingSize", value)}
                />

                <RangeField
                  label="Offer title size"
                  min={14}
                  max={30}
                  value={appearance.offerTitleSize}
                  onChange={(value) => updateAppearance("offerTitleSize", value)}
                />

                <RangeField
                  label="Offer price size"
                  min={16}
                  max={34}
                  value={appearance.offerPriceSize}
                  onChange={(value) => updateAppearance("offerPriceSize", value)}
                />

                <RangeField
                  label="Card spacing"
                  min={6}
                  max={32}
                  value={appearance.cardGap}
                  onChange={(value) => updateAppearance("cardGap", value)}
                />

                <RangeField
                  label="Card padding"
                  min={12}
                  max={32}
                  value={appearance.cardPadding}
                  onChange={(value) => updateAppearance("cardPadding", value)}
                />

                <RangeField
                  label="Offer border radius"
                  min={0}
                  max={40}
                  value={appearance.offerRadius}
                  onChange={(value) => updateAppearance("offerRadius", value)}
                />
              </div>

              <div style={styles.previewCard}>
                <span style={styles.mutedLabel}>Style preview</span>
                <StylePreview appearance={appearance} />
              </div>
            </div>
          ) : null}

          {activeTab === "timer" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Timer</h3>
              <div style={styles.gridTwo}>
                <label style={styles.field}>
                  <span style={styles.label}>Timer preset</span>
                  <select
                    value={appearance.timerPreset}
                    onChange={(event) => applyTimerPreset(event.target.value)}
                    style={styles.input}
                  >
                    {TIMER_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {TIMER_PRESET_LABELS[preset] || preset}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={appearance.showTimer}
                    onChange={(event) =>
                      updateAppearance("showTimer", event.target.checked)
                    }
                  />
                  <span>Show urgency timer</span>
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>End date</span>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(appearance.timerEnd)}
                    onChange={(event) => updateAppearance("timerEnd", event.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Prefix</span>
                  <input
                    value={appearance.timerPrefix}
                    onChange={(event) =>
                      updateAppearance("timerPrefix", event.target.value)
                    }
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Expired text</span>
                  <input
                    value={appearance.timerExpiredText}
                    onChange={(event) =>
                      updateAppearance("timerExpiredText", event.target.value)
                    }
                    style={styles.input}
                  />
                </label>

                <ColorField
                  label="Timer background"
                  value={appearance.timerBackgroundColor}
                  onChange={(value) =>
                    updateAppearance("timerBackgroundColor", value)
                  }
                  disabled={isOutlineTimerPreset}
                />

                <ColorField
                  label={isOutlineTimerPreset ? "Timer text and outline" : "Timer text"}
                  value={appearance.timerTextColor}
                  onChange={(value) => updateAppearance("timerTextColor", value)}
                />
              </div>

              <div style={styles.previewCard}>
                <span style={styles.mutedLabel}>Timer preview</span>
                <TimerPreview appearance={appearance} />
              </div>
            </div>
          ) : null}

          {activeTab === "effects" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Effects</h3>
              <p style={styles.sectionCopy}>
                Control whether the bundle appears instantly or with a quick fade-in on the storefront.
                This option will become part of a paid plan later.
              </p>
              <div style={styles.gridTwo}>
                <label style={styles.field}>
                  <span style={styles.label}>Entrance effect</span>
                  <select
                    value={appearance.effectsPreset}
                    onChange={(event) => updateAppearance("effectsPreset", event.target.value)}
                    style={styles.input}
                  >
                    {EFFECTS_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  style={{
                    border: "1px solid rgba(0, 0, 0, 0.08)",
                    borderRadius: 18,
                    padding: 16,
                    background: "#fbfbfb",
                    alignSelf: "stretch",
                  }}
                >
                  <span style={styles.mutedLabel}>Current behavior</span>
                  <div style={{ marginTop: 8, fontWeight: 600 }}>
                    {isSlideEffectsPreset
                      ? "Slide in enabled"
                      : isFadeInEffectsPreset
                        ? "Fade in enabled"
                        : "No entrance animation"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "discounts" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Discounts & badges</h3>
              <div style={styles.gridTwo}>
                <label style={styles.field}>
                  <span style={styles.label}>Best seller PNG badge preset</span>
                  <select
                    value={appearance.bestSellerPngBadgePreset}
                    onChange={(event) =>
                      updateAppearance("bestSellerPngBadgePreset", event.target.value)
                    }
                    style={styles.input}
                  >
                    {BEST_SELLER_PNG_BADGE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={styles.field}>
                  <span style={styles.label}>Best seller CSS badge preset</span>
                  <select
                    value={appearance.bestSellerBadgePreset}
                    onChange={(event) =>
                      updateAppearance("bestSellerBadgePreset", event.target.value)
                    }
                    style={{
                      ...styles.input,
                      ...(isBestSellerPngPresetSelected ? styles.inputDisabled : {}),
                    }}
                    disabled={isBestSellerPngPresetSelected}
                  >
                    {BEST_SELLER_BADGE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <ColorField
                  label="Best seller badge background"
                  value={appearance.bestSellerBadgeColor}
                  onChange={(value) =>
                    updateAppearance("bestSellerBadgeColor", value)
                  }
                  disabled={isBestSellerPngPresetSelected}
                />
                <ColorField
                  label="Best seller badge text"
                  value={appearance.bestSellerBadgeText}
                  onChange={(value) =>
                    updateAppearance("bestSellerBadgeText", value)
                  }
                  disabled={isBestSellerPngPresetSelected}
                />
                <ColorField
                  label="Save badge background"
                  value={appearance.saveBadgeColor}
                  onChange={(value) => updateAppearance("saveBadgeColor", value)}
                />
                <ColorField
                  label="Save badge text"
                  value={appearance.saveBadgeText}
                  onChange={(value) => updateAppearance("saveBadgeText", value)}
                />
                <label style={styles.field}>
                  <span style={styles.label}>Save badge label</span>
                  <input
                    value={appearance.saveBadgePrefix}
                    onChange={(event) =>
                      updateAppearance("saveBadgePrefix", event.target.value)
                    }
                    style={styles.input}
                  />
                </label>
              </div>

              <div style={styles.badgePreviewCard}>
                <span style={styles.mutedLabel}>Best seller preview</span>
                <BadgePresetPreview
                  preset={appearance.bestSellerBadgePreset}
                  pngPreset={appearance.bestSellerPngBadgePreset}
                  textColor={appearance.bestSellerBadgeText}
                  backgroundColor={appearance.bestSellerBadgeColor}
                />
              </div>

              <div style={styles.badgePreviewCard}>
                <span style={styles.mutedLabel}>Save badge preview</span>
                <SaveBadgePreview
                  prefix={appearance.saveBadgePrefix}
                  textColor={appearance.saveBadgeText}
                  backgroundColor={appearance.saveBadgeColor}
                />
              </div>
            </div>
          ) : null}
        </section>

        <aside style={styles.sidebar}>
          {aside}

          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Save bundle</h3>
            <button type="submit" style={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
          </div>

          {showDeleteAction ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Danger zone</h3>
              <button
                type="submit"
                name="intent"
                value="delete"
                style={styles.deleteButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Working..." : "Delete bundle"}
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </Form>
  );
}

function BadgePresetPreview({
  preset,
  pngPreset,
  textColor,
  backgroundColor,
}: {
  preset: string;
  pngPreset: string;
  textColor: string;
  backgroundColor: string;
}) {
  if (pngPreset !== "none") {
    const pngAsset = BEST_SELLER_PNG_BADGE_ASSETS[pngPreset];

    return (
      <div style={styles.badgePreviewWrap}>
        {pngAsset ? (
          <img
            src={pngAsset}
            alt="Best seller badge preview"
            style={{
              ...styles.badgePreviewImage,
              ...(pngPreset === "orange-ribbon"
                ? styles.badgePreviewImageRibbon
                : pngPreset === "pink-banner"
                  ? styles.badgePreviewImageBanner
                  : pngPreset === "red-speech"
                    ? styles.badgePreviewImageSpeech
                    : pngPreset === "blue-award" ||
                        pngPreset === "gold-award" ||
                        pngPreset === "red-stamp"
                      ? styles.badgePreviewImageSeal
                      : {}),
            }}
          />
        ) : (
          <div style={styles.badgePreviewMissing}>PNG unavailable</div>
        )}
      </div>
    );
  }

  const style = {
    color: textColor,
    background: backgroundColor,
  } as CSSProperties;

  if (preset === "ribbon") {
    return (
      <div style={styles.badgePreviewWrap}>
        <div style={{ ...styles.badgePreviewBase, ...styles.badgePreviewRibbon, ...style }}>
          #1 Best Seller
        </div>
      </div>
    );
  }

  if (preset === "banner") {
    return (
      <div style={styles.badgePreviewWrap}>
        <div style={{ ...styles.badgePreviewBase, ...styles.badgePreviewBanner, ...style }}>
          BEST SELLER
        </div>
      </div>
    );
  }

  if (preset === "speech") {
    return (
      <div style={styles.badgePreviewWrap}>
        <div style={{ ...styles.badgePreviewBase, ...styles.badgePreviewSpeech, ...style }}>
          BEST SELLER
        </div>
      </div>
    );
  }

  if (preset === "award" || preset === "award-ribbon" || preset === "stamp") {
    return (
      <div style={styles.badgePreviewWrap}>
        <div
          style={{
            ...styles.badgePreviewSeal,
            ...(preset === "stamp" ? styles.badgePreviewStamp : {}),
            color: textColor,
            background: backgroundColor,
            borderColor: backgroundColor,
          }}
        >
          <span>BEST</span>
          <span>SELLER</span>
          {preset === "award-ribbon" ? (
            <div style={styles.badgePreviewSealTailRow}>
              <span style={{ ...styles.badgePreviewSealTail, borderTopColor: backgroundColor }} />
              <span style={{ ...styles.badgePreviewSealTail, borderTopColor: backgroundColor }} />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.badgePreviewWrap}>
      <div style={{ ...styles.badgePreviewBase, ...style }}>
        BEST SELLER
      </div>
    </div>
  );
}

function SaveBadgePreview({
  prefix,
  textColor,
  backgroundColor,
}: {
  prefix: string;
  textColor: string;
  backgroundColor: string;
}) {
  const label = (prefix || "Save").trim() || "Save";

  return (
    <div style={styles.badgePreviewWrap}>
      <div
        style={{
          ...styles.saveBadgePreview,
          color: textColor,
          background: backgroundColor,
        }}
      >
        {label} 10%
      </div>
    </div>
  );
}

function StylePreview({
  appearance,
}: {
  appearance: BundleAppearanceDraft;
}) {
  const theme = getDesignPresetPreviewTheme(appearance.designPreset, appearance);
  const selectedOfferStyle = getOfferPreviewStyle(appearance, true, theme);
  const secondaryOfferStyle = getOfferPreviewStyle(appearance, false, theme);

  return (
    <div style={styles.stylePreviewShell}>
      <div style={{ ...styles.stylePreviewCard, ...theme.shell }}>
        <div style={{ ...styles.stylePreviewHeader, ...theme.header }}>
          <div>
            <div style={{ ...styles.stylePreviewEyebrow, ...theme.eyebrow }}>
              {appearance.eyebrow || "Bundle and save"}
            </div>
            <div
              style={{
                ...styles.stylePreviewHeading,
                fontSize: `${Math.max(18, Math.min(appearance.headingSize, 26))}px`,
                ...theme.heading,
              }}
            >
              {appearance.heading || "Choose your bundle"}
            </div>
            <div
              style={{
                ...styles.stylePreviewSubheading,
                fontSize: `${Math.max(12, Math.min(appearance.subheadingSize, 22))}px`,
                ...theme.subheading,
              }}
            >
              {appearance.subheading || "Pick the offer that fits your customer best."}
            </div>
          </div>
        </div>
        <div style={styles.stylePreviewOffers}>
          <div style={selectedOfferStyle}>
            <div style={styles.stylePreviewOfferMain}>
              <div style={{ ...styles.stylePreviewThumb, ...theme.thumb }}>x2</div>
              <div style={styles.stylePreviewOfferBody}>
                <div style={{ ...styles.stylePreviewTitleRow, ...theme.titleRow }}>
                  <strong
                    style={{
                      ...styles.stylePreviewOfferTitle,
                      fontSize: `${Math.max(16, Math.min(appearance.offerTitleSize, 24))}px`,
                      ...theme.offerTitle,
                    }}
                  >
                    Offer 2
                  </strong>
                  <div
                    style={{
                      ...styles.saveBadgeInline,
                      background: appearance.saveBadgeColor,
                      color: appearance.saveBadgeText,
                      ...theme.saveBadge,
                    }}
                  >
                    {(appearance.saveBadgePrefix || "Save").trim() || "Save"} 10%
                  </div>
                </div>
                <div style={{ ...styles.stylePreviewOfferCopy, ...theme.offerCopy }}>
                  Current product + 1 more item
                </div>
              </div>
              <div
                style={{
                  ...styles.stylePreviewPrice,
                  fontSize: `${Math.max(18, Math.min(appearance.offerPriceSize, 26))}px`,
                  ...theme.price,
                }}
              >
                {formatMoney(1845)}
              </div>
            </div>
          </div>

          <div style={secondaryOfferStyle}>
            <div style={styles.stylePreviewOfferMain}>
              <div style={{ ...styles.stylePreviewThumb, ...theme.thumb }}>x3</div>
              <div style={styles.stylePreviewOfferBody}>
                <div style={{ ...styles.stylePreviewTitleRow, ...theme.titleRow }}>
                  <strong
                    style={{
                      ...styles.stylePreviewOfferTitle,
                      fontSize: `${Math.max(16, Math.min(appearance.offerTitleSize, 24))}px`,
                      ...theme.offerTitle,
                    }}
                  >
                    Offer 3
                  </strong>
                </div>
                <div style={{ ...styles.stylePreviewOfferCopy, ...theme.offerCopy }}>
                  Current product + 2 more items
                </div>
              </div>
              <div
                style={{
                  ...styles.stylePreviewPrice,
                  fontSize: `${Math.max(18, Math.min(appearance.offerPriceSize, 26))}px`,
                  ...theme.price,
                }}
              >
                {formatMoney(2613)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...styles.stylePreviewButtonRow, ...(theme.buttonRow || {}) }}>
          <div style={{ ...styles.stylePreviewButton, ...theme.button }}>
            Add to cart
          </div>
          <div
            style={{
              ...styles.stylePreviewButton,
              ...styles.stylePreviewSecondaryButton,
              ...(theme.secondaryButton || theme.button),
            }}
          >
            Buy it now
          </div>
        </div>
      </div>
    </div>
  );
}

function TimerPreview({
  appearance,
}: {
  appearance: BundleAppearanceDraft;
}) {
  const value = getTimerPreviewValue(appearance.timerEnd);
  const isExpired = value === "00:00:00" && Boolean(appearance.timerEnd);
  const timerTheme = getTimerPresetTheme(appearance);

  return (
    <div style={styles.badgePreviewWrap}>
      <div
        style={{
          ...styles.timerPreview,
          ...timerTheme.container,
        }}
      >
        <span style={{ ...styles.timerPreviewLabel, ...(timerTheme.label || {}) }}>
          {isExpired
            ? timerTheme.expiredLabel
            : timerTheme.prefix}
        </span>
        <span style={{ ...styles.timerPreviewValue, ...(timerTheme.value || {}) }}>{value}</span>
      </div>
    </div>
  );
}

function getDesignPresetPreviewTheme(
  preset: string,
  appearance: BundleAppearanceDraft,
): DesignPresetPreviewTheme {
  const accent = appearance.primaryColor;
  const text = appearance.textColor;
  const background = `color-mix(in srgb, ${accent} 20%, white)`;
  const selectedBackground = `color-mix(in srgb, ${accent} 30%, white)`;
  const border = `color-mix(in srgb, ${accent} 22%, white)`;
  const radius = `${appearance.offerRadius}px`;
  const buttonBase = `color-mix(in srgb, ${accent} 78%, black)`;

  switch (preset) {
    case "cards":
      return {
        shell: { background: "#f7f8fb", boxShadow: "0 12px 24px rgba(18, 31, 14, 0.08)" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: {
          background: "#ffffff",
          borderColor: `color-mix(in srgb, ${accent} 12%, #d7d7d7)`,
          boxShadow: "0 18px 34px rgba(18, 31, 14, 0.12)",
          transform: "translateY(-2px)",
          borderRadius: radius,
        },
        secondaryOffer: {
          background: "#ffffff",
          borderColor: `color-mix(in srgb, ${accent} 12%, #d7d7d7)`,
          boxShadow: "0 10px 24px rgba(18, 31, 14, 0.08)",
          borderRadius: radius,
        },
        button: {
          background: `linear-gradient(135deg, ${buttonBase} 0%, color-mix(in srgb, ${accent} 88%, black) 100%)`,
          color: "#ffffff",
          borderRadius: "999px",
        },
      };
    case "soft-actions":
      return {
        shell: { background: "#f7f8f7" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: selectedBackground, borderColor: border, borderRadius: radius },
        secondaryOffer: { background, borderColor: border, borderRadius: radius },
        buttonRow: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" },
        button: { background: "#111111", color: "#ffffff", borderRadius: "12px", minHeight: "50px" },
        secondaryButton: { background: "#111111", color: "#ffffff", borderRadius: "12px", minHeight: "50px" },
      };
    case "outline":
      return {
        shell: { background: "#fbfcfb" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: {
          background: `color-mix(in srgb, ${accent} 12%, white)`,
          borderStyle: "solid",
          borderWidth: "2px",
          borderColor: `color-mix(in srgb, ${accent} 70%, black)`,
          borderRadius: radius,
        },
        secondaryOffer: {
          background: "transparent",
          borderStyle: "dashed",
          borderWidth: "2px",
          borderColor: `color-mix(in srgb, ${accent} 42%, white)`,
          borderRadius: radius,
        },
        button: {
          background: "transparent",
          color: text,
          border: `2px solid color-mix(in srgb, ${accent} 72%, black)`,
          borderRadius: "999px",
        },
      };
    case "minimal":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: { fontSize: "10px", padding: "4px 10px" },
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: selectedBackground, borderColor: border, borderRadius: radius, padding: "14px", boxShadow: "none" },
        secondaryOffer: { background, borderColor: border, borderRadius: radius, padding: "14px", boxShadow: "none" },
        button: { background: buttonBase, color: "#ffffff", borderRadius: "12px" },
      };
    case "pills":
      return {
        shell: { background: `color-mix(in srgb, ${accent} 18%, white)` },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: { alignItems: "center" },
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "999px" },
        selectedOffer: { background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 24%, white) 0%, color-mix(in srgb, ${accent} 38%, white) 100%)`, borderColor: border, borderRadius: radius },
        secondaryOffer: { background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 20%, white) 0%, color-mix(in srgb, ${accent} 30%, white) 100%)`, borderColor: border, borderRadius: radius },
        button: { background: buttonBase, color: "#ffffff", borderRadius: "999px" },
      };
    case "split":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: "#ffffff", borderColor: `color-mix(in srgb, ${accent} 14%, #d8d8d8)`, borderRadius: radius, boxShadow: "inset 0 -42px 0 rgba(255,255,255,0.7)" },
        secondaryOffer: { background: "#ffffff", borderColor: `color-mix(in srgb, ${accent} 14%, #d8d8d8)`, borderRadius: radius },
        button: { background: `linear-gradient(90deg, ${buttonBase} 0%, color-mix(in srgb, ${accent} 50%, black) 100%)`, color: "#ffffff", borderRadius: "999px" },
      };
    case "luxury":
      return {
        shell: {
          background: "linear-gradient(135deg, #fff7ea 0%, #f7efe4 100%)",
          boxShadow: "0 14px 32px rgba(49, 34, 15, 0.08)",
        },
        header: {},
        eyebrow: { color: "#6c5840" },
        heading: { color: "#31220f" },
        subheading: { color: "#6c5840" },
        offerTitle: { color: "#31220f", letterSpacing: "0.03em" },
        offerCopy: { color: "#6c5840" },
        titleRow: {},
        price: { color: "#31220f" },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: "linear-gradient(135deg, #fff7ea 0%, #f7efe4 100%)", borderColor: "#c7b79e", borderRadius: radius, boxShadow: "0 20px 40px rgba(49, 34, 15, 0.12)" },
        secondaryOffer: { background: "linear-gradient(135deg, #fff7ea 0%, #f7efe4 100%)", borderColor: "#c7b79e", borderRadius: radius, boxShadow: "0 14px 32px rgba(49, 34, 15, 0.08)" },
        button: { background: "linear-gradient(135deg, #2f2618 0%, #5a4527 100%)", color: "#ffffff", borderRadius: "999px" },
      };
    case "contrast":
      return {
        shell: { background: "#111111", color: "#ffffff" },
        header: { padding: "16px 18px", borderRadius: "18px", background: "#101010" },
        eyebrow: { color: "#ffffff" },
        heading: { color: "#ffffff" },
        subheading: { color: "rgba(255,255,255,0.78)" },
        offerTitle: { color: "#111111" },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: "#111111" },
        saveBadge: { background: "#ffdf39", color: "#111111" },
        thumb: { borderRadius: "12px", border: "2px solid currentColor" },
        selectedOffer: { background: "#111111", color: "#ffffff", borderColor: "#111111", borderWidth: "2px", borderRadius: radius, boxShadow: "none" },
        secondaryOffer: { background: "#ffffff", borderColor: "#111111", borderWidth: "2px", borderRadius: radius },
        button: { background: "#111111", color: "#ffffff", borderRadius: "999px", border: "2px solid #111111" },
      };
    case "compact":
      return {
        shell: { gap: "10px" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: { fontSize: "10px", padding: "4px 8px" },
        thumb: { borderRadius: "10px", width: "36px", height: "36px", fontSize: "10px" },
        selectedOffer: { background: selectedBackground, borderColor: border, borderRadius: radius, padding: "10px" },
        secondaryOffer: { background, borderColor: border, borderRadius: radius, padding: "10px" },
        button: { background: buttonBase, color: "#ffffff", borderRadius: "12px", minHeight: "42px" },
      };
    case "radio":
      return {
        shell: { background: "#ffffff" },
        header: { textAlign: "center" },
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: { alignItems: "center" },
        price: { color: text, textAlign: "right" },
        saveBadge: { background: "#ffffff", color: `color-mix(in srgb, ${accent} 92%, #6a5fd8)`, border: `1px solid color-mix(in srgb, ${accent} 48%, white)` },
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: `color-mix(in srgb, ${accent} 18%, white)`, borderColor: `color-mix(in srgb, ${accent} 88%, #5f54d7)`, borderWidth: "2px", borderRadius: radius, paddingLeft: "24px" },
        secondaryOffer: { background: "#ffffff", borderColor: `color-mix(in srgb, ${accent} 40%, white)`, borderWidth: "2px", borderRadius: radius, paddingLeft: "24px" },
        button: { background: "#ffffff", color: "#141414", borderRadius: "14px", border: "2px solid #2f2f2f" },
      };
    case "catalog":
      return {
        shell: { background: "#fffdf8", borderColor: "#efe6d0" },
        header: { paddingBottom: "8px", borderBottom: `2px solid color-mix(in srgb, ${accent} 55%, #d3b05e)` },
        eyebrow: { color: "#b87900" },
        heading: { color: `color-mix(in srgb, ${accent} 82%, #b87900)` },
        subheading: { color: "#5d5d5d" },
        offerTitle: { color: "#111111" },
        offerCopy: { color: "#5d5d5d" },
        titleRow: {},
        price: { color: "#111111" },
        saveBadge: { display: "none" },
        thumb: { borderRadius: "4px" },
        selectedOffer: { background: "#fffdfa", borderColor: `color-mix(in srgb, ${accent} 76%, #c99120)`, borderWidth: "2px", borderRadius: radius, padding: "10px 12px" },
        secondaryOffer: { background: "#ffffff", borderColor: "#efe6d0", borderWidth: "2px", borderRadius: radius, padding: "10px 12px" },
        button: { background: `color-mix(in srgb, ${accent} 85%, #b87d00)`, color: "#ffffff", borderRadius: radius },
      };
    case "stacked":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: { alignItems: "center" },
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: `color-mix(in srgb, ${accent} 8%, #ffffff)`, borderColor: `color-mix(in srgb, ${accent} 88%, #9a6dff)`, borderWidth: "2px", borderRadius: radius },
        secondaryOffer: { background: "#ffffff", borderColor: "#e5e0f5", borderRadius: radius },
        button: { background: "#161616", color: "#ffffff", borderRadius: "12px" },
      };
    default:
      return {
        shell: { background: "#f7f8f7" },
        header: {},
        eyebrow: { color: accent },
        heading: { color: text },
        subheading: { color: "#5f6b72" },
        offerTitle: { color: text },
        offerCopy: { color: "#5f6b72" },
        titleRow: {},
        price: { color: text },
        saveBadge: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: selectedBackground, borderColor: border, borderRadius: radius },
        secondaryOffer: { background, borderColor: border, borderRadius: radius },
        button: { background: buttonBase, color: "#ffffff", borderRadius: "999px" },
      };
  }
}

function getOfferPreviewStyle(
  appearance: BundleAppearanceDraft,
  selected: boolean,
  theme: DesignPresetPreviewTheme,
): CSSProperties {
  return {
    ...styles.stylePreviewOffer,
    color: appearance.textColor,
    padding: `${Math.max(12, Math.min(appearance.cardPadding, 22))}px`,
    borderRadius: `${appearance.offerRadius}px`,
    background: selected
      ? `color-mix(in srgb, ${appearance.primaryColor} 16%, white)`
      : `color-mix(in srgb, ${appearance.primaryColor} 10%, white)`,
    borderColor: `color-mix(in srgb, ${appearance.primaryColor} 28%, white)`,
    ...(selected ? theme.selectedOffer || {} : theme.secondaryOffer || {}),
  };
}

function getTimerPresetTheme(appearance: BundleAppearanceDraft) {
  const accent = appearance.primaryColor;
  const darkAccent = `color-mix(in srgb, ${accent} 78%, black)`;
  const midAccent = `color-mix(in srgb, ${accent} 55%, black)`;
  const outlineText = `color-mix(in srgb, ${accent} 88%, black)`;
  const preset = TIMER_PRESETS.includes(appearance.timerPreset)
    ? appearance.timerPreset
    : "soft";

  if (preset === "cards") {
    const baseBackground = appearance.timerBackgroundColor || darkAccent;
    const textColor = appearance.timerTextColor || "#ffffff";

    return {
      prefix: appearance.timerPrefix || "Limited time offer",
      expiredLabel: appearance.timerExpiredText || "Offer closed",
      container: {
        borderRadius: "18px",
        padding: "14px 18px",
        minWidth: "260px",
        alignItems: "start",
        textAlign: "left",
        background: `linear-gradient(135deg, ${baseBackground} 0%, color-mix(in srgb, ${baseBackground} 72%, black) 100%)`,
        color: textColor,
        boxShadow: "0 14px 28px rgba(18, 31, 14, 0.18)",
      } satisfies CSSProperties,
      label: {
        color: `color-mix(in srgb, ${textColor} 82%, transparent)`,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      } satisfies CSSProperties,
      value: {
        color: textColor,
      } satisfies CSSProperties,
    };
  }

  if (preset === "outline") {
    const outlineColor = appearance.timerTextColor || outlineText;

    return {
      prefix: appearance.timerPrefix || "Offer closes in",
      expiredLabel: appearance.timerExpiredText || "Last chance ended",
      container: {
        borderRadius: "12px",
        padding: "12px 16px",
        background: "transparent",
        color: outlineColor,
        border: `2px solid ${outlineColor}`,
      } satisfies CSSProperties,
      label: {
        color: outlineColor,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      } satisfies CSSProperties,
      value: {
        color: outlineColor,
      } satisfies CSSProperties,
    };
  }

  return {
    prefix: appearance.timerPrefix || "Offer ends in",
    expiredLabel: appearance.timerExpiredText || "Offer expired",
    container: {
      borderRadius: "999px",
      background: appearance.timerBackgroundColor,
      color: appearance.timerTextColor,
    } satisfies CSSProperties,
    label: {
      color: appearance.timerTextColor,
    } satisfies CSSProperties,
    value: {
      color: appearance.timerTextColor,
    } satisfies CSSProperties,
  };
}

function getTimerPresetPreviewStyle(
  preset: string,
  appearance: BundleAppearanceDraft,
): CSSProperties {
  switch (preset) {
    case "cards":
      return {
        borderRadius: "18px",
      };
    case "outline":
      return {
        borderRadius: "12px",
      };
    default:
      return {
        borderRadius: "999px",
      };
  }
}

function ColorField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <div style={styles.colorRow}>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            ...styles.colorInput,
            ...(disabled ? styles.inputDisabled : {}),
          }}
          disabled={disabled}
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            ...styles.input,
            ...(disabled ? styles.inputDisabled : {}),
          }}
          disabled={disabled}
        />
      </div>
    </label>
  );
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>
        {label} ({value})
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
    gap: "20px",
    alignItems: "start",
  },
  mainColumn: { display: "grid", gap: "20px" },
  sidebar: { display: "grid", gap: "20px", alignSelf: "start" },
  card: {
    padding: "20px",
    border: "1px solid #d8d8d8",
    borderRadius: "18px",
    background: "#ffffff",
  },
  subcard: {
    padding: "16px",
    border: "1px solid #e6e6e6",
    borderRadius: "14px",
    background: "#fafafa",
  },
  cardTitle: { margin: "0 0 16px", fontSize: "20px" },
  sectionCopy: {
    margin: "0 0 16px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#5f6b72",
  },
  subcardTitle: { margin: 0, fontSize: "16px" },
  subcardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  field: { display: "grid", gap: "6px" },
  checkboxField: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    minHeight: "42px",
  },
  label: { fontWeight: 600, fontSize: "14px" },
  mutedLabel: {
    fontWeight: 600,
    fontSize: "12px",
    color: "#687076",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
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
  stack: { display: "grid", gap: "12px" },
  submitButton: {
    width: "100%",
    minHeight: "48px",
    borderRadius: "999px",
    border: "none",
    background: "#1d3124",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "44px",
    padding: "0 16px",
    borderRadius: "12px",
    border: "1px solid #cfcfcf",
    background: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "end",
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
  tabBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
  tabButton: {
    minHeight: "42px",
    padding: "0 16px",
    borderRadius: "999px",
    border: "1px solid #d4d4d4",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 600,
  },
  tabButtonActive: {
    background: "#1d3124",
    color: "#ffffff",
    borderColor: "#1d3124",
  },
  colorRow: {
    display: "grid",
    gridTemplateColumns: "52px minmax(0, 1fr)",
    gap: "10px",
    alignItems: "center",
  },
  colorInput: {
    width: "52px",
    height: "44px",
    padding: "4px",
    borderRadius: "12px",
    border: "1px solid #cfcfcf",
    background: "#ffffff",
  },
  pricingPanel: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    margin: "16px 0",
  },
  priceCard: {
    display: "grid",
    gap: "6px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e4e4e4",
    background: "#ffffff",
  },
  priceValue: {
    fontSize: "22px",
    lineHeight: 1.1,
  },
  previewCard: {
    marginTop: "14px",
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e8e8e8",
    background: "#ffffff",
  },
  bestSellerPill: {
    padding: "6px 10px",
    borderRadius: "999px",
    background: "#1d3124",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 700,
  },
  badgePreviewCard: {
    marginTop: "14px",
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e8e8e8",
    background: "#ffffff",
  },
  badgePreviewWrap: {
    minHeight: "96px",
    display: "grid",
    placeItems: "center",
    padding: "10px",
    background: "#f6f7f8",
    borderRadius: "14px",
  },
  badgePreviewImage: {
    display: "block",
    width: "96px",
    maxWidth: "100%",
    height: "96px",
    objectFit: "contain",
  },
  badgePreviewImageRibbon: {
    width: "168px",
    height: "56px",
  },
  badgePreviewImageBanner: {
    width: "150px",
    height: "76px",
  },
  badgePreviewImageSpeech: {
    width: "118px",
    height: "86px",
  },
  badgePreviewImageSeal: {
    width: "94px",
    height: "94px",
  },
  badgePreviewMissing: {
    color: "#6b7280",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.02em",
  },
  badgePreviewBase: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "42px",
    padding: "0 16px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  badgePreviewRibbon: {
    borderRadius: "6px",
    clipPath: "polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)",
  },
  badgePreviewBanner: {
    borderRadius: "4px",
    transform: "skewX(-12deg)",
  },
  badgePreviewSpeech: {
    position: "relative",
    borderRadius: "14px",
    border: "3px solid currentColor",
    background: "#ffffff",
  },
  badgePreviewSeal: {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: "2px",
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    fontSize: "13px",
    fontWeight: 800,
    textTransform: "uppercase",
    lineHeight: 1,
  },
  saveBadgePreview: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "34px",
    padding: "0 14px",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  stylePreviewShell: {
    padding: "8px 0",
  },
  stylePreviewCard: {
    display: "grid",
    gap: "14px",
    padding: "16px",
    borderRadius: "20px",
    border: "1px solid #d9e1d9",
    background: "#f7f8f7",
  },
  stylePreviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "start",
    gap: "12px",
    flexWrap: "wrap",
  },
  stylePreviewOffers: {
    display: "grid",
    gap: "10px",
  },
  stylePreviewEyebrow: {
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: "4px",
  },
  stylePreviewHeading: {
    fontWeight: 800,
    lineHeight: 1.1,
  },
  stylePreviewOffer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    border: "1px solid #d9e1d9",
  },
  stylePreviewOfferMain: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr) auto",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  },
  stylePreviewOfferBody: {
    display: "grid",
    gap: "4px",
    minWidth: 0,
  },
  stylePreviewOfferTitle: {
    fontWeight: 800,
    lineHeight: 1.1,
  },
  stylePreviewOfferCopy: {
    fontSize: "13px",
    lineHeight: 1.35,
  },
  stylePreviewTitleRow: {
    display: "flex",
    alignItems: "start",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
  },
  stylePreviewThumb: {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.08)",
    display: "grid",
    placeItems: "center",
    fontSize: "11px",
    fontWeight: 800,
  },
  stylePreviewPrice: {
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  stylePreviewButton: {
    minHeight: "46px",
    display: "grid",
    placeItems: "center",
    padding: "0 18px",
    fontSize: "14px",
    fontWeight: 800,
    border: "1px solid transparent",
  },
  stylePreviewButtonRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "8px",
  },
  stylePreviewSecondaryButton: {
    minHeight: "46px",
  },
  stylePreviewSubheading: {
    fontSize: "13px",
    color: "#5f6b72",
    lineHeight: 1.4,
  },
  saveBadgeInline: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "28px",
    padding: "0 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  timerPreview: {
    display: "grid",
    gap: "6px",
    minWidth: "220px",
    padding: "14px 18px",
    borderRadius: "14px",
    textAlign: "center",
  },
  timerPreviewLabel: {
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    opacity: 0.9,
  },
  timerPreviewValue: {
    fontSize: "28px",
    fontWeight: 800,
    letterSpacing: "0.04em",
    lineHeight: 1,
  },
  badgePreviewStamp: {
    background: "#ffffff",
    borderWidth: "5px",
    borderStyle: "solid",
    boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.85)",
  },
  badgePreviewSealTailRow: {
    position: "absolute",
    bottom: "-22px",
    display: "flex",
    gap: "10px",
  },
  badgePreviewSealTail: {
    width: 0,
    height: 0,
    borderLeft: "12px solid transparent",
    borderRight: "12px solid transparent",
    borderTop: "28px solid #000000",
  },
  offerItemCard: {
    display: "grid",
    gap: "12px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e8e8e8",
    background: "#ffffff",
  },
  offerItemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  offerItemTitle: {
    margin: 0,
    fontSize: "15px",
  },
  offerItemMeta: {
    fontSize: "13px",
    color: "#5f6b72",
  },
  productPickerRow: {
    display: "flex",
    gap: "12px",
    alignItems: "end",
    flexWrap: "wrap",
  },
  snapshotBox: {
    display: "grid",
    gap: "4px",
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#f3f6f3",
    border: "1px solid #d9e2d9",
  },
  hintBox: {
    padding: "12px 14px",
    borderRadius: "12px",
    background: "#fff8e8",
    border: "1px solid #f1dfb0",
    color: "#745e1a",
    fontSize: "13px",
  },
  variantPreviewRow: {
    display: "grid",
    gap: "6px",
  },
};
