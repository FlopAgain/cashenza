import { authenticate } from "../shopify.server";
import { STARTER_PLAN } from "../shopify.server";
import {
  buildStarterBillingFailureResponse,
  isBillingTestMode,
} from "./billing-helpers";

export { isBillingTestMode } from "./billing-helpers";

export function buildRequireStarterPlanOptions(
  redirect: any,
) {
  return {
    plans: [STARTER_PLAN] as [typeof STARTER_PLAN],
    isTest: isBillingTestMode(),
    onFailure: buildStarterBillingFailureResponse(redirect),
  };
}

const DEFAULT_BILLING_BYPASS_SHOPS = [
  "bundle-dev-w89ntc1k.myshopify.com",
];

export function getBillingBypassShops() {
  const configuredShops = String(process.env.BILLING_BYPASS_SHOPS || "")
    .split(",")
    .map((shop) => shop.trim())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_BILLING_BYPASS_SHOPS, ...configuredShops]));
}

export function shouldBypassBillingForShop(shop: string) {
  return getBillingBypassShops().includes(shop);
}

export async function requireStarterPlan(request: Request) {
  const auth = await authenticate.admin(request);

  if (shouldBypassBillingForShop(auth.session.shop)) {
    return auth;
  }

  await auth.billing.require(buildRequireStarterPlanOptions(auth.redirect));

  return auth;
}
