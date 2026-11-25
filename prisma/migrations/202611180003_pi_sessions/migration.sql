-- Pi 原生会话与草稿的归属映射
CREATE TABLE "PiSession" (
    "id" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "piSessionId" TEXT NOT NULL,
    "sessionFile" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'root',
    "parentSessionId" UUID,
    "forkEntryId" TEXT,
    "currentLeafId" TEXT,
    "label" TEXT,
    "cursor" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PiSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PiRequest" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "draftId" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PiRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PiSession_draftId_piSessionId_key" ON "PiSession"("draftId", "piSessionId");
CREATE INDEX "PiSession_draftId_updatedAt_idx" ON "PiSession"("draftId", "updatedAt");
CREATE INDEX "PiRequest_draftId_createdAt_idx" ON "PiRequest"("draftId", "createdAt");

ALTER TABLE "PiSession" ADD CONSTRAINT "PiSession_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PiSession" ADD CONSTRAINT "PiSession_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "PiSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PiRequest" ADD CONSTRAINT "PiRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PiSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
