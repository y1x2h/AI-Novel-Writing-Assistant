import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import type {
  NovelSpecClarificationAnswer,
  NovelSpecClarificationQuestion,
} from "@ai-novel/shared/types/novelSpecClarification";

interface SpecClarificationPanelProps {
  open: boolean;
  candidateTitle: string;
  questions: NovelSpecClarificationQuestion[];
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (answers: NovelSpecClarificationAnswer[]) => void;
}

export default function SpecClarificationPanel({
  open,
  candidateTitle,
  questions,
  submitting,
  onOpenChange,
  onSubmit,
}: SpecClarificationPanelProps) {
  const [drafts, setDrafts] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDrafts(questions.map((item) => item.suggestedAnswer));
  }, [open, questions]);

  const updateDraft = (index: number, value: string) => {
    setDrafts((prev) => prev.map((item, current) => (current === index ? value : item)));
  };

  const handleSubmit = () => {
    onSubmit(questions.map((item, index) => ({
      topic: item.topic,
      answer: (drafts[index] ?? "").trim(),
    })));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next && submitting) {
        return;
      }
      onOpenChange(next);
    }}>
      <AppDialogContent
        className="max-w-2xl"
        title="先确认几个关键设定"
        description={`${candidateTitle} 还有几处会影响后续规划的地方，确认后会更贴近你想要的故事。`}
        footer={(
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              先不澄清
            </Button>
            <Button type="button" disabled={submitting} onClick={handleSubmit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              确认并开始创作
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            每条都已给出建议答案，直接确认即可；如果有不同想法，改成你想要的方向就行。
          </p>
          {questions.map((item, index) => (
            <div key={`${item.topic}-${index}`} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-foreground">{item.topic}</span>
                <span className="text-sm text-foreground">{item.question}</span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{item.whyItMatters}</p>
              <textarea
                value={drafts[index] ?? ""}
                onChange={(event) => updateDraft(index, event.target.value)}
                rows={2}
                disabled={submitting}
                className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="写下你的设定，或保留建议答案"
              />
            </div>
          ))}
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
