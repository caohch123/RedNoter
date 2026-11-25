ALTER TABLE "Draft" ADD COLUMN "workspaceVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "WorkspaceFile" (
    "id" UUID NOT NULL PRIMARY KEY,
    "draftId" UUID NOT NULL REFERENCES "Draft"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "attachmentId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkspaceFile_draftId_deletedAt_idx" ON "WorkspaceFile"("draftId", "deletedAt");

CREATE TABLE "WorkspaceVersion" (
    "id" UUID NOT NULL PRIMARY KEY,
    "fileId" UUID NOT NULL REFERENCES "WorkspaceFile"("id") ON DELETE CASCADE,
    "version" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "runId" UUID,
    "outputIndex" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "WorkspaceVersion_fileId_version_key" ON "WorkspaceVersion"("fileId", "version");
CREATE UNIQUE INDEX "WorkspaceVersion_runId_outputIndex_key" ON "WorkspaceVersion"("runId", "outputIndex");
