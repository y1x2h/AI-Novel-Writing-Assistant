import { prisma } from "../../../../db/prisma";
import type { ReviewOptions } from "../../novelCoreShared";
import { ChapterQualityGateService } from "../../runtime/ChapterQualityGateService";
import { assembleChapterAuditContextPackage } from "../../runtime/repair/chapterAuditContext";
import type { PipelineRuntimeResult } from "../../runtime/chapterRuntimePipeline";
import { SavedChapterQualityRecoveryError } from "./SavedChapterQualityRecovery";

/** An explicit continuation may reassess author edits, but must never invoke the writer or automatic repair. */
export async function recheckEditedChapterQuality(novelId: string, chapterId: string, content: string,
  options: ReviewOptions, recoveryOptions: { persistAssessment?: boolean } = {}): Promise<PipelineRuntimeResult> {
  const contextPackage = await assembleChapterAuditContextPackage({ novelId, chapterId, options, operation: "review" });
  const gate = new ChapterQualityGateService({});
  const gateInput = { novelId, chapterId, content, contextPackage, request: options, persistAssessment: false };
  const result = await gate.runAcceptanceGate(gateInput);
  const current = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { content: true } });
  if (current?.content !== content) throw new SavedChapterQualityRecoveryError("正文在检查期间发生变化，请从保存进度继续处理新正文。");
  if (result.assessment.repairability === "plan_misalignment") {
    throw new SavedChapterQualityRecoveryError("本章修订需要调整后续规划，请保存规划后继续。", "quality.replan_required");
  }
  // Persist only after the saved-content check so a late edit cannot be overwritten by stale reports.
  if (recoveryOptions.persistAssessment) {
    await gate.persistAcceptanceResult(gateInput, result);
  }
  return { reviewExecuted: !result.assessment.riskTags.includes("acceptance_gate_unavailable"),
    pass: result.assessment.status === "accepted" && result.assessment.continuePolicy === "continue",
    score: result.score, issues: result.issues, runtimePackage: null, retryCountUsed: 0 };
}
