import { reconcileBundleAutomaticDiscountState } from "./bundle-discount.server";
import {
  normalizeBundleDatabaseStatus,
  resolveBundleOperationalStatus,
  resolveBundleSyncLabel,
  resolveShopifyDiscountStatusLabel,
  type BundleDatabaseStatus,
} from "./bundle-status";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: {
      variables?: Record<string, unknown>;
    },
  ) => Promise<Response>;
};

export async function loadBundleStatusSnapshot(
  admin: AdminGraphqlClient,
  bundle: {
    id: string;
    status: BundleDatabaseStatus;
    automaticDiscountId: string | null;
  },
) {
  const reconciled = await reconcileBundleAutomaticDiscountState(admin, bundle);

  return {
    ...reconciled,
    operationalStatus: resolveBundleOperationalStatus({
      bundleStatus: normalizeBundleDatabaseStatus(reconciled.bundleStatus),
      automaticDiscountId: reconciled.automaticDiscountId,
      shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
    }),
    syncLabel: resolveBundleSyncLabel({
      automaticDiscountId: reconciled.automaticDiscountId,
      shopifyDiscountStatus: reconciled.shopifyDiscountStatus,
    }),
    discountStatusLabel: resolveShopifyDiscountStatusLabel(
      reconciled.shopifyDiscountStatus,
    ),
  };
}
