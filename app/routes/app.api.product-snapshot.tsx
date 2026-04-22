import type { LoaderFunctionArgs } from "react-router";

import { requireStarterPlan } from "../utils/billing.server";
import { loadProductSnapshots, snapshotsToRecord } from "../utils/product-snapshots.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await requireStarterPlan(request);
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle")?.trim() || "";

  if (!handle) {
    return Response.json({ ok: false, error: "Missing product handle." }, { status: 400 });
  }

  const snapshots = await loadProductSnapshots(admin, [handle]);
  const record = snapshotsToRecord(snapshots);

  return Response.json({
    ok: true,
    handle,
    product: record[handle] || null,
  });
};
