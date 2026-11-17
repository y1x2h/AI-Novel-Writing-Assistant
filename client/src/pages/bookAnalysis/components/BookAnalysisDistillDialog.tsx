import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { BookAnalysisDetail } from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter, DocumentSourceRange } from "@ai-novel/shared/types/knowledge";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { createStyleExtractionTaskFromKnowledgeDocument } from "@/api/styleEngine";
import DocumentSourceRangePicker from "@/components/knowledge/DocumentSourceRangePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStyleExtractionTaskWatcher } from "@/hooks/useStyleExtractionTaskWatcher";
import type { LLMConfigState } from "../bookAnalysis.types";

type DistillMode = "analysis" | "reread";

interface BookAnalysisDistillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analysis: BookAnalysisDetail;
  chapters: DocumentChapter[];
  chaptersLoading: boolean;
  chaptersError: string;
  llmConfig: LLMConfigState;
  syncPending: boolean;
  syncFeedback: string;
  onUseAnalysisConclusion: (name: string) => Promise<void>;
  onDistilled: (profileId: string) => void;
}

const MODE_OPTIONS: Array<{ key: DistillMode; label: string; summary: string }> = [
  {
    key: "analysis",
    label: "使用拆书结论",
    summary: "直接读取这份拆书的文风与技法小节，速度快，适合作为日常参考。",
  },
  {
    key: "reread",
    label: "缩小范围重读原文",
    summary: "只读取所选章节或字数范围重新提取写法，适合原文很长、只想学习其中一段的情况。",
  },
];

function formatTaskStatus(task: UnifiedTaskDetail | null): string {
  if (!task) {
    return "等待提交";
  }
  if (task.status === "queued") {
    return "排队中";
  }
  if (task.status === "running") {
    return "处理中";
  }
  if (task.status === "succeeded") {
    return "已完成";
  }
  if (task.status === "failed") {
    return "失败";
  }
  if (task.status === "cancelled") {
    return "已取消";
  }
  return "等待审批";
}

function getInitialRange(chapters: DocumentChapter[], bounds: DocumentSourceRange | null): DocumentSourceRange | null {
  const candidates = bounds
    ? chapters.filter(
      (chapter) =>
        chapter.chapterIndex >= bounds.startChapterIndex &&
        chapter.chapterIndex <= bounds.endChapterIndex,
    )
    : [...chapters].sort((left, right) => left.chapterIndex - right.chapterIndex);
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((left, right) => left.chapterIndex - right.chapterIndex);
  return {
    startChapterIndex: sorted[0].chapterIndex,
    endChapterIndex: sorted[sorted.length - 1].chapterIndex,
  };
}

function readCreatedProfileId(task: UnifiedTaskDetail | null): string {
  const value = task?.meta?.createdStyleProfileId;
  return typeof value === "string" ? value : "";
}

export default function BookAnalysisDistillDialog(props: BookAnalysisDistillDialogProps) {
  const {
    open,
    onOpenChange,
    analysis,
    chapters,
    chaptersLoading,
    chaptersError,
    llmConfig,
    syncPending,
    syncFeedback,
    onUseAnalysisConclusion,
    onDistilled,
  } = props;
  const [name, setName] = useState("");
  const [mode, setMode] = useState<DistillMode>("analysis");
  const [range, setRange] = useState<DocumentSourceRange | null>(null);
  const [feedback, setFeedback] = useState("");

  const rangeBounds: DocumentSourceRange | null = analysis.sourceRange
    ? {
      startChapterIndex: analysis.sourceRange.startChapterIndex,
      endChapterIndex: analysis.sourceRange.endChapterIndex,
    }
    : null;

  const watcher = useStyleExtractionTaskWatcher({
    onMissing: () => setFeedback("写法提取任务不存在或已被清理，请重新提交。"),
    onSucceeded: (task) => {
      const profileId = readCreatedProfileId(task);
      if (!profileId) {
        setFeedback("写法提取任务已完成，但没有拿到自动保存结果，可到运行记录查看。");
        return;
      }
      onOpenChange(false);
      onDistilled(profileId);
    },
    onFailed: (message) => setFeedback(message),
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(`${analysis.title}-写法资产`);
    setMode("analysis");
    setRange(null);
    setFeedback("");
  }, [analysis.id, analysis.title, open]);

  useEffect(() => {
    if (mode !== "reread" || range || chapters.length === 0) {
      return;
    }
    setRange(getInitialRange(chapters, rangeBounds));
  }, [chapters, mode, range, rangeBounds]);

  const createTaskMutation = useMutation({
    mutationFn: () => createStyleExtractionTaskFromKnowledgeDocument({
      documentId: analysis.documentId,
      name: name.trim() || `${analysis.title}-写法资产`,
      provider: llmConfig.provider,
      model: llmConfig.model || undefined,
      temperature: llmConfig.temperature,
      presetKey: "balanced",
      sourceProcessingMode: "representative_sample",
      sourceRange: range ?? undefined,
    }),
    onSuccess: (response) => {
      const task = response.data;
      if (!task) {
        setFeedback("写法提取任务提交成功，但没有拿到任务详情。");
        return;
      }
      watcher.watch(task);
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : "提交写法提取任务失败，请稍后重试。");
    },
  });

  const handleUseAnalysisConclusion = async () => {
    setFeedback("");
    try {
      await onUseAnalysisConclusion(name.trim() || `${analysis.title}-写法资产`);
      onOpenChange(false);
    } catch {
      // 同步生成失败时由拆书页反馈具体原因。
    }
  };

  const handleSubmit = () => {
    if (mode === "analysis") {
      void handleUseAnalysisConclusion();
      return;
    }
    setFeedback("");
    createTaskMutation.mutate();
  };

  const submitting = mode === "analysis" ? syncPending : createTaskMutation.isPending;
  const submitDisabled = submitting || watcher.isActive || !name.trim();
  const sourceRangeLabel = analysis.sourceRange?.label?.trim() || "全文";
  const activeTask = watcher.task;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>蒸馏为写法</DialogTitle>
          <DialogDescription>
            把这份拆书整理成可复用的写法。可以直接使用拆书结论，也可以只重读其中一段原文再提取。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="book-analysis-distill-name">写法名称</label>
            <input
              id="book-analysis-distill-name"
              className="w-full rounded-md border p-2 text-sm"
              placeholder="写法名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {MODE_OPTIONS.map((option) => {
              const active = option.key === mode;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white hover:border-slate-400"
                  }`}
                  disabled={watcher.isActive}
                  onClick={() => setMode(option.key)}
                >
                  <div className="text-sm font-semibold">{option.label}</div>
                  <div className={`mt-1 text-xs leading-5 ${active ? "text-slate-200" : "text-slate-500"}`}>
                    {option.summary}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-md bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
            本次拆书范围：{sourceRangeLabel}
            {!analysis.isCurrentVersion ? " · 当前活动版本与拆书版本不同，重读原文前请确认章节是否一致。" : ""}
          </div>

          {mode === "reread" ? (
            <>
              <DocumentSourceRangePicker
                selectedRange={range}
                sourceChapters={chapters}
                sourceCharCount={
                  analysis.sourceRange?.startOffset != null && analysis.sourceRange?.endOffset != null
                    ? Math.max(0, analysis.sourceRange.endOffset - analysis.sourceRange.startOffset)
                    : 0
                }
                sourceSelected
                chaptersRequested
                chaptersLoading={chaptersLoading}
                chaptersError={chaptersError}
                onRangeChange={setRange}
                onRequestChapters={() => { /* 拆书页会随分析详情加载章节 */ }}
                rangeBounds={rangeBounds}
                fullRangeLabel={rangeBounds ? "拆书范围全文" : "全文"}
              />
              <div className="text-xs leading-5 text-muted-foreground">
                重读会在所选范围内抽取代表性样本，不会把整本书一次性交给模型。
              </div>
            </>
          ) : (
            <div className="rounded-md bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
              当前拆书进度 {Math.round(analysis.progress * 100)}% · 预算用量 {analysis.usedTokens ?? 0}
              {" / "}
              {analysis.budgetTokens ? analysis.budgetTokens : "不限"} tokens
            </div>
          )}

          {activeTask ? (
            <div className="rounded-md bg-muted/25 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium">{activeTask.title}</div>
                <Badge variant={watcher.isActive ? "secondary" : "outline"}>{formatTaskStatus(activeTask)}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                进度 {Math.round(activeTask.progress * 100)}%{activeTask.currentStage ? ` · ${activeTask.currentStage}` : ""}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                完成后会自动保存写法并打开写法引擎，可以先去忙别的事。
              </div>
            </div>
          ) : null}

          {feedback || syncFeedback ? (
            <div className="rounded-md bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {feedback || syncFeedback}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitDisabled}>
              {submitting
                ? "提交中..."
                : watcher.isActive
                  ? "后台提取中..."
                  : mode === "analysis"
                    ? "使用拆书结论生成"
                    : "按范围重读并生成"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
