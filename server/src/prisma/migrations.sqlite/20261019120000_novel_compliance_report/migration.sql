CREATE TABLE "NovelComplianceReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'planning',
  "level" TEXT NOT NULL DEFAULT 'pass',
  "summary" TEXT,
  "checkedMaterialSummary" TEXT,
  "itemsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NovelComplianceReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NovelComplianceReport_novelId_createdAt_idx"
  ON "NovelComplianceReport"("novelId", "createdAt");
