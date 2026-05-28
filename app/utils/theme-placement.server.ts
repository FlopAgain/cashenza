export const BUNDLE_APP_BLOCK_HANDLE = "bundle_offers";
const PRODUCT_TEMPLATE_FILENAME = "templates/product.json";
const THEME_LAYOUT_FILENAME = "layout/theme.liquid";
const HEAD_GUARD_START = "<!-- Cashenza Bundlify anti-flash guard start -->";
const HEAD_GUARD_END = "<!-- Cashenza Bundlify anti-flash guard end -->";
const NATIVE_PRODUCT_CONTROL_SELECTORS = [
  ".buy-buttons-block",
  ".product-form-buttons",
  ".quantity-selector-wrapper",
  ".accelerated-checkout-block",
  "add-to-cart-component",
  "product-form-component",
  "product-form",
  ".shopify-product-form",
  ".product-form",
  ".product-form__buttons",
  ".shopify-payment-button",
  "variant-picker",
  "product-variant-picker",
  "variant-radios",
  "variant-selects",
  ".product-form__input",
  ".product__selectors",
  ".product-form__submit",
  '[data-testid="standalone-add-to-cart"]',
];

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type PlacementReadinessInput = {
  scopes?: string | null;
};

export type ThemePlacementReadiness = {
  canReadThemes: boolean;
  canWriteThemeFiles: boolean;
  missingScopes: string[];
  status: "ready" | "missing_scopes";
  message: string;
};

export type ThemePlacementInspection = {
  status:
    | "missing_scope"
    | "theme_missing"
    | "template_missing"
    | "template_invalid"
    | "already_placed"
    | "needs_placement"
    | "unsupported"
    | "error";
  themeId?: string;
  themeName?: string;
  templateFilename?: string;
  mainSectionId?: string;
  message: string;
  details: string[];
};

export type ThemePlacementAttempt = {
  status: "blocked" | "skipped" | "ready_for_write" | "placed" | "error";
  message: string;
  details: string[];
};

export type AntiFlashGuardSyncAttempt = {
  status: "skipped" | "synced" | "error";
  message: string;
  details: string[];
};

type ProductTemplateInfo = {
  themeId: string;
  themeName: string;
  filename: string;
  content: string;
};

type ThemeTextFileInfo = ProductTemplateInfo;

function parseScopes(scopes?: string | null) {
  return new Set(
    String(scopes || "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
}

function stringifyScopes(scopes: Iterable<string>) {
  return Array.from(new Set(scopes))
    .map((scope) => scope.trim())
    .filter(Boolean)
    .sort()
    .join(",");
}

export async function resolveThemePlacementScopes({
  admin,
  fallbackScopes,
}: {
  admin: AdminGraphqlClient;
  fallbackScopes?: string | null;
}) {
  try {
    const response = await admin.graphql(
      `#graphql
        query CashenzaCurrentAppScopes {
          currentAppInstallation {
            accessScopes {
              handle
            }
          }
        }
      `,
    );
    const payload = await response.json();
    const handles = payload?.data?.currentAppInstallation?.accessScopes
      ?.map((scope: { handle?: unknown }) => scope.handle)
      .filter((handle: unknown): handle is string => typeof handle === "string");

    if (Array.isArray(handles) && handles.length > 0) {
      return stringifyScopes(handles);
    }
  } catch (error) {
    // Fall back to the stored Shopify session scope if live scope lookup fails.
  }

  return fallbackScopes || "";
}

export function getThemePlacementReadiness({
  scopes,
}: PlacementReadinessInput): ThemePlacementReadiness {
  const parsedScopes = parseScopes(scopes);
  const requiredScopes = ["read_themes", "write_themes"];
  const missingScopes = requiredScopes.filter((scope) => !parsedScopes.has(scope));
  const canReadThemes = parsedScopes.has("read_themes");
  const canWriteThemeFiles = parsedScopes.has("write_themes");

  if (missingScopes.length > 0) {
    return {
      canReadThemes,
      canWriteThemeFiles,
      missingScopes,
      status: "missing_scopes",
      message:
        "Automatic theme placement is not ready yet. The app needs theme read/write access before it can insert or repair the bundle block from the admin.",
    };
  }

  return {
    canReadThemes,
    canWriteThemeFiles,
    missingScopes: [],
    status: "ready",
    message:
      "Theme placement permissions are present. The next implementation step can safely inspect and update the product template.",
  };
}

function getTextBody(body: unknown) {
  if (!body || typeof body !== "object") return "";
  const maybeContent = (body as { content?: unknown }).content;
  return typeof maybeContent === "string" ? maybeContent : "";
}

function findMainSectionId(template: unknown) {
  if (!template || typeof template !== "object") return "";
  const sections = (template as { sections?: unknown }).sections;
  if (!sections || typeof sections !== "object") return "";

  if ("main" in sections) return "main";

  for (const [sectionId, section] of Object.entries(sections)) {
    if (!section || typeof section !== "object") continue;
    const type = (section as { type?: unknown }).type;
    if (typeof type === "string" && type.toLowerCase().includes("product")) {
      return sectionId;
    }
  }

  return "";
}

function templateContainsBundleBlock(templateContent: string) {
  const normalized = templateContent.toLowerCase();
  return (
    normalized.includes(BUNDLE_APP_BLOCK_HANDLE.toLowerCase()) ||
    normalized.includes("cashenza") ||
    normalized.includes("bundlify")
  );
}

function stripShopifyThemeJsonHeader(content: string) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("/*")) return content;

  const headerEnd = trimmed.indexOf("*/");
  if (headerEnd < 0) return content;

  return trimmed.slice(headerEnd + 2).trimStart();
}

function parseThemeJsonTemplate(content: string) {
  return JSON.parse(stripShopifyThemeJsonHeader(content));
}

async function loadThemeTemplateInfo(
  admin: AdminGraphqlClient,
  filename: string,
): Promise<
  | {
      ok: true;
      info: ProductTemplateInfo;
    }
  | {
      ok: false;
      inspection: ThemePlacementInspection;
    }
> {
  const response = await admin.graphql(
    `#graphql
      query CashenzaCurrentThemeProductTemplate($filenames: [String!]!) {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            id
            name
            role
            files(filenames: $filenames, first: 10) {
              nodes {
                filename
                body {
                  ... on OnlineStoreThemeFileBodyText {
                    content
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        filenames: [filename],
      },
    },
  );
  const payload = await response.json();
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length > 0) {
    return {
      ok: false,
      inspection: {
        status: "error",
        message: "Shopify could not inspect the published product template.",
        details: errors.map((error: { message?: string }) => error.message || "Unknown Shopify error"),
      },
    };
  }

  const theme = payload?.data?.themes?.nodes?.[0];
  if (!theme?.id) {
    return {
      ok: false,
      inspection: {
        status: "theme_missing",
        message: "No published theme was found.",
        details: ["Cashenza could not find a MAIN theme to inspect."],
      },
    };
  }

  const file = theme.files?.nodes?.find(
    (node: { filename?: unknown }) => node?.filename === filename,
  );
  const templateContent = getTextBody(file?.body);
  if (!file?.filename || !templateContent) {
    return {
      ok: false,
      inspection: {
        status: "template_missing",
        themeId: theme.id,
        themeName: theme.name,
        message: "The published theme does not expose templates/product.json.",
        details: [
          "Automatic placement currently targets Online Store 2.0 JSON product templates.",
          "Legacy Liquid product templates will need a separate fallback strategy.",
        ],
      },
    };
  }

  return {
    ok: true,
    info: {
      themeId: theme.id,
      themeName: theme.name,
      filename: file.filename,
      content: templateContent,
    },
  };
}

async function loadThemeTextFileInfo(
  admin: AdminGraphqlClient,
  filename: string,
): Promise<
  | {
      ok: true;
      info: ThemeTextFileInfo;
    }
  | {
      ok: false;
      message: string;
      details: string[];
    }
> {
  const response = await admin.graphql(
    `#graphql
      query CashenzaCurrentThemeTextFile($filenames: [String!]!) {
        themes(first: 1, roles: [MAIN]) {
          nodes {
            id
            name
            files(filenames: $filenames, first: 10) {
              nodes {
                filename
                body {
                  ... on OnlineStoreThemeFileBodyText {
                    content
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        filenames: [filename],
      },
    },
  );
  const payload = await response.json();
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  if (errors.length > 0) {
    return {
      ok: false,
      message: `Shopify could not inspect ${filename}.`,
      details: errors.map((error: { message?: string }) => error.message || "Unknown Shopify error"),
    };
  }

  const theme = payload?.data?.themes?.nodes?.[0];
  const file = theme?.files?.nodes?.find(
    (node: { filename?: unknown }) => node?.filename === filename,
  );
  const content = getTextBody(file?.body);

  if (!theme?.id || !file?.filename || !content) {
    return {
      ok: false,
      message: `${filename} was not available for the published theme.`,
      details: [`Cashenza could not read ${filename}.`],
    };
  }

  return {
    ok: true,
    info: {
      themeId: theme.id,
      themeName: theme.name,
      filename: file.filename,
      content,
    },
  };
}

export async function inspectCurrentProductTemplatePlacement({
  admin,
  scopes,
}: {
  admin: AdminGraphqlClient;
  scopes?: string | null;
}): Promise<ThemePlacementInspection> {
  const readiness = getThemePlacementReadiness({ scopes });

  if (!readiness.canReadThemes) {
    return {
      status: "missing_scope",
      message: "Product template inspection needs the read_themes scope.",
      details: [`Missing scopes: ${readiness.missingScopes.join(", ")}`],
    };
  }

  try {
    const templateInfo = await loadThemeTemplateInfo(admin, PRODUCT_TEMPLATE_FILENAME);
    if (!templateInfo.ok) return templateInfo.inspection;

    const { themeId, themeName, filename, content: templateContent } = templateInfo.info;

    let parsedTemplate: unknown;
    try {
      parsedTemplate = parseThemeJsonTemplate(templateContent);
    } catch {
      return {
        status: "template_invalid",
        themeId,
        themeName,
        templateFilename: filename,
        message: "The product template JSON could not be parsed safely.",
        details: ["Cashenza will not modify a template unless the current structure is valid JSON."],
      };
    }

    const mainSectionId = findMainSectionId(parsedTemplate);
    if (!mainSectionId) {
      return {
        status: "unsupported",
        themeId,
        themeName,
        templateFilename: filename,
        message: "No product main section was detected in templates/product.json.",
        details: ["Cashenza needs a product section target before it can place the app block safely."],
      };
    }

    if (templateContainsBundleBlock(templateContent)) {
      return {
        status: "already_placed",
        themeId,
        themeName,
        templateFilename: filename,
        mainSectionId,
        message: "The Cashenza bundle block appears to already be present in the product template.",
        details: [`Theme: ${themeName}`, `Target section: ${mainSectionId}`],
      };
    }

    return {
      status: "needs_placement",
      themeId,
      themeName,
      templateFilename: filename,
      mainSectionId,
      message: "The product template is readable and needs the Cashenza bundle block.",
      details: [
        `Theme: ${themeName}`,
        `Template: ${filename}`,
        `Recommended target section: ${mainSectionId}`,
      ],
    };
  } catch (error) {
    return {
      status: "error",
      message: "Theme placement inspection failed unexpectedly.",
      details: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

function getSectionRecord(template: unknown, sectionId: string) {
  if (!template || typeof template !== "object") return null;
  const sections = (template as { sections?: unknown }).sections;
  if (!sections || typeof sections !== "object") return null;
  const section = (sections as Record<string, unknown>)[sectionId];
  return section && typeof section === "object" ? (section as Record<string, unknown>) : null;
}

function getSectionsRecord(template: unknown) {
  if (!template || typeof template !== "object") return null;
  const sections = (template as { sections?: unknown }).sections;
  return sections && typeof sections === "object" && !Array.isArray(sections)
    ? (sections as Record<string, unknown>)
    : null;
}

function findPurchaseButtonBlockId(section: Record<string, unknown>) {
  const blocks = section.blocks;
  if (!blocks || typeof blocks !== "object") return "";
  const blockEntries = Object.entries(blocks as Record<string, unknown>);
  const match = blockEntries.find(([, block]) => {
    if (!block || typeof block !== "object") return false;
    const type = String((block as { type?: unknown }).type || "").toLowerCase();
    return type.includes("buy") || type.includes("button") || type.includes("purchase");
  });
  return match?.[0] || "";
}

function findBlockContainerWithPurchase(container: Record<string, unknown>): Record<string, unknown> | null {
  if (findPurchaseButtonBlockId(container)) return container;

  const blocks = container.blocks;
  if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) return null;

  for (const block of Object.values(blocks as Record<string, unknown>)) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    const nestedMatch = findBlockContainerWithPurchase(block as Record<string, unknown>);
    if (nestedMatch) return nestedMatch;
  }

  return null;
}

function isStaticThemeBlock(block: unknown) {
  return Boolean(block && typeof block === "object" && (block as { static?: unknown }).static === true);
}

function normalizeEditableBlockOrder(section: Record<string, unknown>, blocks: Record<string, unknown>) {
  const currentOrder = Array.isArray(section.block_order)
    ? (section.block_order as unknown[]).filter((blockId): blockId is string => typeof blockId === "string")
    : Object.keys(blocks);

  section.block_order = currentOrder.filter(
    (blockId) => blockId in blocks && !isStaticThemeBlock(blocks[blockId]),
  );
  return section.block_order as string[];
}

function normalizeAllBlockOrders(container: Record<string, unknown>) {
  const blocks = container.blocks;
  if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) return;

  normalizeEditableBlockOrder(container, blocks as Record<string, unknown>);
  for (const block of Object.values(blocks as Record<string, unknown>)) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    normalizeAllBlockOrders(block as Record<string, unknown>);
  }
}

function templateAlreadyContainsCustomLiquidBundle(template: unknown) {
  const sections = getSectionsRecord(template);
  const appsSection = sections?.cashenza_bundle_apps;
  if (!appsSection || typeof appsSection !== "object" || Array.isArray(appsSection)) return false;

  const section = appsSection as { type?: unknown; settings?: unknown };
  const settings = section.settings && typeof section.settings === "object"
    ? (section.settings as { custom_liquid?: unknown })
    : {};
  const customLiquid = String(settings.custom_liquid || "");

  return (
    String(section.type || "") === "custom-liquid" &&
    customLiquid.includes("bundle-widget") &&
    customLiquid.includes("/apps/custom-bundles/widget")
  );
}

function templateAlreadyContainsAntiFlashGuard(template: unknown) {
  const sections = getSectionsRecord(template);
  const guardSection = sections?.cashenza_bundle_guard;
  if (!guardSection || typeof guardSection !== "object" || Array.isArray(guardSection)) {
    return false;
  }

  const section = guardSection as { type?: unknown; settings?: unknown };
  const settings = section.settings && typeof section.settings === "object"
    ? (section.settings as { custom_liquid?: unknown })
    : {};
  const customLiquid = String(settings.custom_liquid || "");

  return (
    String(section.type || "") === "custom-liquid" &&
    customLiquid.includes("cashenza-bundle-loading")
  );
}

function buildNativeControlsHideCss() {
  const selectorList = NATIVE_PRODUCT_CONTROL_SELECTORS.map((selector) => `    ${selector}`).join(",\n");

  return `
  .cashenza-bundle-loading :is(
${selectorList}
  ):not(.bundle-widget *) {
    display: none !important;
  }
`.trim();
}

function buildAntiFlashGuardMarkup() {
  return `
<style data-cashenza-bundle-critical>
${buildNativeControlsHideCss()}
</style>
<script>
  (() => {
    document.documentElement.classList.add("cashenza-bundle-loading");
    document.body?.classList?.add("cashenza-bundle-loading");
    const container =
      document.querySelector(".product-information") ||
      document.querySelector(".product-details") ||
      document.querySelector("main");
    container?.classList?.add("cashenza-bundle-loading");

    window.setTimeout(() => {
      if (document.documentElement.dataset.cashenzaBundleState !== "active") {
        document.documentElement.dataset.cashenzaBundleState = "timeout";
        document.documentElement.classList.add("cashenza-bundle-ready");
        document.documentElement.classList.remove("cashenza-bundle-loading");
        document.body?.classList?.remove("cashenza-bundle-loading");
        container?.classList?.remove("cashenza-bundle-loading");
      }
    }, 2200);
  })();
</script>
`.trim();
}

function buildHeadAntiFlashGuardMarkup() {
  return `
${HEAD_GUARD_START}
{% if request.page_type == 'product' or template.name == 'product' %}
<style id="cashenza-bundle-head-guard">
${buildNativeControlsHideCss()}
</style>
<script id="cashenza-bundle-head-guard-script">
  (() => {
    const root = document.documentElement;
    root.classList.add("cashenza-bundle-loading");
    root.dataset.cashenzaBundleState = root.dataset.cashenzaBundleState || "pending";
    window.setTimeout(() => {
      if (root.dataset.cashenzaBundleState !== "active") {
        root.dataset.cashenzaBundleState = "timeout";
        root.classList.add("cashenza-bundle-ready");
        root.classList.remove("cashenza-bundle-loading");
      }
    }, 2200);
  })();
</script>
{% endif %}
${HEAD_GUARD_END}
`.trim();
}

function buildDisabledHeadAntiFlashGuardMarkup() {
  return `
${HEAD_GUARD_START}
<!-- Cashenza Bundlify anti-flash guard disabled from app settings -->
${HEAD_GUARD_END}
`.trim();
}

export function patchThemeLayoutWithAntiFlashGuardForTest({
  layoutContent,
}: {
  layoutContent: string;
}) {
  return patchThemeLayoutAntiFlashGuardSettingForTest({
    layoutContent,
    enabled: true,
  });
}

export function patchThemeLayoutAntiFlashGuardSettingForTest({
  layoutContent,
  enabled,
}: {
  layoutContent: string;
  enabled: boolean;
}) {
  const nextGuard = enabled
    ? buildHeadAntiFlashGuardMarkup()
    : buildDisabledHeadAntiFlashGuardMarkup();
  const existingStart = layoutContent.indexOf(HEAD_GUARD_START);
  const existingEnd = layoutContent.indexOf(HEAD_GUARD_END);

  if (existingStart >= 0 && existingEnd >= existingStart) {
    const replacementEnd = existingEnd + HEAD_GUARD_END.length;
    const content = `${layoutContent.slice(0, existingStart)}${nextGuard}${layoutContent.slice(replacementEnd)}`;

    return {
      content,
      changed: content !== layoutContent,
    };
  }

  if (!enabled) {
    return {
      content: layoutContent,
      changed: false,
    };
  }

  if (layoutContent.includes(nextGuard)) {
    return {
      content: layoutContent,
      changed: false,
    };
  }

  const headCloseIndex = layoutContent.toLowerCase().indexOf("</head>");
  if (headCloseIndex >= 0) {
    return {
      content: `${layoutContent.slice(0, headCloseIndex)}${nextGuard}\n${layoutContent.slice(headCloseIndex)}`,
      changed: true,
    };
  }

  return {
    content: `${nextGuard}\n${layoutContent}`,
    changed: true,
  };
}

function patchExistingProductTemplateAntiFlashGuardSetting({
  templateContent,
  antiFlashGuardEnabled,
}: {
  templateContent: string;
  antiFlashGuardEnabled: boolean;
}) {
  const parsedTemplate = parseThemeJsonTemplate(templateContent);
  const mainSectionId = findMainSectionId(parsedTemplate);
  if (!mainSectionId) {
    return {
      content: templateContent,
      changed: false,
    };
  }

  const hasCustomLiquidBundle = templateAlreadyContainsCustomLiquidBundle(parsedTemplate);
  const hasGuardSection = templateAlreadyContainsAntiFlashGuard(parsedTemplate);
  if (!hasCustomLiquidBundle && !hasGuardSection) {
    return {
      content: templateContent,
      changed: false,
    };
  }

  const guardChanged = ensureAntiFlashGuardSection(
    parsedTemplate,
    mainSectionId,
    antiFlashGuardEnabled,
  );
  const customLiquidChanged = syncCustomLiquidBundleMarkup(
    parsedTemplate,
    antiFlashGuardEnabled,
  );

  return {
    content: JSON.stringify(parsedTemplate, null, 2),
    changed: guardChanged || customLiquidChanged,
  };
}

export async function syncAntiFlashGuardOnPublishedTheme({
  admin,
  enabled,
}: {
  admin: AdminGraphqlClient;
  enabled: boolean;
}): Promise<AntiFlashGuardSyncAttempt> {
  if (process.env.CASHENZA_ENABLE_THEME_WRITES !== "true") {
    return {
      status: "skipped",
      message: "Anti-flash guard setting saved, but theme writes are disabled.",
      details: ["Required flag to update the live theme: CASHENZA_ENABLE_THEME_WRITES=true"],
    };
  }

  try {
    const layoutInfo = await loadThemeTextFileInfo(admin, THEME_LAYOUT_FILENAME);
    if (!layoutInfo.ok) {
      return {
        status: "error",
        message: "Anti-flash guard setting was saved, but Cashenza could not read layout/theme.liquid.",
        details: layoutInfo.details,
      };
    }

    const patch = patchThemeLayoutAntiFlashGuardSettingForTest({
      layoutContent: layoutInfo.info.content,
      enabled,
    });
    const files: Array<{
      filename: string;
      body: {
        type: "TEXT";
        value: string;
      };
    }> = [];
    const details = [`Theme: ${layoutInfo.info.themeName}`, `Layout: ${THEME_LAYOUT_FILENAME}`];

    if (patch.changed) {
      files.push({
        filename: THEME_LAYOUT_FILENAME,
        body: {
          type: "TEXT",
          value: patch.content,
        },
      });
    }

    const templateInfo = await loadThemeTemplateInfo(admin, PRODUCT_TEMPLATE_FILENAME);
    if (templateInfo.ok) {
      try {
        const productPatch = patchExistingProductTemplateAntiFlashGuardSetting({
          templateContent: templateInfo.info.content,
          antiFlashGuardEnabled: enabled,
        });

        if (productPatch.changed) {
          files.push({
            filename: PRODUCT_TEMPLATE_FILENAME,
            body: {
              type: "TEXT",
              value: productPatch.content,
            },
          });
          details.push(`Product template fallback guard: ${enabled ? "enabled" : "disabled"}.`);
        }
      } catch (error) {
        details.push(
          `Product template fallback guard was not updated: ${
            error instanceof Error ? error.message : "Unknown template patch error"
          }`,
        );
      }
    } else {
      details.push(...templateInfo.inspection.details);
    }

    if (!files.length) {
      return {
        status: "skipped",
        message: enabled
          ? "Anti-flash guard is already enabled in the published theme."
          : "Anti-flash guard is already disabled in the published theme.",
        details,
      };
    }

    const response = await admin.graphql(
      `#graphql
        mutation CashenzaSyncAntiFlashGuard(
          $themeId: ID!
          $files: [OnlineStoreThemeFilesUpsertFileInput!]!
        ) {
          themeFilesUpsert(themeId: $themeId, files: $files) {
            upsertedThemeFiles {
              filename
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          themeId: layoutInfo.info.themeId,
          files,
        },
      },
    );
    const payload = await response.json();
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const userErrors = payload?.data?.themeFilesUpsert?.userErrors || [];
    if (errors.length > 0 || userErrors.length > 0) {
      return {
        status: "error",
        message: "Shopify rejected the anti-flash guard theme update.",
        details: [
          ...errors.map((error: { message?: string }) => error.message || "Unknown Shopify error"),
          ...userErrors.map((error: { message?: string }) => error.message || "Unknown theme file error"),
        ],
      };
    }

    return {
      status: "synced",
      message: enabled
        ? "Anti-flash guard was enabled in the published theme."
        : "Anti-flash guard was disabled in the published theme.",
      details,
    };
  } catch (error) {
    return {
      status: "error",
      message: "Anti-flash guard theme sync failed unexpectedly.",
      details: [error instanceof Error ? error.message : "Unknown anti-flash guard sync error"],
    };
  }
}

function ensureAntiFlashGuardSection(
  template: unknown,
  mainSectionId: string,
  enabled = true,
) {
  const sections = getSectionsRecord(template);
  if (!sections) throw new Error("Template sections are missing.");

  const guardSectionId = "cashenza_bundle_guard";
  const templateRecord = template as { order?: unknown };
  const currentOrder = Array.isArray(templateRecord.order)
    ? templateRecord.order.filter((sectionId): sectionId is string => typeof sectionId === "string")
    : Object.keys(sections);

  if (!enabled) {
    const previousOrder = currentOrder.join("\u0000");
    const guardExisted = guardSectionId in sections;
    delete sections[guardSectionId];
    const nextOrder = currentOrder.filter((sectionId) => sectionId !== guardSectionId);
    templateRecord.order = nextOrder;

    return guardExisted || previousOrder !== nextOrder.join("\u0000");
  }

  const nextGuardMarkup = buildAntiFlashGuardMarkup();
  const existingGuard = sections[guardSectionId];
  const existingSettings =
    existingGuard && typeof existingGuard === "object" && !Array.isArray(existingGuard)
      ? (existingGuard as { settings?: unknown }).settings
      : {};
  const existingCustomLiquid =
    existingSettings && typeof existingSettings === "object"
      ? String((existingSettings as { custom_liquid?: unknown }).custom_liquid || "")
      : "";
  const guardMarkupChanged = existingCustomLiquid !== nextGuardMarkup;

  sections[guardSectionId] = {
    type: "custom-liquid",
    settings: {
      ...(existingSettings && typeof existingSettings === "object" && !Array.isArray(existingSettings)
        ? existingSettings
        : {}),
      custom_liquid: nextGuardMarkup,
      color_scheme: "",
      section_width: "page-width",
      "padding-block-start": 0,
      "padding-block-end": 0,
    },
  };

  const previousOrder = currentOrder.join("\u0000");
  const existingIndex = currentOrder.indexOf(guardSectionId);
  if (existingIndex >= 0) currentOrder.splice(existingIndex, 1);

  const mainIndex = currentOrder.indexOf(mainSectionId);
  if (mainIndex >= 0) {
    currentOrder.splice(mainIndex, 0, guardSectionId);
  } else {
    currentOrder.unshift(guardSectionId);
  }

  templateRecord.order = currentOrder;

  return guardMarkupChanged || previousOrder !== currentOrder.join("\u0000");
}

function buildCustomLiquidBundleMarkup({
  antiFlashGuardEnabled = true,
}: {
  antiFlashGuardEnabled?: boolean;
} = {}) {
  return `
${antiFlashGuardEnabled ? `${buildAntiFlashGuardMarkup()}\n` : ""}<div
  class="bundle-widget bundle-widget--soft"
  id="bundle-widget-cashenza-{{ product.handle }}"
  hidden
  data-bundle-visibility="pending"
  data-best-seller-preset="pill"
  style="
    --bundle-accent-base: #8db28a;
    --bundle-bg: color-mix(in srgb, #8db28a 20%, white);
    --bundle-bg-selected: color-mix(in srgb, #8db28a 30%, white);
    --bundle-border: color-mix(in srgb, #8db28a 22%, white);
    --bundle-input: color-mix(in srgb, #8db28a 42%, white);
    --bundle-text: #1a2118;
    --bundle-heading-size: 28px;
    --bundle-subheading-size: 16px;
    --bundle-offer-title-size: 22px;
    --bundle-offer-price-size: 24px;
    --bundle-card-gap: 12px;
    --bundle-card-padding: 18px;
    --bundle-card-radius: 24px;
    --bundle-bestseller-bg: #ffffff;
    --bundle-bestseller-text: #1a2118;
    --bundle-save-bg: #f1c500;
    --bundle-save-text: #1a2118;
    --bundle-timer-bg: #1a2118;
    --bundle-timer-text: #ffffff;
    --bundle-offer-count: 3;
  "
>
  <script type="application/json" data-bundle-config>
    {
      "locale": {{ request.locale.iso_code | json }},
      "currencyCode": {{ cart.currency.iso_code | json }},
      "productHandle": {{ product.handle | json }},
      "proxyUrl": {{ "/apps/custom-bundles/bundles?product_handle=" | append: product.handle | append: "&shop=" | append: shop.permanent_domain | json }},
      "analyticsUrl": {{ "/apps/custom-bundles/analytics?shop=" | append: shop.permanent_domain | json }},
      "themeEffectsPreset": "fade in",
      "themeTimerPreset": "soft",
      "themeBadgeAppearance": {
        "bestSellerBadgePreset": "pill",
        "bestSellerPngBadgePreset": "none",
        "bestSellerBadgeColor": "#ffffff",
        "bestSellerBadgeText": "#1a2118",
        "saveBadgeColor": "#f1c500",
        "saveBadgeText": "#1a2118",
        "saveBadgePrefix": "Save"
      },
      "bestSellerPngAssets": {
        "orange-ribbon": {{ "/apps/custom-bundles/badge?preset=orange-ribbon" | json }},
        "blue-award": {{ "/apps/custom-bundles/badge?preset=blue-award" | json }},
        "gold-award": {{ "/apps/custom-bundles/badge?preset=gold-award" | json }},
        "pink-banner": {{ "/apps/custom-bundles/badge?preset=pink-banner" | json }},
        "red-speech": {{ "/apps/custom-bundles/badge?preset=red-speech" | json }},
        "red-stamp": {{ "/apps/custom-bundles/badge?preset=red-stamp" | json }}
      }
    }
  </script>
  <div class="bundle-widget__topbar">
    <div class="bundle-widget__header">
      <p class="bundle-widget__eyebrow">Bundle and save</p>
      <h2 class="bundle-widget__title">Choose your bundle</h2>
      <p class="bundle-widget__subheading">Pick the offer that fits your customer best.</p>
    </div>
    <div class="bundle-widget__timer bundle-widget__timer--soft" data-bundle-timer hidden>
      <span class="bundle-widget__timer-label">Offer ends in</span>
      <span class="bundle-widget__timer-value">00:00:00</span>
    </div>
  </div>
  <div class="bundle-dynamic-root"></div>
  <div class="bundle-static-root" data-static-root hidden></div>
</div>
<link rel="stylesheet" href="/apps/custom-bundles/widget-css?shop={{ shop.permanent_domain }}">
<script src="/apps/custom-bundles/widget?shop={{ shop.permanent_domain }}" defer></script>
`.trim();
}

function syncCustomLiquidBundleMarkup(template: unknown, antiFlashGuardEnabled: boolean) {
  const sections = getSectionsRecord(template);
  const appsSection = sections?.cashenza_bundle_apps;
  if (!appsSection || typeof appsSection !== "object" || Array.isArray(appsSection)) {
    return false;
  }

  const section = appsSection as { type?: unknown; settings?: unknown };
  const settings =
    section.settings && typeof section.settings === "object" && !Array.isArray(section.settings)
      ? (section.settings as { custom_liquid?: unknown })
      : null;
  const customLiquid = String(settings?.custom_liquid || "");

  if (
    String(section.type || "") !== "custom-liquid" ||
    !customLiquid.includes("bundle-widget") ||
    !customLiquid.includes("/apps/custom-bundles/widget")
  ) {
    return false;
  }

  const nextCustomLiquid = buildCustomLiquidBundleMarkup({ antiFlashGuardEnabled });
  if (customLiquid === nextCustomLiquid) return false;

  (section as { settings: Record<string, unknown> }).settings = {
    ...(settings || {}),
    custom_liquid: nextCustomLiquid,
  };

  return true;
}

function addBundleBlockToAppsSection(
  template: unknown,
  mainSectionId: string,
  antiFlashGuardEnabled = true,
) {
  const sections = getSectionsRecord(template);
  if (!sections) throw new Error("Template sections are missing.");

  ensureAntiFlashGuardSection(template, mainSectionId, antiFlashGuardEnabled);

  const appsSectionId = "cashenza_bundle_apps";
  sections[appsSectionId] = {
    type: "custom-liquid",
    settings: {
      custom_liquid: buildCustomLiquidBundleMarkup({ antiFlashGuardEnabled }),
      color_scheme: "",
      section_width: "page-width",
      "padding-block-start": 0,
      "padding-block-end": 0,
    },
  };

  const templateRecord = template as { order?: unknown };
  const currentOrder = Array.isArray(templateRecord.order)
    ? templateRecord.order.filter((sectionId): sectionId is string => typeof sectionId === "string")
    : Object.keys(sections);

  const existingIndex = currentOrder.indexOf(appsSectionId);
  if (existingIndex >= 0) currentOrder.splice(existingIndex, 1);

  const mainIndex = currentOrder.indexOf(mainSectionId);
  if (mainIndex >= 0) {
    currentOrder.splice(mainIndex + 1, 0, appsSectionId);
  } else {
    currentOrder.push(appsSectionId);
  }

  templateRecord.order = currentOrder;

  return {
    blockId: "",
    mainSectionId: appsSectionId,
  };
}

export function patchProductTemplateWithBundleBlockForTest({
  templateContent,
  antiFlashGuardEnabled = true,
}: {
  templateContent: string;
  appBlockType?: string;
  antiFlashGuardEnabled?: boolean;
}) {
  const parsedTemplate = parseThemeJsonTemplate(templateContent);
  const mainSectionId = findMainSectionId(parsedTemplate);
  if (!mainSectionId) {
    throw new Error("No product main section found.");
  }

  const section = getSectionRecord(parsedTemplate, mainSectionId);
  if (!section) {
    throw new Error("Product main section is missing.");
  }

  normalizeAllBlockOrders(section);

  if (templateAlreadyContainsCustomLiquidBundle(parsedTemplate)) {
    const guardChanged = ensureAntiFlashGuardSection(
      parsedTemplate,
      mainSectionId,
      antiFlashGuardEnabled,
    );
    const customLiquidChanged = syncCustomLiquidBundleMarkup(
      parsedTemplate,
      antiFlashGuardEnabled,
    );

    return {
      content: JSON.stringify(parsedTemplate, null, 2),
      mainSectionId,
      blockId: "",
      changed: guardChanged || customLiquidChanged,
    };
  }

  const appsPatch = addBundleBlockToAppsSection(
    parsedTemplate,
    mainSectionId,
    antiFlashGuardEnabled,
  );

  return {
    content: JSON.stringify(parsedTemplate, null, 2),
    mainSectionId: appsPatch.mainSectionId,
    blockId: appsPatch.blockId,
    changed: true,
  };
}

export async function placeBundleBlockOnProductTemplate({
  admin,
  scopes,
  antiFlashGuardEnabled = true,
}: {
  admin: AdminGraphqlClient;
  scopes?: string | null;
  productId?: string;
  antiFlashGuardEnabled?: boolean;
}): Promise<ThemePlacementAttempt> {
  const readiness = getThemePlacementReadiness({ scopes });
  if (readiness.status !== "ready") {
    return {
      status: "blocked",
      message: "Cashenza cannot place the bundle block until theme permissions are ready.",
      details:
        readiness.missingScopes.length > 0
          ? [`Missing scopes: ${readiness.missingScopes.join(", ")}`]
          : ["Theme permissions are not ready."],
    };
  }

  if (process.env.CASHENZA_ENABLE_THEME_WRITES !== "true") {
    return {
      status: "blocked",
      message:
        "Theme writes are deliberately disabled. Enable them only after Shopify grants write_themes access and the app block type has been verified on a deployed extension.",
      details: ["Required flag: CASHENZA_ENABLE_THEME_WRITES=true"],
    };
  }

  const templateInfo = await loadThemeTemplateInfo(admin, PRODUCT_TEMPLATE_FILENAME);
  if (!templateInfo.ok) {
    return {
      status: "blocked",
      message: templateInfo.inspection.message,
      details: templateInfo.inspection.details,
    };
  }

  let patch;
  try {
    patch = patchProductTemplateWithBundleBlockForTest({
      templateContent: templateInfo.info.content,
      antiFlashGuardEnabled,
    });
  } catch (error) {
    return {
      status: "blocked",
      message: "Cashenza could not prepare a safe default product template patch.",
      details: [error instanceof Error ? error.message : "Unknown patch error"],
    };
  }

  const files: Array<{
    filename: string;
    body: {
      type: "TEXT";
      value: string;
    };
  }> = [];
  const placementDetails = [
    `Theme: ${templateInfo.info.themeName}`,
    `Template: ${PRODUCT_TEMPLATE_FILENAME}`,
    `Section target: ${patch.mainSectionId}`,
    "The widget remains hidden on products without an active Cashenza bundle.",
    "A single volume bundle and a single cross-sell bundle can coexist on the same product.",
  ];

  if (patch.changed) {
    files.push({
      filename: PRODUCT_TEMPLATE_FILENAME,
      body: {
        type: "TEXT",
        value: patch.content,
      },
    });
  }

  try {
    const layoutInfo = await loadThemeTextFileInfo(admin, THEME_LAYOUT_FILENAME);
    if (layoutInfo.ok) {
      const layoutPatch = patchThemeLayoutAntiFlashGuardSettingForTest({
        layoutContent: layoutInfo.info.content,
        enabled: antiFlashGuardEnabled,
      });

      if (layoutPatch.changed) {
        files.push({
          filename: THEME_LAYOUT_FILENAME,
          body: {
            type: "TEXT",
            value: layoutPatch.content,
          },
        });
        placementDetails.push(
          antiFlashGuardEnabled
            ? "Head anti-flash guard: repaired."
            : "Head anti-flash guard: disabled by app settings.",
        );
      } else {
        placementDetails.push(
          antiFlashGuardEnabled
            ? "Head anti-flash guard: already present."
            : "Head anti-flash guard: disabled by app settings.",
        );
      }
    } else {
      placementDetails.push(
        "Head anti-flash guard: not updated; product-section fallback remains active.",
        ...layoutInfo.details,
      );
    }
  } catch (error) {
    placementDetails.push(
      "Head anti-flash guard: not updated; product-section fallback remains active.",
      error instanceof Error ? error.message : "Unknown layout guard error",
    );
  }

  if (files.length === 0) {
    return {
      status: "skipped",
      message: "The Cashenza bundle block and head anti-flash guard are already present.",
      details: placementDetails,
    };
  }

  try {
    const themeResponse = await admin.graphql(
      `#graphql
        mutation CashenzaPlaceProductBundleBlock(
          $themeId: ID!
          $files: [OnlineStoreThemeFilesUpsertFileInput!]!
        ) {
          themeFilesUpsert(themeId: $themeId, files: $files) {
            upsertedThemeFiles {
              filename
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          themeId: templateInfo.info.themeId,
          files,
        },
      },
    );
    const themePayload = await themeResponse.json();
    const themeErrors = Array.isArray(themePayload?.errors) ? themePayload.errors : [];
    const themeUserErrors = themePayload?.data?.themeFilesUpsert?.userErrors || [];
    if (themeErrors.length > 0 || themeUserErrors.length > 0) {
      return {
        status: "error",
        message: "Shopify rejected the default product template update.",
        details: [
          ...themeErrors.map((error: { message?: string }) => error.message || "Unknown Shopify error"),
          ...themeUserErrors.map((error: { message?: string }) => error.message || "Unknown theme file error"),
        ],
      };
    }

    return {
      status: "placed",
      message: patch.changed
        ? "The Cashenza bundle block was added to the default product template."
        : "The Cashenza storefront placement was repaired.",
      details: placementDetails,
    };
  } catch (error) {
    return {
      status: "error",
      message: "Default product template placement failed unexpectedly.",
      details: [error instanceof Error ? error.message : "Unknown placement error"],
    };
  }
}
