const test = require('node:test');
const assert = require('node:assert/strict');
const { styleRewriteConservationPrompt } = require('../../dist/prompting/prompts/style/styleRewriteConservation.prompts');

test('conservation review rejects self-contradictory verdicts', () => {
  const asset = styleRewriteConservationPrompt;
  assert.throws(() => asset.postValidate({ status: 'preserved',
    changes: [{ direction: 'added', kind: 'entity', detail: '新增人物', evidence: '王五' }], reason: '表达调整' }), /自相矛盾/);
  assert.throws(() => asset.postValidate({ status: 'changed', changes: [], reason: '有增删' }), /自相矛盾/);
  assert.equal(asset.postValidate({ status: 'uncertain', changes: [], reason: '证据不足' }).status, 'uncertain');
});

test('conservation review renders the original text and every patch pair', () => {
  const messages = styleRewriteConservationPrompt.render({
    originalContent: '张三缓缓打开木门，等李四进屋。',
    changes: [{ original: '张三缓缓打开木门，', replacement: '张三打开木门，' }],
  });
  const human = String(messages[1].content);
  assert.match(human, /张三缓缓打开木门， → 张三打开木门，/);
  assert.match(String(messages[0].content), /守恒对象/);
});
