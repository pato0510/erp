-- AlterTable
ALTER TABLE "sii_connections"
  ADD COLUMN "certificateData" BYTEA,
  ADD COLUMN "certificateName" TEXT;
