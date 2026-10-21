const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyExtractionVerificationDecision,
  decideStyleFeatureDecision,
} = require('@ai-novel/shared/types/styleEngine');
const { buildStyleVerificationSamples } = require('../../dist/services/styleEngine/verification');
const { styleProfileFeatureVerificationPrompt } = require('../../dist/prompting/prompts/style/styleProfileVerification.prompts');

const verified = (overrides = {}) => ({
  crossSource: { passed: true, sampleIndexes: [1, 3], evidence: '两处都写了同样的收束节奏', ...(overrides.crossSource ?? {}) },
  predictive: { passed: true, reason: '可以直接指导生成', ...(overrides.predictive ?? {}) },
  exclusive: { passed: true, reason: '能与其他写法区分', ...(overrides.exclusive ?? {}) },
  reason: overrides.reason ?? '三项通过',
  verifiedAt: '2026-10-20T00:00:00.000Z',
  sourceHash: 'hash',
});

test('verification samples reuse labeled sample boundaries and group long paragraphs', () => {
  const labeled = buildStyleVerificationSamples([
    '【样本：开篇｜位置 1-800/4000】\n第一章 雪夜',
    '【样本：对话｜位置 801-1600/4000】\n“你来了。”他说。',
  ].join('\n\n'));
  assert.equal(labeled.length, 2);
  assert.equal(labeled[0].label, '开篇｜位置 1-800/4000');
  assert.equal(labeled[1].index, 2);

  const paragraphs = Array.from({ length: 6 }, (_, index) => `第${index + 1}段内容`).join('\n\n');
  const grouped = buildStyleVerificationSamples(paragraphs, 3);
  assert.equal(grouped.length, 3);
  assert.match(grouped[0].label, /^第 1-\d+ 段$/);
  assert.match(grouped[2].text, /第6段内容/);
});

test('verification prompt rejects unknown features and unsupported cross-source claims', () => {
  const input = {
    name: '冷峻克制',
    features: [{ id: 'f1', label: '短句收束', description: '用短句结束场景', evidence: '他走了。' }],
    samples: [{ index: 1, label: '第 1 段', text: '他走了。' }, { index: 2, label: '第 2 段', text: '他没有回头。' }],
  };
  const item = {
    featureId: 'f1',
    crossSource: { passed: true, sampleIndexes: [1, 2], evidence: '他走了。/ 他没有回头。' },
    predictive: { passed: true, reason: '可直接指导生成' },
    exclusive: { passed: true, reason: '能区分其他写法' },
    reason: '三项通过',
  };
  assert.equal(styleProfileFeatureVerificationPrompt.postValidate({ items: [item] }, input).items.length, 1);
  assert.throws(() => styleProfileFeatureVerificationPrompt.postValidate({ items: [{ ...item, featureId: 'f9' }] }, input), /未提供的特征/);
  assert.throws(() => styleProfileFeatureVerificationPrompt.postValidate({
    items: [{ ...item, crossSource: { passed: true, sampleIndexes: [1], evidence: '' } }],
  }, input), /至少两个样本序号/);
  assert.throws(() => styleProfileFeatureVerificationPrompt.postValidate({
    items: [{ ...item, crossSource: { passed: false, sampleIndexes: [9], evidence: '' } }],
  }, input), /不存在的样本文本序号/);
});

test('verification prompt renders every sample and feature id', () => {
  const messages = styleProfileFeatureVerificationPrompt.render({
    name: '冷峻克制',
    features: [{ id: 'f1', label: '短句收束', description: '用短句结束场景', evidence: '他走了。' }],
    samples: [{ index: 2, label: '第 2 段', text: '他没有回头。' }],
  });
  const human = String(messages[1].content);
  assert.match(human, /【样本 2｜第 2 段】/);
  assert.match(human, /featureId: f1/);
});

test('verification verdicts only tighten decisions and tolerate missing verification', () => {
  const feature = { importance: 0.9, imitationValue: 0.8, transferability: 0.8, fingerprintRisk: 0.2 };
  assert.equal(decideStyleFeatureDecision({ ...feature, verification: verified() }, 'imitate'), 'keep');
  assert.equal(decideStyleFeatureDecision({ ...feature, verification: null }, 'imitate'), 'keep');
  assert.equal(applyExtractionVerificationDecision('keep', verified({ predictive: { passed: false, reason: '只是读后评价' } }), 'imitate'), 'remove');
  assert.equal(applyExtractionVerificationDecision('keep', verified({ crossSource: { passed: false, sampleIndexes: [], evidence: '' } }), 'transfer'), 'weaken');
  assert.equal(applyExtractionVerificationDecision('keep', verified({ exclusive: { passed: false, reason: '所有小说都有' } }), 'balanced'), 'weaken');
  assert.equal(applyExtractionVerificationDecision('keep', verified({ exclusive: { passed: false, reason: '所有小说都有' } }), 'transfer'), 'keep');
  assert.equal(applyExtractionVerificationDecision('remove', verified(), 'imitate'), 'remove');
});
