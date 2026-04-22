import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate, STARTER_PLAN, STARTER_PLAN_CURRENCY, STARTER_PLAN_PRICE } from "../shopify.server";
import {
  isBillingTestMode,
  shouldBypassBillingForShop,
} from "../utils/billing.server";

type ActionData = {
  error?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const billingState = await billing.check({
    plans: [STARTER_PLAN],
    isTest: isBillingTestMode(),
  });
  const bypassBilling = shouldBypassBillingForShop(session.shop);

  return {
    shop: session.shop,
    planName: STARTER_PLAN,
    price: STARTER_PLAN_PRICE,
    currencyCode: STARTER_PLAN_CURRENCY,
    isTestMode: isBillingTestMode(),
    bypassBilling,
    hasActivePayment: bypassBilling || billingState.hasActivePayment,
    appSubscriptions: billingState.appSubscriptions as Array<{
      id: string;
      name: string;
      status: string;
    }>,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "subscribe") {
    return billing.request({
      plan: STARTER_PLAN,
      isTest: isBillingTestMode(),
      returnUrl: new URL("/app/billing", request.url).toString(),
    });
  }

  if (intent === "cancel") {
    const subscriptionId = String(formData.get("subscriptionId") || "").trim();
    if (!subscriptionId) {
      return { error: "Missing subscription id." } satisfies ActionData;
    }

    await billing.cancel({
      subscriptionId,
      isTest: isBillingTestMode(),
      prorate: false,
    });

    return redirect("/app/billing", { target: "_parent" });
  }

  return { error: "Unknown billing action." } satisfies ActionData;
};

export default function BillingPage() {
  const { shop, planName, price, currencyCode, isTestMode, bypassBilling, hasActivePayment, appSubscriptions } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const activeSubscription = appSubscriptions[0];

  return (
    <s-page heading="Billing">
      {actionData?.error ? <s-banner tone="critical">{actionData.error}</s-banner> : null}

      <div style={styles.layout}>
        <section style={styles.hero}>
          <span style={styles.badge}>Starter plan</span>
            <h1 style={styles.title}>Activate paid billing before using Cashenza Bundlify.</h1>
          <p style={styles.text}>
            The live app plan is simple for launch: one Starter subscription at ${price}/30 days.
            This keeps the offer clear while we validate adoption and conversion.
          </p>

          <div style={styles.priceBox}>
            <div style={styles.priceValue}>
              ${price}
              <span style={styles.priceSuffix}>/30 days</span>
            </div>
            <div style={styles.textMuted}>Currency: {currencyCode}</div>
          </div>

          {bypassBilling ? (
            <div style={styles.successPanel}>
              <strong>Billing bypass is active for this development shop.</strong>
              <div style={styles.textMuted}>
                {shop} can access the app as if Starter were active, without creating a paid subscription.
              </div>
            </div>
          ) : hasActivePayment ? (
            <div style={styles.successPanel}>
              <strong>Billing is active.</strong>
              <div style={styles.textMuted}>
                {activeSubscription
                  ? `${activeSubscription.name} (${activeSubscription.status})`
                  : "An active Shopify subscription was found."}
              </div>
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <button type="submit" style={styles.primaryButton} disabled={isSubmitting}>
                {isSubmitting ? "Redirecting..." : "Activate Starter plan"}
              </button>
            </Form>
          )}
        </section>

        <aside style={styles.sidebar}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>What merchants get</h2>
            <ul style={styles.list}>
              <li>Unlimited bundles and bundle offers.</li>
              <li>Per-article variant selectors and variant thumbnails.</li>
              <li>Best seller badges, timers, and design presets.</li>
              <li>Shopify-native automatic discount billing flow.</li>
            </ul>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Billing status</h2>
            <div style={styles.stack}>
              <StatusRow label="Plan" value={planName} />
              <StatusRow label="Mode" value={isTestMode ? "Test" : "Live"} />
              <StatusRow label="Dev bypass" value={bypassBilling ? "Yes" : "No"} />
              <StatusRow label="Active payment" value={hasActivePayment ? "Yes" : "No"} />
            </div>

            {hasActivePayment && activeSubscription && !bypassBilling ? (
              <Form method="post">
                <input type="hidden" name="intent" value="cancel" />
                <input type="hidden" name="subscriptionId" value={activeSubscription.id} />
                <button type="submit" style={styles.secondaryButton} disabled={isSubmitting}>
                  {isSubmitting ? "Cancelling..." : "Cancel subscription"}
                </button>
              </Form>
            ) : null}
          </div>
        </aside>
      </div>
    </s-page>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div style={styles.statusRow}>
      <span style={styles.statusLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.9fr)",
    gap: "20px",
    alignItems: "start",
  },
  hero: {
    padding: "24px",
    borderRadius: "24px",
    background: "linear-gradient(135deg, #f4efe5 0%, #e2eddf 100%)",
    border: "1px solid #d7ddd1",
    display: "grid",
    gap: "16px",
  },
  sidebar: {
    display: "grid",
    gap: "20px",
  },
  badge: {
    display: "inline-flex",
    width: "fit-content",
    padding: "6px 12px",
    borderRadius: "999px",
    background: "#162314",
    color: "#ffffff",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: "34px",
    lineHeight: 1.05,
    letterSpacing: "-0.03em",
    color: "#162314",
  },
  text: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#394737",
    maxWidth: "64ch",
  },
  textMuted: {
    margin: 0,
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#5b6958",
  },
  priceBox: {
    padding: "18px",
    borderRadius: "20px",
    background: "#ffffff",
    border: "1px solid #d9e0d4",
    display: "grid",
    gap: "6px",
  },
  priceValue: {
    fontSize: "36px",
    fontWeight: 800,
    color: "#162314",
  },
  priceSuffix: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#51604e",
    marginLeft: "6px",
  },
  successPanel: {
    padding: "16px 18px",
    borderRadius: "18px",
    background: "#edf8ea",
    border: "1px solid #cfe5c8",
    display: "grid",
    gap: "6px",
  },
  card: {
    padding: "20px",
    borderRadius: "20px",
    border: "1px solid #dbe1d5",
    background: "#ffffff",
    display: "grid",
    gap: "16px",
  },
  cardTitle: {
    margin: 0,
    fontSize: "20px",
    color: "#162314",
  },
  list: {
    margin: 0,
    paddingLeft: "18px",
    display: "grid",
    gap: "10px",
    color: "#556352",
  },
  stack: {
    display: "grid",
    gap: "10px",
  },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: "14px",
    background: "#f5f8f3",
  },
  statusLabel: {
    fontSize: "13px",
    color: "#526150",
    fontWeight: 600,
  },
  primaryButton: {
    minHeight: "48px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "none",
    background: "#162314",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: "46px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "1px solid #162314",
    background: "#ffffff",
    color: "#162314",
    fontWeight: 700,
    cursor: "pointer",
  },
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
