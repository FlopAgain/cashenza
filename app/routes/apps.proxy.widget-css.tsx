import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

const routeDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(routeDir, "..", "..");
const blockLiquidPath = path.join(
  appRoot,
  "extensions",
  "custom-bundle-app-extension",
  "blocks",
  "bundle_offers.liquid",
);

const fallbackCss = `
.bundle-widget[hidden],
.bundle-widget[data-bundle-visibility="hidden"] {
  display: none !important;
}
`.trim();

async function loadBundleCss() {
  const liquid = await readFile(blockLiquidPath, "utf8");
  const styleBlocks = Array.from(
    liquid.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi),
    (match) => String(match[1] || "").trim(),
  ).filter(Boolean);

  if (!styleBlocks.length) return fallbackCss;
  return styleBlocks.join("\n\n").trim() || fallbackCss;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {
    // The CSS is public storefront styling; signed app proxy auth is best-effort in local dev.
  }

  let css = fallbackCss;
  try {
    css = await loadBundleCss();
  } catch {
    css = fallbackCss;
  }

  return new Response(css, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/css; charset=utf-8",
    },
  });
};
