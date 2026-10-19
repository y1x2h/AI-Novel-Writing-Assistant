import { createHash } from "node:crypto";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StyleExtractionFeature,
  StyleExtractionFeatureVerification,
} from "@ai-novel/shared/types/styleEngine";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { styleProfileFeatureVerificationPrompt } from "../../../prompting/prompts/style/styleProfileVerification.prompts";

export interface StyleVerificationSample {
  index: number;
  label: string;
  text: string;
}

export interface StyleFeatureVerificationRequest {
  name: string;
  sourceText: string;
  features: Array<Pick<StyleExtractionFeature, "id" | "label" | "description" | "evidence">>;
  provider?: LLMProvider;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface StyleFeatureVerificationResult {
  verifications: Map<string, StyleExtractionFeatureVerification>;
  sampleCount: number;
}

const MAX_SAMPLE_COUNT = 8;
const MAX_SAMPLE_CHARS = 1_400;
const LABELED_SAMPLE_PATTERN = /【样本：([^】]{1,30})】/g;

function sliceSample(text: string): string {
  const normalized = text.trim();
  return normalized.length > MAX_SAMPLE_CHARS
    ? `${normalized.slice(0, MAX_SAMPLE_CHARS)}…`
    : normalized;
}

/** 代表性采样模式下原文自带样本分块，直接沿用它的分块边界；否则按段落合并成固定份数。 */
function splitLabeledSamples(text: string): Array<{ label: string; text: string }> {
  const matches = Array.from(text.matchAll(LABELED_SAMPLE_PATTERN));
  if (matches.length < 2) {
    return [];
  }
  return matches
    .map((match, position) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = position + 1 < matches.length ? matches[position + 1].index ?? text.length : text.length;
      return { label: match[1].trim(), text: text.slice(start, end) };
    })
    .filter((sample) => sample.text.trim());
}

function splitParagraphBlocks(text: string, limit: number): Array<{ label: string; text: string }> {
  const byBlankLine = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const parts = byBlankLine.length >= 2
    ? byBlankLine
    : text.split(/\n/).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= limit) {
    return parts.map((part, index) => ({ label: `第 ${index + 1} 段`, text: part }));
  }
  return Array.from({ length: limit }, (_, index) => {
    const start = Math.floor((parts.length * index) / limit);
    const end = Math.max(Math.floor((parts.length * (index + 1)) / limit), start + 1);
    return { label: `第 ${start + 1}-${end} 段`, text: parts.slice(start, end).join("\n") };
  });
}

export function buildStyleVerificationSamples(
  text: string,
  limit: number = MAX_SAMPLE_COUNT,
): StyleVerificationSample[] {
  const labeled = splitLabeledSamples(text);
  const blocks = labeled.length >= 2 ? labeled : splitParagraphBlocks(text, limit);
  return blocks
    .slice(0, limit)
    .map((block, position) => ({
      index: position + 1,
      label: block.label,
      text: sliceSample(block.text),
    }))
    .filter((sample) => sample.text);
}

export function buildStyleVerificationSourceHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 24);
}

export class StyleFeatureVerificationService {
  async verifyFeatures(input: StyleFeatureVerificationRequest): Promise<StyleFeatureVerificationResult> {
    if (input.features.length === 0) {
      return { verifications: new Map(), sampleCount: 0 };
    }
    const samples = buildStyleVerificationSamples(input.sourceText);
    if (samples.length === 0) {
      return { verifications: new Map(), sampleCount: 0 };
    }

    const result = await runStructuredPrompt({
      asset: styleProfileFeatureVerificationPrompt,
      promptInput: {
        name: input.name,
        features: input.features.map((feature) => ({
          id: feature.id,
          label: feature.label,
          description: feature.description,
          evidence: feature.evidence,
        })),
        samples,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: 0.2,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      },
    });

    const verifiedAt = new Date().toISOString();
    const sourceHash = buildStyleVerificationSourceHash(input.sourceText);
    const knownFeatureIds = new Set(input.features.map((feature) => feature.id));
    const verifications = new Map<string, StyleExtractionFeatureVerification>();
    for (const item of result.output.items) {
      if (!knownFeatureIds.has(item.featureId)) {
        continue;
      }
      verifications.set(item.featureId, {
        crossSource: {
          passed: item.crossSource.passed,
          sampleIndexes: item.crossSource.sampleIndexes,
          evidence: item.crossSource.evidence,
        },
        predictive: item.predictive,
        exclusive: item.exclusive,
        reason: item.reason,
        verifiedAt,
        sourceHash,
      });
    }
    return { verifications, sampleCount: samples.length };
  }
}
