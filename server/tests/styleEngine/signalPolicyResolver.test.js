const test = require('node:test');
const assert = require('node:assert/strict');
const { StyleSignalPolicyResolver } = require('../../dist/services/styleEngine/signals');
const { DEFAULT_STYLE_TEMPLATES } = require('../../dist/services/styleEngine/defaults.js');
const { StyleCompiler } = require('../../dist/services/styleEngine/StyleCompiler.js');
const { createStyleSignalPolicy } = require('../../../shared/dist/types/styleEngine.js');

function template(key) {
  const found = DEFAULT_STYLE_TEMPLATES.find((item) => item.key === key);
  assert.ok(found, `template ${key} should exist`);
  return found;
}

test('resolver maps different registers to different detection thresholds', () => {
  const resolver = new StyleSignalPolicyResolver();
  const colloquial = resolver.resolve(template('bottom-loop-reality').languageRules);
  const cold = resolver.resolve(template('cold-professional').languageRules);

  assert.notEqual(colloquial.punctuationCount, cold.punctuationCount);
  assert.notEqual(colloquial.clusterCount, cold.clusterCount);
  assert.ok(colloquial.punctuationCount > cold.punctuationCount);
  assert.ok(colloquial.dialogueTagRatio > cold.dialogueTagRatio);
  assert.equal(colloquial.revision, createStyleSignalPolicy().revision);
});

test('resolver falls back to the global baseline when no calibration is declared', () => {
  const resolver = new StyleSignalPolicyResolver();
  const base = createStyleSignalPolicy();

  assert.deepEqual(resolver.resolve(undefined), base);
  assert.deepEqual(resolver.resolve(null), base);
  assert.deepEqual(resolver.resolve({ register: 'colloquial' }), base);
});

test('resolver only overrides declared keys and keeps the rest on the baseline', () => {
  const resolver = new StyleSignalPolicyResolver();
  const base = createStyleSignalPolicy();
  const resolved = resolver.resolve({ signalCalibration: { fillerCount: 5 } });

  assert.equal(resolved.fillerCount, 5);
  assert.equal(resolved.clusterCount, base.clusterCount);
  assert.equal(resolved.punctuationCount, base.punctuationCount);
});

test('resolver falls back to the baseline when the calibration is invalid', () => {
  const resolver = new StyleSignalPolicyResolver();
  const base = createStyleSignalPolicy();

  assert.deepEqual(resolver.resolve({ signalCalibration: { clusterCount: 99 } }), base);
  assert.deepEqual(resolver.resolve({ signalCalibration: 'colloquial' }), base);
});

test('signalCalibration never leaks into the style contract text', () => {
  const compiled = new StyleCompiler().compile({
    styleProfile: {
      narrativeRules: { summary: '动作先于解释' },
      characterRules: {},
      languageRules: template('bottom-loop-reality').languageRules,
      rhythmRules: {},
    },
    antiAiRules: [],
  });

  assert.match(compiled.style, /colloquial/);
  for (const text of [compiled.style, compiled.contract.language.text, compiled.contract.language.lines.join('\n')]) {
    assert.doesNotMatch(text, /signalCalibration/);
    assert.doesNotMatch(text, /clusterCount/);
    assert.doesNotMatch(text, /punctuationCount/);
  }
});
