import {
  DEFAULT_STRUCTURE_SIMILARITY_THRESHOLD,
  MAX_STRUCTURE_SIMILARITY_CANDIDATES,
  type CrossChapterStructureCandidate,
  type CrossChapterStructureEvidence,
  type CrossChapterStructureRun,
} from "@ai-novel/shared/types/novel/crossChapterStructure";
import { hasComparableStructure, type ChapterStructureSignature } from "./StructureSignature";

const MAX_SHARED_LABELS = 3;
/** 判定“连续同构”所需的最少章节数：本章加上两章历史。 */
const MIN_REPEATED_RUN_LENGTH = 3;

export interface StructureComparison {
  similarity: number;
  sceneSimilarity: number | null;
  contractSimilarity: number | null;
  sharedBeats: string[];
  contractOverlap: string[];
}

export interface CrossChapterStructureEvidenceInput {
  current: ChapterStructureSignature;
  /** 窗口内的历史章节签名，按章节顺序升序。 */
  history: ChapterStructureSignature[];
  windowSize: number;
  threshold?: number;
}

function weightedAverage(parts: Array<[number | null, number]>): number | null {
  let total = 0;
  let weight = 0;
  for (const [value, partWeight] of parts) {
    if (value == null) continue;
    total += value * partWeight;
    weight += partWeight;
  }
  return weight === 0 ? null : total / weight;
}

function jaccardSimilarity(left: string[], right: string[]): number | null {
  if (left.length === 0 || right.length === 0) return null;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? null : intersection / union;
}

/** 骨架顺序一致度：同序最长公共子序列占比。 */
function sequenceSimilarity(left: string[], right: string[]): number | null {
  if (left.length === 0 || right.length === 0) return null;
  let previous = new Array<number>(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    const current = new Array<number>(right.length + 1).fill(0);
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[right.length] / Math.max(left.length, right.length);
}

function sharedLabels(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  const shared: string[] = [];
  for (const label of left) {
    if (rightSet.has(label) && !shared.includes(label)) shared.push(label);
    if (shared.length >= MAX_SHARED_LABELS) break;
  }
  return shared;
}

export function compareStructureSignatures(
  left: ChapterStructureSignature,
  right: ChapterStructureSignature,
): StructureComparison | null {
  if (!hasComparableStructure(left) || !hasComparableStructure(right)) return null;
  const sceneSimilarity = weightedAverage([
    [sequenceSimilarity(left.sceneBeats, right.sceneBeats), 0.6],
    [jaccardSimilarity(left.beatShingles, right.beatShingles), 0.4],
  ]);
  const contractSimilarity = jaccardSimilarity(left.contractShingles, right.contractShingles);
  const similarity = weightedAverage([[sceneSimilarity, 0.65], [contractSimilarity, 0.35]]);
  if (similarity == null) return null;
  return {
    similarity,
    sceneSimilarity,
    contractSimilarity,
    sharedBeats: sharedLabels(left.sceneBeats, right.sceneBeats),
    contractOverlap: sharedLabels(left.contractHighlights, right.contractHighlights),
  };
}

/**
 * 只输出候选证据：达到阈值的近邻章节相似度、共享骨架，以及连续同构的收束提示。
 * 没有任何候选时返回 null，避免给验收提示词塞入无信息的段落。
 */
export function buildCrossChapterStructureEvidence(
  input: CrossChapterStructureEvidenceInput,
): CrossChapterStructureEvidence | null {
  const threshold = input.threshold ?? DEFAULT_STRUCTURE_SIMILARITY_THRESHOLD;
  const comparisons = input.history
    .map((previous) => ({ previous, comparison: compareStructureSignatures(input.current, previous) }))
    .filter((entry): entry is { previous: ChapterStructureSignature; comparison: StructureComparison } =>
      entry.comparison != null && entry.comparison.similarity >= threshold)
    .sort((left, right) => right.comparison.similarity - left.comparison.similarity);
  if (comparisons.length === 0) return null;

  const candidates: CrossChapterStructureCandidate[] = comparisons
    .slice(0, MAX_STRUCTURE_SIMILARITY_CANDIDATES)
    .map((entry) => ({
      chapterOrder: entry.previous.chapterOrder,
      similarity: Math.round(entry.comparison.similarity * 1000) / 1000,
      sharedBeats: entry.comparison.sharedBeats,
      contractOverlap: entry.comparison.contractOverlap,
    }));

  return {
    windowSize: input.windowSize,
    comparedChapterCount: input.history.length,
    maxSimilarity: Math.round(comparisons[0].comparison.similarity * 1000) / 1000,
    repeatedSkeletonRun: buildRepeatedSkeletonRun(input.current, input.history, threshold),
    candidates,
  };
}

function buildRepeatedSkeletonRun(
  current: ChapterStructureSignature,
  history: ChapterStructureSignature[],
  threshold: number,
): CrossChapterStructureRun | null {
  let previous = current;
  const chapterOrders = [current.chapterOrder];
  const similarities: number[] = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = history[index];
    if (!candidate.hasSceneCards || !previous.hasSceneCards) break;
    const comparison = compareStructureSignatures(previous, candidate);
    if (!comparison || comparison.similarity < threshold) break;
    similarities.push(comparison.similarity);
    chapterOrders.push(candidate.chapterOrder);
    previous = candidate;
  }
  if (chapterOrders.length < MIN_REPEATED_RUN_LENGTH) return null;
  const average = similarities.reduce((sum, value) => sum + value, 0) / similarities.length;
  return {
    chapterOrders: chapterOrders.sort((left, right) => left - right),
    similarity: Math.round(average * 1000) / 1000,
  };
}
