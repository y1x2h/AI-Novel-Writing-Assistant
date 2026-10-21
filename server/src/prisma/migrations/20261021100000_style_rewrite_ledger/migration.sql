CREATE TABLE "StyleRewriteLedger" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT,
  "sourceHash" TEXT NOT NULL,
  "candidateHash" TEXT NOT NULL,
  "policyRevision" TEXT NOT NULL,
  "entriesJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StyleRewriteLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StyleRewriteLedger_novelId_createdAt_idx"
  ON "StyleRewriteLedger"("novelId", "createdAt");

CREATE INDEX "StyleRewriteLedger_chapterId_idx"
  ON "StyleRewriteLedger"("chapterId");

ALTER TABLE "StyleRewriteLedger" ADD CONSTRAINT "StyleRewriteLedger_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
