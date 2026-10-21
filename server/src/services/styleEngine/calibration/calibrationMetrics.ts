import { z } from "zod";
import { createStyleSignalPolicy, type StyleSignalPolicy } from "@ai-novel/shared/types/styleEngine";
import { styleSignalFindingSchema } from "@ai-novel/shared/types/styleEngine/signals";
import { scanStyleSignals } from "../signals";

/** 规则 id 的唯一来源，避免在校准模块里重复枚举信号种类。 */
export const CALIBRATION_RULE_IDS = styleSignalFindingSchema.shape.ruleId.options;
export type CalibrationRuleId = (typeof CALIBRATION_RULE_IDS)[number];

export const calibrationEntrySchema = z.object({
  ruleId: styleSignalFindingSchema.shape.ruleId,
  /** AI 语料里每千字的候选证据条数。 */
  perKilo: z.number().nonnegative(),
  /** 命中里来自真人语料的比例，用作误报代理指标。 */
  falsePositiveRate: z.number().min(0).max(1),
  hits: z.number().int().nonnegative(),
});
export type CalibrationEntry = z.infer<typeof calibrationEntrySchema>;

export const calibrationBaselineSchema = z.object({
  corpusId: z.string().min(1),
  /** 与信号策略的 revision 绑定：改阈值或加信号后必须重新校准。 */
  signalRevision: z.literal("style-signals-v1"),
  sampleCharacters: z.number().int().nonnegative(),
  generatedAt: z.string().min(1),
  tolerance: z.object({
    perKilo: z.number().nonnegative(),
    falsePositiveRate: z.number().nonnegative(),
  }),
  entries: z.array(calibrationEntrySchema),
});
export type CalibrationBaseline = z.infer<typeof calibrationBaselineSchema>;

export interface CalibrationMeasurement {
  sampleCharacters: number;
  humanCharacters: number;
  entries: CalibrationEntry[];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countCharacters(text: string): number {
  return Array.from(text.replace(/\s/gu, "")).length;
}

/**
 * 用固定语料复算每条规则的命中密度与误报代理指标。
 * 统计只产出基线与差异，不做任何硬判定，也不参与运行时路由。
 */
export function measureCalibration(input: {
  human: string[];
  ai: string[];
  policy?: StyleSignalPolicy;
}): CalibrationMeasurement {
  const policy = input.policy ?? createStyleSignalPolicy();
  const aiCharacters = input.ai.reduce((sum, text) => sum + countCharacters(text), 0);
  const humanCharacters = input.human.reduce((sum, text) => sum + countCharacters(text), 0);
  const aiHits = new Map<CalibrationRuleId, number>();
  const humanHits = new Map<CalibrationRuleId, number>();

  const tally = (texts: string[], target: Map<CalibrationRuleId, number>) => {
    for (const text of texts) {
      for (const finding of scanStyleSignals(text, policy).findings) {
        target.set(finding.ruleId, (target.get(finding.ruleId) ?? 0) + 1);
      }
    }
  };
  tally(input.ai, aiHits);
  tally(input.human, humanHits);

  const entries = CALIBRATION_RULE_IDS.map((ruleId) => {
    const ai = aiHits.get(ruleId) ?? 0;
    const human = humanHits.get(ruleId) ?? 0;
    const denominator = ai + human;
    return {
      ruleId,
      perKilo: aiCharacters === 0 ? 0 : round((ai / aiCharacters) * 1000, 3),
      falsePositiveRate: denominator === 0 ? 0 : round(human / denominator, 4),
      hits: ai,
    } satisfies CalibrationEntry;
  });

  return { sampleCharacters: aiCharacters, humanCharacters, entries };
}

export interface CalibrationDrift {
  ruleId: CalibrationRuleId;
  field: "perKilo" | "falsePositiveRate" | "hits";
  measured: number;
  expected: number;
  tolerance: number;
}

/**
 * 比对基线与实测：返回全部超出容差的差异。
 * 阈值或信号改动后没有刷新基线时，这里会立刻报出差异。
 */
export function diffCalibration(input: {
  baseline: CalibrationBaseline;
  measurement: CalibrationMeasurement;
}): CalibrationDrift[] {
  const drifts: CalibrationDrift[] = [];
  const measuredById = new Map(input.measurement.entries.map((entry) => [entry.ruleId, entry]));

  if (input.measurement.sampleCharacters !== input.baseline.sampleCharacters) {
    drifts.push({
      ruleId: "template.transition",
      field: "hits",
      measured: input.measurement.sampleCharacters,
      expected: input.baseline.sampleCharacters,
      tolerance: 0,
    });
  }

  for (const entry of input.baseline.entries) {
    const measured = measuredById.get(entry.ruleId);
    if (!measured) {
      continue;
    }
    if (Math.abs(measured.perKilo - entry.perKilo) > input.baseline.tolerance.perKilo) {
      drifts.push({
        ruleId: entry.ruleId,
        field: "perKilo",
        measured: measured.perKilo,
        expected: entry.perKilo,
        tolerance: input.baseline.tolerance.perKilo,
      });
    }
    if (Math.abs(measured.falsePositiveRate - entry.falsePositiveRate) > input.baseline.tolerance.falsePositiveRate) {
      drifts.push({
        ruleId: entry.ruleId,
        field: "falsePositiveRate",
        measured: measured.falsePositiveRate,
        expected: entry.falsePositiveRate,
        tolerance: input.baseline.tolerance.falsePositiveRate,
      });
    }
    if (measured.hits !== entry.hits) {
      drifts.push({
        ruleId: entry.ruleId,
        field: "hits",
        measured: measured.hits,
        expected: entry.hits,
        tolerance: 0,
      });
    }
  }

  return drifts;
}
