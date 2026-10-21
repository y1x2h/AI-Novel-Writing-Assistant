import { createHash } from "node:crypto";
import { applyChapterPatchRepairPlan, type ChapterPatchRepairPlan } from "@ai-novel/shared/types/chapterPatchRepair";
import type {
  StyleRewriteBaseline,
  StyleRewriteEscalation,
  StyleRewriteGuard,
  StyleRewriteScope,
} from "@ai-novel/shared/types/styleEngine";

export const STYLE_REWRITE_POLICY_REVISION = "style-patch-v2";

export interface StyleRewriteScopePolicy {
  /** 整个选区允许删除的字数占比上限。 */
  maxDeletionRatio: number;
  /** 单个补丁改写后至少保留原片段字数的比例，用于挡住「整句删掉」。 */
  perPatchMinRetention: number;
}

/**
 * 三档改写力度的确定性边界，对应用户可见的「轻改 / 中改 / 重写」。
 * 这里是结构化配置 → 阈值映射，不是关键词判断；删除幅度由代码兜底，语义由 AI 判定。
 */
export const STYLE_REWRITE_SCOPE_POLICY: Record<StyleRewriteScope, StyleRewriteScopePolicy> = {
  in_place: { maxDeletionRatio: 0.05, perPatchMinRetention: 0.9 },
  sentence: { maxDeletionRatio: 0.15, perPatchMinRetention: 0.5 },
  free: { maxDeletionRatio: 0.35, perPatchMinRetention: 0 },
};

export const DEFAULT_STYLE_REWRITE_SCOPE: StyleRewriteScope = "free";

const NEEDS_REVIEW_TAG = "[需复核]";

const count = (text: string) => Array.from(text.replace(/\s/gu, "")).length;
export const styleContentHash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Safety anchors only: this does not classify style or infer narrative facts. */
function numericTerms(text: string): string[] {
  return text.match(/\d+(?:[.,:/-]\d+)*(?:%|％)?/gu) ?? [];
}

function occurrences(text: string, term: string): number {
  return text.split(term).length - 1;
}

/**
 * 删除幅度是「最多能删多少有剧情功能的内容」的确定性底线。
 * 触线时保留原稿并标记待复核，不把局部质量问题升级成全局阻塞。
 */
function collectDeletionEscalations(input: {
  patches: ChapterPatchRepairPlan["patches"];
  deletionRatio: number;
  policy: StyleRewriteScopePolicy;
}): StyleRewriteEscalation[] {
  const escalations: StyleRewriteEscalation[] = [];
  const globalBreach = input.deletionRatio > input.policy.maxDeletionRatio;

  input.patches.forEach((patch, index) => {
    const originalLength = count(patch.targetExcerpt);
    const replacementLength = count(patch.replacement);
    const retention = originalLength === 0 ? 1 : replacementLength / originalLength;
    const removedInPatch = originalLength - replacementLength;

    if (removedInPatch <= 0) {
      return;
    }
    if (retention < input.policy.perPatchMinRetention) {
      escalations.push({
        patchIndex: index,
        code: "needs_review",
        reason: `${NEEDS_REVIEW_TAG}该补丁删掉了原片段 ${Math.round((1 - retention) * 100)}% 的内容，超出当前改写力度允许的删减幅度。`,
      });
      return;
    }
    if (globalBreach) {
      escalations.push({
        patchIndex: index,
        code: "needs_review",
        reason: `${NEEDS_REVIEW_TAG}本次改写的整体删减幅度超过当前改写力度上限，请人工确认被删掉的内容是否仍有剧情功能。`,
      });
    }
  });

  return escalations;
}

export function guardStylePatches(input: {
  original: string;
  plan: ChapterPatchRepairPlan;
  allowedIssueIds: string[];
  styleIssueIds: string[];
  protectedTerms?: string[];
  scope?: StyleRewriteScope;
}): { content: string; guard: StyleRewriteGuard; baseline: StyleRewriteBaseline } {
  const applied = applyChapterPatchRepairPlan(input.original, input.plan);
  const allowed = new Set(input.allowedIssueIds);
  const style = new Set(input.styleIssueIds);
  const scope = input.scope ?? DEFAULT_STYLE_REWRITE_SCOPE;
  const scopePolicy = STYLE_REWRITE_SCOPE_POLICY[scope];
  const scopeValid = applied.success && input.plan.patches.every(patch => patch.issueIds.length > 0
    && patch.issueIds.every(id => allowed.has(id)));
  const total = Math.max(1, count(input.original));
  const touchedRatio = input.plan.patches.reduce((sum, patch) => sum + count(patch.targetExcerpt), 0) / total;
  const addedCharacters = input.plan.patches.reduce((sum, patch) => sum
    + Math.max(0, count(patch.replacement) - count(patch.targetExcerpt)), 0);
  const deletedCharacters = input.plan.patches.reduce((sum, patch) => sum
    + Math.max(0, count(patch.targetExcerpt) - count(patch.replacement)), 0);
  const deletionRatio = deletedCharacters / total;
  const lengthChangeRatio = (count(applied.content) - count(input.original)) / total;
  // Short pasted selections have a different denominator from full chapters.
  const budgetValid = touchedRatio <= (total < 500 ? 1 : 0.3)
    && addedCharacters / total <= (total < 500 ? 0.2 : 0.05)
    && Math.abs(lengthChangeRatio) <= 0.3;
  const escalations = collectDeletionEscalations({
    patches: input.plan.patches,
    deletionRatio,
    policy: scopePolicy,
  });
  const deletionValid = escalations.length === 0;
  const protectedValid = input.plan.patches.every(patch => {
    // Explicit non-style repair may correct an erroneous draft fact. AI reacceptance
    // must separately verify the correction against its issue and canonical context.
    if (patch.issueIds.some(id => !style.has(id))) return true;
    const terms = new Set([...numericTerms(patch.targetExcerpt), ...numericTerms(patch.replacement),
      ...(input.protectedTerms ?? []).filter(Boolean)]);
    return [...terms].every(term => occurrences(patch.targetExcerpt, term) === occurrences(patch.replacement, term));
  });
  const guard: StyleRewriteGuard = {
    sourceContentHash: styleContentHash(input.original), candidateContentHash: styleContentHash(applied.content),
    policyRevision: STYLE_REWRITE_POLICY_REVISION, touchedRatio, addedCharacters, lengthChangeRatio,
    scope, deletionRatio, escalations,
    checks: [
      { code: "patch_scope", status: scopeValid ? "passed" : "blocked", reason: scopeValid ? "本次需要修改的片段已核对。" : "修订包含尚未确认的修改或无法可靠定位的片段，保留原稿。" },
      { code: "edit_budget", status: budgetValid ? "passed" : "blocked", reason: budgetValid ? "修改范围与篇幅在保护范围内。" : "修改范围或新增篇幅过大，保留原稿。" },
      { code: "deletion_budget", status: deletionValid ? "passed" : "blocked", reason: deletionValid ? "删减幅度在当前改写力度的保护范围内。" : `${NEEDS_REVIEW_TAG}删减超出当前改写力度上限，保留原稿并标出需人工复核的补丁。` },
      { code: "protected_terms", status: protectedValid ? "passed" : "blocked", reason: protectedValid ? "表达补丁保留了明确保护的原文词项。" : "表达补丁改变了数字或受保护专名，保留原稿。" },
      { code: "semantic_facts", status: "not_checked", reason: "原文词项保护不代表人物行为与设定一致，语义由候选复验核对。" },
    ],
  };
  return {
    content: guard.checks.some(check => check.status === "blocked") ? input.original : applied.content,
    guard,
    baseline: {
      sourceContentHash: guard.sourceContentHash,
      changes: input.plan.patches.map(patch => ({ original: patch.targetExcerpt, replacement: patch.replacement })),
      allowedCorrectionIssueIds: [...new Set(input.plan.patches.flatMap(patch => patch.issueIds))]
        .filter(id => allowed.has(id) && !style.has(id)),
    },
  };
}

export function isStyleRewriteBlocked(guard?: StyleRewriteGuard): boolean {
  return Boolean(guard?.checks.some(check => check.status === "blocked"));
}
