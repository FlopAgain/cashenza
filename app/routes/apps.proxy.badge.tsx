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

const BADGE_FILES: Record<string, string> = {
  "orange-ribbon": "best-seller-orange-ribbon.png",
  "blue-award": "best-seller-blue-award.png",
  "gold-award": "best-seller-gold-award.png",
  "pink-banner": "best-seller-pink-banner.png",
  "red-speech": "best-seller-red-speech.png",
  "red-stamp": "best-seller-red-stamp.png",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {
    // Keep local theme previews resilient while still serving only known files.
  }

  const url = new URL(request.url);
  const preset = url.searchParams.get("preset") || "";
  const filename = BADGE_FILES[preset];

  if (!filename) {
    return new Response("Badge not found", { status: 404 });
  }

  const bytes = await readFile(path.join(extensionAssetsDir, filename));

  return new Response(bytes, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/png",
    },
  });
};

