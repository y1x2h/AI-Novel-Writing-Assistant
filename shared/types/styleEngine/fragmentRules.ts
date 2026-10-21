import { z } from "zod";

/**
 * 禁改清单：作者按书声明的「必须原样保留」字面片段（专名、设定名词、口头禅、敏感表述等）。
 * 它是书级数据，默认空、不跨书继承；命中即保留原稿，属于确定性护栏而不是风格判定。
 */
export const STYLE_FRAGMENT_MIN_CHARACTERS = 2;
export const STYLE_FRAGMENT_MAX_CHARACTERS = 80;
export const STYLE_FRAGMENT_MAX_COUNT = 50;

export const styleFragmentRuleSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  fragment: z.string(),
  note: z.string().nullable(),
  source: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StyleFragmentRule = z.infer<typeof styleFragmentRuleSchema>;

/** 比较与展示统一使用归一化文本，避免空白差异导致「同一条片段」被重复登记。 */
export function normalizeStyleFragment(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function dedupeStyleFragments(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeStyleFragment(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** 只对原文中实际出现的片段做保护，避免把清单里的片段当成新增内容写进改后正文。 */
export function selectPresentFragments(fragments: readonly string[], content: string): string[] {
  return dedupeStyleFragments(fragments).filter((fragment) => content.includes(fragment));
}
