export const STYLE_PRESETS = [
  "soft",
  "soft-actions",
  "cards",
  "outline",
  "minimal",
  "split",
  "luxury",
  "contrast",
  "compact",
  "radio",
  "catalog",
  "stacked",
] as const;

export const STYLE_PRESET_LABELS: Record<string, string> = {
  soft: "Soft (Default)",
  "soft-actions": "Soft + Dual CTA",
  cards: "Cards",
  outline: "Outline",
  minimal: "Minimal",
  split: "Split Panel",
  luxury: "Luxury",
  contrast: "High Contrast",
  compact: "Compact",
  radio: "Radio Offer Cards",
  catalog: "Catalog List",
  stacked: "Buy More Save More",
};
