const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildProseQualityAuditReport,
  detectProseQuality,
} = require("../dist/services/novel/runtime/proseQuality/ProseQualityDetector.js");
const { createStyleSignalPolicy } = require("../../shared/dist/types/styleEngine.js");

const dialogueHeavyChapter = Array.from({ length: 40 }, (_, index) => (
  `「这是第${index + 1}段对白，我们要在这里把话说清楚，不要给彼此留任何余地。」`
)).join("\n");

const narrativeOnlyChapter = Array.from({ length: 30 }, (_, index) => (
  `他在第${index + 1}条长街尽头停下脚步，风把城头的旗帜吹得猎猎作响，灯火顺着石阶一层层亮起来。`
)).join("\n");

const mixedChapter = Array.from({ length: 20 }, (_, index) => [
  `「第${index + 1}次交锋，你打算怎么走？」他问。`,
  `他把手按在刀柄上，屋檐的雨水第${index + 1}次顺着瓦沟落下来，砸在青石板上溅起细小的水花。`,
  `远处更鼓敲过第${index + 1}响，巡夜的灯笼从巷口缓慢移过，又在转角处被墙影吞没。`,
].join("\n")).join("\n");

function codes(report) {
  return report.findings.map((finding) => finding.code);
}

function severitiesByCode(report, code) {
  return report.findings
    .filter((finding) => finding.code === code)
    .map((finding) => finding.severity);
}

test("detectProseQuality detects deterministic prose degradation signals", () => {
  const longParagraph = `${"潮声压在城墙外，灯火一层层熄灭，守夜人握紧刀柄。".repeat(12)}。`;
  const report = detectProseQuality([
    "他不是害怕，而是终于明白自己已经没有退路。",
    "门后传来声音——很轻，却像刀锋一样贴着耳骨……",
    "他停下。他抬头。他看门。他推开。他进去。他沉默。",
    longParagraph,
    "同一句话在墙上反复浮现。",
    "同一句话在墙上反复浮现。",
    "作为AI语言模型，我无法继续生成这一章。",
    "（此处省略）",
    "本章的任务单要求章尾钩子更强。",
    "更远处的灯火仍在晃动，像一条没有收束的路",
  ].join("\n"));

  assert.ok(report.hasBlockingFindings);
  assert.deepEqual(new Set(codes(report)), new Set([
    "prose_negative_flip",
    "prose_dash_or_ellipsis",
    "prose_period_stutter",
    "prose_long_paragraph",
    "prose_verbatim_repeat",
    "prose_truncation",
    "prose_ai_self_reference",
    "prose_placeholder_leak",
    "prose_engineering_term_leak",
  ]));
  assert.ok(severitiesByCode(report, "prose_long_paragraph").includes("medium"));
  assert.ok(severitiesByCode(report, "prose_ai_self_reference").includes("critical"));
});

test("detectProseQuality keeps common false positives out of blocking findings", () => {
  const report = detectProseQuality([
    "他终于明白，这不是黑就是白的问题，而是每个人都要付出代价。",
    "「作为AI，我会保护你。」银色傀儡抬起头，眼底亮起蓝光。",
    "> 不是冷漠，而是克制。",
    "她在纸上写下完整答案，然后把灯熄灭。",
  ].join("\n"));

  assert.equal(codes(report).includes("prose_negative_flip"), false);
  assert.equal(codes(report).includes("prose_ai_self_reference"), false);
  assert.equal(report.hasBlockingFindings, false);
});

test("flags a dialogue-heavy chapter as dialogue density evidence without blocking", () => {
  const report = detectProseQuality(dialogueHeavyChapter);

  assert.ok(codes(report).includes("prose_dialogue_ratio"));
  assert.ok(codes(report).includes("prose_talk_loop"));
  assert.equal(report.hasBlockingFindings, false);
  const ratioFinding = report.findings.find((finding) => finding.code === "prose_dialogue_ratio");
  assert.match(ratioFinding.message, /对白淹没叙述/);
  assert.equal(ratioFinding.severity, "low");
});

test("flags a narrative-only chapter as low dialogue ratio evidence", () => {
  const report = detectProseQuality(narrativeOnlyChapter);

  assert.ok(codes(report).includes("prose_dialogue_ratio"));
  assert.equal(codes(report).includes("prose_talk_loop"), false);
  assert.equal(report.hasBlockingFindings, false);
  assert.match(
    report.findings.find((finding) => finding.code === "prose_dialogue_ratio").message,
    /叙述明显压倒对白/,
  );
});

test("leaves chapters that interleave dialogue with action alone", () => {
  const report = detectProseQuality(mixedChapter);

  assert.equal(codes(report).includes("prose_dialogue_ratio"), false);
  assert.equal(codes(report).includes("prose_talk_loop"), false);
  assert.equal(report.hasBlockingFindings, false);
});

test("dialogue density thresholds follow the writing style signal policy", () => {
  const shortDialogueRun = ["「你来了。」", "「嗯。」", "「坐吧。」", "「好。」"].join("\n");

  assert.equal(codes(detectProseQuality(shortDialogueRun)).includes("prose_dialogue_ratio"), false);
  assert.equal(codes(detectProseQuality(shortDialogueRun)).includes("prose_talk_loop"), false);

  const strictPolicy = { ...createStyleSignalPolicy(), dialogueRatioMax: 0.1, talkLoopRounds: 3 };
  assert.ok(codes(detectProseQuality(mixedChapter, strictPolicy)).includes("prose_dialogue_ratio"));
  assert.ok(codes(detectProseQuality(shortDialogueRun, strictPolicy)).includes("prose_talk_loop"));
});

test("buildProseQualityAuditReport maps findings into mode_fit runtime audit issues", () => {
  const report = detectProseQuality("作为AI语言模型，我无法继续生成这一章。后来他只能望着未完成的门");
  const auditReport = buildProseQualityAuditReport({
    novelId: "novel-1",
    chapterId: "chapter-1",
    report,
    now: new Date("2026-07-06T00:00:00.000Z"),
  });

  assert.ok(auditReport);
  assert.equal(auditReport.auditType, "mode_fit");
  assert.equal(auditReport.issues.length >= 1, true);
  assert.equal(auditReport.issues[0].status, "open");
  assert.equal(auditReport.issues[0].auditType, "mode_fit");
  assert.match(auditReport.issues[0].code, /^prose_/);
  assert.equal(auditReport.createdAt, "2026-07-06T00:00:00.000Z");
});
