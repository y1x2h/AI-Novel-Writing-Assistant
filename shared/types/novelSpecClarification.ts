import type { DirectorCandidate } from "./novelDirector";
import type { LLMProvider } from "./llm";

/** 故事规格成型后，AI 指出的待澄清歧义。 */
export interface NovelSpecClarificationQuestion {
  topic: string;
  question: string;
  whyItMatters: string;
  suggestedAnswer: string;
}

export interface NovelSpecClarificationRequest {
  idea: string;
  candidate: DirectorCandidate;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface NovelSpecClarificationResponse {
  questions: NovelSpecClarificationQuestion[];
}

/** 用户对某条歧义的作答（可采纳 AI 建议答案）。 */
export interface NovelSpecClarificationAnswer {
  topic: string;
  answer: string;
}

/**
 * 把澄清答案并入起始想法，作为正式故事规格的补充。
 * 无有效答案时原样返回，保证不影响既有链路。
 */
export function composeIdeaWithClarifications(
  idea: string,
  answers: NovelSpecClarificationAnswer[],
): string {
  const base = idea.trim();
  const effective = answers
    .map((item) => ({ topic: item.topic.trim(), answer: item.answer.trim() }))
    .filter((item) => Boolean(item.topic) && Boolean(item.answer));
  if (effective.length === 0) {
    return base;
  }
  const block = [
    "【补充设定】",
    ...effective.map((item) => `- ${item.topic}：${item.answer}`),
  ].join("\n");
  return base ? `${base}\n\n${block}` : block;
}
