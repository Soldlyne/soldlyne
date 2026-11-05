-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "SellerDetails" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "legalName" TEXT,
    "address" TEXT,
    "companyNumber" TEXT,
    "vatNumber" TEXT,
    "contactEmail" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "defaultTaxRateMilliPercent" INTEGER NOT NULL DEFAULT 0,
    "defaultValidityDays" INTEGER NOT NULL DEFAULT 30,
    "defaultTerms" TEXT,
    "yearlyQuoteNumbers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteCounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "number" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "dealId" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "issueDate" DATE NOT NULL,
    "validUntil" DATE NOT NULL,
    "notes" TEXT,
    "terms" TEXT,
    "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL DEFAULT 0,
    "taxBreakdown" JSONB NOT NULL DEFAULT '[]',
    "sellerCopy" JSONB,
    "customerCopy" JSONB,
    "tokenHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedName" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedIp" TEXT,
    "acceptedUserAgent" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdBy" "Actor" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "quoteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantityMilli" BIGINT NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "taxRateMilliPercent" INTEGER NOT NULL,
    "discountMilliPercent" INTEGER,
    "netMinor" BIGINT NOT NULL,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellerDetails_workspaceId_key" ON "SellerDetails"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCounter_workspaceId_key" ON "QuoteCounter"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_tokenHash_key" ON "Quote"("tokenHash");

-- CreateIndex
CREATE INDEX "Quote_workspaceId_status_idx" ON "Quote"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Quote_dealId_idx" ON "Quote"("dealId");

-- CreateIndex
CREATE INDEX "Quote_companyId_idx" ON "Quote"("companyId");

-- CreateIndex
CREATE INDEX "Quote_contactId_idx" ON "Quote"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_workspaceId_number_key" ON "Quote"("workspaceId", "number");

-- CreateIndex
CREATE INDEX "QuoteLine_quoteId_position_idx" ON "QuoteLine"("quoteId", "position");

-- CreateIndex
CREATE INDEX "QuoteLine_productId_idx" ON "QuoteLine"("productId");

-- CreateIndex
CREATE INDEX "QuoteLine_workspaceId_idx" ON "QuoteLine"("workspaceId");

-- AddForeignKey
ALTER TABLE "SellerDetails" ADD CONSTRAINT "SellerDetails_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCounter" ADD CONSTRAINT "QuoteCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A line for nothing, or at a price below nothing, is a mistake whichever path wrote it.
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quantity_positive" CHECK ("quantityMilli" > 0);
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_price_not_negative" CHECK ("unitPriceMinor" >= 0);

-- ---------------------------------------------------------------------------
-- Tenant isolation, as in the first migration: forced row-level security, and each policy looks every
-- parent up through that parent's own policy, since a foreign key's check alone bypasses it.
-- ---------------------------------------------------------------------------

ALTER TABLE "SellerDetails" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SellerDetails" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "SellerDetails" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "SellerDetails" TO soldlyne_app;

ALTER TABLE "QuoteCounter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteCounter" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "QuoteCounter" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "QuoteCounter" TO soldlyne_app;

ALTER TABLE "Quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Quote" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Quote" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND ("dealId" IS NULL OR EXISTS (SELECT 1 FROM "Deal" parent WHERE parent."id" = "Quote"."dealId"))
    AND ("companyId" IS NULL OR EXISTS (SELECT 1 FROM "Company" parent WHERE parent."id" = "Quote"."companyId"))
    AND ("contactId" IS NULL OR EXISTS (SELECT 1 FROM "Person" parent WHERE parent."id" = "Quote"."contactId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Quote" TO soldlyne_app;

ALTER TABLE "QuoteLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "QuoteLine" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true)
    AND EXISTS (SELECT 1 FROM "Quote" parent WHERE parent."id" = "QuoteLine"."quoteId")
    AND ("productId" IS NULL OR EXISTS (SELECT 1 FROM "Product" parent WHERE parent."id" = "QuoteLine"."productId")));
GRANT SELECT, INSERT, UPDATE, DELETE ON "QuoteLine" TO soldlyne_app;

-- A customer's link says which workspace it is for, so finding its quote comes before any workspace is known.
CREATE POLICY "trusted_lookup" ON "Quote" FOR SELECT TO CURRENT_USER USING (true);
