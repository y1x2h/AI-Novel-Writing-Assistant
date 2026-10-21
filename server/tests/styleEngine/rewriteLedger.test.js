const test = require('node:test');
const assert = require('node:assert/strict');
const { guardStylePatches } = require('../../dist/services/styleEngine/rewrite');
const { buildLedgerEntries } = require('../../dist/services/styleEngine/ledger/buildLedgerEntries');
const { styleRewriteLedgerSchema } = require('../../../shared/dist/types/styleEngine.js');

const original = '他缓缓推开门，院子里的雨声一下子涌了进来。';
const issues = [{ issueId: 'style:1', ruleName: '动作堆叠' }];
function plan(target, replacement, issueIds = ['style:1']) {
  return { strategy: 'patch_first', summary: '局部修订', requiresFullRewrite: false,
    patches: [{ id: 'p', targetExcerpt: target, replacement, reason: '减少副词', issueIds }] };
}

test('ledger entries record the rule, the before/after text and the accepted status', () => {
  const patchPlan = plan('他缓缓推开门，', '他推开门，');
  const result = guardStylePatches({ original, plan: patchPlan, allowedIssueIds: ['style:1'], styleIssueIds: ['style:1'] });
  const entries = buildLedgerEntries({ plan: patchPlan, issues, guard: result.guard, adopt: true });
  assert.deepEqual(entries, [{
    issueId: 'style:1',
    ruleName: '动作堆叠',
    targetExcerpt: '他缓缓推开门，',
    replacement: '他推开门，',
    checkStatus: 'accepted',
  }]);
});

test('ledger entries mark a blocked guard as blocked instead of accepted', () => {
  const patchPlan = plan(original, '他推开门，外面的雨声涌了进来。');
  const result = guardStylePatches({ original, plan: patchPlan, allowedIssueIds: ['style:1'], styleIssueIds: ['style:1'],
    protectedFragments: ['院子里的雨声'] });
  assert.ok(result.guard.checks.some((check) => check.status === 'blocked'));
  const entries = buildLedgerEntries({ plan: patchPlan, issues, guard: result.guard, adopt: false });
  assert.equal(entries[0].checkStatus, 'blocked');
});

test('ledger entries flag deletion escalations as needing review', () => {
  const patchPlan = plan(original, '他推开门。', ['style:1']);
  const result = guardStylePatches({ original, plan: patchPlan, allowedIssueIds: ['style:1'], styleIssueIds: ['style:1'], scope: 'sentence' });
  assert.equal(result.guard.escalations.length, 1);
  const entries = buildLedgerEntries({ plan: patchPlan, issues, guard: result.guard, adopt: false });
  assert.equal(entries[0].checkStatus, 'needs_review');
});

test('ledger payload stays valid against the shared read schema', () => {
  const patchPlan = plan(original, '他推开门。', ['style:1']);
  const result = guardStylePatches({ original, plan: patchPlan, allowedIssueIds: ['style:1'], styleIssueIds: ['style:1'], scope: 'sentence' });
  const persisted = {
    id: 'ledger-1', novelId: 'n1', chapterId: null,
    sourceHash: result.guard.sourceContentHash, candidateHash: result.guard.candidateContentHash,
    policyRevision: result.guard.policyRevision,
    entries: buildLedgerEntries({ plan: patchPlan, issues, guard: result.guard, adopt: false }),
    createdAt: new Date('2026-10-21T09:00:00.000Z').toISOString(),
  };
  assert.deepEqual(styleRewriteLedgerSchema.parse(persisted), persisted);
});

test('ledger entries fall back to the patch issue id when the rule cannot be resolved', () => {
  const patchPlan = plan('他缓缓推开门，', '他推开门，');
  const result = guardStylePatches({ original, plan: patchPlan, allowedIssueIds: ['style:1'], styleIssueIds: ['style:1'] });
  const entries = buildLedgerEntries({ plan: patchPlan, issues: [], guard: result.guard, adopt: true });
  assert.equal(entries[0].issueId, 'style:1');
  assert.equal(entries[0].ruleName, '');
});
