CREATE TABLE "StyleRewriteLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT,
  "sourceHash" TEXT NOT NULL,
  "candidateHash" TEXT NOT NULL,
  "policyRevision" TEXT NOT NULL,
  "entriesJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StyleRewriteLedger_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StyleRewriteLedger_novelId_createdAt_idx"
  ON "StyleRewriteLedger"("novelId", "createdAt");

CREATE INDEX "StyleRewriteLedger_chapterId_idx"
  ON "StyleRewriteLedger"("chapterId");
