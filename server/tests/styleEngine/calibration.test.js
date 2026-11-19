const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readdirSync } = require('node:fs');

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

test('every human corpus file has complete named-source provenance', () => {
  const corpus = loadCalibrationCorpus(corpusRoot);
  const filesOnDisk = readdirSync(path.join(corpusRoot, 'human'))
    .filter((name) => name.endsWith('.txt'))
    .sort();
  const declaredFiles = corpus.provenance.human.map((entry) => entry.file).sort();

  assert.deepEqual(declaredFiles, filesOnDisk);
  assert.equal(new Set(declaredFiles).size, declaredFiles.length);
  assert.ok(new Set(corpus.provenance.human.map((entry) => entry.author)).size >= 2, '真人基线不能只依赖单一作者');
  for (const entry of corpus.provenance.human) {
    assert.ok(entry.author.trim());
    assert.ok(entry.work.trim());
    assert.match(entry.sourceUrl, /^https:\/\//);
    assert.match(entry.rights, /公有领域/);
    assert.ok(entry.selection.trim());
    assert.doesNotMatch(`${entry.author}${entry.work}${entry.rights}`, /佚名|未知|待确认/);
  }
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
  assert.equal(measurement.humanCharacters, CALIBRATION_BASELINE.humanCharacters);
});

test('human corpus length and exact human hits cannot drift silently', () => {
  const corpus = loadCalibrationCorpus(corpusRoot);
  const measurement = measureCalibration(corpus);
  const target = CALIBRATION_BASELINE.entries.find((entry) => entry.humanHits > 0);
  assert.ok(target, '基线至少保留一条真人候选命中，防止把正常中文表达当成零误报证明');

  const changedBaseline = {
    ...CALIBRATION_BASELINE,
    humanCharacters: CALIBRATION_BASELINE.humanCharacters + 1,
    entries: CALIBRATION_BASELINE.entries.map((entry) => entry.ruleId === target.ruleId
      ? { ...entry, humanHits: entry.humanHits + 1 }
      : entry),
  };
  const drifts = diffCalibration({ baseline: changedBaseline, measurement });

  assert.ok(drifts.some((drift) => drift.ruleId === 'corpus.human' && drift.field === 'characters'));
  assert.ok(drifts.some((drift) => drift.ruleId === target.ruleId && drift.field === 'humanHits'));
});
