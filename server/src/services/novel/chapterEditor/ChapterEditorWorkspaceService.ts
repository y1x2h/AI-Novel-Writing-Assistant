import { randomUUID } from "node:crypto";
import type {
  AuditIssue,
  AuditReport,
  ChapterEditorDiagnosticCard,
  ChapterEditorMacroContext,
  ChapterEditorQualityView,
  ChapterEditorRecommendedTask,
  ChapterEditorWorkspaceResponse,
  StoryPlan,
  StoryStateSnapshot,
  VolumeChapterPlan,
  VolumePlan,
} from "@ai-novel/shared/types/novel";
import {
  CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_PROMPT_LIMIT,
  appendChapterEditorHandledDiagnostic,
  chapterEditorDiagnosticTitlesMatch,
  readChapterEditorHandledDiagnostics,
  type ChapterEditorHandledDiagnostic,
} from "@ai-novel/shared/types/chapterEditorDiagnostics";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterEditorWorkspaceDiagnosisPrompt,
  type ChapterEditorWorkspaceDiagnosisPromptInput,
} from "../../../prompting/prompts/novel/chapterEditor/workspaceDiagnosis.prompts";
import type { ChapterEditorWorkspaceDiagnosisParsed } from "../../../prompting/prompts/novel/chapterEditor/workspaceDiagnosis.promptSchemas";
import { NovelCoreService } from "../NovelCoreService";
import type { ReviewOptions } from "../novelCoreShared";
import { createQualityReport } from "../novelCoreReviewService";
import { recheckEditedChapterQuality } from "../production/qualityClosure/recheckEditedChapterQuality";
import { chapterQualityLoopService } from "../quality/ChapterQualityLoopService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { readActiveManuscriptChapters } from "../../../modules/novel/manuscript/application/ManuscriptIsolation";
import {
  buildAnchorRangeFromParagraphBounds,
  buildCharacterStateSummary,
  buildMustKeepConstraints,
  buildPaceDirective,
  buildStyleSummary,
  buildWorldConstraintSummary,
  countEditorWords,
  findVolumeLocation,
  normalizeChapterContent,
  parseLooseTextList,
  splitParagraphsWithRanges,
  type ChapterEditorParagraph,
} from "./context";

type LoadedWorkspaceNovel = NonNullable<Awaited<ReturnType<NovelCoreService["getNovelById"]>>>;

export interface ChapterEditorWorkspaceContext {
  novel: LoadedWorkspaceNovel;
  chapter: LoadedWorkspaceNovel["chapters"][number];
  chapterPlan: StoryPlan | null;
  auditReports: AuditReport[];
  latestStateSnapshot: StoryStateSnapshot | null;
  volumes: VolumePlan[];
  normalizedContent: string;
  paragraphs: ChapterEditorParagraph[];
  styleSummary: string;
  chapterSummary: string;
  openAuditIssues: AuditIssue[];
  macroContext: ChapterEditorMacroContext;
}

function toRoleLabel(planRole?: StoryPlan["planRole"] | null): string | null {
  return ({
    setup: "负责建立局面与预期",
    progress: "负责推动目标前进",
    pressure: "负责抬高压迫与难度",
    turn: "负责形成转折或方向变化",
    payoff: "负责兑现前文承诺",
    cooldown: "负责收束余波并转场",
  } as Record<string, string | undefined>)[planRole ?? ""] ?? null;
}

function trimPromptText(text: string, maxLength = 260): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function buildBridgeLabel(chapter: { title?: string | null; expectation?: string | null; summary?: string | null } | null | undefined, fallback: string): string {
  if (!chapter) {
    return fallback;
  }
  const body = chapter.summary?.trim() || chapter.expectation?.trim() || chapter.title?.trim() || "";
  return body || fallback;
}

function buildVolumeChapterBridge(chapter: VolumeChapterPlan | null | undefined, fallback: string): string {
  if (!chapter) {
    return fallback;
  }
  return chapter.summary?.trim()
    || chapter.purpose?.trim()
    || chapter.endingState?.trim()
    || chapter.nextChapterEntryState?.trim()
    || chapter.title?.trim()
    || fallback;
}

function buildChapterSummary(chapter: LoadedWorkspaceNovel["chapters"][number], content: string): string {
  const chapterWithSummary = chapter as LoadedWorkspaceNovel["chapters"][number] & {
    chapterSummary?: { summary?: string | null } | null;
  };
  return chapterWithSummary.chapterSummary?.summary?.trim()
    || chapter.expectation?.trim()
    || content.slice(0, 180)
    || "暂无章节摘要。";
}

function buildActivePlotThreads(
  chapterPlan: StoryPlan | null,
  latestStateSnapshot: StoryStateSnapshot | null,
  volume: VolumePlan | null,
): string[] {
  const fromPlan = parseLooseTextList(chapterPlan?.mustAdvanceJson);
  const fromVolume = volume?.openPayoffs ?? [];
  const fromSnapshot = latestStateSnapshot?.foreshadowStates
    .filter((item) => item.status !== "paid_off")
    .map((item) => item.summary?.trim() || item.title?.trim() || "")
    .filter(Boolean) ?? [];
  return Array.from(new Set([
    ...fromPlan,
    ...fromVolume,
    ...fromSnapshot,
  ])).slice(0, 5);
}

function normalizeSnapshotDates(snapshot: Awaited<ReturnType<NovelCoreService["getLatestStateSnapshot"]>>): StoryStateSnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    createdAt: snapshot.createdAt instanceof Date ? snapshot.createdAt.toISOString() : snapshot.createdAt,
    updatedAt: snapshot.updatedAt instanceof Date ? snapshot.updatedAt.toISOString() : snapshot.updatedAt,
    characterStates: snapshot.characterStates.map((state) => ({
      ...state,
      createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
      updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt,
    })),
    relationStates: snapshot.relationStates.map((state) => ({
      ...state,
      createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
      updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt,
    })),
    informationStates: snapshot.informationStates.map((state) => ({
      ...state,
      createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
      updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt,
    })),
    foreshadowStates: snapshot.foreshadowStates.map((state) => ({
      ...state,
      createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
      updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt,
    })),
  };
}

type WorkspaceDiagnosticCardOutput = ChapterEditorWorkspaceDiagnosisParsed["cards"][number];

function normalizeRecurrenceEvidence(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * AI 负责判断语义关联；投影层只验证关联对象和当前段落内的连续原文证据。
 * 标题相近但没有结构化关联的新问题必须保留，证据不足的关联卡才收起。
 */
function shouldRetainDiagnosticCard(
  card: WorkspaceDiagnosticCardOutput,
  handledDiagnostics: ChapterEditorHandledDiagnostic[],
  paragraphs: ChapterEditorParagraph[],
): boolean {
  const handledIssueTitle = card.handledIssueTitle?.trim();
  if (!handledIssueTitle) {
    return true;
  }
  const hasValidAssociation = handledDiagnostics.some((record) => (
    chapterEditorDiagnosticTitlesMatch(record.title, handledIssueTitle)
  ));
  if (!hasValidAssociation) {
    return true;
  }

  const evidence = normalizeRecurrenceEvidence(card.recurrenceEvidence ?? "");
  const start = card.paragraphStart ?? null;
  const end = card.paragraphEnd ?? start;
  if (evidence.length < 4 || start === null || end === null || end < start) {
    return false;
  }
  return paragraphs.some((paragraph) => (
    paragraph.index >= start
    && paragraph.index <= end
    && normalizeRecurrenceEvidence(paragraph.text).includes(evidence)
  ));
}

function mapDiagnosticCard(
  card: {
    sourceIssueId?: string;
    title: string;
    problemSummary: string;
    whyItMatters: string;
    repairGoal?: string;
    repairApproach?: string;
    mustPreserve?: string[];
    recommendedAction: ChapterEditorDiagnosticCard["recommendedAction"];
    recommendedScope: ChapterEditorDiagnosticCard["recommendedScope"];
    paragraphStart?: number | null;
    paragraphEnd?: number | null;
    severity: ChapterEditorDiagnosticCard["severity"];
    sourceTags: string[];
  },
  paragraphs: ChapterEditorParagraph[],
  sourceIssueIds: ReadonlySet<string>,
): ChapterEditorDiagnosticCard {
  const start = card.paragraphStart ?? null;
  const end = card.paragraphEnd ?? start;
  return {
    id: randomUUID(),
    sourceIssueId: card.sourceIssueId && sourceIssueIds.has(card.sourceIssueId) ? card.sourceIssueId : null,
    title: card.title,
    problemSummary: card.problemSummary,
    whyItMatters: card.whyItMatters,
    repairGoal: card.repairGoal,
    repairApproach: card.repairApproach,
    mustPreserve: card.mustPreserve,
    recommendedAction: card.recommendedAction,
    recommendedScope: card.recommendedScope,
    anchorRange: buildAnchorRangeFromParagraphBounds(paragraphs, start, end),
    paragraphLabel: start && end ? (start === end ? `P${start}` : `P${start}-P${end}`) : null,
    severity: card.severity,
    sourceTags: card.sourceTags,
  };
}

function mapRecommendedTask(
  task: {
    title: string;
    summary: string;
    recommendedAction: ChapterEditorRecommendedTask["recommendedAction"];
    recommendedScope: ChapterEditorRecommendedTask["recommendedScope"];
    paragraphStart?: number | null;
    paragraphEnd?: number | null;
  } | undefined,
  cards: ChapterEditorDiagnosticCard[],
  paragraphs: ChapterEditorParagraph[],
): ChapterEditorRecommendedTask | null {
  if (task) {
    const start = task.paragraphStart ?? null;
    const end = task.paragraphEnd ?? start;
    return {
      title: task.title,
      summary: task.summary,
      recommendedAction: task.recommendedAction,
      recommendedScope: task.recommendedScope,
      anchorRange: buildAnchorRangeFromParagraphBounds(paragraphs, start, end),
      paragraphLabel: start && end ? (start === end ? `P${start}` : `P${start}-P${end}`) : null,
    };
  }
  const firstCard = cards[0];
  if (!firstCard) {
    return null;
  }
  return {
    title: firstCard.title,
    summary: firstCard.whyItMatters,
    recommendedAction: firstCard.recommendedAction,
    recommendedScope: firstCard.recommendedScope,
    anchorRange: firstCard.anchorRange ?? null,
    paragraphLabel: firstCard.paragraphLabel ?? null,
  };
}

function readQualityNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readAuditQualityPayload(report: AuditReport): { score: Record<string, unknown> | null; scoreAvailable: boolean; riskTags: string[] } | null {
  const raw = (report as { legacyScoreJson?: unknown }).legacyScoreJson;
  if (!raw) {
    return null;
  }
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  // Acceptance writes a flat score object; older reports may nest it under `score`.
  const score = record.score && typeof record.score === "object" && !Array.isArray(record.score)
    ? record.score as Record<string, unknown>
    : record;
  const riskTags = Array.isArray(record.riskTags)
    ? record.riskTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return { score, scoreAvailable: record.scoreAvailable !== false, riskTags };
}

function describeQualityUnavailable(riskTags: string[]): string {
  if (riskTags.some((tag) => tag.includes("continuity_review_evidence_invalid"))) {
    return "本次审校的前后章证据核对未通过，未生成评分。继续写作不受影响，可稍后重新分析本章。";
  }
  if (riskTags.some((tag) => tag.includes("transport") || tag.includes("timeout") || tag.includes("unavailable"))) {
    return "本次审校未完成，未生成评分。继续写作不受影响，可稍后重新分析本章。";
  }
  return "本章还没有质量评分，完成一次章节分析后会显示。";
}

function buildChapterQualityView(auditReports: AuditReport[]): ChapterEditorQualityView {
  const latest = auditReports.find((report) => readAuditQualityPayload(report) !== null);
  const payload = latest ? readAuditQualityPayload(latest) : null;
  const score = payload?.score ?? null;
  const overall = readQualityNumber(score?.overall);
  const available = Boolean(payload && payload.scoreAvailable && overall !== null);
  const createdAt = latest?.createdAt;
  return {
    available,
    overall,
    coherence: available ? readQualityNumber(score?.coherence) : null,
    repetition: available ? readQualityNumber(score?.repetition) : null,
    pacing: available ? readQualityNumber(score?.pacing) : null,
    voice: available ? readQualityNumber(score?.voice) : null,
    engagement: available ? readQualityNumber(score?.engagement) : null,
    evaluatedAt: createdAt ? new Date(createdAt).toISOString() : null,
    reason: available ? null : describeQualityUnavailable(payload?.riskTags ?? []),
  };
}

export class ChapterEditorWorkspaceService {
  constructor(
    private readonly core: NovelCoreService = new NovelCoreService(),
    private readonly volumeService: NovelVolumeService = new NovelVolumeService(),
    private readonly promptRunner: typeof runStructuredPrompt = runStructuredPrompt,
  ) {}

  async loadContext(novelId: string, chapterId: string): Promise<ChapterEditorWorkspaceContext> {
    const [novel, volumeWorkspace, chapterPlan, auditReports, latestStateSnapshotRaw] = await Promise.all([
      this.core.getNovelById(novelId),
      this.volumeService.getVolumes(novelId).catch(() => null),
      this.core.getChapterPlan(novelId, chapterId).catch(() => null),
      this.core.listChapterAuditReports(novelId, chapterId).catch(() => []),
      this.core.getLatestStateSnapshot(novelId).catch(() => null),
    ]);

    if (!novel) {
      throw new Error("小说不存在。");
    }

    const activeChapters = await readActiveManuscriptChapters(prisma as never, novelId);
    const effectiveChapters = activeChapters
      ? activeChapters.map(item => ({...item, chapterSummary: novel.chapters.find(row => row.id === item.id)?.chapterSummary ?? null}))
      : novel.chapters;
    const chapter = effectiveChapters.find((item) => item.id === chapterId);
    if (!chapter) {
      throw new Error("章节不存在。");
    }

    const latestStateSnapshot = normalizeSnapshotDates(latestStateSnapshotRaw);
    const normalizedContent = normalizeChapterContent(chapter.content ?? "");
    const paragraphs = splitParagraphsWithRanges(normalizedContent);
    const volumes = volumeWorkspace?.volumes ?? [];
    const location = findVolumeLocation(volumes, chapter.order);
    const volumeChapters = location.volume?.chapters.slice().sort((left, right) => left.chapterOrder - right.chapterOrder) ?? [];
    const currentVolumeChapter = volumeChapters.find((item) => item.chapterOrder === chapter.order) ?? null;
    const previousVolumeChapter = location.chapterIndex > 0 ? volumeChapters[location.chapterIndex - 1] ?? null : null;
    const nextVolumeChapter = location.chapterIndex >= 0 ? volumeChapters[location.chapterIndex + 1] ?? null : null;
    const effectiveOrder = activeChapters ? effectiveChapters.findIndex((item) => item.id === chapterId) + 1 : chapter.order;
    const previousChapter = activeChapters
      ? effectiveChapters[effectiveOrder - 2] ?? null
      : effectiveChapters.find((item) => item.order === chapter.order - 1) ?? null;
    const nextChapter = activeChapters
      ? effectiveChapters[effectiveOrder] ?? null
      : effectiveChapters.find((item) => item.order === chapter.order + 1) ?? null;
    const styleSummary = buildStyleSummary(novel);
    const chapterSummary = buildChapterSummary(chapter, normalizedContent);
    const openAuditIssues = auditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open"));
    const activePlotThreads = buildActivePlotThreads(chapterPlan, latestStateSnapshot, location.volume);
    const chapterMission = chapterPlan?.objective?.trim()
      || currentVolumeChapter?.purpose?.trim()
      || currentVolumeChapter?.summary?.trim()
      || chapter.expectation?.trim()
      || "当前重点是保证本章继续服务卷内推进。";
    const chapterRoleInVolume = currentVolumeChapter?.purpose?.trim()
      || toRoleLabel(chapterPlan?.planRole)
      || chapterPlan?.phaseLabel?.trim()
      || "负责承接本章在卷内的推进职责。";
    const macroContext: ChapterEditorMacroContext = {
      chapterRoleInVolume,
      volumeTitle: location.volume?.title?.trim() || "未识别所属卷",
      volumePositionLabel: location.volumePositionLabel,
      volumePhaseLabel: location.volumePhaseLabel,
      paceDirective: buildPaceDirective(location.volumePhaseLabel, novel.pacePreference),
      chapterMission,
      previousChapterBridge: buildVolumeChapterBridge(previousVolumeChapter, buildBridgeLabel(previousChapter, "本章前没有可承接的上一章摘要。")),
      nextChapterBridge: buildVolumeChapterBridge(nextVolumeChapter, buildBridgeLabel(nextChapter, "本章后没有可参考的下一章摘要。")),
      activePlotThreads: activePlotThreads.length > 0 ? activePlotThreads : ["当前没有明确抽取出的主线提醒。"],
      characterStateSummary: buildCharacterStateSummary(latestStateSnapshot),
      worldConstraintSummary: buildWorldConstraintSummary(novel.world),
      mustKeepConstraints: buildMustKeepConstraints(novel.bookContract, chapterPlan),
    };

    return {
      novel,
      chapter,
      chapterPlan,
      auditReports,
      latestStateSnapshot,
      volumes,
      normalizedContent,
      paragraphs,
      styleSummary,
      chapterSummary,
      openAuditIssues,
      macroContext,
    };
  }

  async getWorkspace(novelId: string, chapterId: string): Promise<ChapterEditorWorkspaceResponse> {
    const context = await this.loadContext(novelId, chapterId);
    const quality = buildChapterQualityView(context.auditReports);

    if (!context.normalizedContent.trim() || context.paragraphs.length === 0) {
      return {
        chapterMeta: {
          chapterId: context.chapter.id,
          order: context.chapter.order,
          title: context.chapter.title?.trim() || "未命名章节",
          wordCount: countEditorWords(context.normalizedContent),
          openIssueCount: context.openAuditIssues.length,
          styleSummary: context.styleSummary || null,
          updatedAt: context.chapter.updatedAt instanceof Date ? context.chapter.updatedAt.toISOString() : context.chapter.updatedAt,
          quality,
        },
        macroContext: context.macroContext,
        diagnosticCards: [],
        recommendedTask: null,
        refreshReason: "当前章节正文为空，先补正文后再由 AI 生成修文建议。",
      };
    }

    try {
      // AI 结构化关联已处理问题；投影层只收起缺少当前正文复发证据的关联卡。
      const handledDiagnostics = readChapterEditorHandledDiagnostics(context.chapter.riskFlags);
      const result = await this.promptRunner({
        asset: chapterEditorWorkspaceDiagnosisPrompt,
        promptInput: {
          chapterTitle: `第 ${context.chapter.order} 章 · ${context.chapter.title?.trim() || "未命名章节"}`,
          chapterMission: context.macroContext.chapterMission,
          volumePositionLabel: context.macroContext.volumePositionLabel,
          volumePhaseLabel: context.macroContext.volumePhaseLabel,
          paceDirective: context.macroContext.paceDirective,
          previousChapterBridge: context.macroContext.previousChapterBridge,
          nextChapterBridge: context.macroContext.nextChapterBridge,
          activePlotThreads: context.macroContext.activePlotThreads,
          paragraphs: context.paragraphs.map((paragraph) => ({
            index: paragraph.index,
            text: trimPromptText(paragraph.text),
          })),
          openIssues: context.openAuditIssues.slice(0, 8).map((issue) => ({
            id: issue.id,
            severity: issue.severity,
            auditType: issue.auditType,
            code: issue.code,
            evidence: trimPromptText(issue.evidence, 180),
            fixSuggestion: trimPromptText(issue.fixSuggestion, 180),
          })),
          handledIssues: handledDiagnostics
            .slice(-CHAPTER_EDITOR_HANDLED_DIAGNOSTICS_PROMPT_LIMIT)
            .map((record) => ({
              title: record.title,
              problemSummary: record.problemSummary ?? "",
              handledAt: record.handledAt,
            })),
        } satisfies ChapterEditorWorkspaceDiagnosisPromptInput,
        options: {
          provider: "deepseek",
          temperature: 0.4,
        },
      });

      const sourceIssueIds = new Set(context.openAuditIssues.map((issue) => issue.id));
      const retainedCards = result.output.cards.filter((card) => (
        shouldRetainDiagnosticCard(card, handledDiagnostics, context.paragraphs)
      ));
      const diagnosticCards = retainedCards.map((card) => (
        mapDiagnosticCard(card, context.paragraphs, sourceIssueIds)
      ));
      const suppressedCount = result.output.cards.length - diagnosticCards.length;
      const recommendedTaskInput = result.output.recommendedTask
        && retainedCards.some((card) => (
          chapterEditorDiagnosticTitlesMatch(card.title, result.output.recommendedTask?.title)
        ))
        ? result.output.recommendedTask
        : undefined;
      const recommendedTask = mapRecommendedTask(recommendedTaskInput, diagnosticCards, context.paragraphs);

      return {
        chapterMeta: {
          chapterId: context.chapter.id,
          order: context.chapter.order,
          title: context.chapter.title?.trim() || "未命名章节",
          wordCount: countEditorWords(context.normalizedContent),
          openIssueCount: context.openAuditIssues.length,
          styleSummary: context.styleSummary || null,
          updatedAt: context.chapter.updatedAt instanceof Date ? context.chapter.updatedAt.toISOString() : context.chapter.updatedAt,
          quality,
        },
        macroContext: context.macroContext,
        diagnosticCards,
        recommendedTask,
        refreshReason: suppressedCount > 0
          ? `本章修文建议已更新，并收起 ${suppressedCount} 项未在当前正文中发现复发证据的已处理问题。`
          : "已基于本章内容、卷内定位与开放问题实时生成修文建议。",
      };
    } catch (error) {
      console.warn("Failed to generate chapter editor workspace diagnosis.", error);
      return {
        chapterMeta: {
          chapterId: context.chapter.id,
          order: context.chapter.order,
          title: context.chapter.title?.trim() || "未命名章节",
          wordCount: countEditorWords(context.normalizedContent),
          openIssueCount: context.openAuditIssues.length,
          styleSummary: context.styleSummary || null,
          updatedAt: context.chapter.updatedAt instanceof Date ? context.chapter.updatedAt.toISOString() : context.chapter.updatedAt,
          quality,
        },
        macroContext: context.macroContext,
        diagnosticCards: [],
        recommendedTask: null,
        refreshReason: "AI 暂未完成本章诊断，你仍可先手动定位片段或直接告诉 AI 怎么改。",
      };
    }
  }

  /** 显式重新分析：先验收并保存当前正文的评分，再生成同一正文版本的诊断。 */
  async reanalyzeWorkspace(
    novelId: string,
    chapterId: string,
    options: ReviewOptions = {},
  ): Promise<ChapterEditorWorkspaceResponse> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, order: true, content: true },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }
    const content = chapter.content ?? "";
    if (!content.trim()) {
      throw new Error("当前章节正文为空，无法重新分析。请先写下至少一段正文。");
    }
    const review = await recheckEditedChapterQuality(novelId, chapterId, content, options, {
      persistAssessment: true,
    });
    if (review.reviewExecuted) {
      await createQualityReport(novelId, chapterId, review.score, review.issues);
      await chapterQualityLoopService.recordAssessment({
        novelId,
        chapterId,
        chapterOrder: chapter.order,
        score: review.score,
        issues: review.issues,
        source: "manual_review",
        terminalAction: review.pass ? null : "defer_and_continue",
      });
    }
    return this.getWorkspace(novelId, chapterId);
  }

  /**
   * 记录「这张诊断卡已被作者完整处理」，供后续诊断进行结构化复发核对。
   * 记录在 chapter.riskFlags.editorHandledDiagnostics，与质量债共用同一持久化载体，无需迁移。
   */
  async markDiagnosticHandled(
    novelId: string,
    chapterId: string,
    input: { title: string; problemSummary?: string | null },
  ): Promise<{ recorded: boolean }> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, riskFlags: true },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }
    const nextRiskFlags = appendChapterEditorHandledDiagnostic(chapter.riskFlags, input);
    if (!nextRiskFlags) {
      return { recorded: false };
    }
    await prisma.chapter.update({ where: { id: chapter.id }, data: { riskFlags: nextRiskFlags } });
    return { recorded: true };
  }
}
