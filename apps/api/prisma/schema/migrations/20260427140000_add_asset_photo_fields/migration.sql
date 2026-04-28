-- Photo storage fields on operational_assets. photoPath holds the MinIO/S3 key
-- when object storage is configured; photoData/photoMimeType are the DB fallback
-- when MinIO is unavailable. photoMimeType is set whenever a photo exists,
-- regardless of storage backend, so callers can determine "has photo".

ALTER TABLE "operational_assets" ADD COLUMN "photoData" BYTEA;
ALTER TABLE "operational_assets" ADD COLUMN "photoMimeType" TEXT;
