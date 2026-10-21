import type { LLMProvider } from "./llm";

export const BLURB_MIN_COUNT = 3;
export const BLURB_MAX_COUNT = 8;
export const DEFAULT_BLURB_COUNT = 4;

/** 简介正文的机械长度边界：过短承载不了卖点，过长不适合平台展示。 */
export const BLURB_MIN_LENGTH = 80;
export const BLURB_MAX_LENGTH = 400;

/** 辅助字段的机械长度边界，用于收敛模型输出，避免展示被单条候选撑破。 */
export const BLURB_HOOK_LINE_MAX_LENGTH = 40;
export const BLURB_ANGLE_MAX_LENGTH = 24;
export const BLURB_TARGET_READER_MAX_LENGTH = 60;
export const BLURB_CAUTION_MAX_LENGTH = 60;

export interface BlurbCandidate {
  /** 可直接回填到小说概述的简介正文。 */
  blurb: string;
  /** 首句钩子，概括这条简介主打的抓人点。 */
  hookLine: string;
  /** 这条简介主打的唯一切入角度。 */
  angle: string;
  /** 这条简介主要写给谁看。 */
  targetReader: string;
  /** 可选的风险提醒，例如涉及敏感题材时需要回避的表达。 */
  caution?: string | null;
}

export interface BlurbGenerationInput {
  title?: string;
  description?: string;
  genreLabel?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  targetAudience?: string;
  commercialTags?: string[];
  /** 填写后服务会读取已保存的小说字段作为上下文。 */
  novelId?: string;
  count?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export function normalizeBlurbText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/gu, " ").trim();
}

export function truncateBlurbText(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length <= maxLength ? value : characters.slice(0, maxLength).join("");
}

export function normalizeRequestedBlurbCount(value: unknown, fallback = DEFAULT_BLURB_COUNT): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(BLURB_MAX_COUNT, Math.max(BLURB_MIN_COUNT, Math.floor(numeric)));
}

function normalizeCompareKey(value: string): string {
  return normalizeBlurbText(value)
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, "")
    .toLowerCase();
}

function buildBiGramSet(source: string): Set<string> {
  const normalized = normalizeCompareKey(source);
  if (!normalized) {
    return new Set<string>();
  }
  if (normalized.length <= 2) {
    return new Set<string>([normalized]);
  }
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - 2; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

export function blurbSimilarity(left: string, right: string): number {
  const leftGrams = buildBiGramSet(left);
  const rightGrams = buildBiGramSet(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      intersection += 1;
    }
  }
  const union = leftGrams.size + rightGrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isNearDuplicateBlurb(left: string, right: string): boolean {
  const leftKey = normalizeCompareKey(left);
  const rightKey = normalizeCompareKey(right);
  if (!leftKey || !rightKey) {
    return false;
  }
  if (leftKey === rightKey) {
    return true;
  }
  return blurbSimilarity(leftKey, rightKey) >= 0.78;
}
