import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  return redirect(`/app/cross-sell-bundles/new${url.search}`);
};

export const action = async ({}: ActionFunctionArgs) => {
  return redirect("/app/cross-sell-bundles/new");
};

export default function LegacyNewBundleRedirect() {
  return null;
}

export const headers: HeadersFunction = () => ({});
