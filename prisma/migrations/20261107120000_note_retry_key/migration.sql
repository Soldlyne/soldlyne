-- Adds only: what a tool's retry of one event is known by. Notes from before have none, and no two notes with one can share it in a workspace.
ALTER TABLE "Note" ADD COLUMN "retryKey" TEXT;

-- Partial, which the Prisma schema can't say: most notes have no retry key.
CREATE UNIQUE INDEX "Note_workspaceId_retryKey_key" ON "Note"("workspaceId", "retryKey") WHERE "retryKey" IS NOT NULL;
