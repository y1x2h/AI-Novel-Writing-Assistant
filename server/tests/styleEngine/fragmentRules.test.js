const test = require('node:test');
const assert = require('node:assert/strict');
const { guardStylePatches } = require('../../dist/services/styleEngine/rewrite');
const { styleRewritePrompt } = require('../../dist/prompting/prompts/style/style.prompts.js');
const { dedupeStyleFragments, normalizeStyleFragment, selectPresentFragments } =
  require('../../../shared/dist/types/styleEngine.js');

function guard(original, target, replacement, options = {}) {
  return guardStylePatches({ original, allowedIssueIds: ['expression'], styleIssueIds: ['expression'],
    plan: { strategy: 'patch_first', summary: '局部修订', requiresFullRewrite: false,
      patches: [{ id: 'p', targetExcerpt: target, replacement, reason: '去除重复', issueIds: ['expression'] }] }, ...options });
}
const blocked = result => result.guard.checks.filter(check => check.status === 'blocked').map(check => check.code);

test('fragment helpers normalize whitespace, deduplicate and only keep fragments present in the content', () => {
  assert.equal(normalizeStyleFragment('  玄铁  剑鞘\n'), '玄铁 剑鞘');
  assert.deepEqual(dedupeStyleFragments([' 玄铁剑鞘 ', '玄铁剑鞘', '', '听雨楼']), ['玄铁剑鞘', '听雨楼']);
  assert.deepEqual(selectPresentFragments(['玄铁剑鞘', '听雨楼'], '他握着玄铁剑鞘站在门口。'), ['玄铁剑鞘']);
});

test('changing a protected fragment keeps the complete original', () => {
  const original = '他缓缓推开门，院子里的雨声一下子涌了进来。';
  const result = guard(original, original, '他推开门，外面的雨声涌了进来。', { protectedFragments: ['院子里的雨声'] });
  assert.equal(result.content, original);
  assert.ok(blocked(result).includes('protected_fragment'));
  assert.match(result.guard.checks.filter(check => check.code === 'protected_fragment')[0].reason, /院子里的雨声/);
});

test('deleting a protected fragment keeps the complete original', () => {
  const original = '他缓缓推开门，院子里的雨声一下子涌了进来。';
  const result = guard(original, '院子里的雨声', '雨声', { protectedFragments: ['院子里的雨声'] });
  assert.equal(result.content, original);
  assert.ok(blocked(result).includes('protected_fragment'));
});

test('keeping the protected fragment untouched does not block the patch', () => {
  const original = '他缓缓推开门，院子里的雨声一下子涌了进来。';
  const result = guard(original, '他缓缓推开门，', '他推开门，', { protectedFragments: ['院子里的雨声'] });
  assert.deepEqual(blocked(result), []);
  assert.equal(result.content, '他推开门，院子里的雨声一下子涌了进来。');
});

test('fragments that never appear in the original cannot block a rewrite', () => {
  const original = '他缓缓推开门，院子里的雨声一下子涌了进来。';
  const result = guard(original, '他缓缓推开门，', '他推开门，', { protectedFragments: ['听雨楼', '玄铁剑鞘'] });
  assert.deepEqual(blocked(result), []);
});

test('style rewrite prompt renders the protected fragment list only when fragments are supplied', () => {
  const render = (protectedFragments) => styleRewritePrompt.render({
    styleContractText: '写法契约', content: '正文', issuesBlock: '问题清单', protectedFragments,
  }).map(message => String(message.content)).join('\n');

  const withFragments = render(['玄铁剑鞘', '听雨楼']);
  assert.match(withFragments, /禁改清单（作者指定必须原样保留的片段）：/);
  assert.match(withFragments, /1\. 玄铁剑鞘/);
  assert.match(withFragments, /2\. 听雨楼/);
  assert.match(withFragments, /跳过该问题/);

  assert.doesNotMatch(render([]), /禁改清单（作者指定必须原样保留的片段）：/);
  assert.doesNotMatch(render(undefined), /禁改清单（作者指定必须原样保留的片段）：/);
});
