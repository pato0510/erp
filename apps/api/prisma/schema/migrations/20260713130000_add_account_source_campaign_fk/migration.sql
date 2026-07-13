-- MKT-006 — promote accounts.sourceCampaignId (a bare UUID hook since COM-003) into a
-- real FK referencing campaigns(id). accounts is an EXISTING audited table, so this
-- migration adds NO RLS policy / audit trigger / GRANT (those already exist; a
-- FOR EACH ROW audit trigger captures the column automatically).

-- Defensive orphan cleanup — NULL any sourceCampaignId that does not point at a real
-- campaign BEFORE adding the constraint. Recon (MKT-000 M2) expects ZERO affected rows;
-- nulling garbage is production-safe and beats bricking the Railway boot with a failed
-- ADD CONSTRAINT on a value that was never referentially validated.
UPDATE accounts
  SET "sourceCampaignId" = NULL
  WHERE "sourceCampaignId" IS NOT NULL
    AND "sourceCampaignId" NOT IN (SELECT id FROM campaigns);

-- AddForeignKey — ON DELETE SET NULL: deleting a campaign only CLEARS the attribution
-- (sets sourceCampaignId NULL), it never deletes or blocks the account. This is the
-- DB-level safety net UNDER the application delete guard (which blocks deleting a
-- campaign that still has attributed accounts). The FK does NOT validate tenant — the
-- accounts service rejects cross-company campaign ids via the company-scoped lookup.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_sourceCampaignId_fkey" FOREIGN KEY ("sourceCampaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex — the ROI/attribution read path filters accounts by sourceCampaignId
-- (missing until now, confirmed by recon M2/M7).
CREATE INDEX "accounts_sourceCampaignId_idx" ON "accounts"("sourceCampaignId");
