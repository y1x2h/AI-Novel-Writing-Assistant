import { calibrationBaselineSchema, type CalibrationBaseline } from "./calibrationMetrics";

/**
 * 反 AI 信号的统计学校准基线。
 *
 * 维护规则：
 * - 改动 `shared/types/styleEngine/signals.ts` 的阈值、词表或新增信号后，
 *   必须同步提升信号策略 revision，并重新运行 `pnpm run calibrate:signals`
 *   刷新这里的 entries、sampleCharacters 与 signalRevision。
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
  sampleCharacters: 316,
  generatedAt: "2026-10-21",
  tolerance: {
    perKilo: 0.05,
    falsePositiveRate: 0.02,
  },
  entries: [
    { ruleId: "template.transition", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
    { ruleId: "rhythm.comma-density", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.repeated-softeners", perKilo: 6.329, falsePositiveRate: 0, hits: 2 },
    { ruleId: "surface.action-adverb-stack", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
    { ruleId: "syntax.attributive-stack", perKilo: 3.165, falsePositiveRate: 0.5, hits: 1 },
    { ruleId: "syntax.particle-overload", perKilo: 6.329, falsePositiveRate: 0, hits: 2 },
    { ruleId: "surface.degree-adverb-stack", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.punctuation-density", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.filler-stack", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
    { ruleId: "surface.dialogue-tag-density", perKilo: 3.165, falsePositiveRate: 0, hits: 1 },
  ],
});
