import { join } from "node:path";
import { diffCalibration, measureCalibration, type CalibrationMeasurement } from "./calibrationMetrics";
import { CALIBRATION_BASELINE } from "./calibrationBaseline";
import { loadCalibrationCorpus } from "./loadCalibrationCorpus";

/**
 * 开发脚本：用固定语料复算每条反 AI 信号的命中密度与误报代理指标。
 *
 * 运行方式（在 server 目录下）：
 *   pnpm run calibrate:signals
 *
 * 输出：
 * - 与基线一致的差异列表（空数组表示基线仍然有效）；
 * - 可直接粘贴回 calibrationBaseline.ts 的 entries 片段；
 * - 未在 AI 语料里触发的规则（提示语料可能需要补样本）。
 */
function renderBaselineEntries(measurement: CalibrationMeasurement): string {
  return measurement.entries
    .map((entry) => `  { ruleId: "${entry.ruleId}", perKilo: ${entry.perKilo}, falsePositiveRate: ${entry.falsePositiveRate}, hits: ${entry.hits} },`)
    .join("\n");
}

function main(): void {
  const corpusRoot = process.argv[2]
    ?? join(process.cwd(), "src", "services", "styleEngine", "calibration", "corpus");
  const corpus = loadCalibrationCorpus(corpusRoot);
  const measurement = measureCalibration(corpus);
  const drifts = diffCalibration({ baseline: CALIBRATION_BASELINE, measurement });
  const silentRules = measurement.entries.filter((entry) => entry.hits === 0).map((entry) => entry.ruleId);

  console.log(`语料目录：${corpusRoot}`);
  console.log(`AI 语料字数：${measurement.sampleCharacters}，真人语料字数：${measurement.humanCharacters}`);
  console.table(measurement.entries);
  console.log(`与基线的差异：${drifts.length === 0 ? "无" : JSON.stringify(drifts, null, 2)}`);
  if (silentRules.length > 0) {
    console.log(`AI 语料未触发的规则：${silentRules.join(", ")}`);
  }
  console.log("\n可直接更新的 entries：\n");
  console.log(renderBaselineEntries(measurement));
}

main();
