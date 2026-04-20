import { useState, type CSSProperties } from "react";
import { Form } from "react-router";

import type {
  BundleAppearanceDraft,
  BundleDraftPayload,
  BundleItemDraft,
  BundleOfferDraft,
} from "../utils/bundle-configurator";
import {
  MAX_ITEMS,
  createDefaultItem,
  createDefaultOffer,
  ensureLength,
} from "../utils/bundle-configurator";

type Props = {
  draft: BundleDraftPayload;
  submitLabel: string;
  isSubmitting: boolean;
  showDeleteAction?: boolean;
  aside?: React.ReactNode;
};

type TabId = "offers" | "products" | "style" | "timer" | "discounts";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "offers", label: "Offers" },
  { id: "products", label: "Products" },
  { id: "style", label: "Style" },
  { id: "timer", label: "Timer" },
  { id: "discounts", label: "Discounts" },
];

const PRESETS = [
  "soft",
  "cards",
  "outline",
  "minimal",
  "pills",
  "split",
  "luxury",
  "contrast",
  "compact",
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

export function BundleConfiguratorForm({
  draft,
  submitLabel,
  isSubmitting,
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

  const visibleItems = items.slice(0, itemCount);
  const visibleOffers = offers.slice(0, itemCount);

  return (
    <FormShell
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
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      updateItem={updateItem}
      updateOffer={updateOffer}
      updateAppearance={updateAppearance}
      showDeleteAction={showDeleteAction}
      aside={aside}
    />
  );
}

function FormShell(props: {
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
  isSubmitting: boolean;
  submitLabel: string;
  activeTab: TabId;
  setActiveTab: (value: TabId) => void;
  updateItem: (index: number, patch: Partial<BundleItemDraft>) => void;
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
  updateAppearance: <K extends keyof BundleAppearanceDraft>(
    key: K,
    value: BundleAppearanceDraft[K],
  ) => void;
  showDeleteAction?: boolean;
  aside?: React.ReactNode;
}) {
  const {
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
    isSubmitting,
    submitLabel,
    activeTab,
    setActiveTab,
    updateItem,
    updateOffer,
    updateAppearance,
    showDeleteAction,
    aside,
  } = props;

  return (
    <Form method="post">
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
            <h3 style={styles.cardTitle}>Bundle settings</h3>
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
                <span style={styles.label}>Status</span>
                <select
                  name="status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value === "ACTIVE" ? "ACTIVE" : "DRAFT")
                  }
                  style={styles.input}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                </select>
              </label>

              <label style={styles.field}>
                <span style={styles.label}>Number of articles</span>
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
              <h3 style={styles.cardTitle}>Offers</h3>
              <div style={styles.stack}>
                {offers.map((offer, index) => (
                  <div key={index} style={styles.subcard}>
                    <h4 style={styles.subcardTitle}>
                      Offer {index + 1} ({index + 1} article{index > 0 ? "s" : ""})
                    </h4>
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
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "products" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Products</h3>
              <div style={styles.stack}>
                {items.map((item, index) => (
                  <div key={index} style={styles.subcard}>
                    <h4 style={styles.subcardTitle}>Article {index + 1}</h4>
                    <div style={styles.gridTwo}>
                      <label style={styles.field}>
                        <span style={styles.label}>Label</span>
                        <input
                          value={item.label}
                          onChange={(event) =>
                            updateItem(index, { label: event.target.value })
                          }
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.field}>
                        <span style={styles.label}>Product handle</span>
                        <input
                          value={item.productHandle}
                          onChange={(event) =>
                            updateItem(index, { productHandle: event.target.value })
                          }
                          style={styles.input}
                        />
                      </label>

                      <label style={styles.checkboxField}>
                        <input
                          type="checkbox"
                          checked={item.allowVariantSelection}
                          onChange={(event) =>
                            updateItem(index, {
                              allowVariantSelection: event.target.checked,
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
                            updateItem(index, {
                              showVariantThumbnails: event.target.checked,
                            })
                          }
                        />
                        <span>Show variant thumbnails</span>
                      </label>
                    </div>
                  </div>
                ))}
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
                    {PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {preset}
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
            </div>
          ) : null}

          {activeTab === "timer" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Timer</h3>
              <div style={styles.gridTwo}>
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
                />

                <ColorField
                  label="Timer text"
                  value={appearance.timerTextColor}
                  onChange={(value) => updateAppearance("timerTextColor", value)}
                />
              </div>
            </div>
          ) : null}

          {activeTab === "discounts" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Discounts & badges</h3>
              <div style={styles.gridTwo}>
                <ColorField
                  label="Best seller badge background"
                  value={appearance.bestSellerBadgeColor}
                  onChange={(value) =>
                    updateAppearance("bestSellerBadgeColor", value)
                  }
                />
                <ColorField
                  label="Best seller badge text"
                  value={appearance.bestSellerBadgeText}
                  onChange={(value) =>
                    updateAppearance("bestSellerBadgeText", value)
                  }
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

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      <div style={styles.colorRow}>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={styles.colorInput}
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={styles.input}
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
  subcardTitle: { margin: "0 0 12px", fontSize: "16px" },
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
  input: {
    minHeight: "44px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #cfcfcf",
    fontSize: "14px",
    background: "#ffffff",
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
};
