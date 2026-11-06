-- A workspace's accounts at outside services. Only adds: nothing that exists changes.

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('CONNECTED', 'FAILING');

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT current_setting('app.workspace_id'::text),
    "kind" TEXT NOT NULL,
    "sealedCredentials" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "checkedAt" TIMESTAMP(3),
    "connectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Connection_workspaceId_kind_key" ON "Connection"("workspaceId", "kind");

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Tenant isolation, as in the first migration: forced row-level security for the app role. Its only
-- parent is the workspace, and no lookup comes before the workspace is known, so the owner gets no policy.
-- ---------------------------------------------------------------------------

ALTER TABLE "Connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Connection" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "Connection" FOR ALL TO soldlyne_app
  USING ("workspaceId" = current_setting('app.workspace_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "Connection" TO soldlyne_app;
