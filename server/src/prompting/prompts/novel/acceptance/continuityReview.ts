import { z } from "zod";
import type { ChapterAcceptanceAssessmentOutput, ChapterAcceptancePromptInput } from "../chapterAcceptance.prompts";

export const continuityCheckSchema = z.object({
  subject: z.string().trim().min(1),
  previousFact: z.string().trim().min(1),
  currentFact: z.string().trim().min(1),
  previousEvidence: z.string().trim().min(1).max(350),
  currentEvidence: z.string().trim().min(1).max(350),
  verdict: z.enum(["consistent", "conflict", "uncertain"]),
  reason: z.string().trim().min(1),
  issueCode: z.string().trim().min(1).nullable(),
});

export class ChapterContinuityReviewValidationError extends Error {
  constructor(readonly code: string) {super(`前后章事实核对未通过（${code}），请连续复制对应正文原句并引用对应 continuity 问题编号。`); this.name="ChapterContinuityReviewValidationError";}
}

/** AI judges continuity; runtime checks evidence origins and references only. */
export function validateContinuityReview(output: ChapterAcceptanceAssessmentOutput, input: ChapterAcceptancePromptInput) {
  if (!input.previousChapterContent?.trim()) return output;
  const compact=(value:string)=>value.replace(/\s/gu, "");
  const previous=compact(input.previousChapterContent), current=compact(input.content);
  if (!output.continuityChecks?.length) throw new ChapterContinuityReviewValidationError("missing_checks");
  for (const check of output.continuityChecks) {
    if (!compact(check.previousEvidence) || !previous.includes(compact(check.previousEvidence))) {
      throw new ChapterContinuityReviewValidationError("previous_quote_invalid");
    }
    if (!compact(check.currentEvidence) || !current.includes(compact(check.currentEvidence))) {
      throw new ChapterContinuityReviewValidationError("current_quote_invalid");
    }
    if (check.verdict === "conflict" && !output.blockingIssues.some(issue => (
        issue.code === check.issueCode && issue.category === "continuity"
      ))) throw new ChapterContinuityReviewValidationError("conflict_reference_invalid");
  }
  return output;
}

/**
 * Correction attempts already asked the model for exact quotes. When they still fail,
 * drop only the unverifiable continuity checks instead of erasing the whole chapter score.
 */
export function sanitizeContinuityReview(output: ChapterAcceptanceAssessmentOutput, input: ChapterAcceptancePromptInput) {
  if (!input.previousChapterContent?.trim()) return output;
  const compact=(value:string)=>value.replace(/\s/gu, "");
  const previous=compact(input.previousChapterContent), current=compact(input.content);
  const checks = output.continuityChecks ?? [];
  const droppedIssueCodes = new Set<string>();
  const usable: typeof checks = [];
  for (const check of checks) {
    const previousValid = Boolean(compact(check.previousEvidence)) && previous.includes(compact(check.previousEvidence));
    const currentValid = Boolean(compact(check.currentEvidence)) && current.includes(compact(check.currentEvidence));
    const conflictReferenced = check.verdict !== "conflict" || output.blockingIssues.some(issue => (
      issue.code === check.issueCode && issue.category === "continuity"
    ));
    if (previousValid && currentValid && conflictReferenced) {
      usable.push(check);
      continue;
    }
    if (check.verdict === "conflict" && check.issueCode) droppedIssueCodes.add(check.issueCode);
  }
  if (checks.length > 0 && usable.length === checks.length) return output;
  return {
    ...output,
    continuityChecks: usable,
    blockingIssues: droppedIssueCodes.size > 0
      ? output.blockingIssues.filter(issue => !(issue.category === "continuity" && droppedIssueCodes.has(issue.code)))
      : output.blockingIssues,
    riskTags: [...new Set([...output.riskTags, checks.length === 0 ? "continuity_review_missing" : "continuity_review_evidence_partial"])],
  };
}
