import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

function redirectToUnifiedBundleEditor(request: Request, bundleId: string) {
  const url = new URL(request.url);
  return redirect(`/app/bundles/${bundleId}${url.search}`);
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const bundleId = params.bundleId;
  if (!bundleId) throw new Response("Bundle not found", { status: 404 });

  return redirectToUnifiedBundleEditor(request, bundleId);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const bundleId = params.bundleId;
  if (!bundleId) throw new Response("Bundle not found", { status: 404 });

  return redirectToUnifiedBundleEditor(request, bundleId);
};
