export type ShopifyDiscountStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "SCHEDULED"
  | "UNKNOWN"
  | "MISSING"
  | null;

export type BundleDatabaseStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type BundleOperationalStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export function normalizeBundleDatabaseStatus(
  status: string | null | undefined,
): BundleDatabaseStatus {
  if (status === "ACTIVE" || status === "ARCHIVED") {
    return status;
  }

  return "DRAFT";
}

export function resolveBundleOperationalStatus(params: {
  bundleStatus: BundleDatabaseStatus;
  automaticDiscountId: string | null;
  shopifyDiscountStatus: ShopifyDiscountStatus;
}): BundleOperationalStatus {
  if (params.bundleStatus === "ARCHIVED") {
    return "ARCHIVED";
  }

  if (
    params.bundleStatus === "ACTIVE" &&
    params.automaticDiscountId &&
    params.shopifyDiscountStatus === "ACTIVE"
  ) {
    return "ACTIVE";
  }

  return "INACTIVE";
}

export function resolveBundleSyncLabel(params: {
  automaticDiscountId: string | null;
  shopifyDiscountStatus: ShopifyDiscountStatus;
}) {
  if (!params.automaticDiscountId || params.shopifyDiscountStatus === "MISSING") {
    return "Missing";
  }

  return "Synced";
}

export function resolveShopifyDiscountStatusLabel(
  status: ShopifyDiscountStatus,
  options?: { style?: "badge" | "select" },
) {
  if (options?.style === "select") {
    return status === "ACTIVE" ? "Active" : "Expired (inactive)";
  }

  if (status === "ACTIVE") return "Active";
  if (status === "EXPIRED") return "Inactive";
  if (status === "SCHEDULED") return "Scheduled";
  if (status === "MISSING") return "Missing";
  return "Unknown";
}
