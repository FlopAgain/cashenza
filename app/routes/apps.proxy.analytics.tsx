import type { ActionFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { trackBundleAnalyticsEvent } from "../utils/bundle-analytics.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    let session:
      | Awaited<ReturnType<typeof authenticate.public.appProxy>>["session"]
      | null = null;

    try {
      const authResult = await authenticate.public.appProxy(request);
      session = authResult.session;
    } catch {
      session = null;
    }

    const url = new URL(request.url);
    const shop =
      session?.shop ||
      url.searchParams.get("shop")?.trim() ||
      request.headers.get("x-shopify-shop-domain")?.trim() ||
      "";

    if (!shop) {
      return Response.json({ ok: false, error: "Missing shop" }, { status: 200 });
    }

    const payload = (await request.json()) as any;
    if (!payload?.bundleType || !payload?.eventType) {
      return Response.json({ ok: false, error: "Missing analytics payload" }, { status: 200 });
    }

    await trackBundleAnalyticsEvent(shop, {
      bundleType: payload.bundleType,
      eventType: payload.eventType,
      bundleId: payload.bundleId,
      offerId: payload.offerId,
      productHandle: payload.productHandle,
      sessionId: payload.sessionId,
      offerPosition:
        payload.offerPosition == null ? null : Number(payload.offerPosition),
      offerQuantity:
        payload.offerQuantity == null ? null : Number(payload.offerQuantity),
      metadata:
        payload.metadata && typeof payload.metadata === "object"
          ? payload.metadata
          : null,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown analytics proxy error",
      },
      { status: 200 },
    );
  }
};
