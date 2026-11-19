import type { BaseMessageChunk } from "@langchain/core/messages";
import { REASONING_EFFORTS, type LLMProvider, type ReasoningEffort } from "@ai-novel/shared/types/llm";
import { resolveCapability, thinkingControlKwargs } from "./compatibility";

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
export interface ProviderReasoningBehavior {
  reasoningEnabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  modelKwargs?: Record<string, unknown>;
  includeRawResponse: boolean;
  usesAccumulatedStreamDeltas: boolean;
}

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return typeof value === "string" && (REASONING_EFFORTS as readonly string[]).includes(value)
    ? value as ReasoningEffort
    : "high";
}

export interface StreamFilterResult {
  text: string;
  reasoning: string;
}

export interface MiniMaxStreamState {
  contentBuffer: string;
  reasoningBuffer: string;
}

function collectTextArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return item.trim() ? [item] : [];
    }
    if (!item || typeof item !== "object") {
      return [];
    }
    if ("text" in item && typeof item.text === "string" && item.text.trim()) {
      return [item.text];
    }
    if ("reasoning" in item && typeof item.reasoning === "string" && item.reasoning.trim()) {
      return [item.reasoning];
    }
    return [];
  });
}

function extractReasoningTextFromSummary(reasoning: unknown): string[] {
  if (!reasoning || typeof reasoning !== "object") {
    return [];
  }
  if ("summary" in reasoning) {
    return collectTextArray((reasoning as { summary?: unknown }).summary);
  }
  if ("text" in reasoning && typeof reasoning.text === "string" && reasoning.text.trim()) {
    return [reasoning.text];
  }
  return [];
}

function uniqueJoinedText(parts: string[]): string {
  return Array.from(new Set(parts.map((item) => item.trim()).filter(Boolean))).join("");
}

export function isMiniMaxCompatibleProvider(provider: LLMProvider, baseURL?: string, model?: string): boolean {
  return resolveCapability({ provider, baseURL, model }).family === "minimax";
}
export function isDeepSeekThinkingModeProvider(provider: LLMProvider, baseURL?: string, model?: string): boolean {
  const profile = resolveCapability({ provider, baseURL, model });
  return profile.family === "deepseek" && profile.thinkingToggle.supported;
}
export function isGlmThinkingModeProvider(provider: LLMProvider, baseURL?: string, model?: string): boolean {
  const profile = resolveCapability({ provider, baseURL, model });
  return profile.family === "glm" && profile.thinkingToggle.supported;
}

// GLM-5.3 起模型始终启用思考，关闭思考会返回 400（code 1210）。
// 该错误提示虽然写着「请使用 low、high 或 max」，但实测 low/high 同样被拒，只有 enabled 或不传可用。
export function isGlmAlwaysThinkingModel(model?: string): boolean {
  const normalizedModel = model?.trim().toLowerCase().split("/").at(-1);
  const version = normalizedModel?.match(/^glm-(\d+)(?:\.(\d+))?/);
  if (!version) {
    return false;
  }
  const major = Number(version[1] ?? 0);
  const minor = Number(version[2] ?? 0);
  return major > 5 || (major === 5 && minor >= 3);
}

export function supportsGlmReasoningToggle(
  provider: LLMProvider,
  baseURL?: string,
  model?: string,
): boolean {
  return isGlmThinkingModeProvider(provider, baseURL, model) && !isGlmAlwaysThinkingModel(model);
}

/**
 * 这些规划类结构化任务单次输出规模大、需要长推理，且调用方给定了较紧的输出上限。强制思考模型
 * （GLM 5.3+）在它们上面会持续输出思考内容，思考占满输出预算后不再产出正文（例如卷战略预算为
 * 1800，实测每次恰好用满 1800 个输出 token 却返回空正文），最终结构化输出空返回。
 * 因此这类任务不允许被显式模型覆盖绑定到强制思考模型，必须使用该任务类型路由配置的模型。
 */
const ROUTE_BOUND_STRUCTURED_PLANNING_PROMPTS = new Set<string>([
  "novel.world.generate_from_theme",
  "novel.volume.strategy",
  "novel.volume.skeleton",
  "novel.volume.chapter_list",
]);

export function shouldFallBackToRouteModel(input: {
  taskType: string | undefined;
  promptId: string | undefined;
  model: string | undefined;
}): boolean {
  if (input.taskType !== "planner") {
    return false;
  }
  if (!input.promptId || !ROUTE_BOUND_STRUCTURED_PLANNING_PROMPTS.has(input.promptId)) {
    return false;
  }
  return isGlmAlwaysThinkingModel(input.model);
}

export function resolveProviderReasoningBehavior(input: {
  provider: LLMProvider; baseURL: string; model: string; reasoningEnabled: boolean; reasoningEffort?: ReasoningEffort | null;
  minimizeRequiredThinking?: boolean;
}): ProviderReasoningBehavior {
  const profile = resolveCapability(input);
  const toggle = profile.thinkingToggle;
  // 始终思考的 GLM 型号无法关闭思考，发出 disabled 会直接 400，因此固定为 enabled。
  const enabled = input.reasoningEnabled || (profile.family === "glm" && isGlmAlwaysThinkingModel(input.model));
  const effort = normalizeReasoningEffort(input.reasoningEffort);
  let modelKwargs = profile.family === "ollama" && enabled ? undefined : thinkingControlKwargs(toggle, enabled, effort);
  const geminiStructuredThinking = input.minimizeRequiredThinking && profile.family === "gemini"
    && new URL(input.baseURL).hostname === "generativelanguage.googleapis.com";
  const minimized = geminiStructuredThinking && profile.reasoningRequired;
  if (minimized) modelKwargs = { ...modelKwargs, reasoning_effort: "low" };
  if (geminiStructuredThinking && !minimized && /^gemini-2\.5-flash(?:[.-]|$)/i.test(input.model)) {
    modelKwargs = { ...modelKwargs, reasoning_effort: "none" };
  }
  const miniMax = profile.family === "minimax";
  if (miniMax) modelKwargs = { ...modelKwargs, reasoning_split: true };
  return { reasoningEnabled: enabled || minimized === true, reasoningEffort: minimized ? "low" : toggle.effort && enabled ? effort : null,
    modelKwargs, includeRawResponse: miniMax || profile.reasoningField !== "none", usesAccumulatedStreamDeltas: miniMax };
}

function reasoningSources(chunk: BaseMessageChunk): Record<string, unknown>[] {
  const extra = (chunk.additional_kwargs ?? {}) as Record<string, unknown>;
  const raw = extra.__raw_response as { choices?: Array<{ delta?: Record<string, unknown> }> } | undefined;
  return [extra, raw?.choices?.[0]?.delta ?? {}];
}

export function detectReasoningField(chunk: BaseMessageChunk): "reasoning_content" | "reasoning" | "reasoning_details" | "think_tags" | undefined {
  if (typeof chunk.content === "string" && chunk.content.includes("<think>")) return "think_tags";
  for (const source of reasoningSources(chunk)) {
    if (source.reasoning_content) return "reasoning_content";
    if (source.reasoning) return "reasoning";
    if (source.reasoning_details) return "reasoning_details";
  }
  return undefined;
}

export function extractReasoningTextFromChunk(chunk: BaseMessageChunk): string {
  const directReasoning = reasoningSources(chunk).flatMap((source) => [
    ...collectTextArray(source.reasoning_content),
    ...collectTextArray(source.reasoning_details),
    ...collectTextArray(source.reasoning),
    ...extractReasoningTextFromSummary(source.reasoning),
  ]);

  const contentReasoning = Array.isArray(chunk.content)
    ? chunk.content.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      if ("type" in item && item.type === "reasoning" && "reasoning" in item && typeof item.reasoning === "string") {
        return item.reasoning.trim() ? [item.reasoning] : [];
      }
      if ("reasoning" in item && typeof item.reasoning === "string") {
        return item.reasoning.trim() ? [item.reasoning] : [];
      }
      return [];
    })
    : [];

  return uniqueJoinedText([...directReasoning, ...contentReasoning]);
}

export function extractMiniMaxRawStreamData(rawResponse: unknown): {
  contentBuffer?: string;
  reasoningBuffer?: string;
} {
  if (!rawResponse || typeof rawResponse !== "object") {
    return {};
  }
  const choices = (rawResponse as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return {};
  }
  const delta = choices[0] && typeof choices[0] === "object"
    ? (choices[0] as { delta?: unknown }).delta
    : undefined;
  if (!delta || typeof delta !== "object") {
    return {};
  }
  const contentBuffer = typeof (delta as { content?: unknown }).content === "string"
    ? (delta as { content: string }).content
    : undefined;
  const reasoningBuffer = uniqueJoinedText(
    collectTextArray((delta as { reasoning_details?: unknown }).reasoning_details),
  ) || undefined;
  return {
    contentBuffer,
    reasoningBuffer,
  };
}

export function diffAccumulatedText(previousBuffer: string, nextBuffer?: string): {
  nextBuffer: string;
  delta: string;
} {
  if (!nextBuffer) {
    return {
      nextBuffer: previousBuffer,
      delta: "",
    };
  }
  if (!previousBuffer) {
    return {
      nextBuffer,
      delta: nextBuffer,
    };
  }
  if (nextBuffer === previousBuffer) {
    return {
      nextBuffer,
      delta: "",
    };
  }
  if (nextBuffer.startsWith(previousBuffer)) {
    return {
      nextBuffer,
      delta: nextBuffer.slice(previousBuffer.length),
    };
  }
  if (previousBuffer.startsWith(nextBuffer)) {
    return {
      nextBuffer,
      delta: "",
    };
  }
  return {
    nextBuffer,
    delta: nextBuffer,
  };
}

export class ThinkTagStreamFilter {
  private pending = "";

  private insideThink = false;

  push(input: string): StreamFilterResult {
    this.pending += input;
    return this.consume(false);
  }

  flush(): StreamFilterResult {
    return this.consume(true);
  }

  private consume(flush: boolean): StreamFilterResult {
    let text = "";
    let reasoning = "";

    while (this.pending.length > 0) {
      if (!this.insideThink && this.pending.startsWith(THINK_CLOSE_TAG)) {
        this.pending = this.pending.slice(THINK_CLOSE_TAG.length);
        continue;
      }

      if (this.insideThink) {
        const closeIndex = this.pending.indexOf(THINK_CLOSE_TAG);
        if (closeIndex >= 0) {
          reasoning += this.pending.slice(0, closeIndex);
          this.pending = this.pending.slice(closeIndex + THINK_CLOSE_TAG.length);
          this.insideThink = false;
          continue;
        }
        const safeLength = flush ? this.pending.length : Math.max(0, this.pending.length - (THINK_CLOSE_TAG.length - 1));
        if (safeLength === 0) {
          break;
        }
        reasoning += this.pending.slice(0, safeLength);
        this.pending = this.pending.slice(safeLength);
        continue;
      }

      const openIndex = this.pending.indexOf(THINK_OPEN_TAG);
      if (openIndex >= 0) {
        text += this.pending.slice(0, openIndex);
        this.pending = this.pending.slice(openIndex + THINK_OPEN_TAG.length);
        this.insideThink = true;
        continue;
      }

      const safeLength = flush ? this.pending.length : Math.max(0, this.pending.length - (THINK_OPEN_TAG.length - 1));
      if (safeLength === 0) {
        break;
      }
      text += this.pending.slice(0, safeLength);
      this.pending = this.pending.slice(safeLength);
    }

    return {
      text,
      reasoning,
    };
  }
}

export class ReasoningStreamCollector {
  private readonly thinkFilter = new ThinkTagStreamFilter();

  private miniMaxReasoningBuffer = "";

  push(chunk: BaseMessageChunk, text: string): string {
    const rawResponse = (chunk.additional_kwargs as { __raw_response?: unknown } | undefined)
      ?.__raw_response;
    const rawReasoning = extractMiniMaxRawStreamData(rawResponse).reasoningBuffer;
    const normalized = diffAccumulatedText(this.miniMaxReasoningBuffer, rawReasoning);
    this.miniMaxReasoningBuffer = normalized.nextBuffer;
    const direct = normalized.delta || extractReasoningTextFromChunk(chunk);
    return uniqueJoinedText([direct, this.thinkFilter.push(text).reasoning]);
  }

  flush(): string {
    return this.thinkFilter.flush().reasoning;
  }
}
