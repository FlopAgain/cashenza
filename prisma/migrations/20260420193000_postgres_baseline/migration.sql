-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BundleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BundleDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FIXED_PRICE');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "appDisplayName" TEXT NOT NULL DEFAULT 'Cashenza custom-bundle',
    "supportEmail" TEXT,
    "defaultAddToCartLabel" TEXT NOT NULL DEFAULT 'Add selected bundle',
    "defaultSaveBadgeLabel" TEXT NOT NULL DEFAULT 'Save',
    "defaultTimerPrefix" TEXT NOT NULL DEFAULT 'Offer ends in',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "productHandle" TEXT,
    "status" "BundleStatus" NOT NULL DEFAULT 'DRAFT',
    "bestSellerOfferId" TEXT,
    "automaticDiscountId" TEXT,
    "showVariantPicker" BOOLEAN NOT NULL DEFAULT true,
    "showVariantThumbnails" BOOLEAN NOT NULL DEFAULT false,
    "designPreset" TEXT NOT NULL DEFAULT 'soft',
    "primaryColor" TEXT NOT NULL DEFAULT '#8db28a',
    "textColor" TEXT NOT NULL DEFAULT '#1a2118',
    "heading" TEXT NOT NULL DEFAULT 'Choose your bundle',
    "subheading" TEXT NOT NULL DEFAULT 'Pick the offer that fits your customer best.',
    "eyebrow" TEXT NOT NULL DEFAULT 'Bundle and save',
    "headingSize" INTEGER NOT NULL DEFAULT 28,
    "subheadingSize" INTEGER NOT NULL DEFAULT 16,
    "offerTitleSize" INTEGER NOT NULL DEFAULT 22,
    "offerPriceSize" INTEGER NOT NULL DEFAULT 24,
    "cardGap" INTEGER NOT NULL DEFAULT 12,
    "cardPadding" INTEGER NOT NULL DEFAULT 18,
    "offerRadius" INTEGER NOT NULL DEFAULT 24,
    "bestSellerBadgeColor" TEXT NOT NULL DEFAULT '#ffffff',
    "bestSellerBadgeText" TEXT NOT NULL DEFAULT '#1a2118',
    "saveBadgeColor" TEXT NOT NULL DEFAULT '#f1c500',
    "saveBadgeText" TEXT NOT NULL DEFAULT '#1a2118',
    "saveBadgePrefix" TEXT NOT NULL DEFAULT 'Save',
    "showTimer" BOOLEAN NOT NULL DEFAULT false,
    "timerEnd" TEXT,
    "timerPrefix" TEXT NOT NULL DEFAULT 'Offer ends in',
    "timerExpiredText" TEXT NOT NULL DEFAULT 'Offer expired',
    "timerBackgroundColor" TEXT NOT NULL DEFAULT '#1a2118',
    "timerTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleOffer" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "quantity" INTEGER NOT NULL,
    "discountType" "BundleDiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleOfferItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "variantId" TEXT,
    "variantTitle" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "allowVariantSelection" BOOLEAN NOT NULL DEFAULT false,
    "showVariantThumbnails" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleOfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- CreateIndex
CREATE INDEX "Bundle_shop_status_idx" ON "Bundle"("shop", "status");

-- CreateIndex
CREATE INDEX "BundleOffer_bundleId_sortOrder_idx" ON "BundleOffer"("bundleId", "sortOrder");

-- CreateIndex
CREATE INDEX "BundleOfferItem_offerId_sortOrder_idx" ON "BundleOfferItem"("offerId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BundleOffer" ADD CONSTRAINT "BundleOffer_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleOfferItem" ADD CONSTRAINT "BundleOfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "BundleOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
