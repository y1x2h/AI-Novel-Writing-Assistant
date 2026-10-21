const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBlurbInputSummary,
  collectUniqueBlurbCandidates,
  ensureBlurbQuality,
  normalizeBlurbCandidates,
} = require("../dist/services/novel/blurb/blurbGeneration.shared.js");
const {
  blurbGenerationPrompt,
  blurbGenerationRawOutputSchema,
} = require("../dist/prompting/prompts/novel/blurbGeneration.prompts.js");

function longBlurb(seed) {
  const base = `${seed}，主角必须在所有人都以为他会认输的时候重新站起来，用一场谁也预料不到的反击夺回主动权，并让读者看到下一章必须继续追下去的理由。`;
  return base.padEnd(90, "他");
}

function buildCandidate(seed, body) {
  return {
    blurb: body ?? longBlurb(seed),
    hookLine: `${seed}的钩子`,
    angle: `${seed}角度`,
    targetReader: "爱看高压逆袭和持续追更钩子的读者",
  };
}

function padBlurb(text) {
  let result = text;
  while (Array.from(result).length < 90) {
    result += text;
  }
  return result;
}

test("normalizeCommercialTags-like sanitation rejects overly short blurbs and truncates long fields", async () => {
  const { BLURB_MAX_LENGTH, BLURB_HOOK_LINE_MAX_LENGTH } = await import("@ai-novel/shared/types/blurb");

  const candidates = normalizeBlurbCandidates([
    { blurb: "太短了", hookLine: "钩子", angle: "角度", targetReader: "读者" },
    {
      blurb: "他".repeat(BLURB_MAX_LENGTH + 120),
      hookLine: "钩".repeat(200),
      angle: "角度",
      targetReader: "读者",
    },
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(Array.from(candidates[0].blurb).length, BLURB_MAX_LENGTH);
  assert.equal(Array.from(candidates[0].hookLine).length, BLURB_HOOK_LINE_MAX_LENGTH);
});

test("collectUniqueBlurbCandidates dedupes near-identical blurbs and keeps requested count", async () => {
  const { DEFAULT_BLURB_COUNT } = await import("@ai-novel/shared/types/blurb");

  const duplicated = buildCandidate("身份错位的复仇");
  const collected = collectUniqueBlurbCandidates([
    duplicated,
    { ...duplicated },
    buildCandidate("规则异常的求生", padBlurb("废土世界的维修师在废墟里捡到一枚会自行修复的古老机甲核心")),
    buildCandidate("被流放的维修师逆袭", padBlurb("被家族除名的年轻医师带着一本残缺药典回到疫病蔓延的边城")),
  ], DEFAULT_BLURB_COUNT);

  assert.equal(collected.length, 3);
  assert.equal(collected[0].angle, "身份错位的复仇角度");
});

test("ensureBlurbQuality throws when candidate count is below the requested target", () => {
  const candidates = normalizeBlurbCandidates([buildCandidate("唯一角度")]);
  assert.equal(candidates.length, 1);
  assert.throws(() => ensureBlurbQuality(candidates, 4), /简介候选数量不足/);
});

test("buildBlurbInputSummary only includes provided fields and never fabricates values", () => {
  const summary = buildBlurbInputSummary({
    title: "雾港审判局",
    targetAudience: "爱看悬疑压迫感的读者",
    commercialTags: ["逆袭", "强冲突"],
  });

  assert.match(summary, /书名：雾港审判局/);
  assert.match(summary, /目标读者：爱看悬疑压迫感的读者/);
  assert.match(summary, /商业标签：逆袭、强冲突/);
  assert.doesNotMatch(summary, /核心卖点/);
  assert.doesNotMatch(summary, /前 30 章承诺/);
});

test("blurb generation prompt renders count, requirements and retry reason", () => {
  const rendered = blurbGenerationPrompt.render({
    inputSummary: "书名：雾港审判局",
    baselineDescription: "主角是被流放的维修师。",
    count: 4,
    retryReason: "简介过长",
    forceJson: true,
  }, { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });

  const system = String(rendered[0]?.content ?? "");
  const user = String(rendered[1]?.content ?? "");

  assert.match(system, /candidates/);
  assert.match(system, /严禁捏造|不得捏造/);
  assert.match(user, /需要产出的候选条数：4/);
  assert.match(user, /书名：雾港审判局/);
  assert.match(user, /作者现有概述（作为基线）：\n主角是被流放的维修师。/);
  assert.match(user, /上一次输出存在问题：简介过长/);
});

test("blurb raw output schema accepts loose extra fields but requires candidates", () => {
  const parsed = blurbGenerationRawOutputSchema.safeParse({
    candidates: [buildCandidate("宽松解析")],
    modelNote: "额外字段应被允许",
  });
  assert.equal(parsed.success, true);

  const invalid = blurbGenerationRawOutputSchema.safeParse({ items: [] });
  assert.equal(invalid.success, false);
});
