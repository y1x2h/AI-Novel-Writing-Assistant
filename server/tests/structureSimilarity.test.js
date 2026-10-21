const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterStructureSignature,
  hasComparableStructure,
} = require("../dist/services/novel/runtime/structureSimilarity/StructureSignature.js");
const {
  compareStructureSignatures,
  buildCrossChapterStructureEvidence,
} = require("../dist/services/novel/runtime/structureSimilarity/StructureSimilarityDetector.js");

const SHARED_BEATS = [
  "主角从昏迷中醒来",
  "与守卫发生正面冲突",
  "独处时回顾自己的处境",
  "靠一个反转脱身",
];

const SHARED_CONTRACT = {
  keyTurn: "主角发现自己被同伴出卖",
  primaryResistance: "守卫封锁了唯一出口",
  emotionalShift: "从茫然转为冷硬的决意",
  netChange: "主角失去退路但拿到线索",
  endingHook: "门外传来熟人的声音",
};

function sceneCardsJson(beats, contract = SHARED_CONTRACT) {
  return JSON.stringify({
    targetWordCount: 3000,
    readerExperience: contract,
    scenes: beats.map((turn, index) => ({
      title: `场景${index + 1}`,
      turn,
      emotionalShift: `情绪${index + 1}`,
    })),
  });
}

function signature(chapterOrder, sceneCards) {
  return buildChapterStructureSignature({
    chapterId: `c${chapterOrder}`,
    chapterOrder,
    sceneCards,
    targetWordCount: 3000,
  });
}

test("flags three chapters reusing the same scene skeleton as repeated structure evidence", () => {
  const history = [signature(8, sceneCardsJson(SHARED_BEATS)), signature(9, sceneCardsJson(SHARED_BEATS))];
  const current = signature(10, sceneCardsJson(SHARED_BEATS));

  const evidence = buildCrossChapterStructureEvidence({ current, history, windowSize: 5 });

  assert.ok(evidence);
  assert.equal(evidence.comparedChapterCount, 2);
  assert.deepEqual(evidence.candidates.map((candidate) => candidate.chapterOrder), [8, 9]);
  assert.ok(evidence.maxSimilarity >= 0.9);
  assert.deepEqual(evidence.repeatedSkeletonRun.chapterOrders, [8, 9, 10]);
  assert.ok(evidence.candidates[0].sharedBeats.length > 0);
});

test("stays silent when neighbouring chapters use different skeletons", () => {
  const history = [
    signature(8, sceneCardsJson(["主角在集市上被人认出", "追查一张失踪的货单", "深夜独自登上渡船"])),
    signature(9, sceneCardsJson(["审判在雨夜开庭", "证人的供词互相矛盾", "主角选择公开认罪"])),
  ];
  const current = signature(10, sceneCardsJson(SHARED_BEATS));

  assert.equal(buildCrossChapterStructureEvidence({ current, history, windowSize: 5 }), null);
});

test("falls back to the reader experience contract when scene cards are missing", () => {
  const contractOnly = JSON.stringify({ targetWordCount: 3000, readerExperience: SHARED_CONTRACT });
  const history = [signature(4, contractOnly), signature(5, contractOnly)];
  const current = signature(6, contractOnly);

  assert.equal(current.hasSceneCards, false);
  assert.ok(hasComparableStructure(current));

  const evidence = buildCrossChapterStructureEvidence({ current, history, windowSize: 5 });
  assert.ok(evidence);
  assert.ok(evidence.candidates.length > 0);
  assert.equal(evidence.repeatedSkeletonRun, null);
});

test("ignores chapters without scene cards or contract content", () => {
  const empty = signature(3, null);
  const emptyPlan = signature(4, JSON.stringify({ targetWordCount: 3000, scenes: [] }));

  assert.equal(hasComparableStructure(empty), false);
  assert.equal(compareStructureSignatures(empty, emptyPlan), null);
  assert.equal(
    buildCrossChapterStructureEvidence({ current: emptyPlan, history: [empty], windowSize: 5 }),
    null,
  );
});

test("orders candidates by similarity and keeps the closest neighbour first", () => {
  const identicalContract = SHARED_CONTRACT;
  const driftedContract = {
    keyTurn: "主角被留在原地等待",
    primaryResistance: "没有对手出场",
    emotionalShift: "平静到依然平静",
    netChange: "什么也没有改变",
    endingHook: "夜色降临",
  };
  const history = [
    signature(7, sceneCardsJson(["主角在码头清点货物", "与旧识叙旧", "独自回到住处"], driftedContract)),
    signature(8, sceneCardsJson(SHARED_BEATS, identicalContract)),
  ];
  const current = signature(9, sceneCardsJson(SHARED_BEATS, identicalContract));

  const evidence = buildCrossChapterStructureEvidence({ current, history, windowSize: 5 });
  assert.ok(evidence);
  assert.equal(evidence.candidates[0].chapterOrder, 8);
  assert.ok(evidence.maxSimilarity > 0.9);
});
