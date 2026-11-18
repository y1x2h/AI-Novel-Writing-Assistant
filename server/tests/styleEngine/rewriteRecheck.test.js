const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareStyleReports,
  hasBlockingStyleRegression,
  withStyleRegressionCheck,
} = require("../../dist/services/styleEngine/rewrite/recheck.js");

function issue(ruleId, severity = "medium", excerpt = "原文片段") {
  return {
    ruleId,
    ruleName: `规则 ${ruleId}`,
    ruleType: "forbidden",
    severity,
    source: "anti_ai",
    layer: "surface",
    issueCategory: "expression",
    excerpt,
    reason: "命中原因",
    suggestion: "修改方向",
    canAutoRewrite: true,
  };
}

function report(violations, riskScore = 60) {
  return { riskScore, summary: "摘要", violations, generatedAt: "2026-11-18T00:00:00.000Z" };
}

test("compares rewrite reports by rule identity instead of excerpt wording", () => {
  const before = report([issue("rule-a"), issue("rule-a"), issue("rule-b")], 62);
  const after = report([issue("rule-a", "medium", "改写后的原文"), issue("rule-b", "medium", "另一处原文")], 40);

  const recheck = compareStyleReports(before, after);

  assert.equal(recheck.beforeRiskScore, 62);
  assert.equal(recheck.afterRiskScore, 40);
  assert.equal(recheck.resolved, 1);
  assert.equal(recheck.remaining, 2);
  assert.deepEqual(recheck.introduced, []);
});

test("reports problems that only appear after rewriting", () => {
  const before = report([issue("rule-a")]);
  const after = report([issue("rule-a"), issue("rule-c", "high"), issue("rule-d", "low")]);

  const recheck = compareStyleReports(before, after);

  assert.equal(recheck.resolved, 0);
  assert.equal(recheck.remaining, 1);
  assert.equal(recheck.introduced.length, 2);
  assert.deepEqual(recheck.introduced.map((item) => item.ruleId), ["rule-c", "rule-d"]);
  assert.equal(hasBlockingStyleRegression(recheck), true);
});

test("medium regressions stay advisory while high regressions block adoption", () => {
  const advisory = compareStyleReports(report([issue("rule-a")]), report([issue("rule-a"), issue("rule-c", "medium")]));
  assert.equal(hasBlockingStyleRegression(advisory), false);

  const guard = { sourceContentHash: "a", candidateContentHash: "b", policyRevision: "rev", checks: [] };
  const passed = withStyleRegressionCheck(guard, advisory).checks.find((check) => check.code === "style_regression");
  assert.equal(passed.status, "passed");

  const blocking = compareStyleReports(report([]), report([issue("rule-z", "high")]));
  const blocked = withStyleRegressionCheck(guard, blocking).checks.find((check) => check.code === "style_regression");
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.reason, /保留原稿/);
});

test("records a skipped recheck when detection fails", () => {
  const guard = { sourceContentHash: "a", candidateContentHash: "b", policyRevision: "rev", checks: [] };
  const check = withStyleRegressionCheck(guard, undefined).checks.find((item) => item.code === "style_regression");
  assert.equal(check.status, "not_checked");
});

test("flags over-correction when new issues outweigh resolved ones", () => {
  const before = report([issue("rule-a", "high")], 60);
  const after = report([issue("rule-a", "high"), issue("rule-c", "medium"), issue("rule-d", "medium")], 60);
  const recheck = compareStyleReports(before, after);
  assert.equal(recheck.overCorrection?.detected, true);
  assert.match(recheck.overCorrection?.reason ?? "", /没有处理掉原有问题/);
  const guard = { sourceContentHash: "a", candidateContentHash: "b", policyRevision: "rev", checks: [] };
  const check = withStyleRegressionCheck(guard, recheck).checks.find((item) => item.code === "over_correction");
  assert.equal(check?.status, "advisory");
});

test("flags over-correction when risk score rises after rewrite", () => {
  const before = report([issue("rule-a", "high")], 60);
  const after = report([issue("rule-c", "low")], 72);
  const recheck = compareStyleReports(before, after);
  assert.equal(recheck.overCorrection?.detected, true);
  assert.match(recheck.overCorrection?.reason ?? "", /参考分从 60 升到 72/);
});

test("does not flag over-correction when rewrite resolves more than it introduces", () => {
  const before = report([issue("rule-a", "high")], 60);
  const after = report([], 40);
  const recheck = compareStyleReports(before, after);
  assert.equal(recheck.overCorrection, undefined);
  const guard = { sourceContentHash: "a", candidateContentHash: "b", policyRevision: "rev", checks: [] };
  const check = withStyleRegressionCheck(guard, recheck).checks.find((item) => item.code === "over_correction");
  assert.equal(check?.status, "passed");
});
