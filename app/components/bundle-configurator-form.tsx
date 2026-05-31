import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Form, useBlocker, useFetcher } from "react-router";

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
  getCrossSellOfferItemCount,
  getCrossSellOfferSubtitle,
  getMaxCrossSellItemSlots,
  normalizeQuantity,
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
  productOptions?: ProductSelectOption[];
  volumeBundleBaseOffer?: {
    id: string;
    title: string;
  } | null;
  showDeleteAction?: boolean;
  dirtyResetSignal?: unknown;
  aside?: React.ReactNode;
};

type TabId = "offers" | "style" | "timer" | "effects" | "discounts";

type ProductSnapshotResponse = {
  ok: boolean;
  handle: string;
  product: ProductSnapshotDraft | null;
  error?: string;
};

export type ProductSelectOption = {
  id: string;
  title: string;
  handle: string;
  featuredImage: string | null;
  variantsCount: number;
  availableStock: number;
  status: string;
  collections?: Array<{
    title: string;
    handle: string;
  }>;
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
  { id: "offers", label: "Offers" },
  { id: "style", label: "Style" },
  { id: "timer", label: "Timer" },
  { id: "effects", label: "Effects" },
  { id: "discounts", label: "Discounts" },
];

const CONFIGURATOR_LAYOUT_CSS = `
  .cashenza-configurator-layout {
    grid-template-columns: minmax(0, 1fr) minmax(470px, 0.95fr);
    grid-template-areas:
      "settings preview"
      "tabs preview"
      "content preview";
    width: 100%;
    max-width: 1560px;
    margin-inline: 0 auto;
  }

  .cashenza-configurator-settings {
    grid-area: settings;
    min-width: 0;
  }

  .cashenza-configurator-preview {
    grid-area: preview;
    min-width: 0;
  }

  .cashenza-configurator-tabs {
    grid-area: tabs;
    min-width: 0;
  }

  .cashenza-configurator-content {
    grid-area: content;
    min-width: 0;
  }

  .cashenza-offer-summary {
    list-style: none;
  }

  .cashenza-offer-summary::-webkit-details-marker {
    display: none;
  }

  .cashenza-disclosure-chevron {
    transition: transform 180ms ease;
  }

  details[open] > .cashenza-offer-summary > span > span:first-child {
    transform: rotate(90deg);
  }

  .cashenza-preview-widget {
    --bundle-pill: #ffffff;
    --bundle-accent: #f1c500;
    display: grid;
    gap: 14px;
    color: var(--bundle-text);
    width: 100%;
    box-sizing: border-box;
  }

  .cashenza-preview-widget *,
  .cashenza-preview-widget *::before,
  .cashenza-preview-widget *::after {
    box-sizing: border-box;
  }

  .cashenza-preview-widget.bundle-widget--soft {
    gap: 12px;
  }

  .cashenza-preview-widget.bundle-widget--soft .bundle-offer {
    border-radius: var(--bundle-card-radius);
  }

  .cashenza-preview-widget.bundle-widget--soft .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--soft .bundle-buy-now-button {
    background: color-mix(in srgb, var(--bundle-accent-base) 78%, black);
  }

  .cashenza-preview-widget.bundle-widget--soft-actions .bundle-offer {
    border-radius: var(--bundle-card-radius);
  }

  .cashenza-preview-widget.bundle-widget--soft-actions .bundle-action-buttons {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .cashenza-preview-widget.bundle-widget--soft-actions .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--soft-actions .bundle-buy-now-button {
    min-height: 50px;
    border-radius: 12px;
    background: #111111;
    color: #ffffff;
  }

  .cashenza-preview-widget.bundle-widget--cards .bundle-offer {
    background: #ffffff;
    border-radius: var(--bundle-card-radius);
    border-color: color-mix(in srgb, var(--bundle-accent-base) 12%, #d7d7d7);
    box-shadow: 0 10px 24px rgba(18, 31, 14, 0.08);
  }

  .cashenza-preview-widget.bundle-widget--cards .bundle-offer.is-selected {
    background: color-mix(in srgb, var(--bundle-accent-base) 8%, #ffffff);
    transform: translateY(-2px);
    box-shadow: 0 18px 34px rgba(18, 31, 14, 0.12);
  }

  .cashenza-preview-widget.bundle-widget--cards .bundle-offer__title {
    font-size: 20px;
    letter-spacing: 0.01em;
  }

  .cashenza-preview-widget.bundle-widget--cards .bundle-offer__price {
    font-size: 26px;
  }

  .cashenza-preview-widget.bundle-widget--cards .bundle-offer-item__static {
    background: color-mix(in srgb, var(--bundle-accent-base) 10%, #ffffff);
    border: 1px solid color-mix(in srgb, var(--bundle-accent-base) 16%, #d9d9d9);
  }

  .cashenza-preview-widget.bundle-widget--cards .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--cards .bundle-buy-now-button {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--bundle-accent-base) 72%, black) 0%,
      color-mix(in srgb, var(--bundle-accent-base) 88%, black) 100%
    );
  }

  .cashenza-preview-widget.bundle-widget--outline .bundle-offer {
    background: transparent;
    border-width: 2px;
    border-style: dashed;
    border-color: color-mix(in srgb, var(--bundle-accent-base) 42%, white);
  }

  .cashenza-preview-widget.bundle-widget--outline .bundle-offer.is-selected {
    background: color-mix(in srgb, var(--bundle-accent-base) 12%, white);
    box-shadow: none;
    border-style: solid;
    border-color: color-mix(in srgb, var(--bundle-accent-base) 70%, black);
  }

  .cashenza-preview-widget.bundle-widget--outline .bundle-offer__thumb {
    border: 2px solid color-mix(in srgb, var(--bundle-accent-base) 34%, white);
  }

  .cashenza-preview-widget.bundle-widget--outline .bundle-offer__price-row {
    gap: 10px;
  }

  .cashenza-preview-widget.bundle-widget--outline .bundle-offer-item__static {
    background: transparent;
    border: 2px solid color-mix(in srgb, var(--bundle-accent-base) 36%, white);
  }

  .cashenza-preview-widget.bundle-widget--outline .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--outline .bundle-buy-now-button {
    background: transparent;
    border: 2px solid color-mix(in srgb, var(--bundle-accent-base) 72%, black);
    color: var(--bundle-text);
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-widget__header {
    gap: 2px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer {
    border-radius: var(--bundle-card-radius);
    padding: 14px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__thumb {
    border-radius: 12px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__title {
    font-size: 18px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__price {
    font-size: 20px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__qty-chip,
  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__saving,
  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__pill {
    font-size: 11px;
    padding: 4px 10px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer__summary-left {
    align-items: flex-start;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-offer-item__static {
    min-height: 46px;
    border-radius: 10px;
    font-size: 15px;
  }

  .cashenza-preview-widget.bundle-widget--minimal .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--minimal .bundle-buy-now-button {
    min-height: 48px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--bundle-accent-base) 70%, black);
  }

  .cashenza-preview-widget.bundle-widget--pills .bundle-offer {
    border-radius: var(--bundle-card-radius);
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--bundle-accent-base) 24%, white) 0%,
      color-mix(in srgb, var(--bundle-accent-base) 38%, white) 100%
    );
  }

  .cashenza-preview-widget.bundle-widget--pills .bundle-offer__thumb,
  .cashenza-preview-widget.bundle-widget--pills .bundle-offer-item__image {
    border-radius: 999px;
  }

  .cashenza-preview-widget.bundle-widget--pills .bundle-offer-item__static,
  .cashenza-preview-widget.bundle-widget--pills .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--pills .bundle-buy-now-button {
    border-radius: 999px;
  }

  .cashenza-preview-widget.bundle-widget--pills .bundle-offer__qty-chip {
    background: color-mix(in srgb, var(--bundle-accent-base) 18%, white);
    border: 1px solid rgba(255, 255, 255, 0.65);
  }

  .cashenza-preview-widget.bundle-widget--pills .bundle-offer-item__static {
    background: color-mix(in srgb, var(--bundle-accent-base) 55%, white);
  }

  .cashenza-preview-widget.bundle-widget--pills .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--pills .bundle-buy-now-button {
    background: color-mix(in srgb, var(--bundle-accent-base) 82%, black);
  }

  .cashenza-preview-widget.bundle-widget--split {
    gap: 16px;
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-offer {
    padding: 0;
    overflow: hidden;
    border-radius: var(--bundle-card-radius);
    background: #ffffff;
    border-color: color-mix(in srgb, var(--bundle-accent-base) 14%, #d8d8d8);
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-offer__summary {
    padding: 16px 18px;
    background: color-mix(in srgb, var(--bundle-accent-base) 18%, white);
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-offer__details {
    margin-top: 0;
    padding: 14px 18px 18px;
    background: #ffffff;
    border-top: 1px solid color-mix(in srgb, var(--bundle-accent-base) 14%, #e4e4e4);
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-offer.is-selected .bundle-offer__summary {
    background: color-mix(in srgb, var(--bundle-accent-base) 32%, white);
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-offer__pill {
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.05);
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-offer-item__static {
    background: color-mix(in srgb, var(--bundle-accent-base) 8%, #ffffff);
    border: 1px solid color-mix(in srgb, var(--bundle-accent-base) 18%, #d8d8d8);
  }

  .cashenza-preview-widget.bundle-widget--split .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--split .bundle-buy-now-button {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--bundle-accent-base) 78%, black) 0%,
      color-mix(in srgb, var(--bundle-accent-base) 50%, black) 100%
    );
  }

  .cashenza-preview-widget.bundle-widget--luxury {
    gap: 18px;
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-widget__eyebrow {
    letter-spacing: 0.14em;
    opacity: 0.75;
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-offer {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--bundle-accent-base) 12%, #fff7ea) 0%,
      color-mix(in srgb, var(--bundle-accent-base) 20%, #f7efe4) 100%
    );
    border: 1px solid color-mix(in srgb, var(--bundle-accent-base) 24%, #c7b79e);
    border-radius: var(--bundle-card-radius);
    box-shadow: 0 14px 32px rgba(49, 34, 15, 0.08);
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-offer.is-selected {
    box-shadow: 0 20px 40px rgba(49, 34, 15, 0.12);
    transform: translateY(-2px);
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-offer__title {
    font-size: 24px;
    letter-spacing: 0.03em;
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-offer__pill {
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-offer-item__static {
    background: rgba(255, 250, 243, 0.92);
    border: 1px solid rgba(89, 61, 27, 0.12);
  }

  .cashenza-preview-widget.bundle-widget--luxury .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--luxury .bundle-buy-now-button {
    background: linear-gradient(135deg, #2f2618 0%, #5a4527 100%);
  }

  .cashenza-preview-widget.bundle-widget--contrast {
    gap: 16px;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-widget__header {
    padding: 16px 18px;
    border-radius: 18px;
    background: #101010;
    color: #ffffff;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer {
    background: #ffffff;
    border: 2px solid #111111;
    border-radius: var(--bundle-card-radius);
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer.is-selected {
    background: #111111;
    color: #ffffff;
    box-shadow: none;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer__thumb,
  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer-item__image {
    border: 2px solid currentColor;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer__compare {
    opacity: 0.72;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer__pill {
    background: #ffffff;
    color: #111111;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer.is-selected .bundle-offer__pill {
    background: #ffdf39;
    color: #111111;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer-item__static {
    background: #ffffff;
    border: 2px solid #111111;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-offer.is-selected .bundle-offer-item__static {
    color: #111111;
  }

  .cashenza-preview-widget.bundle-widget--contrast .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--contrast .bundle-buy-now-button {
    background: #111111;
    border: 2px solid #111111;
  }

  .cashenza-preview-widget.bundle-widget--compact {
    gap: 10px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offers {
    gap: 10px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer {
    padding: 12px;
    border-radius: var(--bundle-card-radius);
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__summary-left {
    gap: 10px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__thumb-wrap {
    width: 52px;
    height: 52px;
    flex-basis: 52px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__thumb {
    width: 52px;
    height: 52px;
    border-radius: 12px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__qty-chip {
    min-width: 24px;
    height: 24px;
    font-size: 11px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__title {
    font-size: 16px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__price {
    font-size: 18px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__saving,
  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__pill {
    padding: 4px 8px;
    font-size: 10px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer__details {
    margin-top: 10px;
    gap: 8px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer-item__row {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 8px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer-item__image,
  .cashenza-preview-widget.bundle-widget--compact .bundle-offer-item__thumb-wrap {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-offer-item__static {
    min-height: 42px;
    padding: 0 12px;
    border-radius: 10px;
    font-size: 14px;
  }

  .cashenza-preview-widget.bundle-widget--compact .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--compact .bundle-buy-now-button {
    min-height: 46px;
    border-radius: 12px;
  }

  .cashenza-preview-widget.bundle-widget--radio {
    gap: 14px;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-widget__header {
    position: relative;
    text-align: center;
    gap: 6px;
    padding-top: 6px;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-widget__header::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 2px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--bundle-accent-base) 30%, white) 0%,
      color-mix(in srgb, var(--bundle-accent-base) 85%, white) 22%,
      transparent 22%,
      transparent 78%,
      color-mix(in srgb, var(--bundle-accent-base) 85%, white) 78%,
      color-mix(in srgb, var(--bundle-accent-base) 30%, white) 100%
    );
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-widget__eyebrow {
    display: inline-block;
    width: fit-content;
    margin-inline: auto;
    padding: 0 14px;
    background: #ffffff;
    position: relative;
    z-index: 1;
    letter-spacing: 0.08em;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer {
    position: relative;
    background: #ffffff;
    border: 2px solid color-mix(in srgb, var(--bundle-accent-base) 40%, white);
    border-radius: var(--bundle-card-radius);
    padding: 18px 18px 18px 56px;
    box-shadow: none;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer::before {
    content: "";
    position: absolute;
    left: 18px;
    top: 50%;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2px solid color-mix(in srgb, var(--bundle-accent-base) 68%, #4e4e4e);
    background: #ffffff;
    transform: translateY(-50%);
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer.is-selected {
    background: color-mix(in srgb, var(--bundle-accent-base) 18%, white);
    border-color: color-mix(in srgb, var(--bundle-accent-base) 88%, #5f54d7);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--bundle-accent-base) 24%, white);
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer.is-selected::before {
    box-shadow: inset 0 0 0 4px #ffffff;
    background: color-mix(in srgb, var(--bundle-accent-base) 92%, #6e62e6);
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__summary-left,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__summary-left,
  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__summary-left {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: start;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__thumb-wrap,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__thumb-wrap {
    width: 48px;
    height: 48px;
    flex-basis: 48px;
    border-radius: 12px;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__thumb,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__thumb {
    width: 48px;
    height: 48px;
    border-radius: 12px;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__qty-chip,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__qty-chip,
  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__qty-chip {
    display: none;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__title,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__title {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__price-row,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__price-row {
    justify-content: flex-end;
    gap: 6px;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__price,
  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__compare,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__price,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__compare {
    min-width: 100px;
    text-align: right;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__saving {
    display: none;
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-offer__details,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__details {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--bundle-accent-base) 18%, #ece6fb);
  }

  .cashenza-preview-widget.bundle-widget--radio .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--radio .bundle-buy-now-button {
    min-height: 56px;
    border-radius: 14px;
    border: 2px solid #2f2f2f;
    background: #ffffff;
    color: #141414;
    box-shadow: none;
  }

  .cashenza-preview-widget.bundle-widget--catalog {
    gap: 12px;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-widget__header {
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 2px solid color-mix(in srgb, var(--bundle-accent-base) 55%, #d3b05e);
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-widget__title {
    color: color-mix(in srgb, var(--bundle-accent-base) 82%, #b87900);
    font-size: 26px;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offers {
    gap: 10px;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer {
    background: #ffffff;
    border: 2px solid #efe6d0;
    border-radius: var(--bundle-card-radius);
    padding: 10px 12px;
    min-height: 92px;
    box-shadow: none;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer.is-selected {
    border-color: color-mix(in srgb, var(--bundle-accent-base) 76%, #c99120);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--bundle-accent-base) 16%, #f1d08b);
    background: #fffdfa;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__summary-left {
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__thumb-wrap {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
    border-radius: 4px;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__thumb,
  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer-item__image {
    border-radius: 4px;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__pill,
  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__compare,
  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__saving {
    display: none;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__title {
    font-size: 16px;
    font-weight: 700;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: #5d5d5d;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__price {
    font-size: 18px;
    font-weight: 800;
    color: #111111;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer__details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #f0eadc;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-offer-item__static {
    min-height: 42px;
    border-radius: 4px;
    border: 1px solid #dbcba7;
    background: #fffefa;
    font-size: 14px;
  }

  .cashenza-preview-widget.bundle-widget--catalog .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--catalog .bundle-buy-now-button {
    min-height: 50px;
    border-radius: 0;
    background: color-mix(in srgb, var(--bundle-accent-base) 85%, #b87d00);
    color: #ffffff;
  }

  .cashenza-preview-widget.bundle-widget--stacked {
    gap: 12px;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-widget__title {
    font-size: 30px;
    letter-spacing: -0.03em;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offers {
    gap: 10px;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer {
    background: #ffffff;
    border: 1px solid #e5e0f5;
    border-radius: var(--bundle-card-radius);
    padding: 16px 18px;
    box-shadow: none;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer.is-selected {
    border: 2px solid color-mix(in srgb, var(--bundle-accent-base) 88%, #9a6dff);
    background: color-mix(in srgb, var(--bundle-accent-base) 8%, #ffffff);
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__title {
    font-size: 18px;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__price,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__compare {
    min-width: 104px;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer__subtitle {
    margin-top: 4px;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-offer-item__static {
    min-height: 56px;
    padding: 0 18px;
    border-radius: 10px;
    border: 1px solid #dbd2f5;
    background: #ffffff;
    font-size: 15px;
  }

  .cashenza-preview-widget.bundle-widget--stacked .bundle-add-button,
  .cashenza-preview-widget.bundle-widget--stacked .bundle-buy-now-button {
    min-height: 50px;
    border-radius: 12px;
    background: #161616;
    color: #ffffff;
  }

  .cashenza-preview-widget .bundle-widget__topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: stretch;
    gap: 16px;
    margin-bottom: 8px;
  }

  .cashenza-preview-widget .bundle-widget__header {
    display: grid;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .cashenza-preview-widget .bundle-widget__timer {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    max-width: 100%;
    padding: 10px 14px;
    background: var(--bundle-timer-bg);
    color: var(--bundle-timer-text);
    border: var(--bundle-timer-border, none);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    justify-self: end;
    margin-left: 0;
    margin-bottom: 2px;
    flex: 0 0 auto;
  }

  .cashenza-preview-widget .bundle-widget__timer--soft {
    border-radius: 999px;
  }

  .cashenza-preview-widget .bundle-widget__timer--cards {
    border-radius: 18px;
    padding: 14px 18px;
    min-width: 260px;
    align-items: flex-start;
    text-align: left;
    box-shadow: 0 14px 28px rgba(18, 31, 14, 0.18);
  }

  .cashenza-preview-widget .bundle-widget__timer--outline {
    border-radius: 12px;
    padding: 12px 16px;
  }

  .cashenza-preview-widget .bundle-widget__timer--odometer {
    border-radius: 18px;
    padding: 10px 14px;
    background: var(--bundle-timer-bg);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap {
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    border-radius: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .cashenza-preview-widget .bundle-widget__timer-label,
  .cashenza-preview-widget .bundle-widget__timer-value {
    margin: 0;
  }

  .cashenza-preview-widget .bundle-widget__timer-label {
    color: var(--bundle-timer-label-color, currentColor);
  }

  .cashenza-preview-widget .bundle-widget__timer-value {
    font-variant-numeric: tabular-nums;
    color: var(--bundle-timer-value-color, currentColor);
  }

  .cashenza-preview-widget .bundle-widget__timer--odometer .bundle-widget__timer-value,
  .cashenza-preview-widget .bundle-widget__timer--split-flap .bundle-widget__timer-value {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap .bundle-widget__timer-value {
    perspective: 550px;
    transform-style: preserve-3d;
  }

  .cashenza-preview-widget .bundle-widget__timer-digit {
    display: inline-flex;
    position: relative;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 30px;
    overflow: hidden;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .cashenza-preview-widget .bundle-widget__timer--odometer .bundle-widget__timer-digit {
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.14);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -8px 14px rgba(0, 0, 0, 0.2);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap .bundle-widget__timer-digit {
    position: relative;
    display: grid;
    width: 1em;
    min-width: 1em;
    height: 1.5em;
    border-radius: 0.1em;
    color: var(--bundle-timer-value-color, #ffffff);
    font-size: 24px;
    font-weight: 900;
    line-height: 1;
    background: linear-gradient(
      180deg,
      var(--bundle-timer-flap-bg-top, #191919) 0%,
      var(--bundle-timer-flap-bg, #111111) 49%,
      var(--bundle-timer-flap-divider, #050505) 50%,
      var(--bundle-timer-flap-bg-bottom, #1f1f1f) 100%
    );
    box-shadow: 0 0 12px rgba(0, 0, 0, 0.3);
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.8);
    text-align: center;
  }

  .cashenza-preview-widget .bundle-widget__timer-base,
  .cashenza-preview-widget .bundle-widget__timer-flap {
    grid-row: 1 / 1;
    grid-column: 1 / 1;
  }

  .cashenza-preview-widget .bundle-widget__timer-base {
    display: grid;
  }

  .cashenza-preview-widget .bundle-widget__timer-base-top,
  .cashenza-preview-widget .bundle-widget__timer-base-bottom {
    position: relative;
    grid-row: 1;
    grid-column: 1;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
  }

  .cashenza-preview-widget .bundle-widget__timer-base-top::after,
  .cashenza-preview-widget .bundle-widget__timer-base-bottom::after,
  .cashenza-preview-widget .bundle-widget__timer-flap::after {
    content: "";
    position: absolute;
    left: 0;
    width: 100%;
    height: 1px;
  }

  .cashenza-preview-widget .bundle-widget__timer-base-top {
    clip-path: inset(0 0 50% 0);
    background: var(--bundle-timer-flap-bg, #111111);
    border-radius: 0.1em 0.1em 0 0;
  }

  .cashenza-preview-widget .bundle-widget__timer-base-top::after {
    top: calc(50% - 1px);
    background-color: color-mix(in srgb, var(--bundle-timer-flap-bg, #111111) 72%, black);
  }

  .cashenza-preview-widget .bundle-widget__timer-base-bottom {
    clip-path: inset(50% 0 0 0);
    background: var(--bundle-timer-flap-bg-bottom, #1f1f1f);
    border-radius: 0 0 0.1em 0.1em;
  }

  .cashenza-preview-widget .bundle-widget__timer-base-bottom::after {
    bottom: calc(50% - 1px);
    background-color: color-mix(in srgb, var(--bundle-timer-flap-bg-bottom, #1f1f1f) 72%, black);
  }

  .cashenza-preview-widget .bundle-widget__timer-flap {
    position: relative;
    display: none;
    backface-visibility: hidden;
    grid-row: 1 / 1;
    grid-column: 1 / 1;
  }

  .cashenza-preview-widget .bundle-widget__timer-flap::before {
    content: attr(data-content);
  }

  .cashenza-preview-widget .bundle-widget__timer-flap.show {
    display: block;
    animation: cashenza-flip-top 0.6s ease-in-out forwards;
  }

  .cashenza-preview-widget .bundle-widget__timer-flap--front {
    clip-path: inset(0 0 50% 0);
    transform-origin: center bottom;
    transform: rotateX(0deg);
    background: var(--bundle-timer-flap-bg, #111111);
    border-radius: 0.1em 0.1em 0 0;
  }

  .cashenza-preview-widget .bundle-widget__timer-flap--front::after {
    top: calc(50% - 1px);
    background-color: color-mix(in srgb, var(--bundle-timer-flap-bg, #111111) 72%, black);
  }

  .cashenza-preview-widget .bundle-widget__timer-flap--back {
    clip-path: inset(50% 0 0 0);
    transform-origin: center top;
    transform: rotateX(-180deg);
    background: var(--bundle-timer-flap-bg-bottom, #1f1f1f);
    border-radius: 0 0 0.1em 0.1em;
  }

  .cashenza-preview-widget .bundle-widget__timer-flap--back.show {
    animation-name: cashenza-flip-bottom;
    animation-delay: 100ms;
  }

  .cashenza-preview-widget .bundle-widget__timer-flap--back::after {
    bottom: calc(50% - 1px);
    background-color: color-mix(in srgb, var(--bundle-timer-flap-bg-bottom, #1f1f1f) 72%, black);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap .bundle-widget__timer-digit::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    top: 50%;
    height: 1px;
    background: color-mix(in srgb, var(--bundle-timer-flap-divider, #050505) 62%, transparent);
    transform: translateY(-50%);
    box-shadow: none;
  }

  .cashenza-preview-widget .bundle-widget__timer-separator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 8px;
    font-weight: 900;
    opacity: 0.82;
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap .bundle-widget__timer-separator {
    height: 36px;
    color: var(--bundle-timer-value-color, currentColor);
    opacity: 0.82;
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-slot] {
    display: inline-grid;
    place-content: center;
    overflow: visible;
    transform-style: preserve-3d;
    --split-flap-crease: 2px;
    --split-flap-flip-duration: 800ms;
    --split-flap-timing-function: cubic-bezier(.215, .61, .355, 1);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-character] {
    display: flex;
    flex-direction: column;
    gap: var(--split-flap-crease);
    grid-area: 1 / 1;
    pointer-events: none;
    position: relative;
    transform-style: preserve-3d;
    transition: z-index var(--split-flap-flip-duration) var(--split-flap-timing-function);
    z-index: calc(var(--split-flap-is-current) * 2 + var(--split-flap-is-previous) + var(--split-flap-is-next));
    --split-flap-total0: calc(var(--split-flap-total) - 1);
    --split-flap-offset: calc(var(--split-flap-index) - var(--split-flap-current-character-index));
    --split-flap-abs-offset: max(var(--split-flap-offset), calc(var(--split-flap-offset) * -1));
    --split-flap-safe-abs-offset: max(var(--split-flap-abs-offset), 0.001);
    --split-flap-direction: calc(var(--split-flap-offset) / var(--split-flap-safe-abs-offset));
    --split-flap-past: min(0, var(--split-flap-direction));
    --split-flap-future: max(0, var(--split-flap-direction));
    --split-flap-is-current: clamp(0, calc(1 - var(--split-flap-abs-offset) * 1000), 1);
    --split-flap-is-not-current: clamp(0, calc(1 - var(--split-flap-is-current)), 1);
    --split-flap-is-previous: clamp(0, calc(1 - max(var(--split-flap-offset) + 1, (var(--split-flap-offset) + 1) * -1) * 1000), 1);
    --split-flap-is-next: clamp(0, calc(1 - max(var(--split-flap-offset) - 1, (var(--split-flap-offset) - 1) * -1) * 1000), 1);
    --split-flap-angle: calc((0.5 / var(--split-flap-total0)) * 1turn);
    --split-flap-top-flap-angle: calc(var(--split-flap-abs-offset) * var(--split-flap-direction) * var(--split-flap-angle) + var(--split-flap-past) * 0.5turn);
    --split-flap-bottom-flap-angle: calc(max(var(--split-flap-abs-offset) - 1, 0) * var(--split-flap-direction) * var(--split-flap-angle) + var(--split-flap-future) * 0.5turn);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-character]::after {
    content: "";
    display: block;
    height: var(--split-flap-crease);
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 100%;
    background: #060606;
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-flap] {
    align-items: center;
    backface-visibility: hidden;
    background: #151515;
    border-radius: 3px;
    box-shadow: inset 0 0 2px 0.75px rgba(255, 255, 255, 0.14), inset 0 0 0 1px rgba(0, 0, 0, 0.85);
    box-sizing: content-box;
    display: flex;
    height: 0.86em;
    justify-content: center;
    line-height: 1;
    overflow: hidden;
    position: relative;
    transform-style: preserve-3d;
    transition: transform var(--split-flap-flip-duration) var(--split-flap-timing-function);
    width: 1.18em;
    will-change: transform;
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-flap="top"] {
    align-items: flex-start;
    padding-top: 0;
    transform: translateZ(calc(var(--split-flap-is-current) * 0.1px)) rotateX(var(--split-flap-top-flap-angle));
    transform-origin: center calc(100% + var(--split-flap-crease) * 0.5);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-flap="bottom"] {
    align-items: flex-end;
    padding-bottom: 0;
    transform: translateZ(calc(var(--split-flap-is-current) * 0.1px)) rotateX(var(--split-flap-bottom-flap-angle));
    transform-origin: center calc(var(--split-flap-crease) * -0.5);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-flap] > span {
    translate: 0 calc(var(--split-flap-crease) * 0.2);
  }

  .cashenza-preview-widget .bundle-widget__timer--split-flap [data-split-flap-flap="bottom"] > span {
    translate: 0 calc(var(--split-flap-crease) * -0.2);
  }

  @keyframes cashenza-flip-top {
    from {
      transform: rotateX(0deg);
    }

    to {
      transform: rotateX(180deg);
    }
  }

  @keyframes cashenza-flip-bottom {
    from {
      transform: rotateX(-180deg);
    }

    to {
      transform: rotateX(0deg);
    }
  }

  .cashenza-preview-widget .bundle-widget__timer--cards .bundle-widget__timer-label,
  .cashenza-preview-widget .bundle-widget__timer--outline .bundle-widget__timer-label,
  .cashenza-preview-widget .bundle-widget__timer--odometer .bundle-widget__timer-label,
  .cashenza-preview-widget .bundle-widget__timer--split-flap .bundle-widget__timer-label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .cashenza-preview-widget .bundle-widget__eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .cashenza-preview-widget .bundle-widget__title,
  .cashenza-preview-widget .bundle-widget__subheading {
    margin: 0;
  }

  .cashenza-preview-widget .bundle-widget__title {
    font-size: var(--bundle-heading-size);
    line-height: 1.05;
  }

  .cashenza-preview-widget .bundle-widget__subheading {
    font-size: var(--bundle-subheading-size);
  }

  .cashenza-preview-widget .bundle-offers {
    display: grid;
    gap: var(--bundle-card-gap);
    margin-bottom: 14px;
  }

  .cashenza-preview-widget .bundle-offer {
    background: var(--bundle-bg);
    border: 1px solid var(--bundle-border);
    border-radius: var(--bundle-card-radius);
    padding: var(--bundle-card-padding);
    position: relative;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }

  .cashenza-preview-widget .bundle-offer.is-selected {
    background: var(--bundle-bg-selected);
    box-shadow: 0 10px 24px rgba(46, 74, 39, 0.08);
  }

  .cashenza-preview-widget .bundle-offer__summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .cashenza-preview-widget .bundle-offer__summary-left {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    width: 100%;
    min-width: 0;
  }

  .cashenza-preview-widget .bundle-offer__summary-left > :last-child {
    flex: 1 1 auto;
    min-width: 0;
  }

  .cashenza-preview-widget .bundle-offer__thumb-wrap {
    position: relative;
    width: 64px;
    height: 64px;
    flex: 0 0 64px;
  }

  .cashenza-preview-widget .bundle-offer__thumb {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.5);
  }

  .cashenza-preview-widget .bundle-offer__qty-chip {
    position: absolute;
    right: -6px;
    bottom: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 8px;
    border-radius: 999px;
    background: #fff;
    color: var(--bundle-text);
    font-size: 12px;
    font-weight: 700;
  }

  .cashenza-preview-widget .bundle-offer__title-row {
    display: flex;
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
    width: 100%;
    min-width: 0;
    position: relative;
  }

  .cashenza-preview-widget .bundle-offer__title-row--has-png {
    padding-right: clamp(72px, 11vw, 96px);
  }

  .cashenza-preview-widget .bundle-offer__title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--bundle-offer-title-size);
    font-weight: 700;
    line-height: 1;
  }

  .cashenza-preview-widget .bundle-offer__pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    margin-left: auto;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--bundle-bestseller-bg);
    color: var(--bundle-bestseller-text);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.05;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    position: relative;
  }

  .cashenza-preview-widget .bundle-offer__pill-image {
    display: block;
    position: absolute;
    top: 0;
    right: 0;
    width: auto;
    height: auto;
    max-width: clamp(72px, 11vw, 96px);
    max-height: clamp(72px, 11vw, 96px);
    object-fit: contain;
    object-position: top right;
    transform: translate(18%, -18%);
    pointer-events: none;
    z-index: 2;
  }

  .cashenza-preview-widget .bundle-offer__pill-image--orange-ribbon {
    max-width: clamp(120px, 18vw, 160px);
    max-height: clamp(40px, 7vw, 56px);
  }

  .cashenza-preview-widget .bundle-offer__pill-image--blue-award,
  .cashenza-preview-widget .bundle-offer__pill-image--gold-award,
  .cashenza-preview-widget .bundle-offer__pill-image--red-stamp {
    max-width: clamp(78px, 11vw, 92px);
    max-height: clamp(94px, 13vw, 112px);
  }

  .cashenza-preview-widget .bundle-offer__pill-image--pink-banner {
    max-width: clamp(110px, 16vw, 138px);
    max-height: clamp(64px, 10vw, 82px);
  }

  .cashenza-preview-widget .bundle-offer__pill-image--red-speech {
    max-width: clamp(94px, 13vw, 112px);
    max-height: clamp(72px, 10vw, 86px);
  }

  .cashenza-preview-widget .bundle-offer__pill--ribbon {
    border-radius: 6px;
    padding: 8px 22px 8px 16px;
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%);
  }

  .cashenza-preview-widget .bundle-offer__pill--award,
  .cashenza-preview-widget .bundle-offer__pill--award-ribbon,
  .cashenza-preview-widget .bundle-offer__pill--stamp {
    width: 84px;
    height: 84px;
    padding: 12px;
    border-radius: 50%;
    flex-direction: column;
    gap: 2px;
    white-space: normal;
  }

  .cashenza-preview-widget .bundle-offer__pill--award {
    box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.82);
  }

  .cashenza-preview-widget .bundle-offer__pill--award-ribbon::before,
  .cashenza-preview-widget .bundle-offer__pill--award-ribbon::after {
    content: "";
    position: absolute;
    bottom: -18px;
    width: 0;
    height: 0;
    border-left: 12px solid transparent;
    border-right: 12px solid transparent;
    border-top: 26px solid var(--bundle-bestseller-bg);
  }

  .cashenza-preview-widget .bundle-offer__pill--award-ribbon::before {
    left: 12px;
  }

  .cashenza-preview-widget .bundle-offer__pill--award-ribbon::after {
    right: 12px;
  }

  .cashenza-preview-widget .bundle-offer__pill--banner {
    border-radius: 4px;
    transform: skewX(-14deg);
    padding: 8px 16px;
  }

  .cashenza-preview-widget .bundle-offer__pill--speech {
    border-radius: 16px;
    background: transparent;
    border: 2px solid var(--bundle-bestseller-bg);
    color: var(--bundle-bestseller-bg);
    padding: 8px 14px;
  }

  .cashenza-preview-widget .bundle-offer__pill--speech::after {
    content: "";
    position: absolute;
    left: 16px;
    bottom: -8px;
    width: 12px;
    height: 12px;
    border-left: 2px solid var(--bundle-bestseller-bg);
    border-bottom: 2px solid var(--bundle-bestseller-bg);
    background: #ffffff;
    transform: rotate(-45deg);
  }

  .cashenza-preview-widget .bundle-offer__pill--stamp {
    background: #ffffff;
    color: var(--bundle-bestseller-bg);
    border: 4px solid var(--bundle-bestseller-bg);
    box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.92);
  }

  .cashenza-preview-widget .bundle-offer__price-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
  }

  .cashenza-preview-widget .bundle-offer__compare {
    text-decoration: line-through;
    opacity: 0.6;
  }

  .cashenza-preview-widget .bundle-offer__price {
    font-size: var(--bundle-offer-price-size);
    font-weight: 700;
  }

  .cashenza-preview-widget .bundle-offer__saving {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--bundle-save-bg);
    color: var(--bundle-save-text);
    font-size: 12px;
    font-weight: 700;
  }

  .cashenza-preview-widget .bundle-offer__subtitle {
    margin-top: 4px;
  }

  .cashenza-preview-widget .bundle-offer__details {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .cashenza-preview-widget .bundle-offer-item {
    display: grid;
    gap: 8px;
  }

  .cashenza-preview-widget .bundle-offer-item__row {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }

  .cashenza-preview-widget .bundle-offer-item__row--no-image {
    grid-template-columns: 44px minmax(0, 1fr) !important;
  }

  .cashenza-preview-widget .bundle-offer-item__thumb-wrap {
    position: relative;
    width: 44px;
    height: 44px;
  }

  .cashenza-preview-widget .bundle-offer-item__image {
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.6);
  }

  .cashenza-preview-widget .bundle-offer-item__qty-chip {
    position: absolute;
    right: -7px;
    bottom: -7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 999px;
    background: #ffffff;
    color: var(--bundle-text);
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 2px 8px rgba(18, 31, 14, 0.08);
  }

  .cashenza-preview-widget .bundle-offer-item__thumb-wrap--chip-only {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cashenza-preview-widget .bundle-offer-item__thumb-wrap--chip-only .bundle-offer-item__qty-chip {
    position: static;
    right: auto;
    bottom: auto;
  }

  .cashenza-preview-widget .bundle-offer-item__quantity-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cashenza-preview-widget .bundle-offer-item__quantity-label {
    color: var(--bundle-text);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
  }

  .cashenza-preview-widget .bundle-offer-item__static {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 52px;
    padding: 0 16px;
    border: none;
    border-radius: 14px;
    background: var(--bundle-input);
    color: var(--bundle-text);
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cashenza-preview-widget .bundle-action-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    align-items: stretch;
  }

  .cashenza-preview-widget .bundle-add-button,
  .cashenza-preview-widget .bundle-buy-now-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 54px;
    border: none;
    border-radius: 999px;
    background: #1f2c1c;
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
  }

  .cashenza-preview-widget .bundle-add-button::before,
  .cashenza-preview-widget .bundle-buy-now-button::before {
    content: "";
    width: 18px;
    height: 18px;
    display: inline-flex;
    flex: 0 0 auto;
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
  }

  .cashenza-preview-widget .bundle-add-button::before {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M8 7V6a4 4 0 118 0v1h2.5A1.5 1.5 0 0120 8.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-9A1.5 1.5 0 015.5 7H8zm2 0h4V6a2 2 0 10-4 0v1zm1 2v2H9v2h2v2h2v-2h2v-2h-2V9h-2z' fill='white'/%3E%3C/svg%3E");
  }

  .cashenza-preview-widget .bundle-buy-now-button::before {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M7 7V6a5 5 0 0110 0v1h1.5A1.5 1.5 0 0120 8.5v9A2.5 2.5 0 0117.5 20h-11A2.5 2.5 0 014 17.5v-9A1.5 1.5 0 015.5 7H7zm2 0h6V6a3 3 0 10-6 0v1z' fill='white'/%3E%3C/svg%3E");
  }

  @media (max-width: 749px) {
    .cashenza-preview-widget .bundle-widget__topbar {
      flex-direction: column;
      align-items: stretch;
    }

    .cashenza-preview-widget .bundle-widget__timer {
      justify-self: end;
      margin-left: 0;
      align-self: auto;
    }

    .cashenza-preview-widget .bundle-offer {
      padding: 14px;
      border-radius: var(--bundle-card-radius);
    }

    .cashenza-preview-widget .bundle-offer__title {
      font-size: 18px;
    }

    .cashenza-preview-widget .bundle-action-buttons {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 1250px) {
    .cashenza-configurator-layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "settings"
        "preview"
        "tabs"
        "content";
      width: 100%;
    }
  }
`;

const TIMER_PRESETS = ["split-flap", "soft", "cards", "outline", "odometer"];

const TIMER_PRESET_LABELS: Record<string, string> = {
  "split-flap": "Split-flap flip clock",
  soft: "Soft",
  cards: "Cards",
  outline: "Outline",
  odometer: "Odometer",
};

const TIMER_PRESET_DEFAULTS: Record<
  string,
  {
    prefix: string;
    expiredText: string;
    backgroundColor: string;
    textColor: string;
    prefixColor: string;
  }
> = {
  soft: {
    prefix: "Offer ends in",
    expiredText: "Offer expired",
    backgroundColor: "#1a2118",
    textColor: "#ffffff",
    prefixColor: "#ffffff",
  },
  cards: {
    prefix: "Limited time offer",
    expiredText: "Offer closed",
    backgroundColor: "#243323",
    textColor: "#ffffff",
    prefixColor: "#d7e0d4",
  },
  outline: {
    prefix: "Offer closes in",
    expiredText: "Last chance ended",
    backgroundColor: "#ffffff",
    textColor: "#1f3b24",
    prefixColor: "#1f3b24",
  },
  odometer: {
    prefix: "Offer ends in",
    expiredText: "Offer expired",
    backgroundColor: "#151b16",
    textColor: "#f8fff4",
    prefixColor: "#cdd8c9",
  },
  "split-flap": {
    prefix: "Offer ends in",
    expiredText: "Offer expired",
    backgroundColor: "#111111",
    textColor: "#ffffff",
    prefixColor: "#6b7280",
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

function getTimerPreviewValue(value: string, now = Date.now()) {
  if (!value) return "--:--:--";

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "--:--:--";

  const remaining = target.getTime() - now;
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

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return value / 100;
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
  mode: "cross-sell" | "volume",
) {
  const lineSubtotals = new Map<string, number>();

  for (const [index, item] of offerItems.entries()) {
    const snapshot = productSnapshots[item.productHandle.trim()] || null;
    const variant = pickEffectiveVariant(item, snapshot);
    if (!variant) {
      return { initialTotal: null, discountedTotal: null };
    }

    const quantity =
      mode === "volume" ? 1 : normalizeQuantity(offer.itemQuantities?.[index], 1);
    const lineSubtotal = toCents(parseVariantPrice(variant.price)) * quantity;
    const lineKey =
      mode === "volume"
        ? `${item.productHandle}:${variant.id}`
        : `${index}:${item.productHandle}:${variant.id}`;

    lineSubtotals.set(lineKey, Number(lineSubtotals.get(lineKey) || 0) + lineSubtotal);
  }

  const lineSubtotalValues = Array.from(lineSubtotals.values());
  const initialTotalCents = lineSubtotalValues.reduce((sum, price) => sum + price, 0);
  let discountedTotalCents = initialTotalCents;

  if (offer.discountType === "PERCENTAGE") {
    discountedTotalCents = lineSubtotalValues.reduce((sum, lineSubtotal) => {
      const lineDiscount = Math.round(lineSubtotal * (offer.discountValue / 100));
      return sum + Math.max(0, lineSubtotal - lineDiscount);
    }, 0);
  } else if (offer.discountType === "FIXED_AMOUNT") {
    discountedTotalCents = initialTotalCents - toCents(offer.discountValue);
  } else {
    discountedTotalCents = toCents(offer.discountValue);
  }

  return {
    initialTotal: fromCents(initialTotalCents),
    discountedTotal: fromCents(Math.max(0, discountedTotalCents)),
  };
}

function normalizeOfferDraft(offer: Partial<BundleOfferDraft>, index: number): BundleOfferDraft {
  const fallback = createDefaultOffer(index);
  const itemQuantities = ensureLength(
    Array.isArray(offer.itemQuantities) ? offer.itemQuantities : [],
    getCrossSellOfferItemCount(offer, index),
    () => 1,
  ).map((quantity) => normalizeQuantity(quantity, 1));

  return {
    ...fallback,
    ...offer,
    quantity: normalizeQuantity(offer.quantity, index + 1),
    itemQuantities,
    showQuantitySelector: Boolean(offer.showQuantitySelector),
    quantityOptions: String(offer.quantityOptions || ""),
  };
}

function createDirtySnapshot({
  mode,
  title,
  status,
  itemCount,
  bestSellerIndex,
  items,
  offers,
  appearance,
}: {
  mode: "cross-sell" | "volume";
  title: string;
  status: "DRAFT" | "ACTIVE";
  itemCount: number;
  bestSellerIndex: number;
  items: BundleItemDraft[];
  offers: BundleOfferDraft[];
  appearance: BundleAppearanceDraft;
}) {
  return JSON.stringify({
    mode,
    title,
    status,
    itemCount,
    bestSellerIndex,
    items,
    offers,
    appearance,
  });
}

function getVolumeOfferQuantity(offer: BundleOfferDraft, offerIndex: number) {
  return normalizeQuantity(offer.quantity, offerIndex + 1);
}

function getCrossSellItemQuantity(offer: BundleOfferDraft, itemIndex: number) {
  return normalizeQuantity(offer.itemQuantities?.[itemIndex], 1);
}

function getOfferTotalQuantity(
  offer: BundleOfferDraft,
  offerIndex: number,
  mode: "cross-sell" | "volume",
) {
  if (mode === "volume") {
    return getVolumeOfferQuantity(offer, offerIndex);
  }

  return Array.from({ length: getCrossSellOfferItemCount(offer, offerIndex) }, (_, itemIndex) =>
    getCrossSellItemQuantity(offer, itemIndex),
  ).reduce((sum, quantity) => sum + quantity, 0);
}

function getConfiguredOfferItems(
  mode: "cross-sell" | "volume",
  items: BundleItemDraft[],
  offer: BundleOfferDraft,
  offerIndex: number,
) {
  if (mode === "volume") {
    return Array.from(
      { length: getVolumeOfferQuantity(offer, offerIndex) },
      () => items[0] || createDefaultItem(0),
    );
  }

  return items.slice(0, getCrossSellOfferItemCount(offer, offerIndex));
}

function isDefaultVariantTitle(title: string | null | undefined) {
  return String(title || "").trim().toLowerCase() === "default title";
}

function hasOnlyDefaultVariant(snapshot: ProductSnapshotDraft | null | undefined) {
  const variants = snapshot?.variants || [];
  return variants.length <= 1 || variants.every((variant) => isDefaultVariantTitle(variant.title));
}

function getPreviewSelectorItems({
  mode,
  offer,
  offerIndex,
  offerItems,
  productSnapshots,
}: {
  mode: "cross-sell" | "volume";
  offer: BundleOfferDraft;
  offerIndex: number;
  offerItems: BundleItemDraft[];
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
}) {
  if (mode === "volume") {
    const firstItem = offerItems[0];
    const snapshot = firstItem
      ? productSnapshots[firstItem.productHandle.trim()] || null
      : null;

    if (firstItem && hasOnlyDefaultVariant(snapshot)) {
      return [
        {
          item: firstItem,
          itemIndex: 0,
          quantity: getOfferTotalQuantity(offer, offerIndex, mode),
        },
      ];
    }
  }

  return offerItems.map((item, itemIndex) => ({
    item,
    itemIndex,
    quantity:
      mode === "volume" ? 1 : getCrossSellItemQuantity(offer, itemIndex),
  }));
}

export function BundleConfiguratorForm({
  draft,
  submitLabel,
  isSubmitting,
  formAction,
  mode = "cross-sell",
  productOptions = [],
  volumeBundleBaseOffer,
  showDeleteAction,
  dirtyResetSignal,
  aside,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("offers");
  const [title, setTitle] = useState(draft.title);
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">(draft.status);
  const [itemCount, setItemCount] = useState(draft.itemCount);
  const [bestSellerIndex, setBestSellerIndex] = useState(draft.bestSellerIndex);
  const [items, setItems] = useState<BundleItemDraft[]>(draft.items);
  const [offers, setOffers] = useState<BundleOfferDraft[]>(() =>
    ensureLength(draft.offers, draft.itemCount, createDefaultOffer).map(normalizeOfferDraft),
  );
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
    setOffers((current) => {
      const nextOffers = ensureLength(current, sanitized, createDefaultOffer).map(
        normalizeOfferDraft,
      );
      const nextItemSlots =
        mode === "volume" ? 1 : getMaxCrossSellItemSlots(nextOffers);
      setItems((currentItems) =>
        ensureLength(currentItems, nextItemSlots, createDefaultItem),
      );
      return nextOffers;
    });
    setBestSellerIndex((current) => Math.min(current, sanitized));
  }

  function updateItem(index: number, patch: Partial<BundleItemDraft>) {
    setItems((current) =>
      mode === "volume"
        ? current.map((item) => ({ ...item, ...patch }))
        : current.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...patch } : item,
          ),
    );
  }

  function updateOffer(index: number, patch: Partial<BundleOfferDraft>) {
    setOffers((current) =>
      current.map((offer, offerIndex) => {
        const nextOffer = offerIndex === index ? { ...offer, ...patch } : offer;
        return normalizeOfferDraft(nextOffer, offerIndex);
      }),
    );
  }

  function updateOfferItemQuantity(offerIndex: number, itemIndex: number, quantity: number) {
    setOffers((current) =>
      current.map((offer, currentOfferIndex) => {
        if (currentOfferIndex !== offerIndex) {
          return normalizeOfferDraft(offer, currentOfferIndex);
        }

        const itemQuantities = ensureLength(
          offer.itemQuantities || [],
          offerIndex + 1,
          () => 1,
        );
        itemQuantities[itemIndex] = normalizeQuantity(quantity, 1);

        return normalizeOfferDraft({ ...offer, itemQuantities }, currentOfferIndex);
      }),
    );
  }

  function updateOfferItemCount(offerIndex: number, nextCount: number) {
    const sanitized = Math.max(1, Math.min(MAX_ITEMS, Math.floor(Number(nextCount) || 1)));

    setOffers((current) => {
      const nextOffers = current.map((offer, currentOfferIndex) => {
        if (currentOfferIndex !== offerIndex) {
          return normalizeOfferDraft(offer, currentOfferIndex);
        }

        return normalizeOfferDraft(
          {
            ...offer,
            itemQuantities: ensureLength(
              offer.itemQuantities || [],
              sanitized,
              () => 1,
            ),
          },
          currentOfferIndex,
        );
      });

      setItems((currentItems) =>
        ensureLength(
          currentItems,
          mode === "volume" ? 1 : getMaxCrossSellItemSlots(nextOffers),
          createDefaultItem,
        ),
      );

      return nextOffers;
    });
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
      timerPrefixColor: defaults.prefixColor,
    }));
  }

  function loadProductSnapshot(handle: string) {
    const trimmedHandle = handle.trim();
    if (!trimmedHandle) return;
    productFetcher.load(`/app/api/product-snapshot?handle=${encodeURIComponent(trimmedHandle)}`);
  }

  const visibleOffers = offers.slice(0, itemCount);
  const visibleItemCount =
    mode === "volume" ? 1 : getMaxCrossSellItemSlots(visibleOffers);
  const visibleItems = ensureLength(items, visibleItemCount, createDefaultItem).slice(
    0,
    visibleItemCount,
  );
  const dirtySnapshot = createDirtySnapshot({
    mode,
    title,
    status,
    itemCount,
    bestSellerIndex,
    items: visibleItems,
    offers: visibleOffers,
    appearance,
  });

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
      productOptions={productOptions}
      productSnapshots={productSnapshots}
      isSubmitting={isSubmitting}
      submitLabel={submitLabel}
      formAction={formAction}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      updateItem={updateItem}
      updateOffer={updateOffer}
      updateOfferItemQuantity={updateOfferItemQuantity}
      updateOfferItemCount={updateOfferItemCount}
      updateAppearance={updateAppearance}
      applyTimerPreset={applyTimerPreset}
      loadProductSnapshot={loadProductSnapshot}
      isLoadingProduct={productFetcher.state !== "idle"}
      volumeBundleBaseOffer={volumeBundleBaseOffer}
      showDeleteAction={showDeleteAction}
      dirtySnapshot={dirtySnapshot}
      dirtyResetSignal={dirtyResetSignal}
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
  productOptions: ProductSelectOption[];
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
  isSubmitting: boolean;
  submitLabel: string;
  formAction?: string;
  activeTab: TabId;
  setActiveTab: (value: TabId) => void;
  updateItem: (index: number, patch: Partial<BundleItemDraft>) => void;
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
  updateOfferItemQuantity: (
    offerIndex: number,
    itemIndex: number,
    quantity: number,
  ) => void;
  updateOfferItemCount: (offerIndex: number, nextCount: number) => void;
  updateAppearance: <K extends keyof BundleAppearanceDraft>(
    key: K,
    value: BundleAppearanceDraft[K],
  ) => void;
  applyTimerPreset: (preset: string) => void;
  loadProductSnapshot: (handle: string) => void;
  isLoadingProduct: boolean;
  volumeBundleBaseOffer?: {
    id: string;
    title: string;
  } | null;
  showDeleteAction?: boolean;
  dirtySnapshot: string;
  dirtyResetSignal?: unknown;
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
    productOptions,
    productSnapshots,
    isSubmitting,
    submitLabel,
    formAction,
    activeTab,
    setActiveTab,
    updateItem,
    updateOffer,
    updateOfferItemQuantity,
    updateOfferItemCount,
    updateAppearance,
    applyTimerPreset,
    loadProductSnapshot,
    isLoadingProduct,
    volumeBundleBaseOffer,
    showDeleteAction,
    dirtySnapshot,
    dirtyResetSignal,
    aside,
  } = props;
  const isBestSellerPngPresetSelected = appearance.bestSellerPngBadgePreset !== "none";
  const isOutlineTimerPreset = appearance.timerPreset === "outline";
  const isFadeInEffectsPreset = appearance.effectsPreset === "fade in";
  const isSlideEffectsPreset = appearance.effectsPreset === "slide";
  const [isRulesTooltipOpen, setIsRulesTooltipOpen] = useState(false);
  const [expandedOffers, setExpandedOffers] = useState<Record<number, boolean>>({});
  const [shouldFollowPreviewScroll, setShouldFollowPreviewScroll] = useState(true);
  const dirtyBaselineRef = useRef(dirtySnapshot);
  const allowNavigationRef = useRef(false);
  const hasUnsavedChanges = dirtySnapshot !== dirtyBaselineRef.current;
  const settingsTitle = mode === "volume" ? "Volume bundle settings" : "Cross-sell settings";
  const settingsCopy =
    mode === "volume"
      ? "Configure the same-product quantity ladder. Offer 1 is the single-product baseline, then each next offer increases the quantity of the same product."
      : "Item 1 is the anchored product for the current product page. Each next offer expands from that anchor by adding one more bundled item.";
  const offerTitle = "Offers";
  const offerCopy =
    mode === "volume"
      ? "Configure the repeated product, then define how each offer increases quantity and discount level."
      : "Configure the anchored product first, then define how each offer adds one more bundled item and discount level.";
  const bundleRuleItems =
    mode === "volume"
      ? [
          "Volume bundles sell 1x, 2x, 3x, Nx of the same product.",
          "The product handle anchors the bundle to the matching product page.",
          "A product can show one volume bundle alongside one cross-sell bundle.",
        ]
      : [
          "Cross-sell bundles package the current product with complementary products.",
          "The anchored product handle matches the product page where the bundle appears.",
          "A product can show one cross-sell bundle alongside one volume bundle.",
        ];

  useEffect(() => {
    if (!isSubmitting) return;

    window.requestAnimationFrame(() => {
      const scrollTarget = document.scrollingElement || document.documentElement;
      scrollTarget.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }, [isSubmitting]);

  useEffect(() => {
    if (isSubmitting) return;
    allowNavigationRef.current = false;
  }, [isSubmitting]);

  useEffect(() => {
    if (!dirtyResetSignal) return;
    dirtyBaselineRef.current = dirtySnapshot;
    allowNavigationRef.current = false;
  }, [dirtyResetSignal, dirtySnapshot]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const currentUrl = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextUrl = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;

    return hasUnsavedChanges && !allowNavigationRef.current && currentUrl !== nextUrl;
  });

  useEffect(() => {
    if (blocker.state !== "blocked") return;

    const shouldLeave = window.confirm(
      "You have unsaved bundle changes. Leave this page and lose the incomplete configuration?",
    );

    if (shouldLeave) {
      allowNavigationRef.current = true;
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  return (
    <Form
      method="post"
      action={formAction}
      onSubmit={() => {
        allowNavigationRef.current = true;
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: CONFIGURATOR_LAYOUT_CSS }} />
      <input type="hidden" name="itemCount" value={itemCount} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />
      <input type="hidden" name="offersJson" value={JSON.stringify(offers)} />
      <input
        type="hidden"
        name="appearanceJson"
        value={JSON.stringify(appearance)}
      />

      <div className="cashenza-configurator-layout" style={styles.layout}>
        <section className="cashenza-configurator-settings">
          <div style={styles.card}>
            <div style={styles.cardTitleRow}>
              <h3 style={{ ...styles.cardTitle, margin: 0 }}>{settingsTitle}</h3>
              <span
                style={styles.infoIconWrap}
                onMouseEnter={() => setIsRulesTooltipOpen(true)}
                onMouseLeave={() => setIsRulesTooltipOpen(false)}
                onFocus={() => setIsRulesTooltipOpen(true)}
                onBlur={() => setIsRulesTooltipOpen(false)}
                tabIndex={0}
                role="img"
                aria-label={`${settingsTitle} rules`}
              >
                <span style={styles.infoIcon}>i</span>
                {isRulesTooltipOpen ? (
                  <div style={styles.infoTooltip}>
                    {bundleRuleItems.map((rule) => (
                      <p key={rule} style={styles.infoTooltipLine}>
                        {rule}
                      </p>
                    ))}
                  </div>
                ) : null}
              </span>
            </div>
            <p style={styles.sectionCopy}>{settingsCopy}</p>
            <div style={styles.gridTwo}>
              <label style={styles.field}>
                <span style={styles.label}>
                  {mode === "volume" ? "Volume bundle title" : "Cross-sell bundle title"}
                </span>
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
                    <option value="DRAFT">Expired (inactive)</option>
                    <option value="ACTIVE">Active</option>
                  </select>
                </label>

              <label style={styles.field}>
                <span style={styles.label}>
                  {mode === "volume" ? "Number of volume offers" : "Number of offers"}
                </span>
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
                  <option value={0}>None</option>
                  {Array.from({ length: itemCount }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      Offer {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <aside
          className="cashenza-configurator-preview"
          style={{
            ...styles.sidebar,
            ...(shouldFollowPreviewScroll ? styles.sidebarSticky : {}),
          }}
        >
          {aside}

          <div
            style={{
              ...styles.previewCard,
              ...(shouldFollowPreviewScroll ? styles.previewCardScrollable : {}),
            }}
          >
            <div style={styles.previewHeaderRow}>
              <span style={styles.mutedLabel}>Live storefront preview</span>
              <button
                type="button"
                onClick={() => setShouldFollowPreviewScroll((current) => !current)}
                title="Keeps the live preview visible while you scroll through the configurator. Turn it off if you prefer the preview to stay in its original position."
                style={{
                  ...styles.previewFollowToggle,
                  ...(shouldFollowPreviewScroll ? styles.previewFollowToggleOn : {}),
                }}
                aria-pressed={shouldFollowPreviewScroll}
            >
                Follow scroll {shouldFollowPreviewScroll ? "on" : "off"}
              </button>
            </div>
            <BundleLivePreview
              mode={mode}
              appearance={appearance}
              items={items}
              offers={offers}
              productSnapshots={productSnapshots}
              bestSellerIndex={bestSellerIndex}
              volumeBundleBaseOffer={volumeBundleBaseOffer}
            />
          </div>

          <div
            style={{
              ...styles.actionCard,
              ...(!showDeleteAction ? styles.actionCardSingle : {}),
            }}
          >
            <button type="submit" style={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </button>

            {showDeleteAction ? (
              <button
                type="submit"
                name="intent"
                value="delete"
                style={styles.deleteButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Working..." : "Delete bundle"}
              </button>
            ) : null}
          </div>
        </aside>

        <div className="cashenza-configurator-tabs" style={styles.tabBar}>
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

        <section className="cashenza-configurator-content" style={styles.mainColumn}>
          {activeTab === "offers" ? (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>{offerTitle}</h3>
              <p style={styles.sectionCopy}>{offerCopy}</p>
              <details style={styles.textualDisclosure}>
                <summary className="cashenza-offer-summary" style={styles.offerSummary}>
                  <span style={styles.offerSummaryTitle}>
                    <span aria-hidden="true" style={styles.offerChevron}>
                      ›
                    </span>
                    <h4 style={styles.subcardTitle}>Textual</h4>
                  </span>
                </summary>
                <div style={styles.headerTextFields}>
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
                </div>
              </details>
              <ConfiguratorOfferList
                mode={mode}
                offers={offers}
                items={items}
                appearance={appearance}
                productOptions={productOptions}
                productSnapshots={productSnapshots}
                expandedOffers={expandedOffers}
                setExpandedOffers={setExpandedOffers}
                bestSellerIndex={bestSellerIndex}
                volumeBundleBaseOffer={volumeBundleBaseOffer}
                updateOffer={updateOffer}
                updateItem={updateItem}
                updateOfferItemQuantity={updateOfferItemQuantity}
                updateOfferItemCount={updateOfferItemCount}
                loadProductSnapshot={loadProductSnapshot}
                isLoadingProduct={isLoadingProduct}
              />
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

                {appearance.timerEnd ? (
                  <div style={styles.field}>
                    <span style={styles.label}>Shopify discount expiration</span>
                    <button
                      type="submit"
                      name="intent"
                      value="sync-discount-expiration"
                      style={styles.secondaryButton}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Updating..." : "Align discount with timer end date"}
                    </button>
                    <span style={styles.helpText}>
                      Saves this bundle and updates the Shopify automatic discount end date.
                    </span>
                  </div>
                ) : null}

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

                {appearance.timerPreset === "split-flap" ? (
                  <ColorField
                    label="Flip clock prefix"
                    value={appearance.timerPrefixColor}
                    onChange={(value) => updateAppearance("timerPrefixColor", value)}
                  />
                ) : null}
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
            </div>
          ) : null}
        </section>
      </div>
    </Form>
  );
}

function ConfiguratorOfferList({
  mode,
  offers,
  items,
  appearance,
  productOptions,
  productSnapshots,
  expandedOffers,
  setExpandedOffers,
  bestSellerIndex,
  volumeBundleBaseOffer,
  updateOffer,
  updateItem,
  updateOfferItemQuantity,
  updateOfferItemCount,
  loadProductSnapshot,
  isLoadingProduct,
}: {
  mode: "cross-sell" | "volume";
  offers: BundleOfferDraft[];
  items: BundleItemDraft[];
  appearance: BundleAppearanceDraft;
  productOptions: ProductSelectOption[];
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
  expandedOffers: Record<number, boolean>;
  setExpandedOffers: Dispatch<SetStateAction<Record<number, boolean>>>;
  bestSellerIndex: number;
  volumeBundleBaseOffer?: { id: string; title: string } | null;
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
  updateItem: (index: number, patch: Partial<BundleItemDraft>) => void;
  updateOfferItemQuantity: (offerIndex: number, itemIndex: number, quantity: number) => void;
  updateOfferItemCount: (offerIndex: number, nextCount: number) => void;
  loadProductSnapshot: (handle: string) => void;
  isLoadingProduct: boolean;
}) {
  return (
    <div style={{ ...styles.stack, ...styles.offerListStack }}>
      {offers.map((offer, index) => {
        const offerItems = getConfiguredOfferItems(mode, items, offer, index);
        const pricing = getOfferPricing(offer, offerItems, productSnapshots, mode);
        const isBaseOfferCoveredByVolumeBundle =
          mode === "cross-sell" && index === 0 && Boolean(volumeBundleBaseOffer?.id);
        const isOfferExpanded = expandedOffers[index] ?? false;

        return (
          <details
            key={index}
            style={{
              ...styles.subcard,
              background: `color-mix(in srgb, ${appearance.primaryColor} ${
                isOfferExpanded ? 16 : 10
              }%, white)`,
              border: `1px solid color-mix(in srgb, ${appearance.primaryColor} ${
                isOfferExpanded ? 34 : 24
              }%, white)`,
            }}
            open={isOfferExpanded}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setExpandedOffers((current) => ({ ...current, [index]: isOpen }));
            }}
          >
            <summary className="cashenza-offer-summary" style={styles.offerSummary}>
              <span style={styles.offerSummaryTitle}>
                <span
                  aria-hidden="true"
                  style={{
                    ...styles.offerChevron,
                    transform: isOfferExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  ›
                </span>
                <h4 style={styles.subcardTitle}>Offer {index + 1}</h4>
              </span>
              {bestSellerIndex > 0 && bestSellerIndex === index + 1 ? (
                <span style={styles.bestSellerPill}>Best seller</span>
              ) : null}
            </summary>

            <div style={styles.offerDisclosureBody}>
              {isBaseOfferCoveredByVolumeBundle ? (
                <div style={styles.linkedVolumeNotice}>
                  <span>
                    This single-product base offer is already handled by the volume bundle on this product.
                  </span>
                  <a href={`/app/bundles/${volumeBundleBaseOffer?.id}`} style={styles.inlineActionLink}>
                    Open volume bundle
                  </a>
                </div>
              ) : (
                <>
                  <OfferQuantityControls
                    mode={mode}
                    offer={offer}
                    offerIndex={index}
                    offerItems={offerItems}
                    updateOffer={updateOffer}
                    updateOfferItemQuantity={updateOfferItemQuantity}
                    updateOfferItemCount={updateOfferItemCount}
                  />
                  <OfferPricingControls offer={offer} offerIndex={index} updateOffer={updateOffer} />
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
                  <div style={{ ...styles.stack, ...styles.offerProductStack }}>
                    {(mode === "volume" ? offerItems.slice(0, 1) : offerItems).map(
                      (item, itemIndex) => (
                        <OfferItemConfigurator
                          key={`${index}-${itemIndex}`}
                          mode={mode}
                          offerIndex={index}
                          item={item}
                          itemIndex={itemIndex}
                          productOptions={productOptions}
                          productSnapshots={productSnapshots}
                          updateItem={updateItem}
                          loadProductSnapshot={loadProductSnapshot}
                          isLoadingProduct={isLoadingProduct}
                        />
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function OfferQuantityControls({
  mode,
  offer,
  offerIndex,
  offerItems,
  updateOffer,
  updateOfferItemQuantity,
  updateOfferItemCount,
}: {
  mode: "cross-sell" | "volume";
  offer: BundleOfferDraft;
  offerIndex: number;
  offerItems: BundleItemDraft[];
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
  updateOfferItemQuantity: (offerIndex: number, itemIndex: number, quantity: number) => void;
  updateOfferItemCount: (offerIndex: number, nextCount: number) => void;
}) {
  if (mode === "volume") {
    return (
      <div style={styles.offerQuantityPanel}>
        {offerIndex === 0 ? (
          <div style={styles.stack}>
            <div style={styles.radioButtonGroup}>
              <label
                style={{
                  ...styles.radioChoice,
                  ...(!offer.showQuantitySelector ? styles.radioChoiceActive : {}),
                }}
              >
                <input
                  type="radio"
                  name={`volume-offer-${offerIndex}-quantity-mode`}
                  checked={!offer.showQuantitySelector}
                  onChange={() =>
                    updateOffer(offerIndex, { showQuantitySelector: false })
                  }
                />
                <span>Configured quantity</span>
              </label>
              <label
                style={{
                  ...styles.radioChoice,
                  ...(offer.showQuantitySelector ? styles.radioChoiceActive : {}),
                }}
              >
                <input
                  type="radio"
                  name={`volume-offer-${offerIndex}-quantity-mode`}
                  checked={offer.showQuantitySelector}
                  onChange={() =>
                    updateOffer(offerIndex, { showQuantitySelector: true })
                  }
                />
                <span>Customer can choose quantity</span>
              </label>
            </div>
            {offer.showQuantitySelector ? (
              <label style={styles.field}>
                <span style={styles.label}>Storefront quantity options</span>
                <input
                  value={offer.quantityOptions}
                  onChange={(event) =>
                    updateOffer(offerIndex, { quantityOptions: event.target.value })
                  }
                  placeholder="Leave empty for any quantity, or enter 1,2,3"
                  style={styles.input}
                />
                <span style={styles.helpText}>
                  Empty allows any quantity up to stock. Use comma-separated values to restrict the choices.
                </span>
              </label>
            ) : (
              <VolumeProductQuantityField
                offer={offer}
                offerIndex={offerIndex}
                updateOffer={updateOffer}
              />
            )}
          </div>
        ) : (
          <VolumeProductQuantityField
            offer={offer}
            offerIndex={offerIndex}
            updateOffer={updateOffer}
          />
        )}
      </div>
    );
  }

  return (
    <div style={styles.offerQuantityPanel}>
      <div style={styles.stack}>
        <label style={styles.field}>
          <span style={styles.label}>Number of products in this offer</span>
          <input
            type="number"
            min={1}
            max={MAX_ITEMS}
            value={getCrossSellOfferItemCount(offer, offerIndex)}
            onChange={(event) => updateOfferItemCount(offerIndex, Number(event.target.value || 1))}
            style={styles.input}
          />
          <span style={styles.helpText}>
            Configure one offer with as many bundled products as needed. You do not need one offer per product.
          </span>
        </label>
        <div style={styles.offerQuantityGrid}>
          {offerItems.map((item, itemIndex) => (
            <label key={`${offerIndex}-${itemIndex}-quantity`} style={styles.field}>
              <span style={styles.label}>{getCrossSellItemLabel(itemIndex)} quantity</span>
              <input
                type="number"
                min={1}
                max={99}
                value={getCrossSellItemQuantity(offer, itemIndex)}
                onChange={(event) =>
                  updateOfferItemQuantity(
                    offerIndex,
                    itemIndex,
                    Number(event.target.value || 1),
                  )
                }
                style={styles.input}
              />
              <span style={styles.helpText}>
                {item.productHandle.trim() || "Product handle not set"}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function VolumeProductQuantityField({
  offer,
  offerIndex,
  updateOffer,
}: {
  offer: BundleOfferDraft;
  offerIndex: number;
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>Product quantity in this offer</span>
      <input
        type="number"
        min={1}
        max={99}
        value={getVolumeOfferQuantity(offer, offerIndex)}
        onChange={(event) => {
          const quantity = normalizeQuantity(event.target.value, offerIndex + 1);
          updateOffer(offerIndex, {
            quantity,
            itemQuantities: Array.from({ length: quantity }, () => 1),
          });
        }}
        style={styles.input}
      />
    </label>
  );
}

function OfferPricingControls({
  offer,
  offerIndex,
  updateOffer,
}: {
  offer: BundleOfferDraft;
  offerIndex: number;
  updateOffer: (index: number, patch: Partial<BundleOfferDraft>) => void;
}) {
  return (
    <div style={{ ...styles.gridTwo, order: 2 }}>
      <label style={styles.field}>
        <span style={styles.label}>Offer title</span>
        <input
          value={offer.title}
          onChange={(event) => updateOffer(offerIndex, { title: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={styles.field}>
        <span style={styles.label}>Subtitle</span>
        <input
          value={offer.subtitle}
          onChange={(event) => updateOffer(offerIndex, { subtitle: event.target.value })}
          style={styles.input}
        />
      </label>
      <label style={styles.field}>
        <span style={styles.label}>Discount type</span>
        <select
          value={offer.discountType}
          onChange={(event) =>
            updateOffer(offerIndex, {
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
            updateOffer(offerIndex, { discountValue: Number(event.target.value || 0) })
          }
          style={styles.input}
        />
      </label>
    </div>
  );
}

function OfferItemConfigurator({
  mode,
  offerIndex,
  item,
  itemIndex,
  productOptions,
  productSnapshots,
  updateItem,
  loadProductSnapshot,
  isLoadingProduct,
}: {
  mode: "cross-sell" | "volume";
  offerIndex: number;
  item: BundleItemDraft;
  itemIndex: number;
  productOptions: ProductSelectOption[];
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
  updateItem: (index: number, patch: Partial<BundleItemDraft>) => void;
  loadProductSnapshot: (handle: string) => void;
  isLoadingProduct: boolean;
}) {
  const [productSearch, setProductSearch] = useState("");
  const snapshot = productSnapshots[item.productHandle.trim()] || null;
  const isRepeatedCrossSellAnchor = mode === "cross-sell" && offerIndex > 0 && itemIndex === 0;
  const isProductHandleLocked = mode === "volume" || isRepeatedCrossSellAnchor;
  const shouldHideProductPicker =
    (mode === "volume" && isProductHandleLocked) ||
    (mode === "cross-sell" && itemIndex === 0);
  const productTitle =
    snapshot?.title ||
    productOptions.find((product) => product.handle === item.productHandle.trim())?.title ||
    item.productHandle.trim() ||
    "No product selected";
  const filteredProductOptions = filterProductOptions(productOptions, productSearch);

  return (
    <details style={styles.offerItemCard}>
      <summary className="cashenza-offer-summary" style={styles.offerSummary}>
        <span style={styles.offerSummaryTitle}>
          <span aria-hidden="true" style={styles.offerChevron}>
            ›
          </span>
          <span style={styles.offerItemSummaryText}>
            <span style={styles.offerItemTitle}>
              {mode === "volume" ? "Repeated product" : getCrossSellItemLabel(itemIndex)}
            </span>
            <span style={styles.offerItemMeta}>{productTitle}</span>
          </span>
        </span>
      </summary>
      <div style={styles.offerDisclosureBody}>
        {shouldHideProductPicker ? null : (
          <ProductSearchSelect
            label={itemIndex === 0 ? "Anchored product" : "Added product"}
            value={item.productHandle}
            productOptions={filteredProductOptions}
            searchValue={productSearch}
            disabled={isProductHandleLocked}
            onSearchChange={setProductSearch}
            onChange={(handle) => {
              if (isProductHandleLocked) return;
              const selectedProduct = productOptions.find((product) => product.handle === handle);
              updateItem(itemIndex, {
                productHandle: handle,
                variantId: "",
                variantTitle: "",
              });
              if (selectedProduct?.handle) {
                loadProductSnapshot(selectedProduct.handle);
              }
            }}
          />
        )}
      {snapshot ? (
        <div style={styles.snapshotBox}>
          <span style={styles.offerItemMeta}>{snapshot.variants.length} variants available</span>
          <div style={styles.gridTwo}>
            <label style={styles.checkboxField}>
              <input
                type="checkbox"
                checked={item.allowVariantSelection}
                onChange={(event) =>
                  updateItem(itemIndex, {
                    allowVariantSelection: event.target.checked,
                    variantId: event.target.checked ? "" : item.variantId,
                    variantTitle: event.target.checked ? "" : item.variantTitle,
                  })
                }
              />
              <span>Allow customer variant selection</span>
            </label>
            <label style={styles.checkboxField}>
              <input
                type="checkbox"
                checked={item.showVariantThumbnails}
                onChange={(event) =>
                  updateItem(itemIndex, { showVariantThumbnails: event.target.checked })
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
                    snapshot?.variants.find((variant) => variant.id === event.target.value) || null;
                  updateItem(itemIndex, {
                    variantId: event.target.value,
                    variantTitle: selectedVariant?.title || "",
                  });
                }}
                style={styles.input}
                disabled={!snapshot?.variants?.length}
              >
                <option value="">
                  {snapshot?.variants?.length ? "Select a fixed variant" : "Load the product first"}
                </option>
                {(snapshot?.variants || []).map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.title} - {formatMoney(parseVariantPrice(variant.price))}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <div style={styles.hintBox}>
          {mode === "volume"
            ? "Enter the product handle, then load it to select a fixed variant and preview volume pricing."
            : itemIndex === 0
              ? "Enter the current page product handle first, then load it to select a fixed variant and preview the anchored price."
              : "Enter an added product handle, then load it to select a fixed variant and preview the bundled price."}
        </div>
      )}
      </div>
    </details>
  );
}

function ProductSearchSelect({
  label,
  value,
  productOptions,
  searchValue,
  disabled,
  onSearchChange,
  onChange,
}: {
  label: string;
  value: string;
  productOptions: ProductSelectOption[];
  searchValue: string;
  disabled: boolean;
  onSearchChange: (value: string) => void;
  onChange: (handle: string) => void;
}) {
  return (
    <div style={styles.productSelectBox}>
      <span style={styles.label}>{label}</span>
      <label style={styles.productSearchField}>
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search product or collection"
          style={{
            ...styles.input,
            ...(disabled ? styles.inputDisabled : {}),
          }}
          disabled={disabled}
        />
      </label>
      <label style={styles.productSelectField}>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{
            ...styles.input,
            ...styles.compactSelect,
            ...(disabled ? styles.inputDisabled : {}),
          }}
          disabled={disabled}
        >
          <option value="">Select a product</option>
          {value && !productOptions.some((product) => product.handle === value) ? (
            <option value={value}>{value}</option>
          ) : null}
          {productOptions.map((product) => (
            <option key={product.handle} value={product.handle}>
              {product.title} ({product.handle})
              {product.collections?.length
                ? ` - ${product.collections.map((collection) => collection.title).join(", ")}`
                : ""}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function filterProductOptions(
  productOptions: ProductSelectOption[],
  searchValue: string,
) {
  const query = searchValue.trim().toLowerCase();
  if (!query) return productOptions.slice(0, 30);

  return productOptions
    .filter((product) => {
      const collectionText = (product.collections || [])
        .map((collection) => `${collection.title} ${collection.handle}`)
        .join(" ");
      return `${product.title} ${product.handle} ${collectionText}`
        .toLowerCase()
        .includes(query);
    })
    .slice(0, 30);
}

function getPreviewWidgetVariables(appearance: BundleAppearanceDraft): CSSProperties {
  const accent = appearance.primaryColor || "#8db28a";
  const timerTheme = getTimerPresetTheme(appearance);
  const timerContainer = timerTheme.container || {};
  const timerLabel = timerTheme.label || {};
  const timerValue = timerTheme.value || {};

  return {
    "--bundle-accent-base": accent,
    "--bundle-bg": `color-mix(in srgb, ${accent} 20%, white)`,
    "--bundle-bg-selected": `color-mix(in srgb, ${accent} 30%, white)`,
    "--bundle-border": `color-mix(in srgb, ${accent} 22%, white)`,
    "--bundle-input": `color-mix(in srgb, ${accent} 42%, white)`,
    "--bundle-text": appearance.textColor || "#1a2118",
    "--bundle-heading-size": `${appearance.headingSize ?? 28}px`,
    "--bundle-subheading-size": `${appearance.subheadingSize ?? 16}px`,
    "--bundle-offer-title-size": `${appearance.offerTitleSize ?? 22}px`,
    "--bundle-offer-price-size": `${appearance.offerPriceSize ?? 24}px`,
    "--bundle-card-gap": `${appearance.cardGap ?? 12}px`,
    "--bundle-card-padding": `${appearance.cardPadding ?? 18}px`,
    "--bundle-card-radius": `${appearance.offerRadius ?? 24}px`,
    "--bundle-bestseller-bg": appearance.bestSellerBadgeColor || "#ffffff",
    "--bundle-bestseller-text": appearance.bestSellerBadgeText || "#1a2118",
    "--bundle-save-bg": appearance.saveBadgeColor || "#f1c500",
    "--bundle-save-text": appearance.saveBadgeText || "#1a2118",
    "--bundle-timer-bg":
      typeof timerContainer.background === "string"
        ? timerContainer.background
        : appearance.timerBackgroundColor || "#1a2118",
    "--bundle-timer-text":
      typeof timerContainer.color === "string"
        ? timerContainer.color
        : appearance.timerTextColor || "#ffffff",
    "--bundle-timer-border":
      typeof timerContainer.border === "string" ? timerContainer.border : "none",
    "--bundle-timer-label-color":
      typeof timerLabel.color === "string"
        ? timerLabel.color
        : appearance.timerPrefixColor || "#6b7280",
    "--bundle-timer-value-color":
      typeof timerValue.color === "string" ? timerValue.color : "currentColor",
    "--bundle-timer-flap-bg": appearance.timerBackgroundColor || "#111111",
    "--bundle-timer-flap-bg-top": `color-mix(in srgb, ${appearance.timerBackgroundColor || "#111111"} 88%, white)`,
    "--bundle-timer-flap-bg-bottom": `color-mix(in srgb, ${appearance.timerBackgroundColor || "#111111"} 82%, black)`,
    "--bundle-timer-flap-divider": `color-mix(in srgb, ${appearance.timerBackgroundColor || "#111111"} 72%, black)`,
  } as CSSProperties;
}

function BundleLivePreview({
  mode,
  appearance,
  items,
  offers,
  productSnapshots,
  bestSellerIndex,
  volumeBundleBaseOffer,
}: {
  mode: "cross-sell" | "volume";
  appearance: BundleAppearanceDraft;
  items: BundleItemDraft[];
  offers: BundleOfferDraft[];
  productSnapshots: Record<string, ProductSnapshotDraft | null>;
  bestSellerIndex: number;
  volumeBundleBaseOffer?: {
    id: string;
    title: string;
  } | null;
}) {
  const showTimer = Boolean(appearance.showTimer && appearance.timerEnd);
  const [previewNow, setPreviewNow] = useState(() => Date.now());

  useEffect(() => {
    if (!showTimer || appearance.timerPreset !== "split-flap") return;

    const interval = window.setInterval(() => {
      setPreviewNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [appearance.timerPreset, showTimer]);

  const timerValue = getTimerPreviewValue(appearance.timerEnd, previewNow);
  const isTimerExpired = timerValue === "00:00:00" && Boolean(appearance.timerEnd);
  const timerTheme = getTimerPresetTheme(appearance);
  const previewOffers = offers
    .map((offer, index) => ({ offer, index }))
    .filter(
      ({ index }) =>
        !(mode === "cross-sell" && index === 0 && Boolean(volumeBundleBaseOffer?.id)),
    );
  const defaultSelectedOfferIndex =
    bestSellerIndex > 0 && previewOffers.some(({ index }) => index + 1 === bestSellerIndex)
      ? bestSellerIndex - 1
      : previewOffers[0]?.index ?? 0;
  const [selectedOfferIndex, setSelectedOfferIndex] = useState(defaultSelectedOfferIndex);

  useEffect(() => {
    if (!previewOffers.some(({ index }) => index === selectedOfferIndex)) {
      setSelectedOfferIndex(defaultSelectedOfferIndex);
    }
  }, [defaultSelectedOfferIndex, previewOffers, selectedOfferIndex]);

  return (
    <div style={styles.stylePreviewShell}>
      <div
        className={`cashenza-preview-widget bundle-widget--${appearance.designPreset || "soft"}`}
        style={getPreviewWidgetVariables(appearance)}
      >
        <div className="bundle-widget__topbar">
          <div className="bundle-widget__header">
            {appearance.eyebrow ? (
              <p className="bundle-widget__eyebrow">{appearance.eyebrow}</p>
            ) : null}
            {appearance.heading ? (
              <h2 className="bundle-widget__title">{appearance.heading}</h2>
            ) : null}
            {appearance.subheading ? (
              <p className="bundle-widget__subheading">{appearance.subheading}</p>
            ) : null}
          </div>
          {showTimer ? (
            <div
              className={`bundle-widget__timer bundle-widget__timer--${timerTheme.preset}`}
            >
              <span className="bundle-widget__timer-label">
                {isTimerExpired ? timerTheme.expiredLabel : timerTheme.prefix}
              </span>
              <TimerPreviewValue
                value={timerValue}
                preset={timerTheme.preset}
                className="bundle-widget__timer-value"
              />
            </div>
          ) : null}
        </div>
        <div className="bundle-offers">
          {previewOffers.length ? (
            previewOffers.map(({ offer, index }) => {
              const offerItems = getConfiguredOfferItems(mode, items, offer, index);
              const pricing = getOfferPricing(offer, offerItems, productSnapshots, mode);
              const hasPricing =
                pricing.initialTotal != null && pricing.discountedTotal != null;
              const savings =
                hasPricing && pricing.initialTotal != null && pricing.discountedTotal != null
                  ? Math.max(0, pricing.initialTotal - pricing.discountedTotal)
                  : 0;
              const hasDiscount = savings > 0.004;
              const isBestSeller = bestSellerIndex > 0 && bestSellerIndex === index + 1;
              const isSelected = selectedOfferIndex === index;
              const image = getPreviewOfferImage(offerItems, productSnapshots);
              const quantity = getOfferTotalQuantity(offer, index, mode);
              const shouldHideMainQuantityChip = mode === "cross-sell" && offerItems.length > 1;
              const hasPngBadge =
                isBestSeller && appearance.bestSellerPngBadgePreset !== "none";

              return (
                <div
                  key={index}
                  className={`bundle-offer ${isSelected ? "is-selected" : ""}`}
                  style={{ "--bundle-offer-index": index } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedOfferIndex(index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedOfferIndex(index);
                    }
                  }}
                >
                  <div className="bundle-offer__summary">
                    <div className="bundle-offer__summary-left">
                      <div className="bundle-offer__thumb-wrap">
                        {image ? (
                          <img
                            src={image}
                            alt=""
                            className="bundle-offer__thumb"
                          />
                        ) : (
                          <span>x{quantity}</span>
                        )}
                        {image && !shouldHideMainQuantityChip ? (
                          <span className="bundle-offer__qty-chip">x{quantity}</span>
                        ) : null}
                      </div>
                      <div>
                        <div className={`bundle-offer__title-row ${hasPngBadge ? "bundle-offer__title-row--has-png" : ""}`}>
                          <span className="bundle-offer__title">{offer.title}</span>
                          {isBestSeller ? (
                            <BestSellerInlineBadge appearance={appearance} />
                          ) : null}
                        </div>
                        <div className="bundle-offer__price-row">
                          {hasDiscount && pricing.initialTotal != null ? (
                            <span className="bundle-offer__compare">
                              {formatMoney(pricing.initialTotal)}
                            </span>
                          ) : null}
                          <span className="bundle-offer__price">
                            {pricing.discountedTotal == null
                              ? "Load products"
                              : formatMoney(pricing.discountedTotal)}
                          </span>
                          {hasDiscount ? (
                            <span className="bundle-offer__saving">
                              {getPreviewSaveLabel(offer, savings, appearance)}
                            </span>
                          ) : null}
                        </div>
                        {offer.subtitle ? (
                          <div className="bundle-offer__subtitle">
                            {offer.subtitle}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {isSelected ? (
                    <div className="bundle-offer__details">
                      {index === 0 && offer.showQuantitySelector ? (
                        <div className="bundle-offer-item">
                          <div className="bundle-offer-item__quantity-row">
                            <span className="bundle-offer-item__quantity-label">Quantity:</span>
                            <div className="bundle-offer-item__static">
                              {offer.quantityOptions.trim()
                                ? offer.quantityOptions
                                : "Any available stock"}
                            </div>
                          </div>
                        </div>
                      ) : null}
                          {getPreviewSelectorItems({
                            mode,
                            offer,
                            offerIndex: index,
                            offerItems,
                            productSnapshots,
                          }).map(({ item, itemIndex, quantity: itemQuantity }) => {
                            const snapshot =
                              productSnapshots[item.productHandle.trim()] || null;
                            const variant = snapshot
                              ? pickEffectiveVariant(item, snapshot)
                              : null;
                            const itemImage = getPreviewItemImage(item, snapshot);
                            const showQuantityChipOnly = !itemImage;
                            const label = getPreviewVariantLabel(
                              item,
                              snapshot,
                              variant,
                            );

                            return (
                              <div className="bundle-offer-item" key={`${index}-${itemIndex}-${item.productHandle}`}>
                                <div className={`bundle-offer-item__row ${
                                  itemImage || showQuantityChipOnly
                                    ? ""
                                    : "bundle-offer-item__row--no-image"
                                }`}>
                                  {itemImage ? (
                                  <span className="bundle-offer-item__thumb-wrap">
                                    <img
                                      src={itemImage}
                                      alt=""
                                      className="bundle-offer-item__image"
                                    />
                                    <span className="bundle-offer-item__qty-chip">
                                      x{itemQuantity}
                                    </span>
                                  </span>
                                ) : showQuantityChipOnly ? (
                                  <span className="bundle-offer-item__thumb-wrap bundle-offer-item__thumb-wrap--chip-only">
                                    <span className="bundle-offer-item__qty-chip">
                                      x{itemQuantity}
                                    </span>
                                  </span>
                                ) : null}
                                <div className="bundle-offer-item__static">
                                  {label}
                                </div>
                              </div>
                              </div>
                            );
                          })}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="bundle-offer">
              Configure at least one visible offer to preview the storefront bundle.
            </div>
          )}
        </div>

        <div className="bundle-action-buttons">
          <div className="bundle-add-button">
            Add to cart
          </div>
          <div className="bundle-buy-now-button">
            Buy it now
          </div>
        </div>
      </div>
    </div>
  );
}

function TimerPreviewValue({
  value,
  preset,
  className,
}: {
  value: string;
  preset: string;
  className?: string;
}) {
  const normalizedPreset = String(preset || "");
  const isDigitPreset = normalizedPreset === "odometer" || normalizedPreset === "split-flap";
  const [settledValue, setSettledValue] = useState(value);

  useEffect(() => {
    if (normalizedPreset !== "split-flap") {
      setSettledValue(value);
      return;
    }

    if (settledValue === value) return;

    const timeout = window.setTimeout(() => {
      setSettledValue(value);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [normalizedPreset, settledValue, value]);

  if (!isDigitPreset) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span className={className}>
      {value.split("").map((character, index) =>
        character === ":" ? (
          <span key={`${character}-${index}`} className="bundle-widget__timer-separator">
            {character}
          </span>
        ) : normalizedPreset === "split-flap" ? (
          <SplitFlapTimerSlot
            key={index}
            character={character}
            previousCharacter={settledValue[index] || character}
            shouldFlip={settledValue !== value && settledValue[index] !== character}
          />
        ) : (
          <span key={`${character}-${index}`} className="bundle-widget__timer-digit">
            <span>{character}</span>
          </span>
        ),
      )}
    </span>
  );
}

const SPLIT_FLAP_DIGITS = "0123456789";

function SplitFlapTimerSlot({
  character,
  previousCharacter,
  shouldFlip,
}: {
  character: string;
  previousCharacter: string;
  shouldFlip: boolean;
}) {
  return (
    <span
      className="bundle-widget__timer-digit number"
      aria-hidden="true"
      data-number={character}
    >
      <span className="base bundle-widget__timer-base">
        <span className="top bundle-widget__timer-base-top">{character}</span>
        <span className="bottom bundle-widget__timer-base-bottom">
          {shouldFlip ? previousCharacter : character}
        </span>
      </span>
      <span
        className={`flap front bundle-widget__timer-flap bundle-widget__timer-flap--front ${
          shouldFlip ? "show" : ""
        }`}
        data-content={previousCharacter}
      />
      <span
        className={`flap back bundle-widget__timer-flap bundle-widget__timer-flap--back ${
          shouldFlip ? "show" : ""
        }`}
        data-content={character}
      />
    </span>
  );
}

function getPreviewOfferImage(
  offerItems: BundleItemDraft[],
  productSnapshots: Record<string, ProductSnapshotDraft | null>,
) {
  const item = offerItems[0];
  if (!item) return "";

  const snapshot = productSnapshots[item.productHandle.trim()] || null;
  if (!snapshot) return "";

  if (item.showVariantThumbnails) {
    const variant = pickEffectiveVariant(item, snapshot);
    if (variant?.featuredImage) return variant.featuredImage;
  }

  return snapshot.featuredImage || "";
}

function getPreviewItemImage(
  item: BundleItemDraft,
  snapshot: ProductSnapshotDraft | null,
) {
  if (!snapshot) return "";
  if (!item.showVariantThumbnails) return "";

  if (item.showVariantThumbnails) {
    const variant = pickEffectiveVariant(item, snapshot);
    if (variant?.featuredImage) return variant.featuredImage;
  }

  return snapshot.featuredImage || "";
}

function getPreviewVariantLabel(
  item: BundleItemDraft,
  snapshot: ProductSnapshotDraft | null,
  variant: ReturnType<typeof pickEffectiveVariant>,
) {
  if (!snapshot) {
    return item.productHandle.trim() || "Product not loaded";
  }

  const variantLabel = item.allowVariantSelection
    ? variant?.title || "Customer chooses on storefront"
    : item.variantTitle || variant?.title || "No fixed variant selected";
  const displayVariantLabel = isDefaultVariantTitle(variantLabel) ? "" : variantLabel;
  const priceLabel = variant ? ` - ${formatMoney(parseVariantPrice(variant.price))}` : "";
  const availability = variant && !variant.availableForSale ? " | Sold out" : "";

  return `${snapshot.title}${displayVariantLabel ? ` : ${displayVariantLabel}` : ""}${priceLabel}${availability}`;
}

function getPreviewSaveLabel(
  offer: BundleOfferDraft,
  savings: number,
  appearance: BundleAppearanceDraft,
) {
  const prefix = String(appearance.saveBadgePrefix ?? "Save").trim();
  const value =
    offer.discountType === "PERCENTAGE"
      ? `${offer.discountValue}%`
      : formatMoney(savings);

  return prefix ? `${prefix} ${value}` : value;
}

function BestSellerInlineBadge({
  appearance,
}: {
  appearance: BundleAppearanceDraft;
}) {
  const pngPreset = appearance.bestSellerPngBadgePreset || "none";

  if (pngPreset !== "none") {
    const pngAsset =
      BEST_SELLER_PNG_BADGE_ASSETS[pngPreset] ||
      `/apps/custom-bundles/badge?preset=${encodeURIComponent(pngPreset)}`;

    return (
      <img
        src={pngAsset}
        alt="Best seller"
        className={`bundle-offer__pill-image bundle-offer__pill-image--${pngPreset}`}
      />
    );
  }

  const badgePreset = appearance.bestSellerBadgePreset || "pill";

  return (
    <span className={`bundle-offer__pill bundle-offer__pill--${badgePreset}`}>
      <span>BEST SELLER</span>
    </span>
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
        shell: { background: "#ffffff", color: "#111111" },
        header: { padding: "16px 18px", borderRadius: "18px", background: "#101010" },
        eyebrow: { color: "#ffffff" },
        heading: { color: "#ffffff" },
        subheading: { color: "rgba(255,255,255,0.78)" },
        offerTitle: { color: "currentColor" },
        offerCopy: { color: "currentColor", opacity: 0.76 },
        titleRow: {},
        price: { color: "currentColor" },
        saveBadge: { background: "#ffdf39", color: "#111111" },
        thumb: { borderRadius: "12px", border: "2px solid currentColor" },
        selectedOffer: { background: "#111111", color: "#ffffff", borderColor: "#ffffff", borderWidth: "2px", borderRadius: radius, boxShadow: "none" },
        secondaryOffer: { background: "#ffffff", color: "#111111", borderColor: "#ffffff", borderWidth: "2px", borderRadius: radius },
        button: { background: "#ffffff", color: "#111111", borderRadius: "999px", border: "2px solid #ffffff" },
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
        saveBadge: { fontSize: "11px", padding: "5px 10px" },
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
      preset,
      prefix: appearance.timerPrefix ?? "Limited time offer",
      expiredLabel: appearance.timerExpiredText ?? "Offer closed",
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
        color: appearance.timerPrefixColor || `color-mix(in srgb, ${textColor} 82%, transparent)`,
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
      preset,
      prefix: appearance.timerPrefix ?? "Offer closes in",
      expiredLabel: appearance.timerExpiredText ?? "Last chance ended",
      container: {
        borderRadius: "12px",
        padding: "12px 16px",
        background: "transparent",
        color: outlineColor,
        border: `2px solid ${outlineColor}`,
      } satisfies CSSProperties,
      label: {
        color: appearance.timerPrefixColor || outlineColor,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      } satisfies CSSProperties,
      value: {
        color: outlineColor,
      } satisfies CSSProperties,
    };
  }

  if (preset === "odometer") {
    const textColor = appearance.timerTextColor || "#f8fff4";

    return {
      preset,
      prefix: appearance.timerPrefix ?? "Offer ends in",
      expiredLabel: appearance.timerExpiredText ?? "Offer expired",
      container: {
        borderRadius: "18px",
        padding: "10px 14px",
        background: appearance.timerBackgroundColor || "#151b16",
        color: textColor,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      } satisfies CSSProperties,
      label: {
        color: appearance.timerPrefixColor || `color-mix(in srgb, ${textColor} 78%, transparent)`,
        letterSpacing: "0.08em",
      } satisfies CSSProperties,
      value: {
        color: textColor,
      } satisfies CSSProperties,
    };
  }

  if (preset === "split-flap") {
    const textColor = appearance.timerTextColor || "#ffffff";

    return {
      preset,
      prefix: appearance.timerPrefix ?? "Offer ends in",
      expiredLabel: appearance.timerExpiredText ?? "Offer expired",
      container: {
        borderRadius: 0,
        padding: 0,
        background: "transparent",
        color: textColor,
        boxShadow: "none",
        alignItems: "flex-end",
      } satisfies CSSProperties,
      label: {
        color: appearance.timerPrefixColor || "#6b7280",
        letterSpacing: "0.1em",
      } satisfies CSSProperties,
      value: {
        color: textColor,
      } satisfies CSSProperties,
    };
  }

  return {
    preset,
    prefix: appearance.timerPrefix ?? "Offer ends in",
    expiredLabel: appearance.timerExpiredText ?? "Offer expired",
    container: {
      borderRadius: "999px",
      background: appearance.timerBackgroundColor,
      color: appearance.timerTextColor,
    } satisfies CSSProperties,
    label: {
      color: appearance.timerPrefixColor || appearance.timerTextColor,
    } satisfies CSSProperties,
    value: {
      color: appearance.timerTextColor,
    } satisfies CSSProperties,
  };
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
    gap: "20px",
    alignItems: "start",
  },
  mainColumn: { display: "grid", gap: "20px" },
  sidebar: { display: "grid", gap: "20px", alignSelf: "start" },
  sidebarSticky: {
    position: "sticky",
    top: "16px",
    zIndex: 3,
  },
  card: {
    padding: "20px",
    border: "1px solid #d8d8d8",
    borderRadius: "18px",
    background: "#ffffff",
  },
  subcard: {
    padding: "18px",
    border: "1px solid #e6e6e6",
    borderRadius: "14px",
    background: "#fafafa",
  },
  cardTitle: { margin: "0 0 16px", fontSize: "20px" },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "16px",
  },
  infoIconWrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    outline: "none",
  },
  infoIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: "999px",
    border: "1px solid #9daf94",
    background: "#f7faf4",
    color: "#1d3124",
    fontSize: "13px",
    fontWeight: 800,
    fontFamily: "Georgia, serif",
    cursor: "help",
  },
  infoTooltip: {
    position: "absolute",
    left: "calc(100% + 10px)",
    top: "50%",
    zIndex: 10,
    width: "360px",
    transform: "translateY(-50%)",
    display: "grid",
    gap: "8px",
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #dce6d8",
    background: "#ffffff",
    boxShadow: "0 18px 42px rgba(18, 31, 14, 0.16)",
    color: "#334333",
    fontSize: "13px",
    lineHeight: 1.4,
  },
  infoTooltipLine: {
    margin: 0,
  },
  sectionCopy: {
    margin: "0 0 16px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#5f6b72",
  },
  subcardTitle: { margin: 0, fontSize: "20px", lineHeight: 1.2 },
  offerSummary: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    cursor: "pointer",
    listStyle: "none",
  },
  offerSummaryTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    minWidth: 0,
  },
  offerChevron: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "22px",
    height: "22px",
    borderRadius: "999px",
    background: "rgba(255, 255, 255, 0.7)",
    color: "#1d3124",
    fontSize: "24px",
    lineHeight: 1,
    transition: "transform 180ms ease",
    transformOrigin: "50% 50%",
  },
  offerDisclosureBody: {
    display: "grid",
    gap: "18px",
    marginTop: "18px",
  },
  subcardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "2px",
    order: 0,
  },
  gridTwo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
  },
  headerTextFields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "14px",
    marginTop: "16px",
  },
  textualDisclosure: {
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid #e2e8df",
    background: "#f8faf6",
    marginBottom: "22px",
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
  helpText: {
    color: "#5f6f5b",
    fontSize: "12px",
    lineHeight: 1.4,
  },
  linkedVolumeNotice: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px dashed #c7d4bf",
    background: "#f7faf4",
    color: "#344234",
    fontSize: "14px",
  },
  inlineActionLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "36px",
    padding: "0 14px",
    borderRadius: "999px",
    border: "1px solid #9daf94",
    color: "#1d3124",
    textDecoration: "none",
    fontWeight: 700,
    whiteSpace: "nowrap",
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
  actionCard: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    padding: "16px",
    border: "1px solid #d8d8d8",
    borderRadius: "18px",
    background: "#ffffff",
  },
  actionCardSingle: {
    gridTemplateColumns: "minmax(0, 1fr)",
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
    border: "1px solid #1d3124",
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
    order: 3,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    margin: "16px 0",
  },
  offerQuantityPanel: {
    order: 1,
    padding: "14px",
    borderRadius: "14px",
    border: "1px solid #e4e4e4",
    background: "#ffffff",
  },
  lockedQuantityBox: {
    display: "grid",
    gap: "6px",
    padding: "12px",
    borderRadius: "12px",
    border: "1px dashed #c7d4bf",
    background: "#f7faf4",
  },
  radioButtonGroup: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "10px",
  },
  radioChoice: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "44px",
    padding: "10px 12px",
    borderRadius: "12px",
    border: "1px solid #d9e2d9",
    background: "#ffffff",
    color: "#334333",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  radioChoiceActive: {
    borderColor: "#8db28a",
    background: "#f3f8f1",
    boxShadow: "inset 0 0 0 1px rgba(141, 178, 138, 0.25)",
  },
  offerQuantityGrid: {
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
  previewCardScrollable: {
    maxHeight: "calc(100vh - 150px)",
    overflowY: "auto",
    overscrollBehavior: "contain",
    scrollbarGutter: "stable",
  },
  previewHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  previewFollowToggle: {
    minHeight: "30px",
    padding: "0 10px",
    borderRadius: "999px",
    border: "1px solid #cbd5cb",
    background: "#ffffff",
    color: "#4f5f4b",
    fontSize: "12px",
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  previewFollowToggleOn: {
    borderColor: "#1d3124",
    background: "#1d3124",
    color: "#ffffff",
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
    alignItems: "flex-end",
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
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    border: "1px solid #d9e1d9",
  },
  stylePreviewOfferWithPngBadge: {
    paddingRight: "76px",
  },
  stylePreviewOfferMain: {
    display: "grid",
    gridTemplateColumns: "40px minmax(0, 1fr)",
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
    position: "relative",
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
  stylePreviewThumbImage: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "inherit",
  },
  stylePreviewQtyChip: {
    position: "absolute",
    right: "-7px",
    bottom: "-7px",
    display: "inline-grid",
    placeItems: "center",
    minWidth: "24px",
    height: "24px",
    padding: "0 6px",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#1a2118",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    fontSize: "10px",
    fontWeight: 800,
  },
  stylePreviewPriceRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: "8px",
    minWidth: 0,
  },
  stylePreviewComparePrice: {
    color: "currentColor",
    opacity: 0.58,
    fontSize: "13px",
    textDecoration: "line-through",
  },
  stylePreviewSelectorList: {
    display: "grid",
    gap: "8px",
    marginTop: "10px",
  },
  stylePreviewSelectorRow: {
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr)",
    alignItems: "center",
    gap: "8px",
    minHeight: "42px",
  },
  stylePreviewSelectorRowNoImage: {
    gridTemplateColumns: "minmax(0, 1fr)",
  },
  stylePreviewSelectorImage: {
    display: "block",
    width: "34px",
    height: "34px",
    objectFit: "cover",
    borderRadius: "10px",
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  stylePreviewSelectorThumb: {
    position: "relative",
    display: "inline-flex",
    width: "34px",
    height: "34px",
  },
  stylePreviewSelectorQtyChip: {
    position: "absolute",
    right: "-7px",
    bottom: "-7px",
    display: "inline-grid",
    placeItems: "center",
    minWidth: "20px",
    height: "20px",
    padding: "0 5px",
    borderRadius: "999px",
    background: "#ffffff",
    color: "#1a2118",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    fontSize: "9px",
    fontWeight: 800,
  },
  stylePreviewSelectorText: {
    minHeight: "42px",
    display: "flex",
    alignItems: "center",
    minWidth: 0,
    overflow: "hidden",
    padding: "0 12px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.42)",
    color: "inherit",
    fontSize: "13px",
    lineHeight: 1.2,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  stylePreviewQuantitySelector: {
    width: "fit-content",
    maxWidth: "100%",
    marginTop: "8px",
    padding: "8px 12px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.42)",
    color: "inherit",
    fontSize: "13px",
    fontWeight: 700,
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
  stylePreviewTimer: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    width: "fit-content",
    minHeight: "40px",
    padding: "10px 14px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1,
    whiteSpace: "nowrap",
  },
  stylePreviewTimerValue: {
    fontSize: "13px",
    fontWeight: 900,
    fontVariantNumeric: "tabular-nums",
  },
  timerDigitRow: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    whiteSpace: "nowrap",
  },
  timerOdometerDigit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "18px",
    height: "26px",
    borderRadius: "7px",
    background: "rgba(255,255,255,0.14)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -8px 14px rgba(0,0,0,0.2)",
    fontVariantNumeric: "tabular-nums",
  },
  timerSplitFlapDigit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "19px",
    height: "27px",
    borderRadius: "5px",
    background: "linear-gradient(180deg, rgba(255,255,255,0.18) 0 49%, rgba(0,0,0,0.2) 50% 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 8px rgba(0,0,0,0.22)",
    fontVariantNumeric: "tabular-nums",
  },
  timerDigitSeparator: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "6px",
    fontWeight: 900,
    opacity: 0.82,
  },
  stylePreviewBestSellerPng: {
    position: "absolute",
    top: "-10px",
    right: "-8px",
    zIndex: 1,
    width: "78px",
    height: "78px",
    objectFit: "contain",
    pointerEvents: "none",
  },
  stylePreviewBestSellerPngRibbon: {
    width: "112px",
    height: "42px",
    top: "8px",
    right: "-8px",
  },
  stylePreviewBestSellerPngBanner: {
    width: "104px",
    height: "60px",
    top: "-4px",
  },
  stylePreviewBestSellerPngSpeech: {
    width: "86px",
    height: "64px",
    top: "-2px",
  },
  stylePreviewBestSellerCss: {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "28px",
    padding: "0 10px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "0.04em",
    lineHeight: 1,
    textTransform: "uppercase",
  },
  stylePreviewBestSellerSeal: {
    position: "absolute",
    top: "-8px",
    right: "-6px",
    zIndex: 1,
    display: "grid",
    justifyItems: "center",
    alignContent: "center",
    gap: "1px",
    width: "62px",
    height: "62px",
    borderRadius: "50%",
    border: "3px solid currentColor",
    fontSize: "10px",
    fontWeight: 900,
    lineHeight: 1,
    textTransform: "uppercase",
  },
  stylePreviewEmpty: {
    padding: "18px",
    borderRadius: "14px",
    border: "1px dashed #cbd5cb",
    color: "#5f6b72",
    background: "#fbfcfb",
    fontSize: "14px",
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
  offerProductStack: {
    order: 1,
  },
  offerListStack: {
    gap: "22px",
  },
  offerItemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  offerItemTitle: {
    display: "block",
    margin: 0,
    fontSize: "15px",
  },
  offerItemMeta: {
    display: "block",
    marginTop: "3px",
    paddingLeft: "14px",
    fontSize: "13px",
    color: "#5f6b72",
  },
  offerItemSummaryText: {
    display: "grid",
    gap: "2px",
    minWidth: 0,
  },
  productPickerRow: {
    display: "flex",
    gap: "12px",
    alignItems: "end",
    flexWrap: "wrap",
  },
  productSelectBox: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 0,
    padding: "12px",
    border: "1px solid #cfdcc9",
    borderRadius: "16px",
    background: "#f8fbf6",
  },
  productSearchField: {
    display: "grid",
    gap: "6px",
  },
  productSelectField: {
    display: "grid",
    gap: "6px",
    marginTop: "10px",
    paddingTop: "10px",
    borderTop: "1px solid #dfe8db",
  },
  compactSelect: {
    width: "100%",
    maxWidth: "100%",
    minHeight: "40px",
    paddingTop: 0,
    paddingBottom: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  snapshotBox: {
    display: "grid",
    gap: "14px",
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
