-- CreateEnum
CREATE TYPE "BundleAnalyticsEventType" AS ENUM (
  'BUNDLE_IMPRESSION',
  'OFFER_SELECTED',
  'ADD_TO_CART',
  'BUY_NOW',
  'ADD_TO_CART_FAILED'
);

-- CreateTable
CREATE TABLE "BundleAnalyticsEvent" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "bundleType" "BundleType" NOT NULL,
  "eventType" "BundleAnalyticsEventType" NOT NULL,
  "bundleId" TEXT,
  "offerId" TEXT,
  "productHandle" TEXT,
  "sessionId" TEXT,
  "offerPosition" INTEGER,
  "offerQuantity" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BundleAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BundleAnalyticsEvent_shop_createdAt_idx" ON "BundleAnalyticsEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "BundleAnalyticsEvent_shop_bundleType_eventType_createdAt_idx" ON "BundleAnalyticsEvent"("shop", "bundleType", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "BundleAnalyticsEvent_bundleId_offerId_createdAt_idx" ON "BundleAnalyticsEvent"("bundleId", "offerId", "createdAt");
