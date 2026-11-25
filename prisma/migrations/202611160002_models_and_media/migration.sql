CREATE TABLE "ModelProfile" (
    "id" UUID NOT NULL,
    "version" BIGSERIAL NOT NULL,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModelProfile_version_key" ON "ModelProfile"("version");
CREATE INDEX "ModelProfile_capability_version_idx" ON "ModelProfile"("capability", "version");
ALTER TABLE "Run"
    ADD COLUMN "profileId" UUID,
    ADD COLUMN "providerTaskId" TEXT,
    ADD COLUMN "nextPollAt" TIMESTAMP(3),
    ADD COLUMN "appliedRevision" INTEGER,
    ADD COLUMN "undoData" JSONB,
    ADD COLUMN "undoneAt" TIMESTAMP(3);
ALTER TABLE "Run" ADD CONSTRAINT "Run_profileId_fkey" FOREIGN KEY ("profileId")
    REFERENCES "ModelProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Finalization" ADD COLUMN "videoId" UUID;
ALTER TABLE "Finalization" ADD CONSTRAINT "Finalization_videoId_fkey" FOREIGN KEY ("videoId")
    REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
