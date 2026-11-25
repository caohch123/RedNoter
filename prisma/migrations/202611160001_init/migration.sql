-- CreateTable
CREATE TABLE "Draft" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "baseRevision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "prompt" TEXT,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finalization" (
    "id" UUID NOT NULL,
    "position" BIGSERIAL NOT NULL,
    "draftId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "coverId" UUID,
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finalization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Draft_ownerId_updatedAt_idx" ON "Draft"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Run_draftId_createdAt_idx" ON "Run"("draftId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_status_updatedAt_idx" ON "Run"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Media_objectKey_key" ON "Media"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Finalization_position_key" ON "Finalization"("position");

-- CreateIndex
CREATE UNIQUE INDEX "Finalization_draftId_revision_key" ON "Finalization"("draftId", "revision");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finalization" ADD CONSTRAINT "Finalization_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finalization" ADD CONSTRAINT "Finalization_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

