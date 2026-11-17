const test=require('node:test'),assert=require('node:assert/strict');
const {loadRuntimeSource}=require('./sourceHarness.cjs');

test('historical estimated grades stay hidden after unavailable review, while a later real review is visible',async()=>{
  const imports=Object.fromEntries([
    '../../prompting/core/promptRunner','../../prompting/prompts/novel/review.prompts','../rag','../audit/AuditService',
    '../payoff/PayoffLedgerSyncService','../planner/PlannerService','../state/StateService','./quality/ChapterQualityLoopService',
    './director/runtime/DirectorAutomationLedgerEventService','./runtime/repair/chapterAuditContext',
  ].map(id=>[id,{}]));
  const date=new Date('2026-10-17T10:00:00Z');
  const fields={coherence:83,repetition:83,pacing:83,voice:83,engagement:83,overall:83};
  const rows=[{id:'old',chapterId:'c1',createdAt:new Date(date.getTime()-1000),...fields},
    {id:'other',chapterId:'c2',createdAt:date,...fields}];
  const flags=JSON.stringify({qualityLoop:{evaluatedAt:date.toISOString(),terminalAction:'defer_and_continue',
    signals:[{status:'risk',issueCodes:['acceptance_gate_unavailable']}]}});
  const auditScore=()=>JSON.stringify({coherence:76,repetition:76,pacing:76,voice:76,engagement:76,overall:76,scoreAvailable:true});
  const audits=[{id:'audit-c3',chapterId:'c3',createdAt:new Date(date.getTime()+2000),legacyScoreJson:auditScore()},
    {id:'audit-c4',chapterId:'c4',createdAt:new Date(date.getTime()+2000),legacyScoreJson:JSON.stringify({score:{overall:50},scoreAvailable:false})}];
  Object.assign(imports,{
    '../../db/prisma':{prisma:{qualityReport:{findMany:async()=>rows},auditReport:{findMany:async()=>audits},
      chapter:{findMany:async()=>[{id:'c1',riskFlags:flags},{id:'c3'},{id:'c4'}]}}},
    '@ai-novel/shared/types/chapterQualityLoop':require('../../../shared/dist/types/chapterQualityLoop'),
    './novelCoreShared':{normalizeScore:score=>score},
    './runtime/GenerationContextAssembler':{GenerationContextAssembler:class{}},
    './runtime/ChapterRuntimeCoordinator':{ChapterRuntimeCoordinator:class{}},
  });
  const {NovelCoreReviewService}=loadRuntimeSource('../novelCoreReviewService.ts',imports);
  const service=new NovelCoreReviewService();
  assert.deepEqual((await service.getQualityReport('n')).chapterReports.map(r=>r.id),['other','audit-c3']);
  rows.unshift({id:'fresh',chapterId:'c1',createdAt:new Date(date.getTime()+1000),...fields,overall:90});
  assert.deepEqual((await service.getQualityReport('n')).chapterReports.map(r=>r.id),['fresh','other','audit-c3']);
  assert.equal(rows.length,3,'read projection cannot delete historical reports');
});
