import assert from "node:assert/strict";
import test from "node:test";

import {
  patchProductTemplateWithBundleBlockForTest,
  patchThemeLayoutAntiFlashGuardSettingForTest,
  patchThemeLayoutWithAntiFlashGuardForTest,
} from "../app/utils/theme-placement.server.ts";

const appBlockType = "shopify://apps/cashenza-bundlify/blocks/bundle_offers/test";

function assertCustomLiquidPlacement(patched: any) {
  const guardSection = patched.sections.cashenza_bundle_guard;
  const appsSection = patched.sections.cashenza_bundle_apps;

  assert.equal(guardSection.type, "custom-liquid");
  assert.equal(typeof guardSection.settings.custom_liquid, "string");
  assert.match(guardSection.settings.custom_liquid, /cashenza-bundle-loading/);
  assert.match(guardSection.settings.custom_liquid, /data-cashenza-bundle-critical/);
  assert.equal(appsSection.type, "custom-liquid");
  assert.equal(typeof appsSection.settings.custom_liquid, "string");
  assert.match(appsSection.settings.custom_liquid, /bundle-widget/);
  assert.match(appsSection.settings.custom_liquid, /\/apps\/custom-bundles\/bundles/);
  assert.match(appsSection.settings.custom_liquid, /\/apps\/custom-bundles\/widget/);
  assert.match(appsSection.settings.custom_liquid, /\/apps\/custom-bundles\/widget-css/);
  assert.deepEqual(patched.order, ["cashenza_bundle_guard", "main", "cashenza_bundle_apps"]);
}

test("patchProductTemplateWithBundleBlockForTest adds an anti-flash guard before main and bundle section after main", () => {
  const template = {
    sections: {
      main: {
        type: "main-product",
        blocks: {
          title: { type: "title", settings: {} },
          buy_buttons: { type: "buy_buttons", settings: {} },
        },
        block_order: ["title", "buy_buttons"],
      },
    },
    order: ["main"],
  };

  const result = patchProductTemplateWithBundleBlockForTest({
    templateContent: JSON.stringify(template),
    appBlockType,
  });
  const patched = JSON.parse(result.content);

  assert.equal(result.changed, true);
  assert.equal(result.mainSectionId, "cashenza_bundle_apps");
  assert.equal(patched.sections.main.blocks.cashenza_bundle_app, undefined);
  assert.deepEqual(patched.sections.main.block_order, ["title", "buy_buttons"]);
  assertCustomLiquidPlacement(patched);
});

test("patchProductTemplateWithBundleBlockForTest repairs guard without duplicating an existing custom-liquid widget", () => {
  const template = {
    sections: {
      main: {
        type: "main-product",
        blocks: {
          buy_buttons: { type: "buy_buttons", settings: {} },
        },
        block_order: ["buy_buttons"],
      },
      cashenza_bundle_apps: {
        type: "custom-liquid",
        settings: {
          custom_liquid:
            '<div class="bundle-widget"></div><script src="/apps/custom-bundles/widget?shop={{ shop.permanent_domain }}" defer></script>',
        },
      },
    },
    order: ["main", "cashenza_bundle_apps"],
  };

  const result = patchProductTemplateWithBundleBlockForTest({
    templateContent: JSON.stringify(template),
    appBlockType,
  });
  const patched = JSON.parse(result.content);

  assert.equal(result.changed, true);
  assert.deepEqual(patched.order, ["cashenza_bundle_guard", "main", "cashenza_bundle_apps"]);
  assert.equal(patched.sections.cashenza_bundle_guard.type, "custom-liquid");
  assert.match(
    patched.sections.cashenza_bundle_guard.settings.custom_liquid,
    /cashenza-bundle-loading/,
  );
});

test("patchProductTemplateWithBundleBlockForTest removes product-template guard when anti-flash guard is disabled", () => {
  const template = {
    sections: {
      cashenza_bundle_guard: {
        type: "custom-liquid",
        settings: {
          custom_liquid: "<script>document.documentElement.classList.add('cashenza-bundle-loading')</script>",
        },
      },
      main: {
        type: "main-product",
        blocks: {
          buy_buttons: { type: "buy_buttons", settings: {} },
        },
        block_order: ["buy_buttons"],
      },
      cashenza_bundle_apps: {
        type: "custom-liquid",
        settings: {
          custom_liquid:
            '<style data-cashenza-bundle-critical></style><div class="bundle-widget"></div><script src="/apps/custom-bundles/widget?shop={{ shop.permanent_domain }}" defer></script>',
        },
      },
    },
    order: ["cashenza_bundle_guard", "main", "cashenza_bundle_apps"],
  };

  const result = patchProductTemplateWithBundleBlockForTest({
    templateContent: JSON.stringify(template),
    antiFlashGuardEnabled: false,
  });
  const patched = JSON.parse(result.content);

  assert.equal(result.changed, true);
  assert.equal(patched.sections.cashenza_bundle_guard, undefined);
  assert.deepEqual(patched.order, ["main", "cashenza_bundle_apps"]);
  assert.doesNotMatch(
    patched.sections.cashenza_bundle_apps.settings.custom_liquid,
    /data-cashenza-bundle-critical/,
  );
  assert.match(patched.sections.cashenza_bundle_apps.settings.custom_liquid, /bundle-widget/);
});

test("patchProductTemplateWithBundleBlockForTest accepts Shopify generated JSON comments", () => {
  const templateContent = `/*
 * ------------------------------------------------------------
 * IMPORTANT: The contents of this file are auto-generated.
 * ------------------------------------------------------------
 */
{
  "sections": {
    "main": {
      "type": "main-product",
      "blocks": {
        "buy_buttons": { "type": "buy_buttons", "settings": {} }
      },
      "block_order": ["buy_buttons"]
    }
  },
  "order": ["main"]
}`;

  const result = patchProductTemplateWithBundleBlockForTest({
    templateContent,
    appBlockType,
  });
  const patched = JSON.parse(result.content);

  assert.equal(result.changed, true);
  assertCustomLiquidPlacement(patched);
});

test("patchProductTemplateWithBundleBlockForTest removes static blocks from block_order", () => {
  const template = {
    sections: {
      main: {
        type: "product-information",
        blocks: {
          "media-gallery": { type: "_product-media-gallery", static: true, settings: {} },
          "product-details": { type: "_product-details", static: true, settings: {} },
          title: { type: "title", settings: {} },
          buy_buttons: { type: "buy_buttons", settings: {} },
        },
        block_order: ["media-gallery", "product-details", "title", "buy_buttons"],
      },
    },
    order: ["main"],
  };

  const result = patchProductTemplateWithBundleBlockForTest({
    templateContent: JSON.stringify(template),
    appBlockType,
  });
  const patched = JSON.parse(result.content);

  assert.equal(patched.sections.main.blocks["media-gallery"].static, true);
  assert.equal(patched.sections.main.blocks["product-details"].static, true);
  assert.deepEqual(patched.sections.main.block_order, ["title", "buy_buttons"]);
  assertCustomLiquidPlacement(patched);
});

test("patchProductTemplateWithBundleBlockForTest repairs nested Horizon product details with a custom-liquid section", () => {
  const template = {
    sections: {
      main: {
        type: "product-information",
        blocks: {
          "media-gallery": { type: "_product-media-gallery", static: true, settings: {} },
          "product-details": {
            type: "_product-details",
            static: true,
            settings: {},
            blocks: {
              group: { type: "group", settings: {} },
              buy_buttons: { type: "buy-buttons", settings: {}, blocks: {} },
            },
            block_order: ["orphan_app_block", "group", "buy_buttons"],
          },
        },
      },
    },
    order: ["main"],
  };

  const result = patchProductTemplateWithBundleBlockForTest({
    templateContent: JSON.stringify(template),
    appBlockType,
  });
  const patched = JSON.parse(result.content);
  const details = patched.sections.main.blocks["product-details"];

  assert.equal(patched.sections.main.blocks.cashenza_bundle_app, undefined);
  assert.equal(details.blocks.cashenza_bundle_app, undefined);
  assert.deepEqual(details.block_order, ["group", "buy_buttons"]);
  assertCustomLiquidPlacement(patched);
});

test("patchThemeLayoutWithAntiFlashGuardForTest inserts the critical guard before head close", () => {
  const result = patchThemeLayoutWithAntiFlashGuardForTest({
    layoutContent: "<html><head><title>Shop</title></head><body>{{ content_for_layout }}</body></html>",
  });

  assert.equal(result.changed, true);
  assert.match(result.content, /Cashenza Bundlify anti-flash guard start/);
  assert.match(result.content, /request\.page_type == 'product'/);
  assert.match(result.content, /cashenza-bundle-ready/);
  assert.ok(result.content.indexOf("cashenza-bundle-head-guard") < result.content.indexOf("</head>"));
});

test("patchThemeLayoutWithAntiFlashGuardForTest repairs an existing critical guard", () => {
  const result = patchThemeLayoutWithAntiFlashGuardForTest({
    layoutContent:
      "<html><head><!-- Cashenza Bundlify anti-flash guard start -->old<!-- Cashenza Bundlify anti-flash guard end --></head><body></body></html>",
  });

  assert.equal(result.changed, true);
  assert.doesNotMatch(result.content, /old/);
  assert.match(result.content, /cashenza-bundle-head-guard-script/);
});

test("patchThemeLayoutAntiFlashGuardSettingForTest disables an existing critical guard", () => {
  const enabled = patchThemeLayoutWithAntiFlashGuardForTest({
    layoutContent: "<html><head></head><body></body></html>",
  });
  const disabled = patchThemeLayoutAntiFlashGuardSettingForTest({
    layoutContent: enabled.content,
    enabled: false,
  });

  assert.equal(disabled.changed, true);
  assert.match(disabled.content, /anti-flash guard disabled from app settings/);
  assert.doesNotMatch(disabled.content, /cashenza-bundle-head-guard-script/);
  assert.doesNotMatch(disabled.content, /cashenza-bundle-loading :is/);
});
