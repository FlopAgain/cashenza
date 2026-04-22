import { useState, type CSSProperties } from "react";
import { Form } from "react-router";

import { BEST_SELLER_PNG_BADGE_ASSETS } from "../constants/best-seller-png-badges";
import { EFFECTS_PRESETS } from "../constants/bundle-effects-presets";
import { STYLE_PRESETS, STYLE_PRESET_LABELS } from "../constants/bundle-style-presets";
import type { BundleAppearanceDraft, ProductSnapshotDraft } from "../utils/bundle-configurator";
import type { VolumeOfferDraft } from "./volume-bundle-form";

type TabId = "style" | "timer" | "effects" | "discounts";

type Props = {
  product: ProductSnapshotDraft;
  appearanceDraft: BundleAppearanceDraft;
  offersDraft: VolumeOfferDraft[];
  hasBestSellerDraft: boolean;
  bestSellerIndexDraft: number;
  submitLabel: string;
  isSubmitting: boolean;
  formAction: string;
};

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
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
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

function getEffectiveUnitPrice(product: ProductSnapshotDraft) {
  const variant =
    product.variants.find((entry) => entry.availableForSale) || product.variants[0];
  return Number(variant?.price || 0);
}

function getDiscountedTotal(unitPrice: number, offer: VolumeOfferDraft) {
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

export function VolumeBundleStyleForm({
  product,
  appearanceDraft,
  offersDraft,
  hasBestSellerDraft,
  bestSellerIndexDraft,
  submitLabel,
  isSubmitting,
  formAction,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("style");
  const [appearance, setAppearance] = useState<BundleAppearanceDraft>(appearanceDraft);
  const [offers, setOffers] = useState<VolumeOfferDraft[]>(offersDraft);
  const [hasBestSeller, setHasBestSeller] = useState(hasBestSellerDraft);
  const [bestSellerIndex, setBestSellerIndex] = useState(bestSellerIndexDraft);
  const unitPrice = getEffectiveUnitPrice(product);
  const isBestSellerPngPresetSelected = appearance.bestSellerPngBadgePreset !== "none";
  const isOutlineTimerPreset = appearance.timerPreset === "outline";
  const isFadeInEffectsPreset = appearance.effectsPreset === "fade in";
  const isSlideEffectsPreset = appearance.effectsPreset === "slide";

  function updateAppearance<K extends keyof BundleAppearanceDraft>(
    key: K,
    value: BundleAppearanceDraft[K],
  ) {
    setAppearance((current) => ({ ...current, [key]: value }));
  }

  function updateOffer(index: number, patch: Partial<VolumeOfferDraft>) {
    setOffers((current) =>
      current.map((offer, offerIndex) =>
        offerIndex === index ? { ...offer, ...patch } : offer,
      ),
    );
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

  return (
    <Form method="post" action={formAction}>
      <input type="hidden" name="appearanceJson" value={JSON.stringify(appearance)} />
      <input type="hidden" name="offersJson" value={JSON.stringify(offers)} />
      <input type="hidden" name="hasBestSeller" value={hasBestSeller ? "true" : "false"} />
      <input type="hidden" name="bestSellerIndex" value={bestSellerIndex} />

      <div style={styles.layout}>
        <section style={styles.mainColumn}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Volume bundle style editor</h3>
            <p style={styles.copy}>
              Customize the storefront presentation for <strong>{product.title}</strong>:
              style preset, timer behavior, best seller badge, save badge, and offer-by-offer discount copy.
            </p>
            <div style={styles.tabRow}>
              {[
                { id: "style", label: "Style" },
                { id: "timer", label: "Timer" },
                { id: "effects", label: "Effects" },
                { id: "discounts", label: "Discounts" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabId)}
                  style={{
                    ...styles.tabButton,
                    ...(activeTab === tab.id ? styles.tabButtonActive : {}),
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "style" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Style</h3>
              <div style={styles.gridTwo}>
                <label style={styles.field}>
                  <span style={styles.label}>Design preset</span>
                  <select
                    value={appearance.designPreset}
                    onChange={(event) => updateAppearance("designPreset", event.target.value)}
                    style={styles.input}
                  >
                    {STYLE_PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {STYLE_PRESET_LABELS[preset] || preset}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Primary color</span>
                  <ColorInput
                    value={appearance.primaryColor}
                    onChange={(value) => updateAppearance("primaryColor", value)}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Text color</span>
                  <ColorInput
                    value={appearance.textColor}
                    onChange={(value) => updateAppearance("textColor", value)}
                  />
                </label>

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
                    onChange={(event) => updateAppearance("subheading", event.target.value)}
                    style={styles.input}
                  />
                </label>

                <RangeField
                  label="Heading size"
                  value={appearance.headingSize}
                  min={18}
                  max={40}
                  onChange={(value) => updateAppearance("headingSize", value)}
                />
                <RangeField
                  label="Subheading size"
                  value={appearance.subheadingSize}
                  min={12}
                  max={24}
                  onChange={(value) => updateAppearance("subheadingSize", value)}
                />
                <RangeField
                  label="Offer title size"
                  value={appearance.offerTitleSize}
                  min={14}
                  max={28}
                  onChange={(value) => updateAppearance("offerTitleSize", value)}
                />
                <RangeField
                  label="Offer price size"
                  value={appearance.offerPriceSize}
                  min={16}
                  max={30}
                  onChange={(value) => updateAppearance("offerPriceSize", value)}
                />
                <RangeField
                  label="Offer spacing"
                  value={appearance.cardGap}
                  min={8}
                  max={28}
                  onChange={(value) => updateAppearance("cardGap", value)}
                />
                <RangeField
                  label="Offer padding"
                  value={appearance.cardPadding}
                  min={12}
                  max={28}
                  onChange={(value) => updateAppearance("cardPadding", value)}
                />
                <RangeField
                  label="Border radius"
                  value={appearance.offerRadius}
                  min={0}
                  max={32}
                  onChange={(value) => updateAppearance("offerRadius", value)}
                />
              </div>

              <div style={styles.previewCard}>
                <span style={styles.mutedLabel}>Style preview</span>
                <StylePreview
                  appearance={appearance}
                  offers={offers}
                  hasBestSeller={hasBestSeller}
                  bestSellerIndex={bestSellerIndex}
                  product={product}
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
                    onChange={(event) => updateAppearance("showTimer", event.currentTarget.checked)}
                  />
                  <span>Show urgency timer</span>
                </label>

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
                    onChange={(event) => updateAppearance("timerPrefix", event.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Expired text</span>
                  <input
                    value={appearance.timerExpiredText}
                    onChange={(event) => updateAppearance("timerExpiredText", event.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>
                    {isOutlineTimerPreset ? "Timer text and outline" : "Timer text"}
                  </span>
                  <ColorInput
                    value={appearance.timerTextColor}
                    onChange={(value) => updateAppearance("timerTextColor", value)}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Timer background</span>
                  <ColorInput
                    value={appearance.timerBackgroundColor}
                    onChange={(value) => updateAppearance("timerBackgroundColor", value)}
                    disabled={isOutlineTimerPreset}
                  />
                </label>
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
                Choose whether the bundle fades in on load or appears instantly.
                This preset is intentionally kept simple for the first release.
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
                <label style={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={hasBestSeller}
                    onChange={(event) => setHasBestSeller(event.currentTarget.checked)}
                  />
                  <span>Enable best seller highlight</span>
                </label>

                {hasBestSeller ? (
                  <label style={styles.field}>
                    <span style={styles.label}>Best seller offer</span>
                    <select
                      value={bestSellerIndex}
                      onChange={(event) => setBestSellerIndex(Number(event.target.value))}
                      style={styles.input}
                    >
                      {offers.map((offer, index) => (
                        <option key={offer.quantity} value={index + 1}>
                          Offer {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label style={styles.field}>
                  <span style={styles.label}>Best seller PNG badge preset</span>
                  <select
                    value={appearance.bestSellerPngBadgePreset}
                    onChange={(event) => updateAppearance("bestSellerPngBadgePreset", event.target.value)}
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
                    onChange={(event) => updateAppearance("bestSellerBadgePreset", event.target.value)}
                    style={styles.input}
                    disabled={isBestSellerPngPresetSelected}
                  >
                    {BEST_SELLER_BADGE_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Best seller badge background</span>
                  <ColorInput
                    value={appearance.bestSellerBadgeColor}
                    onChange={(value) => updateAppearance("bestSellerBadgeColor", value)}
                    disabled={isBestSellerPngPresetSelected}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Best seller badge text</span>
                  <ColorInput
                    value={appearance.bestSellerBadgeText}
                    onChange={(value) => updateAppearance("bestSellerBadgeText", value)}
                    disabled={isBestSellerPngPresetSelected}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Save badge background</span>
                  <ColorInput
                    value={appearance.saveBadgeColor}
                    onChange={(value) => updateAppearance("saveBadgeColor", value)}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Save badge text</span>
                  <ColorInput
                    value={appearance.saveBadgeText}
                    onChange={(value) => updateAppearance("saveBadgeText", value)}
                  />
                </label>

                <label style={styles.field}>
                  <span style={styles.label}>Save badge label</span>
                  <input
                    value={appearance.saveBadgePrefix}
                    onChange={(event) => updateAppearance("saveBadgePrefix", event.target.value)}
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

          <div style={styles.actions}>
            <button type="submit" style={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
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
                <div style={styles.metaText}>Offers using current product quantity ladder</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </Form>
  );
}

function ColorInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={styles.colorInputRow}>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={styles.colorSwatch}
        disabled={disabled}
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...styles.input, ...(disabled ? styles.inputDisabled : {}) }}
        disabled={disabled}
      />
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>
        {label} · {value}px
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
  };

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
      <div style={{ ...styles.badgePreviewBase, ...style }}>BEST SELLER</div>
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

function InlineBestSellerBadge({
  appearance,
}: {
  appearance: BundleAppearanceDraft;
}) {
  const pngPreset = appearance.bestSellerPngBadgePreset;

  if (pngPreset !== "none") {
    const pngAsset = BEST_SELLER_PNG_BADGE_ASSETS[pngPreset];

    if (!pngAsset) return null;

    return (
      <img
        src={pngAsset}
        alt="Best seller"
        style={{
          ...styles.inlineBestSellerBadgeImage,
          ...(pngPreset === "orange-ribbon"
            ? styles.inlineBestSellerBadgeImageRibbon
            : pngPreset === "pink-banner"
              ? styles.inlineBestSellerBadgeImageBanner
              : pngPreset === "red-speech"
                ? styles.inlineBestSellerBadgeImageSpeech
                : pngPreset === "blue-award" ||
                    pngPreset === "gold-award" ||
                    pngPreset === "red-stamp"
                  ? styles.inlineBestSellerBadgeImageSeal
                  : {}),
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...styles.saveBadgeInline,
        background: appearance.bestSellerBadgeColor,
        color: appearance.bestSellerBadgeText,
      }}
    >
      Best seller
    </div>
  );
}

function StylePreview({
  appearance,
  offers,
  hasBestSeller,
  bestSellerIndex,
  product,
}: {
  appearance: BundleAppearanceDraft;
  offers: VolumeOfferDraft[];
  hasBestSeller: boolean;
  bestSellerIndex: number;
  product: ProductSnapshotDraft;
}) {
  const theme = getDesignPresetPreviewTheme(appearance.designPreset, appearance);
  const previewVariant =
    product.variants.find((entry) => entry.availableForSale) || product.variants[0] || null;
  const unitPrice = getEffectiveUnitPrice(product);
  const previewSelectLabel = [
    product.title,
    previewVariant ? `: ${previewVariant.title}` : "",
    ` - ${formatMoney(unitPrice)}`,
    previewVariant && !previewVariant.availableForSale ? " | Sold out" : "",
  ].join("");

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

          {appearance.showTimer ? <TimerPreview appearance={appearance} compact /> : null}
        </div>

        <div style={styles.stylePreviewOffers}>
          {offers.slice(0, 3).map((offer, index) => {
            const pricing = getDiscountedTotal(unitPrice, offer);
            const isSelected = index === 0;
            const hasDiscount = pricing.discountedTotal < pricing.initialTotal;
            const saveLabel =
              offer.discountType === "PERCENTAGE"
                ? `${(appearance.saveBadgePrefix || "Save").trim() || "Save"} ${offer.discountValue}%`
                : `${(appearance.saveBadgePrefix || "Save").trim() || "Save"} ${formatMoney(
                    pricing.initialTotal - pricing.discountedTotal,
                  )}`;

            return (
              <div
                key={offer.quantity}
                style={getOfferPreviewStyle(appearance, isSelected, theme)}
              >
                <div style={styles.stylePreviewOfferMain}>
                  <div style={styles.stylePreviewThumbWrap}>
                    {product.featuredImage ? (
                      <img
                        src={product.featuredImage}
                        alt={product.title}
                        style={{ ...styles.stylePreviewThumbImage, ...theme.thumb }}
                      />
                    ) : (
                      <div style={{ ...styles.stylePreviewThumb, ...theme.thumb }}>
                        x{offer.quantity}
                      </div>
                    )}
                    <span style={styles.stylePreviewQtyChip}>x{offer.quantity}</span>
                  </div>
                  <div style={styles.stylePreviewOfferBody}>
                    <div style={{ ...styles.stylePreviewTitleRow, ...theme.titleRow }}>
                      <strong
                        style={{
                          ...styles.stylePreviewOfferTitle,
                          fontSize: `${Math.max(16, Math.min(appearance.offerTitleSize, 24))}px`,
                          ...theme.offerTitle,
                        }}
                      >
                        {offer.title || `Offer ${index + 1}`}
                      </strong>
                      {hasBestSeller && bestSellerIndex === index + 1 ? (
                        <InlineBestSellerBadge appearance={appearance} />
                      ) : null}
                    </div>
                    <div style={styles.stylePreviewPriceRow}>
                      {hasDiscount ? (
                        <span style={styles.stylePreviewCompare}>
                          {formatMoney(pricing.initialTotal)}
                        </span>
                      ) : null}
                      <div
                        style={{
                          ...styles.stylePreviewPrice,
                          fontSize: `${Math.max(18, Math.min(appearance.offerPriceSize, 26))}px`,
                          ...theme.price,
                        }}
                      >
                        {formatMoney(pricing.discountedTotal)}
                      </div>
                      {hasDiscount ? (
                        <div
                          style={{
                            ...styles.saveBadgeInline,
                            background: appearance.saveBadgeColor,
                            color: appearance.saveBadgeText,
                          }}
                        >
                          {saveLabel}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ ...styles.stylePreviewOfferCopy, ...theme.offerCopy }}>
                      {offer.subtitle || `${product.title} x${offer.quantity}`}
                    </div>
                  </div>
                </div>

                {isSelected ? (
                  <div style={styles.stylePreviewSelectedDetails}>
                    <div style={styles.stylePreviewSelectedMedia}>
                      {product.featuredImage ? (
                        <img
                          src={product.featuredImage}
                          alt={product.title}
                          style={styles.stylePreviewSelectedImage}
                        />
                      ) : (
                        <div style={styles.stylePreviewSelectedImagePlaceholder}>Image</div>
                      )}
                    </div>
                    <div style={styles.stylePreviewSelectBox}>
                      <span style={styles.stylePreviewSelectText}>{previewSelectLabel}</span>
                      <span style={styles.stylePreviewSelectChevron}>v</span>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ ...styles.stylePreviewButtonRow, ...(theme.buttonRow || {}) }}>
          <div style={{ ...styles.stylePreviewButton, ...theme.button }}>Add to cart</div>
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
  compact,
}: {
  appearance: BundleAppearanceDraft;
  compact?: boolean;
}) {
  const value = getTimerPreviewValue(appearance.timerEnd);
  const isExpired = value === "00:00:00" && Boolean(appearance.timerEnd);
  const timerTheme = getTimerPresetTheme(appearance);

  return (
    <div style={compact ? undefined : styles.badgePreviewWrap}>
      <div
        style={{
          ...styles.timerPreview,
          ...(compact ? styles.timerPreviewCompact : {}),
          ...timerTheme.container,
        }}
      >
        <span style={{ ...styles.timerPreviewLabel, ...(timerTheme.label || {}) }}>
          {isExpired ? timerTheme.expiredLabel : timerTheme.prefix}
        </span>
        <span style={{ ...styles.timerPreviewValue, ...(timerTheme.value || {}) }}>{value}</span>
      </div>
    </div>
  );
}

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
  thumb: CSSProperties;
  selectedOffer: CSSProperties;
  secondaryOffer: CSSProperties;
  buttonRow?: CSSProperties;
  button: CSSProperties;
  secondaryButton?: CSSProperties;
};

function getDesignPresetPreviewTheme(
  preset: string,
  appearance: BundleAppearanceDraft,
): DesignPresetPreviewTheme {
  const accent = appearance.primaryColor;
  const text = appearance.textColor;
  const buttonBase = `color-mix(in srgb, ${accent} 78%, black)`;

  switch (preset) {
    case "soft-actions":
      return {
        shell: { background: "#f6f7f3" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: {},
        selectedOffer: {},
        secondaryOffer: {},
        buttonRow: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
        button: { background: "#111111", color: "#ffffff", borderRadius: "12px" },
        secondaryButton: { background: "#111111", color: "#ffffff", borderRadius: "12px" },
      };
    case "cards":
      return {
        shell: { background: "#ffffff", boxShadow: "0 12px 24px rgba(18,31,14,0.08)" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: {},
        selectedOffer: { boxShadow: "0 12px 24px rgba(18,31,14,0.12)" },
        secondaryOffer: {},
        button: { background: buttonBase, color: "#ffffff" },
        secondaryButton: { background: buttonBase, color: "#ffffff" },
      };
    case "outline":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { border: `2px solid color-mix(in srgb, ${accent} 34%, white)` },
        selectedOffer: { borderWidth: "2px", borderStyle: "solid" },
        secondaryOffer: { borderWidth: "2px", borderStyle: "dashed" },
        button: { background: "transparent", color: text, border: `2px solid ${buttonBase}` },
        secondaryButton: { background: "transparent", color: text, border: `2px solid ${buttonBase}` },
      };
    case "minimal":
      return {
        shell: { background: "#f7f8f7" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: {},
        secondaryOffer: {},
        button: { background: buttonBase, color: "#ffffff", borderRadius: "12px" },
        secondaryButton: { background: buttonBase, color: "#ffffff", borderRadius: "12px" },
      };
    case "pills":
      return {
        shell: { background: "#f7f8f7" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { borderRadius: "999px" },
        selectedOffer: { borderRadius: "999px" },
        secondaryOffer: { borderRadius: "999px" },
        button: { background: buttonBase, color: "#ffffff", borderRadius: "999px" },
        secondaryButton: { background: buttonBase, color: "#ffffff", borderRadius: "999px" },
      };
    case "split":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: {},
        selectedOffer: { background: `color-mix(in srgb, ${accent} 32%, white)` },
        secondaryOffer: { background: `color-mix(in srgb, ${accent} 18%, white)` },
        button: { background: buttonBase, color: "#ffffff" },
        secondaryButton: { background: buttonBase, color: "#ffffff" },
      };
    case "luxury":
      return {
        shell: { background: "#f6f0e7" },
        header: {},
        eyebrow: { letterSpacing: "0.14em" },
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: { letterSpacing: "0.03em" },
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: {},
        selectedOffer: { boxShadow: "0 18px 34px rgba(49,34,15,0.12)" },
        secondaryOffer: { boxShadow: "0 12px 24px rgba(49,34,15,0.08)" },
        button: { background: "linear-gradient(135deg, #2f2618 0%, #5a4527 100%)", color: "#ffffff" },
        secondaryButton: { background: "linear-gradient(135deg, #2f2618 0%, #5a4527 100%)", color: "#ffffff" },
      };
    case "contrast":
      return {
        shell: { background: "#ffffff" },
        header: { background: "#101010", color: "#ffffff", padding: "16px", borderRadius: "18px" },
        eyebrow: { color: "#ffffff" },
        heading: { color: "#ffffff" },
        subheading: { color: "#ffffff", opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { border: "2px solid currentColor" },
        selectedOffer: { background: "#111111", color: "#ffffff", borderColor: "#111111" },
        secondaryOffer: { background: "#ffffff", color: "#111111", borderColor: "#111111" },
        button: { background: "#111111", color: "#ffffff", border: "2px solid #111111" },
        secondaryButton: { background: "#111111", color: "#ffffff", border: "2px solid #111111" },
      };
    case "compact":
      return {
        shell: { background: "#f7f8f7" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { width: "36px", height: "36px", borderRadius: "10px" },
        selectedOffer: {},
        secondaryOffer: {},
        button: { background: buttonBase, color: "#ffffff", borderRadius: "12px", minHeight: "42px" },
        secondaryButton: { background: buttonBase, color: "#ffffff", borderRadius: "12px", minHeight: "42px" },
      };
    case "radio":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { background: `color-mix(in srgb, ${accent} 18%, white)`, borderWidth: "2px" },
        secondaryOffer: { background: "#ffffff", borderWidth: "2px" },
        button: { background: "#ffffff", color: "#141414", border: "2px solid #2f2f2f" },
        secondaryButton: { background: "#ffffff", color: "#141414", border: "2px solid #2f2f2f" },
      };
    case "catalog":
      return {
        shell: { background: "#fffdfa" },
        header: { borderBottom: `2px solid color-mix(in srgb, ${accent} 55%, #d3b05e)`, paddingBottom: "8px" },
        eyebrow: {},
        heading: { color: `color-mix(in srgb, ${accent} 82%, #b87900)` },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { borderRadius: "4px" },
        selectedOffer: { borderColor: `color-mix(in srgb, ${accent} 76%, #c99120)` },
        secondaryOffer: { borderColor: "#efe6d0" },
        button: { background: `color-mix(in srgb, ${accent} 85%, #b87d00)`, color: "#ffffff", borderRadius: "0" },
        secondaryButton: { background: `color-mix(in srgb, ${accent} 85%, #b87d00)`, color: "#ffffff", borderRadius: "0" },
      };
    case "stacked":
      return {
        shell: { background: "#ffffff" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: { borderRadius: "12px" },
        selectedOffer: { borderWidth: "2px" },
        secondaryOffer: {},
        button: { background: "#161616", color: "#ffffff", borderRadius: "12px" },
        secondaryButton: { background: "#161616", color: "#ffffff", borderRadius: "12px" },
      };
    default:
      return {
        shell: { background: "#f7f8f7" },
        header: {},
        eyebrow: {},
        heading: { color: text },
        subheading: { color: text, opacity: 0.72 },
        offerTitle: {},
        offerCopy: {},
        titleRow: {},
        price: {},
        thumb: {},
        selectedOffer: {},
        secondaryOffer: {},
        button: { background: buttonBase, color: "#ffffff" },
        secondaryButton: { background: buttonBase, color: "#ffffff" },
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
  const preset = TIMER_PRESETS.includes(appearance.timerPreset)
    ? appearance.timerPreset
    : "soft";

  if (preset === "cards") {
    return {
      container: {
        background: `linear-gradient(135deg, color-mix(in srgb, ${appearance.timerBackgroundColor} 88%, black) 0%, color-mix(in srgb, ${appearance.timerBackgroundColor} 58%, black) 100%)`,
        color: appearance.timerTextColor,
        borderRadius: "18px",
        boxShadow: "0 14px 28px rgba(18,31,14,0.18)",
      },
      label: {
        color: "rgba(255,255,255,0.82)",
      },
      value: {
        color: appearance.timerTextColor,
      },
      prefix: appearance.timerPrefix || "Limited time offer",
      expiredLabel: appearance.timerExpiredText || "Offer closed",
    };
  }

  if (preset === "outline") {
    return {
      container: {
        background: "transparent",
        color: appearance.timerTextColor,
        borderRadius: "12px",
        border: `2px solid ${appearance.timerTextColor}`,
      },
      label: {
        color: appearance.timerTextColor,
      },
      value: {
        color: appearance.timerTextColor,
      },
      prefix: appearance.timerPrefix || "Offer closes in",
      expiredLabel: appearance.timerExpiredText || "Last chance ended",
    };
  }

  return {
    container: {
      background: appearance.timerBackgroundColor,
      color: appearance.timerTextColor,
      borderRadius: "999px",
    },
    label: {
      color: appearance.timerTextColor,
    },
    value: {
      color: appearance.timerTextColor,
    },
    prefix: appearance.timerPrefix || "Offer ends in",
    expiredLabel: appearance.timerExpiredText || "Offer expired",
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
  tabRow: { display: "flex", flexWrap: "wrap", gap: "10px" },
  tabButton: {
    minHeight: "38px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #d6d8db",
    background: "#ffffff",
    color: "#172315",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  tabButtonActive: {
    background: "#162314",
    color: "#ffffff",
    borderColor: "#162314",
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
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
  colorInputRow: {
    display: "grid",
    gridTemplateColumns: "56px minmax(0, 1fr)",
    gap: "10px",
    alignItems: "center",
  },
  colorSwatch: {
    width: "56px",
    height: "44px",
    borderRadius: "12px",
    border: "1px solid #cfcfcf",
    background: "#ffffff",
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
  badgePreviewCard: {
    marginTop: "14px",
    display: "grid",
    gap: "10px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e8e8e8",
    background: "#ffffff",
  },
  mutedLabel: {
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#657078",
    fontWeight: 700,
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
    textTransform: "uppercase",
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
  inlineBestSellerBadgeImage: {
    display: "block",
    width: "76px",
    maxWidth: "100%",
    height: "76px",
    objectFit: "contain",
    marginLeft: "auto",
    flex: "0 0 auto",
  },
  inlineBestSellerBadgeImageRibbon: {
    width: "120px",
    height: "42px",
  },
  inlineBestSellerBadgeImageBanner: {
    width: "112px",
    height: "62px",
  },
  inlineBestSellerBadgeImageSpeech: {
    width: "92px",
    height: "68px",
  },
  inlineBestSellerBadgeImageSeal: {
    width: "76px",
    height: "76px",
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
  stylePreviewSubheading: {
    fontSize: "13px",
    color: "#5f6b72",
    lineHeight: 1.4,
  },
  stylePreviewOffer: {
    display: "grid",
    gap: "12px",
    border: "1px solid #d9e1d9",
  },
  stylePreviewOfferMain: {
    display: "grid",
    gridTemplateColumns: "52px minmax(0, 1fr)",
    alignItems: "start",
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
  stylePreviewPriceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
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
  stylePreviewThumbWrap: {
    position: "relative",
    width: "52px",
    height: "52px",
  },
  stylePreviewThumbImage: {
    width: "52px",
    height: "52px",
    objectFit: "cover",
    borderRadius: "14px",
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#ffffff",
  },
  stylePreviewQtyChip: {
    position: "absolute",
    right: "-6px",
    bottom: "-4px",
    minWidth: "24px",
    height: "24px",
    padding: "0 6px",
    borderRadius: "999px",
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.08)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: 800,
    lineHeight: 1,
  },
  stylePreviewPrice: {
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  stylePreviewCompare: {
    fontSize: "14px",
    color: "#7c857f",
    textDecoration: "line-through",
    lineHeight: 1,
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
  stylePreviewSelectedDetails: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr)",
    gap: "10px",
    alignItems: "center",
  },
  stylePreviewSelectedMedia: {
    width: "40px",
    height: "40px",
  },
  stylePreviewSelectedImage: {
    width: "40px",
    height: "40px",
    objectFit: "cover",
    borderRadius: "12px",
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#ffffff",
  },
  stylePreviewSelectedImagePlaceholder: {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    border: "1px dashed rgba(0,0,0,0.16)",
    background: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontSize: "10px",
    color: "#6b7280",
  },
  stylePreviewSelectBox: {
    minHeight: "42px",
    padding: "0 14px",
    borderRadius: "14px",
    background: "color-mix(in srgb, #8db28a 26%, white)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    fontSize: "13px",
    color: "#253126",
    overflow: "hidden",
  },
  stylePreviewSelectText: {
    minWidth: 0,
    flex: "1 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stylePreviewSelectChevron: {
    flex: "0 0 auto",
    fontSize: "14px",
    lineHeight: 1,
  },
  stylePreviewButtonRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "10px",
    marginTop: "8px",
  },
  stylePreviewButton: {
    minHeight: "46px",
    display: "grid",
    placeItems: "center",
    padding: "0 18px",
    fontSize: "14px",
    fontWeight: 800,
    border: "1px solid transparent",
    borderRadius: "999px",
  },
  stylePreviewSecondaryButton: {
    minHeight: "46px",
  },
  timerPreview: {
    display: "grid",
    gap: "6px",
    minWidth: "220px",
    padding: "14px 18px",
    borderRadius: "14px",
    textAlign: "center",
  },
  timerPreviewCompact: {
    minWidth: "180px",
    padding: "10px 14px",
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
