-- Adds only: the product a key that hands people over opens its deals on. Other keys leave it empty.
ALTER TABLE "ApiKey" ADD COLUMN "productId" TEXT;

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The product has to be this workspace's, as on every other link between a workspace's rows: a foreign key alone would let it point at another's.
ALTER POLICY "tenant_isolation" ON "ApiKey"
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("productId" IS NULL OR EXISTS (SELECT 1 FROM "Product" parent WHERE parent."id" = "ApiKey"."productId")));
