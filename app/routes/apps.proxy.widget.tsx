import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

const routeDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(routeDir, "..", "..");
const extensionAssetsDir = path.join(
  appRoot,
  "extensions",
  "custom-bundle-app-extension",
  "assets",
);

async function readAsset(filename: string) {
  return readFile(path.join(extensionAssetsDir, filename), "utf8");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {
    // The widget is storefront-only code; keep local/dev diagnostics from becoming hard failures.
  }

  const [bridge, widget] = await Promise.all([
    readAsset("cashenza-bundle-bridge.js"),
    readAsset("cashenza-bundle-widget.js"),
  ]);

  return new Response(`${bridge}\n;\n${widget}\n`, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
};
