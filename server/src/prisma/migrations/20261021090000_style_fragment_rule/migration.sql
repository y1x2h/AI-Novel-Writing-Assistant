CREATE TABLE "StyleFragmentRule" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'protected',
  "fragment" TEXT NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StyleFragmentRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StyleFragmentRule_novelId_kind_enabled_idx"
  ON "StyleFragmentRule"("novelId", "kind", "enabled");

ALTER TABLE "StyleFragmentRule" ADD CONSTRAINT "StyleFragmentRule_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
