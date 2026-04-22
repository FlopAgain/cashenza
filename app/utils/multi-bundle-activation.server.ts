import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient | PrismaClient;

export async function deactivateOtherActiveBundlesForProduct(
  tx: TxClient,
  params: {
    shop: string;
    productHandle: string;
    keepBundleId?: string;
  },
) {
  const productHandle = params.productHandle.trim();
  if (!productHandle) return [];

  const bundlesToDeactivate = await tx.bundle.findMany({
    where: {
      shop: params.shop,
      bundleType: "CROSS_SELL",
      productHandle,
      status: "ACTIVE",
      ...(params.keepBundleId ? { NOT: { id: params.keepBundleId } } : {}),
    },
    select: {
      id: true,
      automaticDiscountId: true,
    },
  });

  if (!bundlesToDeactivate.length) return [];

  await tx.bundle.updateMany({
    where: {
      id: { in: bundlesToDeactivate.map((bundle) => bundle.id) },
    },
    data: {
      status: "DRAFT",
      automaticDiscountId: null,
    } as any,
  });

  return bundlesToDeactivate;
}
