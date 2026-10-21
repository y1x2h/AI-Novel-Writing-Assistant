import type { BlurbCandidate, BlurbGenerationInput } from "@ai-novel/shared/types/blurb";
import { normalizeRequestedBlurbCount } from "@ai-novel/shared/types/blurb";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { parseCommercialTagsJson } from "@ai-novel/shared/types/novelFraming";
import { prisma } from "../../../db/prisma";
import { resolveLLMClientOptions } from "../../../llm/factory";
import { selectStructuredOutputStrategy } from "../../../llm/structuredOutput";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { blurbGenerationPrompt } from "../../../prompting/prompts/novel/blurbGeneration.prompts";
import {
  buildBlurbInputSummary,
  collectUniqueBlurbCandidates,
  ensureBlurbQuality,
  type BlurbSourceFields,
} from "./blurbGeneration.shared";

export interface GenerateBlurbOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  count?: number;
}

async function shouldForceBlurbJsonOutput(input: GenerateBlurbOptions & { provider?: LLMProvider }): Promise<boolean> {
  const resolved = await resolveLLMClientOptions(input.provider ?? "deepseek", {
    model: input.model,
    temperature: input.temperature ?? 0.7,
    maxTokens: input.maxTokens,
    taskType: blurbGenerationPrompt.taskType,
    executionMode: "structured",
  });
  const profile = resolved.structuredProfile;
  if (!profile || !blurbGenerationPrompt.outputSchema) {
    return false;
  }
  return selectStructuredOutputStrategy(profile, blurbGenerationPrompt.outputSchema) !== "prompt_json";
}

function resolveRetryReason(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export class BlurbGenerationService {
  async generateForNovel(
    novelId: string,
    options: GenerateBlurbOptions = {},
  ): Promise<{ candidates: BlurbCandidate[] }> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        description: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        targetAudience: true,
        commercialTagsJson: true,
        genre: { select: { name: true } },
      },
    });

    if (!novel) {
      throw new Error("小说不存在。");
    }

    return this.generate({
      title: novel.title,
      description: novel.description ?? undefined,
      genreLabel: novel.genre?.name ?? undefined,
      bookSellingPoint: novel.bookSellingPoint ?? undefined,
      competingFeel: novel.competingFeel ?? undefined,
      first30ChapterPromise: novel.first30ChapterPromise ?? undefined,
      targetAudience: novel.targetAudience ?? undefined,
      commercialTags: parseCommercialTagsJson(novel.commercialTagsJson),
      count: options.count,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
  }

  async generate(input: BlurbGenerationInput = {}): Promise<{ candidates: BlurbCandidate[] }> {
    const baselineDescription = input.description?.trim() ?? "";
    const sourceFields: BlurbSourceFields = {
      title: input.title,
      description: input.description,
      genreLabel: input.genreLabel,
      bookSellingPoint: input.bookSellingPoint,
      competingFeel: input.competingFeel,
      first30ChapterPromise: input.first30ChapterPromise,
      targetAudience: input.targetAudience,
      commercialTags: input.commercialTags,
    };
    const inputSummary = buildBlurbInputSummary(sourceFields);

    if (!baselineDescription && !inputSummary.trim()) {
      throw new Error("请先填写书名、概述或书级卖点，再生成简介。");
    }

    const count = normalizeRequestedBlurbCount(input.count);
    const provider = input.provider ?? "deepseek";
    const forceJson = await shouldForceBlurbJsonOutput({ ...input, provider });

    let lastError: unknown;
    let retryReason: string | null = null;
    let bestEffort: BlurbCandidate[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await runStructuredPrompt({
          asset: blurbGenerationPrompt,
          promptInput: {
            inputSummary,
            baselineDescription,
            count,
            retryReason,
            forceJson,
          },
          options: {
            provider,
            model: input.model,
            temperature: input.temperature ?? 0.7,
            maxTokens: input.maxTokens,
          },
        });

        const candidates = collectUniqueBlurbCandidates(result.output, count);
        if (candidates.length > bestEffort.length) {
          bestEffort = candidates;
        }
        ensureBlurbQuality(candidates, count);
        return { candidates };
      } catch (error) {
        lastError = error;
        retryReason = resolveRetryReason(error, "输出不符合 JSON 或简介质量要求。");
      }
    }

    if (bestEffort.length >= 1) {
      return { candidates: bestEffort };
    }

    if (lastError instanceof Error) {
      throw new Error(`简介生成失败：${lastError.message}`);
    }
    throw new Error("简介生成失败。");
  }
}

export const blurbGenerationService = new BlurbGenerationService();
