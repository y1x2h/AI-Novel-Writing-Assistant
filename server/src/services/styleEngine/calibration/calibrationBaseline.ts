import { calibrationBaselineSchema, type CalibrationBaseline } from "./calibrationMetrics";

/**
 * 反 AI 信号的统计学校准基线。
 *
 * 维护规则：
 * - 改动 `shared/types/styleEngine/signals.ts` 的阈值、词表或新增信号后，
 *   必须重新运行 `pnpm run calibrate:signals` 刷新 entries 与两侧语料字数。
 * - 基线只用于回归：记录当前阈值在固定语料上的候选证据命中，不参与运行时逻辑。
 * - humanPerKilo / humanHits 来自已登记作者、作品、来源与版权依据的真人小说节选。
 * - falsePositiveRate 只是真人命中占全部命中的来源比例，不等于真实误报率或作者概率。
 * - 真人样本正常命中长定语、助词、连接词、长段与标点候选，证明候选证据不能单独判违规；
 *   这些命中是有意保留的观测事实，不能通过改窄语料或阈值追求表面上的零命中。
 */
export const CALIBRATION_BASELINE: CalibrationBaseline = calibrationBaselineSchema.parse({
  corpusId: "style-signals-published-human-v2",
  signalRevision: "style-signals-v1",
  sampleCharacters: 1178,
  humanCharacters: 2636,
  generatedAt: "2026-11-19",
  tolerance: {
    perKilo: 0.05,
    falsePositiveRate: 0.02,
  },
  entries: [
    { ruleId: "template.transition", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "rhythm.comma-density", perKilo: 0.849, humanPerKilo: 0.379, falsePositiveRate: 0.5, hits: 1, humanHits: 1 },
    { ruleId: "surface.repeated-softeners", perKilo: 1.698, humanPerKilo: 0, falsePositiveRate: 0, hits: 2, humanHits: 0 },
    { ruleId: "surface.action-adverb-stack", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "syntax.attributive-stack", perKilo: 0.849, humanPerKilo: 1.517, falsePositiveRate: 0.8, hits: 1, humanHits: 4 },
    { ruleId: "syntax.particle-overload", perKilo: 1.698, humanPerKilo: 1.517, falsePositiveRate: 0.6667, hits: 2, humanHits: 4 },
    { ruleId: "surface.degree-adverb-stack", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "surface.punctuation-density", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "surface.filler-stack", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "surface.dialogue-tag-density", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "rhythm.short-sentence-run", perKilo: 2.547, humanPerKilo: 0, falsePositiveRate: 0, hits: 3, humanHits: 0 },
    { ruleId: "discourse.low-connective-density", perKilo: 0.849, humanPerKilo: 0.759, falsePositiveRate: 0.6667, hits: 1, humanHits: 2 },
    { ruleId: "syntax.not-is-comparison", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "syntax.negation-parade", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "discourse.trailer-ending", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "syntax.action-list", perKilo: 0.849, humanPerKilo: 0, falsePositiveRate: 0, hits: 1, humanHits: 0 },
    { ruleId: "surface.em-dash", perKilo: 0.849, humanPerKilo: 0.379, falsePositiveRate: 0.5, hits: 1, humanHits: 1 },
    { ruleId: "discourse.long-paragraph", perKilo: 0.849, humanPerKilo: 1.138, falsePositiveRate: 0.75, hits: 1, humanHits: 3 },
    { ruleId: "surface.conclusion-colon", perKilo: 0.849, humanPerKilo: 0.759, falsePositiveRate: 0.6667, hits: 1, humanHits: 2 },
    { ruleId: "syntax.isomorphic-triple", perKilo: 1.698, humanPerKilo: 0, falsePositiveRate: 0, hits: 2, humanHits: 0 },
  ],
});
