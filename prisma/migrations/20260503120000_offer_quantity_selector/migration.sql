ALTER TABLE "BundleOffer"
ADD COLUMN "showQuantitySelector" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "quantityOptions" TEXT;
