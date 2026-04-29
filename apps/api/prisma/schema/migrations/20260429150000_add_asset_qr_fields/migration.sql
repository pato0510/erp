-- OPS-035 — public-scan QR codes per operational asset.
-- Each asset gets a unique 32-char base64url token that encodes a
-- public URL. Scanning the printed sticker hits a public page that
-- shows live status + compliance — no login required for the
-- limited view.

ALTER TABLE "operational_assets"
  ADD COLUMN "qrToken"         TEXT,
  ADD COLUMN "qrGeneratedAt"   TIMESTAMP(3),
  ADD COLUMN "qrLastScannedAt" TIMESTAMP(3),
  ADD COLUMN "qrScanCount"     INTEGER NOT NULL DEFAULT 0;

-- Token uniqueness — also serves as the lookup index for the
-- public scan endpoint (`WHERE qrToken = ?` is the hot path).
CREATE UNIQUE INDEX "operational_assets_qrToken_key"
  ON "operational_assets" ("qrToken")
  WHERE "qrToken" IS NOT NULL;
