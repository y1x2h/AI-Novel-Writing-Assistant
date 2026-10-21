import type {
  NovelSpecClarificationRequest,
  NovelSpecClarificationResponse,
} from "@ai-novel/shared/types/novelSpecClarification";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { directorSpecClarificationPrompt } from "../../../../prompting/prompts/novel/specClarification.prompts";

const SPEC_CLARIFICATION_MAX_TOKENS = 1_600;

function line(label: string, value: string | null | undefined): string {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text ? `${label}：${text}` : "";
}

function buildSpecDigest(input: NovelSpecClarificationRequest): string {
  const { candidate } = input;
  return [
    line("起始想法", input.idea),
    line("暂定书名", candidate.workingTitle),
    line("一句话卖点", candidate.logline),
    line("题材定位", candidate.positioning),
    line("核心卖点", candidate.sellingPoint),
    line("核心冲突", candidate.coreConflict),
    line("主角路径", candidate.protagonistPath),
    line("结局方向", candidate.endingDirection),
    line("开局钩子", candidate.hookStrategy),
    line("推进循环", candidate.progressionLoop),
    candidate.targetChapterCount ? `目标章数：${candidate.targetChapterCount}` : "",
    candidate.toneKeywords.length > 0 ? `基调关键词：${candidate.toneKeywords.join("、")}` : "",
  ].filter(Boolean).join("\n");
}

export class NovelSpecClarificationService {
  async generate(input: NovelSpecClarificationRequest): Promise<NovelSpecClarificationResponse> {
    const result = await runStructuredPrompt({
      asset: directorSpecClarificationPrompt,
      promptInput: { specDigest: buildSpecDigest(input) },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(0.7, Math.max(0.2, input.temperature ?? 0.4)),
        maxTokens: SPEC_CLARIFICATION_MAX_TOKENS,
        entrypoint: "auto_director",
        stage: "spec_clarification",
      },
    });

    return {
      questions: result.output.questions.map((item) => ({
        topic: item.topic.trim(),
        question: item.question.trim(),
        whyItMatters: item.whyItMatters.trim(),
        suggestedAnswer: item.suggestedAnswer.trim(),
      })),
    };
  }
}

export const novelSpecClarificationService = new NovelSpecClarificationService();
