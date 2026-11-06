-- Who made a key, so that it can end with them. Additive: keys that already exist keep working with no
-- recorded maker, and stay until someone revokes them. Nothing is backfilled.
ALTER TABLE "ApiKey" ADD COLUMN "createdBy" TEXT;

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
