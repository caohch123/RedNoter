CREATE TABLE "MediaBrief" (
  "id" UUID NOT NULL,
  "draftId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL,
  "runId" UUID,
  CONSTRAINT "MediaBrief_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MediaBrief_draftId_key" ON "MediaBrief"("draftId");
ALTER TABLE "MediaBrief" ADD CONSTRAINT "MediaBrief_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Run" ADD COLUMN "failureDetail" JSONB;
ALTER TABLE "Run" ADD COLUMN "resumeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Finalization" ADD COLUMN "imageIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
