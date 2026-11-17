import type { DocumentChapter, DocumentSourceRange } from "@ai-novel/shared/types/knowledge";
import { AppError } from "../../middleware/errorHandler";
import { DocumentChapterService } from "./DocumentChapterService";

export interface ResolvedDocumentSourceRange {
  startChapterIndex: number;
  endChapterIndex: number;
  startOffset: number;
  endOffset: number;
  label: string;
  text: string;
  charCount: number;
}

const documentChapterService = new DocumentChapterService();

function normalizeSourceContent(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

export function buildDocumentSourceRangeLabel(input: {
  startChapterIndex: number;
  endChapterIndex: number;
  startTitle: string;
  endTitle: string;
}): string {
  if (input.startChapterIndex === input.endChapterIndex) {
    return `第 ${input.startChapterIndex + 1} 章：${input.startTitle}`;
  }
  return `第 ${input.startChapterIndex + 1}-${input.endChapterIndex + 1} 章：${input.startTitle} 至 ${input.endTitle}`;
}

export function sliceContentByChapterRange(
  chapters: DocumentChapter[],
  content: string,
  range: DocumentSourceRange,
): ResolvedDocumentSourceRange {
  const sorted = [...chapters].sort((left, right) => left.chapterIndex - right.chapterIndex);
  if (sorted.length < 2) {
    throw new AppError("当前文档章节不足，无法按章节范围读取，可按全文继续。", 400);
  }
  const startChapter = sorted.find((chapter) => chapter.chapterIndex === range.startChapterIndex);
  const endChapter = sorted.find((chapter) => chapter.chapterIndex === range.endChapterIndex);
  if (!startChapter || !endChapter || endChapter.endOffset <= startChapter.startOffset) {
    throw new AppError("所选章节范围在该文档版本中不可用。", 400);
  }
  const text = normalizeSourceContent(content).slice(startChapter.startOffset, endChapter.endOffset);
  if (!text.trim()) {
    throw new AppError("所选章节范围没有可读取的正文内容。", 400);
  }
  return {
    startChapterIndex: startChapter.chapterIndex,
    endChapterIndex: endChapter.chapterIndex,
    startOffset: startChapter.startOffset,
    endOffset: endChapter.endOffset,
    label: buildDocumentSourceRangeLabel({
      startChapterIndex: startChapter.chapterIndex,
      endChapterIndex: endChapter.chapterIndex,
      startTitle: startChapter.title,
      endTitle: endChapter.title,
    }),
    text,
    charCount: text.length,
  };
}

export async function resolveDocumentSourceRange(input: {
  documentId?: string;
  documentVersionId: string;
  content: string;
  range: DocumentSourceRange;
}): Promise<ResolvedDocumentSourceRange> {
  const result = await documentChapterService.ensureChaptersForVersion(
    input.documentVersionId,
    input.documentId,
  );
  return sliceContentByChapterRange(result.chapters, input.content, input.range);
}
