const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractRepairAnchors,
} = require("../../dist/services/novel/runtime/repair/repairIssueAnchors.js");

function createRuntimePackage(openIssues) {
  return {
    novelId: "novel-1",
    chapterId: "chapter-1",
    audit: { openIssues, reports: [] },
  };
}

test("extractRepairAnchors 解析确定性检测的「第 N 行：摘录」锚点", () => {
  const anchors = extractRepairAnchors(createRuntimePackage([{
    auditType: "mode_fit",
    severity: "high",
    code: "prose_negative_flip",
    evidence: "第 7 行：他不是害怕，而是终于明白自己不能回头。",
    fixSuggestion: "改成具体动作和感官细节。",
  }]));

  assert.equal(anchors.length, 1);
  assert.deepEqual(anchors[0], {
    code: "prose_negative_flip",
    auditType: "mode_fit",
    severity: "high",
    line: 7,
    excerpt: "他不是害怕，而是终于明白自己不能回头。",
    evidence: "第 7 行：他不是害怕，而是终于明白自己不能回头。",
    fixSuggestion: "改成具体动作和感官细节。",
  });
});

test("extractRepairAnchors 无行号时回退提取引号摘录", () => {
  const anchors = extractRepairAnchors(createRuntimePackage([{
    auditType: "continuity",
    severity: "medium",
    code: "CONTINUITY_GAP",
    evidence: "承接处出现断层，例如「他推开门走了进去」前后缺少过渡。",
    fixSuggestion: "补足承接。",
  }]));

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].line, null);
  assert.equal(anchors[0].excerpt, "他推开门走了进去");
});

test("extractRepairAnchors 无锚点信息时保留原始证据且不编造摘录", () => {
  const anchors = extractRepairAnchors(createRuntimePackage([{
    auditType: "plot",
    severity: "high",
    code: "OBLIGATION_UNMET",
    evidence: "本章未兑现核心冲突推进。",
    fixSuggestion: "补写冲突推进。",
  }]));

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].line, null);
  assert.equal(anchors[0].excerpt, null);
  assert.equal(anchors[0].evidence, "本章未兑现核心冲突推进。");
});

test("extractRepairAnchors 跳过没有 code 的问题并在空包时返回空数组", () => {
  assert.deepEqual(extractRepairAnchors(null), []);
  assert.deepEqual(extractRepairAnchors(createRuntimePackage([
    { auditType: "continuity", severity: "medium", code: "  ", evidence: "无 code", fixSuggestion: "" },
  ])), []);
});
