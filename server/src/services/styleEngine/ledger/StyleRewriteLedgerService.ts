import {
  STYLE_REWRITE_LEDGER_DEFAULT_LIMIT,
  STYLE_REWRITE_LEDGER_MAX_LIMIT,
  styleRewriteLedgerEntrySchema,
  type StyleRewriteLedger,
  type StyleRewriteLedgerEntry,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../../db/prisma";

function parseEntries(raw: string): StyleRewriteLedgerEntry[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((item) => {
      const result = styleRewriteLedgerEntrySchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

function mapRow(row: {
  id: string;
  novelId: string;
  chapterId: string | null;
  sourceHash: string;
  candidateHash: string;
  policyRevision: string;
  entriesJson: string;
  createdAt: Date;
}): StyleRewriteLedger {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    sourceHash: row.sourceHash,
    candidateHash: row.candidateHash,
    policyRevision: row.policyRevision,
    entries: parseEntries(row.entriesJson),
    createdAt: row.createdAt.toISOString(),
  };
}

/** 改动台账：只写入和只读查询，不参与改写决策，也不改变任务状态。 */
export class StyleRewriteLedgerService {
  async record(input: {
    novelId: string;
    chapterId?: string | null;
    sourceHash: string;
    candidateHash: string;
    policyRevision: string;
    entries: StyleRewriteLedgerEntry[];
  }): Promise<void> {
    if (input.entries.length === 0) {
      return;
    }
    await prisma.styleRewriteLedger.create({
      data: {
        novelId: input.novelId,
        chapterId: input.chapterId ?? null,
        sourceHash: input.sourceHash,
        candidateHash: input.candidateHash,
        policyRevision: input.policyRevision,
        entriesJson: JSON.stringify(input.entries),
      },
    });
  }

  async list(input: {
    novelId: string;
    chapterId?: string | null;
    limit?: number;
  }): Promise<StyleRewriteLedger[]> {
    const requested = Math.trunc(input.limit ?? STYLE_REWRITE_LEDGER_DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, Number.isFinite(requested) ? requested : STYLE_REWRITE_LEDGER_DEFAULT_LIMIT),
      STYLE_REWRITE_LEDGER_MAX_LIMIT);
    const rows = await prisma.styleRewriteLedger.findMany({
      where: {
        novelId: input.novelId,
        ...(input.chapterId ? { chapterId: input.chapterId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapRow);
  }
}
