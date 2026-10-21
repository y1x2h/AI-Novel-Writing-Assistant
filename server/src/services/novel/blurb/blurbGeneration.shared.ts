import type { BlurbCandidate } from "@ai-novel/shared/types/blurb";
import {
  BLURB_ANGLE_MAX_LENGTH,
  BLURB_CAUTION_MAX_LENGTH,
  BLURB_HOOK_LINE_MAX_LENGTH,
  BLURB_MAX_LENGTH,
  BLURB_MIN_LENGTH,
  BLURB_TARGET_READER_MAX_LENGTH,
  isNearDuplicateBlurb,
  normalizeBlurbText,
  truncateBlurbText,
} from "@ai-novel/shared/types/blurb";

export interface BlurbPromptContext {
  inputSummary: string;
  baselineDescription: string;
  count: number;
  retryReason?: string | null;
  forceJson?: boolean;
}

export interface BlurbSourceFields {
  title?: string;
  description?: string;
  genreLabel?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  targetAudience?: string;
  commercialTags?: string[];
}

function clean(value: unknown): string {
  return normalizeBlurbText(value);
}

export function buildBlurbInputSummary(input: BlurbSourceFields): string {
  return [
    input.title?.trim() ? `书名：${input.title.trim()}` : "",
    input.genreLabel?.trim() ? `题材基底：${input.genreLabel.trim()}` : "",
    input.targetAudience?.trim() ? `目标读者：${input.targetAudience.trim()}` : "",
    input.bookSellingPoint?.trim() ? `核心卖点：${input.bookSellingPoint.trim()}` : "",
    input.competingFeel?.trim() ? `阅读体感：${input.competingFeel.trim()}` : "",
    input.first30ChapterPromise?.trim() ? `前 30 章承诺：${input.first30ChapterPromise.trim()}` : "",
    input.commercialTags?.length ? `商业标签：${input.commercialTags.join("、")}` : "",
  ].filter(Boolean).join("\n");
}

export function sanitizeBlurbCandidate(value: unknown): BlurbCandidate | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as {
    blurb?: unknown;
    hookLine?: unknown;
    hook?: unknown;
    angle?: unknown;
    targetReader?: unknown;
    reader?: unknown;
    caution?: unknown;
  };

  const blurb = truncateBlurbText(clean(record.blurb), BLURB_MAX_LENGTH);
  if (Array.from(blurb).length < BLURB_MIN_LENGTH) {
    return null;
  }

  return {
    blurb,
    hookLine: truncateBlurbText(clean(record.hookLine ?? record.hook), BLURB_HOOK_LINE_MAX_LENGTH),
    angle: truncateBlurbText(clean(record.angle), BLURB_ANGLE_MAX_LENGTH),
    targetReader: truncateBlurbText(clean(record.targetReader ?? record.reader), BLURB_TARGET_READER_MAX_LENGTH),
    caution: truncateBlurbText(clean(record.caution), BLURB_CAUTION_MAX_LENGTH) || null,
  };
}

export function normalizeBlurbCandidates(values: unknown[]): BlurbCandidate[] {
  const candidates: BlurbCandidate[] = [];
  for (const item of values) {
    const normalized = sanitizeBlurbCandidate(item);
    if (!normalized) {
      continue;
    }
    candidates.push(normalized);
  }
  return candidates;
}

export function collectUniqueBlurbCandidates(values: unknown[], targetCount: number): BlurbCandidate[] {
  const candidates: BlurbCandidate[] = [];
  for (const item of normalizeBlurbCandidates(values)) {
    if (candidates.some((existing) => isNearDuplicateBlurb(existing.blurb, item.blurb))) {
      continue;
    }
    candidates.push(item);
    if (candidates.length >= targetCount) {
      break;
    }
  }
  return candidates;
}

export function ensureBlurbQuality(candidates: BlurbCandidate[], targetCount: number): void {
  if (candidates.length < targetCount) {
    throw new Error(`简介候选数量不足，目标 ${targetCount} 条，实际仅有 ${candidates.length} 条可用候选。`);
  }
}
