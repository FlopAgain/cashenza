import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const bundleCount = await prisma.bundle.count({
    where: {
      shop: session.shop,
      automaticDiscountId: {
        not: null,
      },
    },
  });
  const needsFirstBundleSetup = bundleCount === 0;
  const allowedDuringSetup = new Set(["/app", "/app/bundles/new", "/app/billing"]);

  if (needsFirstBundleSetup && !allowedDuringSetup.has(url.pathname)) {
    return redirect("/app");
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    needsFirstBundleSetup,
  };
};

export default function App() {
  const { apiKey, needsFirstBundleSetup } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <ui-nav-menu>
        <s-link href="/app">Dashboard</s-link>
        {needsFirstBundleSetup ? null : (
          <>
            <s-link href="/app/bundles">Bundles</s-link>
            <s-link href="/app/volume-bundles">Volume</s-link>
            <s-link href="/app/cross-sell-bundles">Cross-sells</s-link>
            <s-link href="/app/analytics">Analytics</s-link>
            <s-link href="/app/diagnostics">Diagnostics</s-link>
            <s-link href="/app/billing">Billing</s-link>
            <s-link href="/app/settings">Settings</s-link>
          </>
        )}
      </ui-nav-menu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
