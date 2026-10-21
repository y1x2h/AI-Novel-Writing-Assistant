import type { ChapterPatchRepairPlan } from "@ai-novel/shared/types/chapterPatchRepair";
import type { StyleRewriteGuard, StyleRewriteLedgerEntry } from "@ai-novel/shared/types/styleEngine";

/**
 * 台账条目是对已产出结构化结果的确定性翻译：把补丁、护栏结论、信息守恒判定写成一条可读记录，
 * 不重新判断风格、也不改变任何决定。
 */
export function buildLedgerEntries(input: {
  plan: ChapterPatchRepairPlan;
  issues: Array<{ issueId: string; ruleName: string }>;
  guard: StyleRewriteGuard;
  /** false 表示最终保留了原稿（护栏拦截或信息守恒判定为信息增删）。 */
  adopt: boolean;
}): StyleRewriteLedgerEntry[] {
  const blocked = input.guard.checks.some((check) => check.status === "blocked");
  const escalated = new Set((input.guard.escalations ?? []).map((item) => item.patchIndex));

  return input.plan.patches.map((patch, index) => {
    const issue = input.issues.find((item) => patch.issueIds.includes(item.issueId));
    return {
      issueId: issue?.issueId ?? patch.issueIds[0] ?? "",
      ruleName: issue?.ruleName ?? "",
      targetExcerpt: patch.targetExcerpt,
      replacement: patch.replacement,
      checkStatus: escalated.has(index)
        ? "needs_review"
        : blocked || !input.adopt
          ? "blocked"
          : "accepted",
    };
  });
}
