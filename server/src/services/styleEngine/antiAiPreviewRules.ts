import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { mapAntiAiRuleRow } from "./helpers";

function normalizeRuleIds(ruleIds: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawId of ruleIds ?? []) {
    const id = rawId.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

export async function listPreviewAntiAiRules(ruleIds: string[] | undefined): Promise<AntiAiRule[]> {
  const ids = normalizeRuleIds(ruleIds);
  if (ids.length === 0) {
    return [];
  }

  const rows = await prisma.antiAiRule.findMany({
    where: {
      id: { in: ids },
    },
  });
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows
    .map((row) => mapAntiAiRuleRow(row))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function mergeAntiAiRules(baseRules: AntiAiRule[], previewRules: AntiAiRule[]): AntiAiRule[] {
  const seen = new Set<string>();
  const result: AntiAiRule[] = [];
  for (const rule of [...baseRules, ...previewRules]) {
    if (seen.has(rule.id)) {
      continue;
    }
    seen.add(rule.id);
    result.push(rule);
  }
  return result;
}

/** 规则清单进入提示词时封顶：条数与单条字数都设上限，避免规则越积越多把正文挤出去。 */
export const ANTI_AI_RULE_PROMPT_MAX_RULES = 40;
const ANTI_AI_RULE_PROMPT_MAX_CHARACTERS = 120;

function clampRuleInstruction(value: string): string {
  const trimmed = value.trim();
  const characters = Array.from(trimmed);
  return characters.length > ANTI_AI_RULE_PROMPT_MAX_CHARACTERS
    ? `${characters.slice(0, ANTI_AI_RULE_PROMPT_MAX_CHARACTERS).join("")}…`
    : trimmed;
}

export function buildAntiAiRuleCatalogText(rules: AntiAiRule[]): string {
  const rendered = rules.slice(0, ANTI_AI_RULE_PROMPT_MAX_RULES);
  const lines = rendered.map((rule) => {
    const instruction = clampRuleInstruction(rule.promptInstruction ?? rule.description);
    return `- [${rule.id}] ${rule.name} (${rule.type}/${rule.severity}): ${instruction}`;
  });
  const omitted = rules.length - rendered.length;
  if (omitted > 0) {
    lines.push(`- 其余 ${omitted} 条规则同样生效，但优先处理已列出的规则。`);
  }
  return lines.join("\n");
}

export function buildAntiAiRuleDirectiveText(rules: AntiAiRule[]): string {
  if (rules.length === 0) {
    return "";
  }

  return [
    "Temporary anti-AI test rules:",
    ...rules.map((rule) => {
      const instruction = clampRuleInstruction(rule.promptInstruction?.trim() || rule.description);
      const suggestion = rule.rewriteSuggestion?.trim();
      return `- [${rule.id}] ${rule.name} (${rule.type}/${rule.severity}): ${instruction}${suggestion ? ` 修正建议：${clampRuleInstruction(suggestion)}` : ""}`;
    }),
  ].join("\n");
}
