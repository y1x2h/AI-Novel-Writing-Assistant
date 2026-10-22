const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_LIMIT,
  appendChapterEditorHandledDiagnostic,
  chapterEditorDiagnosticTitlesMatch,
  isChapterEditorDiagnosticHandled,
  normalizeChapterEditorDiagnosticTitle,
  readChapterEditorHandledDiagnostics,
} = require("../../shared/dist/types/chapterEditorDiagnostics.js");
const { ChapterEditorWorkspaceService } = require("../dist/services/novel/chapterEditor/ChapterEditorWorkspaceService.js");

test("diagnostic title fingerprint normalizes whitespace and punctuation", () => {
  assert.equal(normalizeChapterEditorDiagnosticTitle("梆子声重复过多，节奏被冲淡"), "梆子声重复过多节奏被冲淡");
  assert.equal(normalizeChapterEditorDiagnosticTitle(" 梆子声 重复过多…节奏被冲淡。 "), "梆子声重复过多节奏被冲淡");
  assert.equal(normalizeChapterEditorDiagnosticTitle(""), "");
  assert.equal(normalizeChapterEditorDiagnosticTitle(null), "");
});

test("diagnostic titles match on equality or containment with minimum length", () => {
  assert.equal(chapterEditorDiagnosticTitlesMatch("梆子声重复过多", "梆子声重复过多"), true);
  assert.equal(chapterEditorDiagnosticTitlesMatch("梆子声重复过多，节奏被冲淡", "梆子声重复过多"), true);
  assert.equal(chapterEditorDiagnosticTitlesMatch("梆子声反复出现，节奏机械", "梆子声重复过多，节奏被冲淡"), false);
  assert.equal(chapterEditorDiagnosticTitlesMatch("节奏", "节奏拖慢"), false, "短于 4 字的标题不做包含匹配，避免误杀");
  assert.equal(chapterEditorDiagnosticTitlesMatch("", "任意标题"), false);
});

test("handled diagnostic records round-trip through riskFlags with dedupe and cap", () => {
  let riskFlags = null;
  riskFlags = appendChapterEditorHandledDiagnostic(riskFlags, { title: "梆子声重复过多", problemSummary: "节奏机械" });
  const first = readChapterEditorHandledDiagnostics(riskFlags);
  assert.equal(first.length, 1);
  assert.equal(first[0].title, "梆子声重复过多");
  assert.equal(first[0].titleKey, "梆子声重复过多");
  assert.equal(first[0].problemSummary, "节奏机械");
  assert.ok(first[0].handledAt);

  riskFlags = appendChapterEditorHandledDiagnostic(riskFlags, { title: "梆子声 重复过多。" });
  const deduped = readChapterEditorHandledDiagnostics(riskFlags);
  assert.equal(deduped.length, 1, "同一 titleKey 去重，保留最新记录");

  for (let index = 0; index < CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_LIMIT + 5; index += 1) {
    riskFlags = appendChapterEditorHandledDiagnostic(riskFlags, { title: `问题编号${index}` });
  }
  const capped = readChapterEditorHandledDiagnostics(riskFlags);
  assert.equal(capped.length, CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_LIMIT);
  assert.equal(capped.some((record) => record.title === "梆子声 重复过多。"), false, "最旧记录被丢弃");

  const preserved = JSON.parse(riskFlags);
  assert.equal(preserved.qualityLoop, undefined, "未污染其他 riskFlags 字段");
  assert.equal(appendChapterEditorHandledDiagnostic(riskFlags, { title: "   " }), null);
});

test("other riskFlags fields survive appending a handled diagnostic", () => {
  const riskFlags = JSON.stringify({ qualityLoop: { status: "non_blocking_quality_debt" } });
  const next = appendChapterEditorHandledDiagnostic(riskFlags, { title: "留存信号不足" });
  const parsed = JSON.parse(next);
  assert.deepEqual(parsed.qualityLoop, { status: "non_blocking_quality_debt" });
  assert.equal(parsed.editorHandledDiagnostics.length, 1);
});

test("isChapterEditorDiagnosticHandled matches rephrased titles", () => {
  const records = [{ title: "梆子声重复过多，节奏被冲淡", titleKey: "梆子声重复过多节奏被冲淡", handledAt: "2026-10-22T00:00:00.000Z" }];
  assert.equal(isChapterEditorDiagnosticHandled("梆子声重复过多", records), true);
  assert.equal(isChapterEditorDiagnosticHandled("梆子声重复过多，节奏被冲淡，建议合并", records), true);
  assert.equal(isChapterEditorDiagnosticHandled("人物动机不清", records), false);
  assert.equal(isChapterEditorDiagnosticHandled("", records), false);
});

function buildWorkspaceContext(riskFlags) {
  return {
    novel: { id: "novel-1", title: "Test Novel" },
    chapter: {
      id: "chapter-1",
      title: "Test Chapter",
      order: 7,
      content: "alpha\n\nbeta",
      expectation: "push conflict forward",
      updatedAt: new Date().toISOString(),
      riskFlags,
    },
    chapterPlan: null,
    auditReports: [],
    latestStateSnapshot: null,
    volumes: [],
    normalizedContent: "alpha\n\nbeta",
    paragraphs: [
      { index: 1, from: 0, to: 5, text: "alpha" },
      { index: 2, from: 7, to: 11, text: "beta" },
    ],
    styleSummary: "",
    chapterSummary: "alpha",
    openAuditIssues: [],
    macroContext: {
      chapterRoleInVolume: "推进",
      volumeTitle: "第一卷",
      volumePositionLabel: "中段",
      volumePhaseLabel: "展开",
      paceDirective: "加快",
      chapterMission: "推进冲突",
      previousChapterBridge: "上一章",
      nextChapterBridge: "下一章",
      activePlotThreads: ["冲突"],
      characterStateSummary: "",
      worldConstraintSummary: "",
      mustKeepConstraints: [],
    },
  };
}

const DIAGNOSIS_OUTPUT = {
  cards: [{
    title: "梆子声重复过多",
    problemSummary: "同一声响反复出现",
    whyItMatters: "节奏机械",
    repairGoal: "合并重复",
    repairApproach: "删并",
    mustPreserve: [],
    recommendedAction: "compress",
    recommendedScope: "selection",
    paragraphStart: 1,
    paragraphEnd: 1,
    severity: "medium",
    sourceTags: ["节奏"],
  }, {
    title: "人物动机不清",
    problemSummary: "行动缺少理由",
    whyItMatters: "读者难以代入",
    repairGoal: "补动机",
    repairApproach: "加一句内心",
    mustPreserve: [],
    recommendedAction: "emotion",
    recommendedScope: "selection",
    paragraphStart: 2,
    paragraphEnd: 2,
    severity: "high",
    sourceTags: ["人物"],
  }],
  recommendedTask: {
    title: "梆子声重复过多",
    summary: "先合并重复",
    recommendedAction: "compress",
    recommendedScope: "selection",
    paragraphStart: 1,
    paragraphEnd: 1,
  },
};

test("workspace diagnosis suppresses cards whose problem was already handled", async () => {
  const riskFlags = appendChapterEditorHandledDiagnostic(null, {
    title: "梆子声重复过多，节奏被冲淡",
    problemSummary: "当时的问题",
  });
  let capturedInput = null;
  const service = new ChapterEditorWorkspaceService({}, {}, async (request) => {
    capturedInput = request.promptInput;
    return { output: DIAGNOSIS_OUTPUT };
  });
  service.loadContext = async () => buildWorkspaceContext(riskFlags);
  const workspace = await service.getWorkspace("novel-1", "chapter-1");

  assert.deepEqual(workspace.diagnosticCards.map((card) => card.title), ["人物动机不清"]);
  assert.ok(workspace.refreshReason.includes("1 个此前已处理的问题未再重复提示"));
  assert.equal(workspace.recommendedTask?.title, "人物动机不清", "被抑制的推荐任务回退到首个保留卡片");
  assert.deepEqual(
    (capturedInput.handledIssues ?? []).map((issue) => issue.title),
    ["梆子声重复过多，节奏被冲淡"],
    "已处理标题注入诊断 prompt 作为上下文",
  );
});

test("workspace diagnosis keeps all cards when nothing was handled before", async () => {
  const service = new ChapterEditorWorkspaceService({}, {}, async () => ({ output: DIAGNOSIS_OUTPUT }));
  service.loadContext = async () => buildWorkspaceContext(null);
  const workspace = await service.getWorkspace("novel-1", "chapter-1");
  assert.equal(workspace.diagnosticCards.length, 2);
  assert.equal(workspace.recommendedTask?.title, "梆子声重复过多");
  assert.ok(!workspace.refreshReason.includes("未再重复提示"));
});
