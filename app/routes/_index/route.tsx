import type { LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

const highlights = [
  {
    label: "Volume bundles",
    title: "Sell more of the same product without confusing the purchase flow.",
    text: "Create clean quantity ladders such as 1x, 2x, 3x or 10x with Shopify discounts, stock-aware variants, urgency timers and storefront buttons that replace the native add-to-cart flow.",
  },
  {
    label: "Cross-sell bundles",
    title: "Package complementary products into a single high-converting offer.",
    text: "Build product combinations with per-item quantities, fixed variants or customer-selected variants, best seller badges, buy now buttons and a cart discount that stays aligned with Shopify.",
  },
  {
    label: "Admin-first setup",
    title: "Configure bundles from the app, then let Cashenza handle the storefront.",
    text: "Choose a product, create the bundle, generate the matching Shopify discount and place or repair the storefront block directly from the admin.",
  },
];

const proofPoints = [
  "One Shopify discount per bundle",
  "Volume and cross-sell can coexist on a product",
  "Theme placement and anti-flash guard built in",
  "Preview, timer, badges, effects and style presets",
];

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.brandRow}>
            <img
              className={styles.logoMark}
              src="/cashenza-square.svg"
              alt="Cashenza Bundlify"
            />
            <div>
              <p className={styles.kicker}>Cashenza Bundlify</p>
              <p className={styles.brandSubline}>Private beta for Shopify merchants</p>
            </div>
          </div>

          <h1 className={styles.heading}>
            Premium bundle offers that replace the messy product-page purchase flow.
          </h1>

          <p className={styles.lead}>
            Cashenza Bundlify helps Shopify merchants create volume bundles and cross-sell
            bundles from one admin-first workflow. Each bundle is tied to a real Shopify
            discount, rendered only where it belongs, and designed to keep the storefront
            fast, clear and conversion-focused.
          </p>

          {showForm ? (
            <Form className={styles.installCard} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>Install on a Shopify store</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="my-shop.myshopify.com"
                  autoComplete="off"
                />
              </label>
              <button className={styles.button} type="submit">
                Open Cashenza
              </button>
            </Form>
          ) : null}

          <div className={styles.proofGrid}>
            {proofPoints.map((point) => (
              <span key={point} className={styles.proofPill}>
                {point}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.visualGlow} />
          <article className={`${styles.previewCard} ${styles.previewCardTop}`}>
            <div className={styles.previewHeader}>
              <span>Volume bundle</span>
              <strong>Repeated quantity offer</strong>
            </div>
            <img
              className={styles.previewImage}
              src="/volume_bundle_example.png"
              alt="Volume bundle storefront example"
            />
          </article>
          <article className={`${styles.previewCard} ${styles.previewCardBottom}`}>
            <div className={styles.previewHeader}>
              <span>Cross-sell bundle</span>
              <strong>Multi-product package</strong>
            </div>
            <img
              className={styles.previewImage}
              src="/crosssell_bundle_example.png"
              alt="Cross-sell bundle storefront example"
            />
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>What Cashenza handles</p>
          <h2 className={styles.sectionTitle}>
            A bundle system built around Shopify discounts, not fake storefront math.
          </h2>
        </div>

        <div className={styles.featureGrid}>
          {highlights.map((item) => (
            <article key={item.label} className={styles.featureCard}>
              <span className={styles.featureLabel}>{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.flowSection}>
        <div>
          <p className={styles.kicker}>Merchant workflow</p>
          <h2 className={styles.sectionTitle}>
            From product selection to live storefront bundle in one controlled flow.
          </h2>
        </div>
        <ol className={styles.flowList}>
          <li>
            <strong>Select a product</strong>
            <span>Start from the admin and choose the product page that should sell more.</span>
          </li>
          <li>
            <strong>Choose the bundle type</strong>
            <span>Pick volume for repeated quantities or cross-sell for product packages.</span>
          </li>
          <li>
            <strong>Save the Shopify discount</strong>
            <span>Cashenza creates and keeps the matching automatic discount in sync.</span>
          </li>
          <li>
            <strong>Render cleanly on the storefront</strong>
            <span>The widget replaces native controls only when a configured bundle exists.</span>
          </li>
        </ol>
      </section>
    </main>
  );
}
