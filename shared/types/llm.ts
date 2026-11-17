export const LLM_PROVIDERS = [
  "deepseek",
  "siliconflow",
  "openai",
  "anthropic",
  "grok",
  "kimi",
  "minimax",
  "glm",
  "qwen",
  "gemini",
  "ollama",
] as const;

export type BuiltinLLMProvider = typeof LLM_PROVIDERS[number];
export type LLMProvider = BuiltinLLMProvider | (string & {});
/** Initial per-request output allowance. Saved task settings and explicit request values take precedence. */
export const DEFAULT_MODEL_OUTPUT_TOKENS = 8192;
/**
 * 强制思考模型（GLM 5.3+）无法关闭思考，思考 token 与正文共用同一次输出额度。
 * 按非思考模型的默认额度请求时，思考会先占满额度，正文与结构化结果为空，
 * 因此这类模型需要更高的输出额度下限。
 */
export const ALWAYS_THINKING_MODEL_OUTPUT_TOKENS = 32768;

export const REASONING_EFFORTS = ["low", "high", "max"] as const;
export type ReasoningEffort = typeof REASONING_EFFORTS[number];

export const PROVIDER_AUTH_MODES = ["bearer", "x-api-key", "none"] as const;
export type ProviderAuthMode = typeof PROVIDER_AUTH_MODES[number];

export function isBuiltinLLMProvider(provider: string): provider is BuiltinLLMProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(provider);
}

export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  name: string;
  provider: LLMProvider;
  baseURL: string;
  defaultModel: string;
  models: string[];
  envKey: string;
}
