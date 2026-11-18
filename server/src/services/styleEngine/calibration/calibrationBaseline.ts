import { calibrationBaselineSchema, type CalibrationBaseline } from "./calibrationMetrics";

/**
 * 反 AI 信号的统计学校准基线。
 *
 * 维护规则：
 * - 改动 `shared/types/styleEngine/signals.ts` 的阈值、词表或新增信号后，
 *   必须重新运行 `pnpm run calibrate:signals` 刷新这里的 entries 与 sampleCharacters；
 *   信号策略 revision 目前是字面量 `style-signals-v1`，协议变更时才整体升级。
 * - 基线只用于回归：它记录「当前阈值在一小份固定语料上会命中多少」，
 *   不是判定标准，也不参与运行时逻辑。
 * - falsePositiveRate 是「该规则的命中里有多少来自真人语料」的代理指标。
 *   当前 `syntax.attributive-stack` 在真人语料上会命中一次
 *   （`巷子深处飘来煮面条的味道` 被误判为长定语），该值刻意保留为可观测事实，
 *   用于后续收敛该信号的召回边界。
 */
export const CALIBRATION_BASELINE: CalibrationBaseline = calibrationBaselineSchema.parse({
  corpusId: "style-signals-fixture-v1",
  signalRevision: "style-signals-v1",
  sampleCharacters: 1178,
  generatedAt: "2026-11-19",
  tolerance: {
    perKilo: 0.05,
    falsePositiveRate: 0.02,
  },
  entries: [
    { ruleId: "template.transition", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "rhythm.comma-density", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.repeated-softeners", perKilo: 1.698, falsePositiveRate: 0, hits: 2 },
    { ruleId: "surface.action-adverb-stack", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "syntax.attributive-stack", perKilo: 0.849, falsePositiveRate: 0.5, hits: 1 },
    { ruleId: "syntax.particle-overload", perKilo: 1.698, falsePositiveRate: 0, hits: 2 },
    { ruleId: "surface.degree-adverb-stack", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.punctuation-density", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.filler-stack", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.dialogue-tag-density", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "rhythm.short-sentence-run", perKilo: 2.547, falsePositiveRate: 0, hits: 3 },
    { ruleId: "discourse.low-connective-density", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "syntax.not-is-comparison", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "syntax.negation-parade", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "discourse.trailer-ending", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "syntax.action-list", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.em-dash", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "discourse.long-paragraph", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.conclusion-colon", perKilo: 0.849, falsePositiveRate: 0, hits: 1 },
    { ruleId: "syntax.isomorphic-triple", perKilo: 1.698, falsePositiveRate: 0, hits: 2 },
  ],
});
