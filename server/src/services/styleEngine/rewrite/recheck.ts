import type {
  StyleDetectionReport,
  StyleDetectionViolation,
  StyleRewriteGuard,
  StyleRewriteRecheck,
  StyleRewriteRecheckIssue,
} from "@ai-novel/shared/types/styleEngine";

const MAX_INTRODUCED = 8;

/** 规则身份：目录规则用规则 ID，写法合同问题退回规则名，避免把模型措辞当成新问题。 */
function issueKey(issue: StyleDetectionViolation): string {
  const ruleId = issue.ruleId?.trim() ?? "";
  return ruleId ? `rule:${ruleId}` : `name:${issue.ruleName.trim()}`;
}

function groupByKey(issues: StyleDetectionViolation[]): Map<string, StyleDetectionViolation[]> {
  const grouped = new Map<string, StyleDetectionViolation[]>();
  for (const issue of issues) {
    const key = issueKey(issue);
    const list = grouped.get(key) ?? [];
    list.push(issue);
    grouped.set(key, list);
  }
  return grouped;
}

function toRecheckIssue(issue: StyleDetectionViolation): StyleRewriteRecheckIssue {
  return {
    ruleId: issue.ruleId,
    ruleName: issue.ruleName,
    severity: issue.severity,
    excerpt: issue.excerpt,
  };
}

/**
 * 改写前后只比较「同一规则身份下的条目数量」：减少的部分记为已处理，持平记为仍保留，
 * 增加的部分才是本次改写引入的候选回归。原文措辞变化不构成新增问题。
 */
export function compareStyleReports(
  before: StyleDetectionReport,
  after: StyleDetectionReport,
): StyleRewriteRecheck {
  const beforeByKey = groupByKey(before.violations);
  const afterByKey = groupByKey(after.violations);
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  let resolved = 0;
  let remaining = 0;
  const introduced: StyleRewriteRecheckIssue[] = [];

  for (const key of keys) {
    const beforeCount = beforeByKey.get(key)?.length ?? 0;
    const afterCount = afterByKey.get(key)?.length ?? 0;
    resolved += Math.max(0, beforeCount - afterCount);
    remaining += Math.min(beforeCount, afterCount);
    if (afterCount > beforeCount) {
      introduced.push(
        ...(afterByKey.get(key) ?? []).slice(0, afterCount - beforeCount).map(toRecheckIssue),
      );
    }
  }

  return {
    beforeRiskScore: before.riskScore,
    afterRiskScore: after.riskScore,
    resolved,
    remaining,
    introduced: introduced.slice(0, MAX_INTRODUCED),
  };
}

/** 复测出现新的高风险问题时，候选稿不采用；中低风险只报告，交给用户判断。 */
export function hasBlockingStyleRegression(recheck: StyleRewriteRecheck): boolean {
  return recheck.introduced.some((issue) => issue.severity === "high");
}

function regressionReason(recheck: StyleRewriteRecheck | undefined): { status: "passed" | "blocked" | "not_checked"; reason: string } {
  if (!recheck) {
    return { status: "not_checked", reason: "改写后的复测未完成，本次预览只保证不丢失原文信息。" };
  }
  const blocking = recheck.introduced.filter((issue) => issue.severity === "high");
  if (blocking.length > 0) {
    return {
      status: "blocked",
      reason: `复测发现改写引入新的高风险表达：${blocking.slice(0, 3).map((issue) => issue.ruleName).join("、")}。保留原稿。`,
    };
  }
  return { status: "passed", reason: "改写后复测未引入新的高风险表达。" };
}

export function withStyleRegressionCheck(
  guard: StyleRewriteGuard,
  recheck: StyleRewriteRecheck | undefined,
): StyleRewriteGuard {
  const { status, reason } = regressionReason(recheck);
  return {
    ...guard,
    checks: [
      ...guard.checks.filter((check) => check.code !== "style_regression"),
      { code: "style_regression", status, reason },
    ],
  };
}
