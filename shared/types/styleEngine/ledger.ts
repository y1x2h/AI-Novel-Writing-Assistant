import { z } from "zod";

/**
 * 改动台账：一次局部修订后「改了什么、依据哪条规则、最终有没有被采用」的归档。
 * 它是只读审计数据，不参与任何决策，也不改变任务状态。
 */
export const STYLE_REWRITE_LEDGER_DEFAULT_LIMIT = 20;
export const STYLE_REWRITE_LEDGER_MAX_LIMIT = 100;

export const styleRewriteLedgerEntrySchema = z.object({
  issueId: z.string(),
  ruleName: z.string(),
  targetExcerpt: z.string(),
  replacement: z.string(),
  /** accepted=已采用；blocked=被护栏拦下保留原稿；needs_review=删减超限，需人工确认。 */
  checkStatus: z.enum(["accepted", "blocked", "needs_review"]),
});
export type StyleRewriteLedgerEntry = z.infer<typeof styleRewriteLedgerEntrySchema>;

export const styleRewriteLedgerSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().nullable(),
  sourceHash: z.string(),
  candidateHash: z.string(),
  policyRevision: z.string(),
  entries: z.array(styleRewriteLedgerEntrySchema),
  createdAt: z.string(),
});
export type StyleRewriteLedger = z.infer<typeof styleRewriteLedgerSchema>;
