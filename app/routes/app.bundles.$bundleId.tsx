import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const bundleId = params.bundleId || "";
  return redirect(`/app/cross-sell-bundles/${bundleId}${url.search}`);
};

export const action = async ({ params }: ActionFunctionArgs) => {
  const bundleId = params.bundleId || "";
  return redirect(`/app/cross-sell-bundles/${bundleId}`);
};

export default function LegacyEditBundleRedirect() {
  return null;
}

export const headers: HeadersFunction = () => ({});
