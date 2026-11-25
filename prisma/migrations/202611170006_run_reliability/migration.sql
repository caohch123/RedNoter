CREATE SEQUENCE "Run_submissionOrder_seq" AS BIGINT;
ALTER TABLE "Run" ADD COLUMN "submissionOrder" BIGINT, ADD COLUMN "requestFingerprint" TEXT;
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS position FROM "Run"
)
UPDATE "Run" SET "submissionOrder" = ordered.position FROM ordered WHERE "Run"."id" = ordered."id";
SELECT setval('"Run_submissionOrder_seq"', COALESCE((SELECT MAX("submissionOrder") FROM "Run"), 0) + 1, false);
ALTER SEQUENCE "Run_submissionOrder_seq" OWNED BY "Run"."submissionOrder";
ALTER TABLE "Run" ALTER COLUMN "submissionOrder" SET DEFAULT nextval('"Run_submissionOrder_seq"'), ALTER COLUMN "submissionOrder" SET NOT NULL;
CREATE UNIQUE INDEX "Run_submissionOrder_key" ON "Run"("submissionOrder");
CREATE INDEX "Run_draftId_baseRevision_submissionOrder_idx" ON "Run"("draftId", "baseRevision", "submissionOrder");
