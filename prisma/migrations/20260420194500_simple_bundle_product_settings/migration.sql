CREATE TABLE "SimpleBundleProductSetting" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "productTitle" TEXT,
    "productHandle" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpleBundleProductSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SimpleBundleProductSetting_shop_productHandle_key"
ON "SimpleBundleProductSetting"("shop", "productHandle");

CREATE INDEX "SimpleBundleProductSetting_shop_enabled_idx"
ON "SimpleBundleProductSetting"("shop", "enabled");
