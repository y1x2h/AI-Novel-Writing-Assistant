const test = require('node:test');
const assert = require('node:assert/strict');
const { guardStylePatches } = require('../../dist/services/styleEngine/rewrite');
const { styleRewritePrompt } = require('../../dist/prompting/prompts/style/style.prompts.js');
const { isStyleIssueRewritable } = require('../../../shared/dist/types/styleEngine.js');
const { runtimeStyleReviewSchema } = require('../../../shared/dist/types/chapterRuntime/qualitySchemas.js');

function guard(original, target, replacement, options = {}) {
  return guardStylePatches({ original, allowedIssueIds: ['expression'], styleIssueIds: ['expression'],
    plan: { strategy: 'patch_first', summary: '局部修订', requiresFullRewrite: false,
      patches: [{ id: 'p', targetExcerpt: target, replacement, reason: '去除重复', issueIds: ['expression'] }] }, ...options });
}
const blocked = result => result.guard.checks.filter(check => check.status === 'blocked').map(check => check.code);
test('automatic permission intersects instance, layer and rule permission; legacy cannot authorize', () => {
  assert.equal(isStyleIssueRewritable({ layer: 'surface', canAutoRewrite: true }), true);
  for (const item of [{ layer: 'narrative', canAutoRewrite: true }, { layer: 'surface', canAutoRewrite: false },
    { canAutoRewrite: true }, { layer: 'surface', canAutoRewrite: true, issueCategory: 'story_structure' }]) {
    assert.equal(isStyleIssueRewritable(item), false);
  }
  assert.equal(isStyleIssueRewritable({ layer: 'surface', canAutoRewrite: true }, false), false);
});
test('local expression edit preserves source and candidate identities and marks semantic comparison pending', () => {
  const original = '他缓缓打开了门，站在门外。';
  const result = guard(original, '他缓缓打开了门，', '他打开了门，');
  assert.equal(result.content, '他打开了门，站在门外。');
  assert.deepEqual(blocked(result), []);
  assert.notEqual(result.guard.sourceContentHash, result.guard.candidateContentHash);
  assert.equal(result.guard.checks.at(-1).status, 'not_checked');
  assert.deepEqual(result.baseline.allowedCorrectionIssueIds, []);
});
test('unknown and report-only issue ids cannot grant an edit permission', () => {
  const original = '他缓缓打开了门，站在门外。';
  const result = guard(original, '他缓缓打开了门，', '他打开了门，', { allowedIssueIds: ['different'] });
  assert.equal(result.content, original);
  assert.ok(blocked(result).includes('patch_scope'));
});
test('pure style cannot change numbers or protected names', () => {
  for (const [original, replacement, protectedTerms] of [
    ['张三交给李四100元。', '张三交给李四200元。', []],
    ['张三交给李四钱袋。', '张三交给王五钱袋。', ['李四']],
  ]) {
    const result = guard(original, original, replacement, { protectedTerms });
    assert.equal(result.content, original);
    assert.ok(blocked(result).includes('protected_terms'));
  }
});
test('authorized factual correction is separate from literal style protection and requires semantic reacceptance', () => {
  const original = '张三交给李四100元。';
  const result = guard(original, original, '张三交给李四200元。', {
    allowedIssueIds: ['expression', 'amount'],
    plan: { summary: '纠正金额', patches: [{ id: 'p', targetExcerpt: original, replacement: '张三交给李四200元。',
      reason: '已登记金额', issueIds: ['amount'] }] },
  });
  assert.deepEqual(blocked(result), []);
  assert.deepEqual(result.baseline.allowedCorrectionIssueIds, ['amount']);
  assert.equal(result.guard.checks.at(-1).status, 'not_checked');
});
test('whole chapter touching over 30%, excessive addition and deletion are rejected', () => {
  const original = '他打开门，望向院子。' + '雨滴敲着窗沿。'.repeat(100);
  const whole = guard(original, original, original.replace('打开门', '推开门'));
  assert.ok(blocked(whole).includes('edit_budget'));
  const added = guard(original, '他打开门，望向院子。', '他推开门，望向院子。' + '他走向街道。'.repeat(50));
  assert.ok(blocked(added).includes('edit_budget'));
  const deleted = guard(original, original, '他打开门，望向院子。');
  assert.ok(blocked(deleted).includes('edit_budget'));
});
test('ambiguous and overlapping targets retain the complete original', () => {
  const original = '他打开了门，走进院子。他打开了门，走进院子。';
  const result = guard(original, '他打开了门，', '他推开了门，');
  assert.equal(result.content, original);
  assert.ok(blocked(result).includes('patch_scope'));
});
test('rewrite protection survives runtime schema round trip with the legacy report', () => {
  const result = guard('他缓缓打开了门，站在门外。', '他缓缓打开了门，', '他打开了门，');
  const persisted = { report: null, originalContent: null, autoRewritten: false, rewriteGuard: result.guard };
  assert.deepEqual(runtimeStyleReviewSchema.parse(JSON.parse(JSON.stringify(persisted))), persisted);
});

const scopeBase = '他缓缓推开门，院子里的雨声一下子涌了进来。';

test('rewrite scope decides how much content may be removed from one patch', () => {
  const lighter = guard(scopeBase, scopeBase, scopeBase.slice(0, 20), { scope: 'in_place' });
  assert.deepEqual(blocked(lighter), []);
  assert.equal(lighter.guard.scope, 'in_place');
  assert.deepEqual(lighter.guard.escalations, []);

  const shrink = '他推开门，院子里的雨声涌了进来。';
  const inPlace = guard(scopeBase, scopeBase, shrink, { scope: 'in_place' });
  assert.ok(blocked(inPlace).includes('deletion_budget'));
  assert.equal(inPlace.content, scopeBase);
  assert.equal(inPlace.guard.escalations.length, 1);
  assert.match(inPlace.guard.escalations[0].reason, /\[需复核\]/);

  const sentence = guard(scopeBase, scopeBase, shrink, { scope: 'sentence' });
  assert.ok(blocked(sentence).includes('deletion_budget'));

  const free = guard(scopeBase, scopeBase, shrink, { scope: 'free' });
  assert.deepEqual(blocked(free), []);
  assert.equal(free.content, shrink);
});

test('sentence scope rejects collapsing a whole sentence while free scope reports it for review', () => {
  const collapsed = '他推开门。';
  const sentence = guard(scopeBase, scopeBase, collapsed, { scope: 'sentence' });
  assert.ok(blocked(sentence).includes('deletion_budget'));
  assert.equal(sentence.content, scopeBase);

  const free = guard(scopeBase, scopeBase, collapsed, { scope: 'free' });
  assert.ok(blocked(free).includes('deletion_budget'));
  assert.match(free.guard.escalations[0].reason, /\[需复核\]/);
});

test('style rewrite prompt renders the constraints of each rewrite scope', () => {
  const renderScope = (scope) => styleRewritePrompt.render({
    styleContractText: '写法契约', content: '正文', issuesBlock: '问题清单', scope,
  }).map(message => String(message.content)).join('\n');

  const inPlace = renderScope('in_place');
  assert.match(inPlace, /当前改写力度：原位（轻改）/);
  assert.match(inPlace, /严禁删除整句或整段/);
  assert.doesNotMatch(inPlace, /删除量不得超过原文的 35%/);

  const sentence = renderScope('sentence');
  assert.match(sentence, /当前改写力度：句内（中改）/);
  assert.match(sentence, /不得跨句搬移/);

  const free = renderScope('free');
  assert.match(free, /当前改写力度：自由（重写）/);
  assert.match(free, /删除量不得超过原文的 35%/);

  assert.match(renderScope(undefined), /当前改写力度：自由（重写）/);
});
