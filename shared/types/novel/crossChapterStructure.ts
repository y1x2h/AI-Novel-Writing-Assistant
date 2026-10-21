import { z } from "zod";

/**
 * 跨章结构相似度证据。
 *
 * 这里只承载“可机械度量的候选证据”，不授予 issue code、不做违规判定：
 * 相似度高只是提醒验收模型留意相邻章节是否复用同一套骨架，是否计入由模型判断。
 */
export const crossChapterStructureCandidateSchema = z.object({
  /** 被比较的历史章节序号。 */
  chapterOrder: z.number().int().positive(),
  similarity: z.number().min(0).max(1),
  /** 与本章重复的场景骨架短语，最多若干条。 */
  sharedBeats: z.array(z.string()).default([]),
  /** 与本章重复的读者体验合同要点。 */
  contractOverlap: z.array(z.string()).default([]),
});

export const crossChapterStructureRunSchema = z.object({
  chapterOrders: z.array(z.number().int().positive()).default([]),
  similarity: z.number().min(0).max(1),
});

export const crossChapterStructureEvidenceSchema = z.object({
  windowSize: z.number().int().positive(),
  comparedChapterCount: z.number().int().min(0),
  maxSimilarity: z.number().min(0).max(1),
  /** 连续多章共用同一骨架时的收束提示，不构成判定。 */
  repeatedSkeletonRun: crossChapterStructureRunSchema.nullable().default(null),
  candidates: z.array(crossChapterStructureCandidateSchema).default([]),
});

export type CrossChapterStructureCandidate = z.infer<typeof crossChapterStructureCandidateSchema>;
export type CrossChapterStructureRun = z.infer<typeof crossChapterStructureRunSchema>;
export type CrossChapterStructureEvidence = z.infer<typeof crossChapterStructureEvidenceSchema>;

/** 默认比较最近 5 章；低于阈值的相似度不写入证据。 */
export const DEFAULT_STRUCTURE_SIMILARITY_WINDOW = 5;
export const DEFAULT_STRUCTURE_SIMILARITY_THRESHOLD = 0.62;
/** 证据里最多保留的候选条数，避免长提示词。 */
export const MAX_STRUCTURE_SIMILARITY_CANDIDATES = 3;
