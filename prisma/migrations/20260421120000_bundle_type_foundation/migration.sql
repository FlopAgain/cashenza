-- CreateEnum
CREATE TYPE "BundleType" AS ENUM ('CROSS_SELL', 'VOLUME');

-- AlterTable
ALTER TABLE "Bundle"
ADD COLUMN "bundleType" "BundleType" NOT NULL DEFAULT 'CROSS_SELL';

-- CreateIndex
CREATE INDEX "Bundle_shop_bundleType_status_idx" ON "Bundle"("shop", "bundleType", "status");

-- CreateIndex
CREATE INDEX "Bundle_shop_bundleType_productHandle_idx" ON "Bundle"("shop", "bundleType", "productHandle");
