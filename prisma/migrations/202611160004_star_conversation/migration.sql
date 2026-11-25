CREATE TABLE "CreationPlan" (
    "draftId" UUID PRIMARY KEY REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "latestRunId" UUID,
    "executionRunId" UUID,
    "approved" BOOLEAN NOT NULL DEFAULT FALSE,
    "media" JSONB NOT NULL
);

CREATE TABLE "ChatAttachment" (
    "id" UUID PRIMARY KEY,
    "draftId" UUID NOT NULL REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL
);
CREATE INDEX "ChatAttachment_draftId_idx" ON "ChatAttachment"("draftId");
