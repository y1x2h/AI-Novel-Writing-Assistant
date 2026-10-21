import type {
  NovelComplianceItem,
  NovelComplianceLevel,
  NovelComplianceReport,
  NovelComplianceScope,
} from "@ai-novel/shared/types/novelCompliance";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { novelCompliancePrecheckPrompt } from "../../../../prompting/prompts/novel/compliancePrecheck.prompts";
import { getSharedNovelServices } from "../../../../services/novel/application/sharedNovelServices";
import { StoryMacroPlanService } from "../../../../services/novel/storyMacro/StoryMacroPlanService";

const MAX_BASIC_CHARS = 900;
const MAX_WORLD_CHARS = 3000;
const MAX_CHARACTER_CHARS = 3000;
const MAX_OUTLINE_CHARS = 4000;
const MAX_CHAPTER_TOTAL_CHARS = 8000;
const MAX_SAMPLED_CHAPTERS = 24;

function clip(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function toDigest(value: unknown, maxChars: number, fallback = "（暂无）"): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = typeof value === "string" ? value : safeJson(value);
  const trimmed = text.trim();
  return trimmed ? clip(trimmed, maxChars) : fallback;
}

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) {
    return items;
  }
  const step = items.length / limit;
  const picked: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    picked.push(items[Math.floor(index * step)]);
  }
  return picked;
}

interface ComplianceMaterial {
  title: string;
  basicDigest: string;
  worldDigest: string;
  characterDigest: string;
  outlineDigest: string;
  chapterDigest: string;
  checkedMaterialSummary: string;
}

function buildChapterDigest(
  chapters: Array<{ order: number; title: string; content: string | null }>,
  scope: NovelComplianceScope,
): { digest: string; summary: string } {
  if (scope === "planning") {
    return { digest: "（本次只检查规划材料，未读取正文）", summary: "规划材料" };
  }
  const written = chapters.filter((chapter) => (chapter.content ?? "").trim().length > 0);
  if (written.length === 0) {
    return { digest: "（尚无已写正文）", summary: "规划材料；尚无正文" };
  }
  const sampled = sampleEvenly(written, MAX_SAMPLED_CHAPTERS);
  const perChapterChars = Math.max(120, Math.floor(MAX_CHAPTER_TOTAL_CHARS / sampled.length) - 40);
  const digest = sampled
    .map((chapter) => [
      `第${chapter.order}章《${chapter.title}》`,
      clip((chapter.content ?? "").replace(/\s+/g, " "), perChapterChars),
    ].join("\n"))
    .join("\n\n");
  return {
    digest,
    summary: `规划材料；正文抽样 ${sampled.length}/${written.length} 章`,
  };
}

function mapReportRow(row: {
  id: string;
  novelId: string;
  scope: string;
  level: string;
  summary: string | null;
  checkedMaterialSummary: string | null;
  itemsJson: string;
  createdAt: Date;
}): NovelComplianceReport {
  let items: NovelComplianceItem[] = [];
  try {
    const parsed = JSON.parse(row.itemsJson);
    items = Array.isArray(parsed) ? (parsed as NovelComplianceItem[]) : [];
  } catch {
    items = [];
  }
  return {
    id: row.id,
    novelId: row.novelId,
    scope: row.scope as NovelComplianceScope,
    level: row.level as NovelComplianceLevel,
    summary: row.summary,
    checkedMaterialSummary: row.checkedMaterialSummary,
    items,
    createdAt: row.createdAt.toISOString(),
  };
}

export class NovelComplianceService {
  private readonly novelService = getSharedNovelServices();
  private readonly storyMacroPlanService = new StoryMacroPlanService();

  async getLatestReport(novelId: string): Promise<NovelComplianceReport | null> {
    const row = await prisma.novelComplianceReport.findFirst({
      where: { novelId },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapReportRow(row) : null;
  }

  async runPrecheck(novelId: string, scope: NovelComplianceScope): Promise<NovelComplianceReport> {
    const material = await this.buildMaterial(novelId, scope);
    const result = await runStructuredPrompt({
      asset: novelCompliancePrecheckPrompt,
      promptInput: {
        scope,
        title: material.title,
        basicDigest: material.basicDigest,
        worldDigest: material.worldDigest,
        characterDigest: material.characterDigest,
        outlineDigest: material.outlineDigest,
        chapterDigest: material.chapterDigest,
      },
      options: {
        novelId,
        stage: "novel",
        itemKey: "novel_compliance_precheck",
        entrypoint: "novel_compliance",
      },
    });

    const output = result.output;
    const row = await prisma.novelComplianceReport.create({
      data: {
        novelId,
        scope,
        level: output.level,
        summary: output.summary,
        checkedMaterialSummary: material.checkedMaterialSummary,
        itemsJson: JSON.stringify(output.items.map((item) => ({
          ...item,
          locationHint: item.locationHint ?? null,
        }))),
      },
    });
    return mapReportRow(row);
  }

  private async buildMaterial(novelId: string, scope: NovelComplianceScope): Promise<ComplianceMaterial> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        first30ChapterPromise: true,
        narrativeForm: true,
        writingPlatform: true,
        styleTone: true,
        outline: true,
        structuredOutline: true,
        chapters: {
          select: { order: true, title: true, content: true },
          orderBy: { order: "asc" },
        },
      },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }

    const [worldSlice, castOptions, storyMacroPlan, volumes] = await Promise.all([
      this.novelService.getWorldSlice(novelId).catch(() => null),
      this.novelService.listCharacterCastOptions(novelId).catch(() => []),
      this.storyMacroPlanService.getPlan(novelId).catch(() => null),
      this.novelService.getVolumes(novelId).catch(() => null),
    ]);

    const chapterPart = buildChapterDigest(novel.chapters, scope);

    return {
      title: novel.title,
      basicDigest: toDigest({
        description: novel.description,
        targetAudience: novel.targetAudience,
        bookSellingPoint: novel.bookSellingPoint,
        first30ChapterPromise: novel.first30ChapterPromise,
        narrativeForm: novel.narrativeForm,
        writingPlatform: novel.writingPlatform,
        styleTone: novel.styleTone,
      }, MAX_BASIC_CHARS),
      worldDigest: toDigest(worldSlice, MAX_WORLD_CHARS),
      characterDigest: toDigest(castOptions, MAX_CHARACTER_CHARS),
      outlineDigest: toDigest(
        {
          outline: clip(novel.outline ?? "", MAX_OUTLINE_CHARS / 2),
          structuredOutline: clip(novel.structuredOutline ?? "", MAX_OUTLINE_CHARS / 2),
          storyMacroPlan,
          volumes,
        },
        MAX_OUTLINE_CHARS,
      ),
      chapterDigest: chapterPart.digest,
      checkedMaterialSummary: chapterPart.summary,
    };
  }
}

export const novelComplianceService = new NovelComplianceService();
