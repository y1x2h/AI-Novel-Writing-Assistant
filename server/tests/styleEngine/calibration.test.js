const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  CALIBRATION_RULE_IDS,
  calibrationBaselineSchema,
  diffCalibration,
  measureCalibration,
} = require('../../dist/services/styleEngine/calibration/calibrationMetrics.js');
const {
  CALIBRATION_BASELINE,
} = require('../../dist/services/styleEngine/calibration/calibrationBaseline.js');
const { loadCalibrationCorpus } = require('../../dist/services/styleEngine/calibration/loadCalibrationCorpus.js');
const { createStyleSignalPolicy } = require('../../../shared/dist/types/styleEngine.js');

// 语料是提交在源码目录的 .txt，tsc 不会复制进 dist，因此测试直接读源码路径。
const corpusRoot = path.join(__dirname, '../../src/services/styleEngine/calibration/corpus');

test('calibration baseline is valid and stays in sync with the signal policy revision', () => {
  assert.deepEqual(calibrationBaselineSchema.parse(CALIBRATION_BASELINE), CALIBRATION_BASELINE);
  assert.equal(CALIBRATION_BASELINE.signalRevision, createStyleSignalPolicy().revision);

  const entryRuleIds = CALIBRATION_BASELINE.entries.map((entry) => entry.ruleId).sort();
  assert.deepEqual(entryRuleIds, [...CALIBRATION_RULE_IDS].sort());
});

test('the ai corpus still triggers every signal so the baseline stays meaningful', () => {
  const corpus = loadCalibrationCorpus(corpusRoot);
  assert.ok(corpus.ai.length > 0, 'ai 语料不能为空');
  assert.ok(corpus.human.length > 0, '真人语料不能为空');

  const measurement = measureCalibration(corpus);
  const silent = measurement.entries.filter((entry) => entry.hits === 0).map((entry) => entry.ruleId);
  assert.deepEqual(silent, [], `ai 语料缺少触发样本：${silent.join(', ')}`);
});

test('measured hits, density and false positive rate stay inside the baseline tolerance', () => {
  const corpus = loadCalibrationCorpus(corpusRoot);
  const measurement = measureCalibration(corpus);
  const drifts = diffCalibration({ baseline: CALIBRATION_BASELINE, measurement });

  assert.deepEqual(
    drifts,
    [],
    `信号阈值或语料已变化，请运行 pnpm run calibrate:signals 刷新基线：${JSON.stringify(drifts)}`,
  );
  assert.equal(measurement.sampleCharacters, CALIBRATION_BASELINE.sampleCharacters);
});
