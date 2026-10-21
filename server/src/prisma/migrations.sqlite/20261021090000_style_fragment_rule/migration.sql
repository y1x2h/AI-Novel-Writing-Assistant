CREATE TABLE "StyleFragmentRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'protected',
  "fragment" TEXT NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "StyleFragmentRule_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StyleFragmentRule_novelId_kind_enabled_idx"
  ON "StyleFragmentRule"("novelId", "kind", "enabled");
