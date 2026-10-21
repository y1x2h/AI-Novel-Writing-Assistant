import {
  DEFAULT_STRUCTURE_SIMILARITY_WINDOW,
  type CrossChapterStructureEvidence,
} from "@ai-novel/shared/types/novel/crossChapterStructure";
import { prisma } from "../../../../db/prisma";
import { buildChapterStructureSignature } from "./StructureSignature";
import { buildCrossChapterStructureEvidence } from "./StructureSimilarityDetector";

export * from "./StructureSignature";
export * from "./StructureSimilarityDetector";

export interface CrossChapterStructureLoadInput {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  /** 当前章的场景拆解；缺失时只依赖读者体验合同。 */
  currentSceneCards?: string | null;
  currentTargetWordCount?: number | null;
  windowSize?: number;
}

/**
 * 读取最近若干章的骨架签名并生成跨章结构证据。
 *
 * 读取失败、章节不足或没有达到阈值的候选时返回 null：跨章证据是可选提示，
 * 任何异常都不得影响章节验收本身。
 */
export async function loadCrossChapterStructureEvidence(
  input: CrossChapterStructureLoadInput,
): Promise<CrossChapterStructureEvidence | null> {
  if (!Number.isFinite(input.chapterOrder) || input.chapterOrder <= 1) return null;
  const windowSize = input.windowSize ?? DEFAULT_STRUCTURE_SIMILARITY_WINDOW;
  try {
    const rows = await prisma.chapter.findMany({
      where: { novelId: input.novelId, order: { lt: input.chapterOrder } },
      orderBy: { order: "desc" },
      take: windowSize,
      select: { id: true, order: true, sceneCards: true, targetWordCount: true },
    });
    if (rows.length === 0) return null;
    const history = rows
      .slice()
      .reverse()
      .map((row) => buildChapterStructureSignature({
        chapterId: row.id,
        chapterOrder: row.order,
        sceneCards: row.sceneCards,
        targetWordCount: row.targetWordCount,
      }));
    const current = buildChapterStructureSignature({
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      sceneCards: input.currentSceneCards ?? null,
      targetWordCount: input.currentTargetWordCount ?? null,
    });
    return buildCrossChapterStructureEvidence({ current, history, windowSize });
  } catch (error) {
    console.warn("[chapter-runtime] cross-chapter structure evidence unavailable", {
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
