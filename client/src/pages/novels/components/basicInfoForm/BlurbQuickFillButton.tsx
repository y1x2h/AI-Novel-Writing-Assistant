import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { BlurbCandidate } from "@ai-novel/shared/types/blurb";
import { DEFAULT_BLURB_COUNT } from "@ai-novel/shared/types/blurb";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";
import { generateNovelBlurb } from "@/api/novelBlurb";
import AiButton from "@/components/common/AiButton";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";

interface GenreOption {
  id: string;
  label: string;
  path: string;
}

interface BlurbQuickFillButtonProps {
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  onApplyBlurb: (blurb: string) => void;
  novelId?: string;
}

function buildCurrentSummary(basicForm: NovelBasicFormState, genreLabel: string): string {
  return [
    basicForm.title.trim() ? `书名：${basicForm.title.trim()}` : "",
    genreLabel ? `题材基底：${genreLabel}` : "",
    basicForm.targetAudience.trim() ? `目标读者：${basicForm.targetAudience.trim()}` : "",
    basicForm.bookSellingPoint.trim() ? `核心卖点：${basicForm.bookSellingPoint.trim()}` : "",
    basicForm.competingFeel.trim() ? `阅读体感：${basicForm.competingFeel.trim()}` : "",
    basicForm.first30ChapterPromise.trim() ? `前 30 章承诺：${basicForm.first30ChapterPromise.trim()}` : "",
    basicForm.description.trim() ? `现有概述：${basicForm.description.trim()}` : "",
  ].filter(Boolean).join("\n");
}

export function BlurbQuickFillButton(props: BlurbQuickFillButtonProps) {
  const { basicForm, genreOptions, onApplyBlurb, novelId } = props;
  const llm = useLLMStore();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<BlurbCandidate[]>([]);

  const genreLabel = useMemo(
    () => genreOptions.find((item) => item.id === basicForm.genreId)?.path
      ?? genreOptions.find((item) => item.id === basicForm.genreId)?.label
      ?? "",
    [basicForm.genreId, genreOptions],
  );

  const currentSummary = useMemo(() => buildCurrentSummary(basicForm, genreLabel), [basicForm, genreLabel]);
  const hasGenerationContext = Boolean(
    novelId
    || basicForm.description.trim()
    || basicForm.title.trim()
    || basicForm.bookSellingPoint.trim(),
  );

  const generateMutation = useMutation({
    mutationFn: () => generateNovelBlurb({
      novelId: novelId || undefined,
      title: basicForm.title.trim() || undefined,
      description: basicForm.description.trim() || undefined,
      genreLabel: genreLabel || undefined,
      bookSellingPoint: basicForm.bookSellingPoint.trim() || undefined,
      competingFeel: basicForm.competingFeel.trim() || undefined,
      first30ChapterPromise: basicForm.first30ChapterPromise.trim() || undefined,
      targetAudience: basicForm.targetAudience.trim() || undefined,
      commercialTags: normalizeCommercialTags(basicForm.commercialTagsText),
      count: DEFAULT_BLURB_COUNT,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
    }),
    onSuccess: (response) => {
      const next = response.data?.candidates ?? [];
      setCandidates(next);
      toast.success(next.length > 0 ? `已生成 ${next.length} 条简介候选。` : "AI 没有返回可用的简介候选。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "简介生成失败，请稍后再试。");
    },
  });

  const handleApply = (candidate: BlurbCandidate) => {
    if (basicForm.description.trim()) {
      const confirmed = window.confirm("将用这条简介覆盖当前概述，是否继续？");
      if (!confirmed) {
        return;
      }
    }
    onApplyBlurb(candidate.blurb);
    setOpen(false);
    toast.success("简介已写入概述，记得保存基本信息。");
  };

  const handleCopy = async (candidate: BlurbCandidate) => {
    await navigator.clipboard.writeText(candidate.blurb);
    toast.success("简介已复制到剪贴板。");
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <AiButton type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          简介快速生成
        </AiButton>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>简介快速生成</DialogTitle>
            <DialogDescription>
              根据当前书名、题材、卖点和读者生成可直接使用的简介候选。选中一条就可以填回概述。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <LLMSelector />

            <div className="border-l border-border/60 pl-3">
              <div className="text-xs font-medium text-foreground">当前会参与生成的已有信息</div>
              <div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                {currentSummary || "暂时还没有足够的信息。请先补一句概述、书名或核心卖点，再生成简介。"}
              </div>
            </div>

            <div className="flex justify-end">
              <AiButton
                type="button"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !hasGenerationContext}
              >
                {generateMutation.isPending ? "生成中..." : "生成简介候选"}
              </AiButton>
            </div>

            {candidates.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                点一次生成，就能得到一批基于当前项目定位的简介候选。
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {candidates.map((candidate, index) => (
                  <div key={`${candidate.blurb.slice(0, 24)}-${index}`} className="space-y-3 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {candidate.angle ? <Badge variant="secondary">{candidate.angle}</Badge> : null}
                      {candidate.targetReader ? <Badge variant="outline">{candidate.targetReader}</Badge> : null}
                    </div>
                    {candidate.hookLine ? (
                      <div className="text-sm font-semibold text-foreground">{candidate.hookLine}</div>
                    ) : null}
                    <div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {candidate.blurb}
                    </div>
                    {candidate.caution ? (
                      <div className="text-xs text-amber-700">提醒：{candidate.caution}</div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={() => handleApply(candidate)}>
                        填入概述
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleCopy(candidate)}>
                        复制
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
