CREATE TABLE "NovelComplianceReport" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'planning',
  "level" TEXT NOT NULL DEFAULT 'pass',
  "summary" TEXT,
  "checkedMaterialSummary" TEXT,
  "itemsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NovelComplianceReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NovelComplianceReport_novelId_createdAt_idx"
  ON "NovelComplianceReport"("novelId", "createdAt");

ALTER TABLE "NovelComplianceReport" ADD CONSTRAINT "NovelComplianceReport_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
