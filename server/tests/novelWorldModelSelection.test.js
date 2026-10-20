const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { setPromptRunnerStructuredInvokerForTests } = require("../dist/prompting/core/promptRunner.js");
const { NovelWorldInstanceService } = require("../dist/services/novel/worldContext/NovelWorldInstanceService.js");
const { novelThemeWorldGenerationPrompt } = require("../dist/prompting/prompts/world/world.prompts.js");
const { setWorldGenerationTimeoutForTests } = require("../dist/services/settings/worldGeneration/timeoutSettings.js");
const { shouldFallBackToRouteModel } = require("../dist/llm/reasoning.js");

test("generating a novel world keeps the selected model instead of forcing DeepSeek", async () => {
  const originalNovel = prisma.novel;
  const captured = [];
  prisma.novel = {
    findUnique: async () => ({
      id: "novel-1",
      title: "测试小说",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
    }),
  };
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    captured.push(input);
    throw new Error("stop after capturing model selection");
  });
  setWorldGenerationTimeoutForTests(120_000);

  try {
    const service = new NovelWorldInstanceService();
    await assert.rejects(
      () => service.generateFromNovelTheme({
        novelId: "novel-1",
        provider: "ollama",
        model: "qwen3:8b",
        temperature: 0.35,
      }),
      /stop after capturing model selection/,
    );

    assert.equal(captured[0].provider, "ollama");
    assert.equal(captured[0].model, "qwen3:8b");
    assert.equal(captured[0].temperature, 0.35);
    // 世界观生成不再设置固定输出上限：强制思考模型的思考内容计入输出预算，固定小上限会把正文挤空。
    assert.equal(captured[0].maxTokens, undefined);
    assert.equal(captured[0].timeoutMs, 120_000);
    assert.equal(captured[0].maxRepairAttempts, 0);
  } finally {
    prisma.novel = originalNovel;
    setPromptRunnerStructuredInvokerForTests();
    setWorldGenerationTimeoutForTests();
  }
});

test("forced-thinking GLM models fall back to the route model on heavy planning prompts", () => {
  // 强制思考模型（GLM 5.3+）只输出思考、长时间不产出正文，重型规划结构化任务必须走任务路由。
  assert.equal(shouldFallBackToRouteModel({
    taskType: "planner",
    promptId: "novel.world.generate_from_theme",
    model: "glm-5.3-flash",
  }), true);
  assert.equal(shouldFallBackToRouteModel({
    taskType: "planner",
    promptId: "novel.volume.chapter_list",
    model: "glm-5.3-flash",
  }), true);
  // 其他任务类型或非重型任务保留调用方的模型选择。
  assert.equal(shouldFallBackToRouteModel({
    taskType: "writer",
    promptId: "novel.world.generate_from_theme",
    model: "glm-5.3-flash",
  }), false);
  assert.equal(shouldFallBackToRouteModel({
    taskType: "planner",
    promptId: "title.generation",
    model: "glm-5.3-flash",
  }), false);
  // 可关闭思考的 GLM 型号仍然尊重用户选择。
  assert.equal(shouldFallBackToRouteModel({
    taskType: "planner",
    promptId: "novel.world.generate_from_theme",
    model: "glm-4.7-flash",
  }), false);
});

test("novel theme world prompt stays within a one-shot JSON budget", () => {
  const messages = novelThemeWorldGenerationPrompt.render({
    novelTitle: "测试小说",
    description: "都市调查故事",
    targetAudience: "成年读者",
    bookSellingPoint: "高压反转",
    first30ChapterPromise: "主角进入事件核心",
    commercialTags: ["都市", "悬疑"],
    genreName: "都市",
    primaryStoryModeName: "悬疑",
    secondaryStoryModeName: "成长",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(novelThemeWorldGenerationPrompt.version, "v3");
  assert.equal(novelThemeWorldGenerationPrompt.repairPolicy.maxAttempts, 0);
  assert.match(String(messages[0].content), /输出容量硬约束/);
  assert.match(String(messages[0].content), /1,800 个汉字以内/);
});
