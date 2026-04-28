-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('EQUIPMENT', 'VEHICLE', 'TOOL', 'INFRASTRUCTURE');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'WITH_OBSERVATIONS', 'NON_OPERATIONAL', 'IN_MAINTENANCE', 'BLOCKED_DOCUMENTAL', 'BLOCKED_PERMIT', 'OUT_OF_SERVICE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID', 'LPG', 'OTHER');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentLocationId" UUID,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_types" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_subtypes" (
    "id" UUID NOT NULL,
    "assetTypeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "specifications" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_subtypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_assets" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "assetTypeId" UUID NOT NULL,
    "assetSubtypeId" UUID,
    "locationId" UUID,
    "parentAssetId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "acquisitionDate" DATE,
    "acquisitionCost" DECIMAL(18,2),
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "statusReason" TEXT,
    "statusChangedAt" TIMESTAMP(3),
    "photoPath" TEXT,
    "dynamicAttributes" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignedToUserId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "operational_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "vin" TEXT,
    "year" INTEGER,
    "currentKilometers" INTEGER NOT NULL DEFAULT 0,
    "lastKmUpdate" TIMESTAMP(3),
    "fuelType" "FuelType" NOT NULL,
    "registrationDate" DATE,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_companyId_code_key" ON "locations"("companyId", "code");

-- CreateIndex
CREATE INDEX "locations_companyId_parentLocationId_idx" ON "locations"("companyId", "parentLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_companyId_name_key" ON "asset_types"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "asset_subtypes_assetTypeId_name_key" ON "asset_subtypes"("assetTypeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "operational_assets_companyId_code_key" ON "operational_assets"("companyId", "code");

-- CreateIndex
CREATE INDEX "operational_assets_companyId_assetTypeId_idx" ON "operational_assets"("companyId", "assetTypeId");

-- CreateIndex
CREATE INDEX "operational_assets_companyId_locationId_idx" ON "operational_assets"("companyId", "locationId");

-- CreateIndex
CREATE INDEX "operational_assets_companyId_status_idx" ON "operational_assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "operational_assets_companyId_parentAssetId_idx" ON "operational_assets"("companyId", "parentAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_assetId_key" ON "vehicles"("assetId");

-- CreateIndex
CREATE INDEX "vehicles_licensePlate_idx" ON "vehicles"("licensePlate");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_parentLocationId_fkey" FOREIGN KEY ("parentLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_subtypes" ADD CONSTRAINT "asset_subtypes_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_assets" ADD CONSTRAINT "operational_assets_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_assets" ADD CONSTRAINT "operational_assets_assetSubtypeId_fkey" FOREIGN KEY ("assetSubtypeId") REFERENCES "asset_subtypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_assets" ADD CONSTRAINT "operational_assets_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_assets" ADD CONSTRAINT "operational_assets_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "operational_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "operational_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS for locations
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY location_isolation ON locations
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- RLS for asset_types
ALTER TABLE asset_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_type_isolation ON asset_types
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- RLS for asset_subtypes (inherits via assetType)
ALTER TABLE asset_subtypes ENABLE ROW LEVEL SECURITY;
CREATE POLICY asset_subtype_isolation ON asset_subtypes
  USING (
    EXISTS (
      SELECT 1 FROM asset_types
      WHERE asset_types.id = asset_subtypes."assetTypeId"
        AND asset_types."companyId" = current_setting('rls.company_id', true)::uuid
    )
  );

-- RLS for operational_assets
ALTER TABLE operational_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY operational_asset_isolation ON operational_assets
  USING ("companyId" = current_setting('rls.company_id', true)::uuid);

-- RLS for vehicles (inherits via operational_assets)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehicle_isolation ON vehicles
  USING (
    EXISTS (
      SELECT 1 FROM operational_assets
      WHERE operational_assets.id = vehicles."assetId"
        AND operational_assets."companyId" = current_setting('rls.company_id', true)::uuid
    )
  );

-- Grants to app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON locations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_types TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON asset_subtypes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON operational_assets TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles TO app_user;

-- Audit triggers
CREATE TRIGGER audit_locations
  AFTER INSERT OR UPDATE OR DELETE ON locations
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_asset_types
  AFTER INSERT OR UPDATE OR DELETE ON asset_types
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_operational_assets
  AFTER INSERT OR UPDATE OR DELETE ON operational_assets
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_vehicles
  AFTER INSERT OR UPDATE OR DELETE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
