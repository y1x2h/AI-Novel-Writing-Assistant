import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { isStyleIssueRewritable, selectPresentFragments, type StyleRewriteGuard, type StyleRewriteLedgerEntry, type StyleRewriteScope, type StyleDetectionReport } from "@ai-novel/shared/types/styleEngine";
import { styleRewritePrompt } from "../../prompting/prompts/style/style.prompts";
import { styleRewriteConservationPrompt } from "../../prompting/prompts/style/styleRewriteConservation.prompts";
import { buildWriterStyleContractText } from "./styleContractText";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import { buildAntiAiRuleDirectiveText, listPreviewAntiAiRules } from "./antiAiPreviewRules";
import { StyleDetectionService } from "./StyleDetectionService";
import { StyleFragmentRuleService } from "./fragments/StyleFragmentRuleService";
import { buildLedgerEntries } from "./ledger/buildLedgerEntries";
import { StyleRewriteLedgerService } from "./ledger/StyleRewriteLedgerService";
import { guardStylePatches } from "./rewrite";

interface ConservationVerdict {
  status: "preserved" | "changed" | "uncertain";
  reason?: string;
}

/** Literal anchors prove nothing about facts; only the AI conservation review can pass or block it. */
function upgradeGuardWithConservation(guard: StyleRewriteGuard, verdict: ConservationVerdict): StyleRewriteGuard {
  const conservation = verdict.status === "preserved"
    ? { status: "passed" as const, reason: "改写只改变表达，数值、专名与事件先后保持不变。" }
    : verdict.status === "changed"
      ? { status: "blocked" as const, reason: `改写增删了原文信息：${verdict.reason?.trim() || "信息守恒核对未通过"}。` }
      : { status: "not_checked" as const, reason: "改写信息守恒核对未完成，请结合本书人物与设定核对预览。" };
  return {
    ...guard,
    checks: guard.checks.map(check => (check.code === "semantic_facts" ? { ...check, ...conservation } : check)),
  };
}

interface RewriteInput {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  previewAntiAiRuleIds?: string[];
  issues: Array<{
    ruleName: string;
    excerpt: string;
    suggestion: string;
  }>;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  /** 用户可见的改写力度：轻改 / 中改 / 重写，默认沿用自由档。 */
  scope?: StyleRewriteScope;
}

export class StyleRewriteService {
  private readonly resolver = new StyleRuntimeResolver();
  private readonly detector = new StyleDetectionService();
  private readonly fragmentRules = new StyleFragmentRuleService();
  private readonly ledger = new StyleRewriteLedgerService();

  async rewrite(input: RewriteInput): Promise<{ content: string; report: StyleDetectionReport; rewriteGuard?: StyleRewriteGuard }> {
    // Request issues are hints, never an authorization receipt. Recheck the current
    // source and policy; clients cannot mark narrative edits as safe.
    const report = await this.detector.check(input);
    const issues = report.violations.filter(item => isStyleIssueRewritable(item)
      && (input.issues.length === 0 || input.issues.some(selected => selected.excerpt === item.excerpt && selected.ruleName === item.ruleName)))
      .map((item, index) => ({ ...item, issueId: `style:${index + 1}` }));
    if (issues.length === 0) return { content: input.content, report };
    const resolved = await this.resolver.resolve({
      styleProfileId: input.styleProfileId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      taskStyleProfileId: input.taskStyleProfileId,
    });
    const previewRules = await listPreviewAntiAiRules(input.previewAntiAiRuleIds);
    const existingRuleIds = new Set(resolved.antiAiRules.map((rule) => rule.id));
    const extraPreviewRules = previewRules.filter((rule) => !existingRuleIds.has(rule.id));

    const issuesBlock = JSON.stringify(issues);
    const styleContractText = [
      buildWriterStyleContractText(resolved.context.compiledBlocks?.contract ?? null),
      buildAntiAiRuleDirectiveText(extraPreviewRules),
    ].filter(Boolean).join("\n\n");
    // 只保护原文里真正出现的片段：把清单整份塞给模型会诱导它把没出现的片段写进正文。
    const protectedFragments = input.novelId
      ? selectPresentFragments(await this.fragmentRules.listProtectedFragments(input.novelId), input.content)
      : [];

    const result = await runStructuredPrompt({
      asset: styleRewritePrompt,
      promptInput: {
        styleContractText,
        content: input.content,
        issuesBlock,
        scope: input.scope,
        protectedFragments,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.35, 0.45),
      },
    });

    const protectedResult = guardStylePatches({
      original: input.content, plan: result.output,
      allowedIssueIds: issues.map(item => item.issueId),
      styleIssueIds: issues.map(item => item.issueId),
      protectedFragments,
      scope: input.scope,
    });
    const guardBlocked = protectedResult.content === input.content;
    const verdict = guardBlocked ? null : await this.reviewInformationConservation({
      original: input.content,
      changes: protectedResult.baseline.changes,
      provider: input.provider,
      model: input.model,
    });
    const adopted = verdict !== null && verdict.status !== "changed";
    await this.recordLedger({
      novelId: input.novelId,
      chapterId: input.chapterId,
      sourceHash: protectedResult.guard.sourceContentHash,
      candidateHash: protectedResult.guard.candidateContentHash,
      policyRevision: protectedResult.guard.policyRevision,
      entries: buildLedgerEntries({
        plan: result.output,
        issues,
        guard: protectedResult.guard,
        adopt: adopted,
      }),
    });
    return {
      content: adopted ? protectedResult.content : input.content,
      report,
      rewriteGuard: verdict && !guardBlocked
        ? upgradeGuardWithConservation(protectedResult.guard, verdict)
        : protectedResult.guard,
    };
  }

  /** 台账只归档结果，写入失败不影响本次改写，也不改变正文链路。 */
  private async recordLedger(input: {
    novelId?: string;
    chapterId?: string;
    sourceHash: string;
    candidateHash: string;
    policyRevision: string;
    entries: StyleRewriteLedgerEntry[];
  }): Promise<void> {
    if (!input.novelId || input.entries.length === 0) {
      return;
    }
    try {
      await this.ledger.record({ ...input, novelId: input.novelId });
    } catch (error) {
      console.warn("[style-rewrite] 改动台账写入失败，本次改写结果不受影响。", error);
    }
  }

  /** Review failures only downgrade the check to not_checked; they never hide the preview. */
  private async reviewInformationConservation(input: {
    original: string;
    changes: Array<{ original: string; replacement: string }>;
    provider?: LLMProvider;
    model?: string;
  }): Promise<ConservationVerdict> {
    try {
      const result = await runStructuredPrompt({
        asset: styleRewriteConservationPrompt,
        promptInput: { originalContent: input.original, changes: input.changes },
        options: {
          provider: input.provider ?? "deepseek",
          model: input.model,
          temperature: 0.1,
        },
      });
      if (result.output.status === "preserved") return { status: "preserved" };
      if (result.output.status === "changed") return { status: "changed", reason: result.output.reason };
      return { status: "uncertain" };
    } catch {
      return { status: "uncertain" };
    }
  }
}
