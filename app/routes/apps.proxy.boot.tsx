import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";

function createBootResponse() {
  return new Response("window.__cashenzaBundleBoot = window.__cashenzaBundleBoot || { ok: true };\n", {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/javascript; charset=utf-8",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {
    // Best effort: this endpoint only prevents noisy 404s from legacy boot pings.
  }

  return createBootResponse();
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch {
    // Best effort: this endpoint only prevents noisy 404s from legacy boot pings.
  }

  return createBootResponse();
};
