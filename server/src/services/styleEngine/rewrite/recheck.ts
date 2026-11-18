import type {
  StyleDetectionReport,
  StyleDetectionViolation,
  StyleRewriteGuard,
  StyleRewriteRecheck,
  StyleRewriteRecheckIssue,
} from "@ai-novel/shared/types/styleEngine";

const MAX_INTRODUCED = 8;

function severityWeight(severity: "low" | "medium" | "high"): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

/**
 * 过度修正判定：改写在去味方向上矫枉过正——改出的新问题（按严重度加权）不少于已解决的问题，
 * 或改写后风险参考分反而升高。advisory 性质，不阻断采用。
 */
function detectOverCorrection(
  beforeRisk: number,
  afterRisk: number,
  resolved: number,
  resolvedWeight: number,
  introducedCount: number,
  introducedWeight: number,
): StyleRewriteRecheck["overCorrection"] | undefined {
  if (introducedCount === 0) return undefined;
  const reasons: string[] = [];
  if (introducedWeight >= resolvedWeight) {
    reasons.push(resolvedWeight === 0
      ? `本次没有处理掉原有问题，却新增了 ${introducedCount} 处问题（${introducedWeight} 点）`
      : `复测新增 ${introducedCount} 处问题（${introducedWeight} 点）不少于已处理的 ${resolved} 处（${resolvedWeight} 点）`);
  }
  if (afterRisk > beforeRisk) {
    reasons.push(`表达风险参考分从 ${beforeRisk} 升到 ${afterRisk}`);
  }
  if (reasons.length === 0) return undefined;
  return { detected: true, reason: `${reasons.join("；")}，可能改过头了，建议对照原稿确认。` };
}

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
  let resolvedWeight = 0;
  let remaining = 0;
  const introduced: StyleRewriteRecheckIssue[] = [];

  for (const key of keys) {
    const beforeList = beforeByKey.get(key) ?? [];
    const afterList = afterByKey.get(key) ?? [];
    const beforeCount = beforeList.length;
    const afterCount = afterList.length;
    const resolvedCount = Math.max(0, beforeCount - afterCount);
    resolved += resolvedCount;
    remaining += Math.min(beforeCount, afterCount);
    resolvedWeight += beforeList.slice(0, resolvedCount).reduce((sum, issue) => sum + severityWeight(issue.severity), 0);
    if (afterCount > beforeCount) {
      introduced.push(
        ...afterList.slice(0, afterCount - beforeCount).map(toRecheckIssue),
      );
    }
  }

  const trimmedIntroduced = introduced.slice(0, MAX_INTRODUCED);
  const introducedWeight = trimmedIntroduced.reduce((sum, issue) => sum + severityWeight(issue.severity), 0);
  const overCorrection = detectOverCorrection(
    before.riskScore, after.riskScore, resolved, resolvedWeight, trimmedIntroduced.length, introducedWeight,
  );

  return {
    beforeRiskScore: before.riskScore,
    afterRiskScore: after.riskScore,
    resolved,
    remaining,
    introduced: trimmedIntroduced,
    overCorrection,
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
  const overCorrection = recheck?.overCorrection;
  return {
    ...guard,
    checks: [
      ...guard.checks.filter((check) => check.code !== "style_regression" && check.code !== "over_correction"),
      { code: "style_regression", status, reason },
      {
        code: "over_correction",
        status: overCorrection?.detected ? "advisory" : "passed",
        reason: overCorrection?.detected ? overCorrection.reason : "改写后未出现过度修正。",
      },
    ],
  };
}
