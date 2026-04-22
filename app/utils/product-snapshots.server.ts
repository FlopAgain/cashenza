import type { ProductSnapshotDraft } from "./bundle-configurator";

type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{
    json: () => Promise<any>;
  }>;
};

export async function loadProductSnapshots(
  admin: AdminGraphqlClient,
  handles: string[],
) {
  const uniqueHandles = [...new Set(handles.map((handle) => handle.trim()).filter(Boolean))];
  const snapshots = new Map<string, ProductSnapshotDraft | null>();

  for (const handle of uniqueHandles) {
    const response = await admin.graphql(
      `#graphql
        query ProductByHandle($handle: String!) {
          productByHandle(handle: $handle) {
            id
            handle
            title
            featuredImage {
              url
            }
            variants(first: 50) {
              nodes {
                id
                title
                price
                availableForSale
                image {
                  url
                }
              }
            }
          }
        }`,
      { variables: { handle } },
    );

    const json = await response.json();
    const product = json.data?.productByHandle;

    if (!product) {
      snapshots.set(handle, null);
      continue;
    }

    snapshots.set(handle, {
      id: product.id,
      handle: product.handle,
      title: product.title,
      featuredImage: product.featuredImage?.url || null,
      variants: (product.variants?.nodes || []).map((variant: any) => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        featuredImage: variant.image?.url || null,
        availableForSale: variant.availableForSale,
      })),
    });
  }

  return snapshots;
}

export function snapshotsToRecord(
  snapshots: Map<string, ProductSnapshotDraft | null>,
): Record<string, ProductSnapshotDraft | null> {
  return Object.fromEntries(snapshots.entries());
}
