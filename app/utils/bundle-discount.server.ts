const BUNDLE_FUNCTION_TITLES = [
  "bundle-discount-js",
  "Custom Bundle Discount",
];
const DISCOUNT_CONFIG_NAMESPACE = "$app:custom-bundle-discount";
const DISCOUNT_CONFIG_KEY = "function-configuration";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

type PersistedBundleForDiscount = {
  id: string;
  bundleType: "CROSS_SELL" | "VOLUME";
  title: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  automaticDiscountId: string | null;
  offers: Array<{
    id: string;
    title: string;
    quantity: number;
    discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FIXED_PRICE";
    discountValue: number;
    items: Array<{
      sortOrder: number;
      quantity: number;
      productId: string;
      productTitle: string | null;
    }>;
  }>;
};

type DiscountMutationResult = {
  automaticAppDiscount?: {
    discountId?: string | null;
    title?: string | null;
  } | null;
  userErrors?: Array<{
    field?: string[] | null;
    message: string;
  }>;
};

type AutomaticDiscountNodeResult = {
  automaticDiscountNode?: {
    id?: string | null;
    automaticDiscount?:
      | {
          status?: string | null;
        }
      | null;
  } | null;
};

type DiscountLifecycleStatus = "ACTIVE" | "EXPIRED" | "SCHEDULED" | "MISSING" | "UNKNOWN";

export function bundleDiscountTitle(bundleTitle: string) {
  return `Cashenza cross-sell Bundle - ${bundleTitle}`;
}

export function bundleVolumeDiscountTitle(bundleTitle: string) {
  const cleanTitle = String(bundleTitle || "")
    .replace(/\s*volume bundle\s*$/i, "")
    .trim();

  return `Cashenza volume Bundle - ${cleanTitle || bundleTitle}`;
}

export function assertNoUserErrors(payload: DiscountMutationResult | undefined, action: string) {
  const userErrors = payload?.userErrors || [];
  if (userErrors.length === 0) return;

  const message = userErrors
    .map((error) => {
      const field = error.field?.length ? `${error.field.join(".")}: ` : "";
      return `${field}${error.message}`;
    })
    .join(" | ");

  throw new Error(`${action} failed: ${message}`);
}

async function getBundleDiscountFunctionId(admin: AdminGraphqlClient) {
  const response = await admin.graphql(`#graphql
    query BundleDiscountFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
    }`);

  const json = await response.json();
  const nodes = json.data?.shopifyFunctions?.nodes || [];

  const functionNode = BUNDLE_FUNCTION_TITLES.flatMap((expectedTitle) =>
    nodes.filter((node: any) => {
      const title = String(node?.title || "");
      const apiType = String(node?.apiType || "").toLowerCase();
      return apiType.includes("discount") && title === expectedTitle;
    }),
  )[0];

  if (!functionNode?.id) {
    throw new Error(
      "Bundle discount function not found. Restart `shopify app dev` so Shopify registers the new function extension.",
    );
  }

  return String(functionNode.id);
}

export function buildDiscountConfig(bundle: PersistedBundleForDiscount) {
  return {
    version: 1,
    bundleId: bundle.id,
    offers: bundle.offers.map((offer) => ({
      id: offer.id,
      title: offer.title,
      quantity: offer.quantity,
      discountType: offer.discountType,
      discountValue: Number(offer.discountValue || 0),
      items: offer.items.map((item) => ({
        itemIndex: item.sortOrder + 1,
        quantity: item.quantity,
        label: item.productTitle || item.productId,
      })),
    })),
  };
}

function getDiscountStartsAt(bundle: PersistedBundleForDiscount) {
  if (bundle.status === "ACTIVE") {
    return new Date().toISOString();
  }

  // Shopify automatic discounts derive their status from dates. Use a past
  // window so the discount remains present but shows as expired / inactive.
  return new Date("2000-01-01T00:00:00.000Z").toISOString();
}

function getDiscountEndsAt(bundle: PersistedBundleForDiscount) {
  if (bundle.status === "ACTIVE") {
    return null;
  }

  return new Date("2000-01-02T00:00:00.000Z").toISOString();
}

function buildAutomaticDiscountInput(bundle: PersistedBundleForDiscount, functionId: string) {
  const title =
    bundle.bundleType === "CROSS_SELL"
      ? bundleDiscountTitle(bundle.title)
      : bundleVolumeDiscountTitle(bundle.title);

  const input: Record<string, unknown> = {
    title,
    functionId,
    startsAt: getDiscountStartsAt(bundle),
    discountClasses: ["PRODUCT"],
    metafields: [
      {
        namespace: DISCOUNT_CONFIG_NAMESPACE,
        key: DISCOUNT_CONFIG_KEY,
        type: "json",
        value: JSON.stringify(buildDiscountConfig(bundle)),
      },
    ],
  };

  const endsAt = getDiscountEndsAt(bundle);
  if (endsAt) {
    input.endsAt = endsAt;
  }

  return input;
}

async function createAutomaticDiscount(
  admin: AdminGraphqlClient,
  bundle: PersistedBundleForDiscount,
  functionId: string,
) {
  const response = await admin.graphql(
    `#graphql
      mutation CreateBundleAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
            title
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        automaticAppDiscount: buildAutomaticDiscountInput(bundle, functionId),
      },
    },
  );

  const json = await response.json();
  const payload = json.data?.discountAutomaticAppCreate as DiscountMutationResult | undefined;
  assertNoUserErrors(payload, "Creating automatic bundle discount");

  const discountId = payload?.automaticAppDiscount?.discountId;
  if (!discountId) {
    throw new Error("Automatic bundle discount was created without a discount ID.");
  }

  return discountId;
}

async function updateAutomaticDiscount(
  admin: AdminGraphqlClient,
  bundle: PersistedBundleForDiscount,
  automaticDiscountId: string,
  functionId: string,
) {
  const response = await admin.graphql(
    `#graphql
      mutation UpdateBundleAutomaticDiscount(
        $id: ID!
        $automaticAppDiscount: DiscountAutomaticAppInput!
      ) {
        discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
            title
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        id: automaticDiscountId,
        automaticAppDiscount: buildAutomaticDiscountInput(bundle, functionId),
      },
    },
  );

  const json = await response.json();
  const payload = json.data?.discountAutomaticAppUpdate as DiscountMutationResult | undefined;
  assertNoUserErrors(payload, "Updating automatic bundle discount");
}

export async function deleteBundleAutomaticDiscount(
  admin: AdminGraphqlClient,
  automaticDiscountId: string,
) {
  const response = await admin.graphql(
    `#graphql
      mutation DeleteBundleAutomaticDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors {
            field
            message
          }
        }
      }`,
    { variables: { id: automaticDiscountId } },
  );

  const json = await response.json();
  const payload = json.data?.discountAutomaticDelete as
    | {
        deletedAutomaticDiscountId?: string | null;
        userErrors?: Array<{ field?: string[] | null; message: string }>;
      }
    | undefined;

  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    throw new Error(
      `Deleting automatic bundle discount failed: ${userErrors
        .map((error) => error.message)
        .join(" | ")}`,
    );
  }
}

export async function loadAutomaticDiscountStatus(
  admin: AdminGraphqlClient,
  automaticDiscountId: string,
) {
  const response = await admin.graphql(
    `#graphql
      query BundleAutomaticDiscountStatus($id: ID!) {
        automaticDiscountNode(id: $id) {
          id
          automaticDiscount {
            ... on DiscountAutomaticApp {
              status
            }
          }
        }
      }`,
    { variables: { id: automaticDiscountId } },
  );

  const json = await response.json();
  const payload = json.data as AutomaticDiscountNodeResult | undefined;
  const node = payload?.automaticDiscountNode;
  const status = String(node?.automaticDiscount?.status || "").toUpperCase();

  if (!node) {
    return "MISSING";
  }

  if (status === "ACTIVE" || status === "EXPIRED" || status === "SCHEDULED") {
    return status as DiscountLifecycleStatus;
  }

  return "UNKNOWN";
}

export async function reconcileBundleAutomaticDiscountState(
  admin: AdminGraphqlClient,
  bundle: {
    id: string;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    automaticDiscountId: string | null;
  },
) {
  if (!bundle.automaticDiscountId) {
    return {
      shopifyDiscountStatus: "MISSING" as DiscountLifecycleStatus,
      bundleStatus: bundle.status,
      automaticDiscountId: null as string | null,
    };
  }

  const shopifyDiscountStatus = await loadAutomaticDiscountStatus(admin, bundle.automaticDiscountId);
  const nextBundleStatus =
    shopifyDiscountStatus === "ACTIVE" ? "ACTIVE" : ("DRAFT" as const);
  const nextAutomaticDiscountId =
    shopifyDiscountStatus === "MISSING" ? null : bundle.automaticDiscountId;

  if (
    nextBundleStatus !== bundle.status ||
    nextAutomaticDiscountId !== bundle.automaticDiscountId
  ) {
    await prisma.bundle.update({
      where: { id: bundle.id },
      data: {
        status: nextBundleStatus,
        automaticDiscountId: nextAutomaticDiscountId,
      } as any,
    });
  }

  return {
    shopifyDiscountStatus,
    bundleStatus: nextBundleStatus,
    automaticDiscountId: nextAutomaticDiscountId,
  };
}

export async function syncBundleAutomaticDiscount(
  admin: AdminGraphqlClient,
  bundle: PersistedBundleForDiscount,
) {
  const functionId = await getBundleDiscountFunctionId(admin);

  if (bundle.status !== "ACTIVE") {
    if (bundle.automaticDiscountId) {
      try {
        await updateAutomaticDiscount(
          admin,
          bundle,
          bundle.automaticDiscountId,
          functionId,
        );
        return bundle.automaticDiscountId;
      } catch {
        await deleteBundleAutomaticDiscount(admin, bundle.automaticDiscountId);
      }
    }

    return createAutomaticDiscount(admin, bundle, functionId);
  }

  if (bundle.automaticDiscountId) {
    try {
      await updateAutomaticDiscount(
        admin,
        bundle,
        bundle.automaticDiscountId,
        functionId,
      );
      return bundle.automaticDiscountId;
    } catch (error) {
      await deleteBundleAutomaticDiscount(admin, bundle.automaticDiscountId);
      return createAutomaticDiscount(admin, bundle, functionId);
    }
  }

  return createAutomaticDiscount(admin, bundle, functionId);
}
import prisma from "../db.server";
