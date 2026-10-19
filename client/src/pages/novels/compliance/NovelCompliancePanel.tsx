import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type {
  NovelComplianceDimension,
  NovelComplianceLevel,
  NovelComplianceReport,
  NovelComplianceScope,
  NovelComplianceSeverity,
} from "@ai-novel/shared/types/novelCompliance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DIMENSION_LABELS: Record<NovelComplianceDimension, string> = {
  ip_infringement: "侵权与影射",
  platform_content: "平台内容",
};

const SEVERITY_LABELS: Record<NovelComplianceSeverity, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const LEVEL_LABELS: Record<NovelComplianceLevel, string> = {
  pass: "未发现明显风险",
  warn: "建议改写后再发布",
  block: "需要处理后再发布",
};

const SCOPE_LABELS: Record<NovelComplianceScope, string> = {
  planning: "规划材料",
  full: "整本（含正文）",
};

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function levelBadgeVariant(level: NovelComplianceLevel) {
  if (level === "block") {
    return "destructive" as const;
  }
  if (level === "warn") {
    return "outline" as const;
  }
  return "secondary" as const;
}

function severityBadgeVariant(severity: NovelComplianceSeverity) {
  if (severity === "high") {
    return "destructive" as const;
  }
  if (severity === "medium") {
    return "outline" as const;
  }
  return "secondary" as const;
}

export interface NovelCompliancePanelProps {
  report: NovelComplianceReport | null;
  isLoading?: boolean;
  isRunning?: boolean;
  onRunPrecheck: (scope: NovelComplianceScope) => void;
  /** 本次预检使用的范围，决定「重新预检」按钮的文案与调用参数。 */
  scope?: NovelComplianceScope;
  title?: string;
  description?: string;
  /** 预检结果存在高风险项时，是否展示「我已了解风险」确认区。 */
  gated?: boolean;
  acknowledged?: boolean;
  onAcknowledgedChange?: (value: boolean) => void;
  className?: string;
}

export default function NovelCompliancePanel({
  report,
  isLoading = false,
  isRunning = false,
  onRunPrecheck,
  scope = "full",
  title = "导出前合规预检",
  description = "检查设定、大纲与正文里可能引起的侵权、影射或平台驳回风险，并给出修改建议。",
  gated = false,
  acknowledged = false,
  onAcknowledgedChange,
  className,
}: NovelCompliancePanelProps) {
  const items = report?.items ?? [];
  const blocked = report?.level === "block" && items.length > 0;
  const showGate = gated && blocked;

  return (
    <section className={cn("space-y-3 rounded-lg bg-muted/40 p-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
            <span>{title}</span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={isRunning}
          onClick={() => onRunPrecheck(scope)}
        >
          {isRunning ? <><Loader2 className="animate-spin" />正在预检…</> : report ? "重新预检" : "开始预检"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">正在读取上次预检结果…</p>
      ) : null}

      {!isLoading && !report ? (
        <p className="text-xs leading-5 text-muted-foreground">
          还没有预检记录。可以现在检查一次，早发现问题比导出后被打回更省事。
        </p>
      ) : null}

      {report ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={levelBadgeVariant(report.level)}>
              {report.level === "pass" ? <CheckCircle2 /> : <AlertTriangle />}
              {LEVEL_LABELS[report.level]}
            </Badge>
            <span>检查范围：{SCOPE_LABELS[report.scope]}</span>
            <span>检查时间：{formatCheckedAt(report.createdAt)}</span>
            {report.checkedMaterialSummary ? <span>材料：{report.checkedMaterialSummary}</span> : null}
          </div>

          {report.summary ? (
            <p className="text-xs leading-5 text-foreground">{report.summary}</p>
          ) : null}

          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li
                  key={`${item.rule}-${index}`}
                  className="space-y-1.5 border-l-2 border-amber-500/60 bg-background/60 py-2 pl-3 pr-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={severityBadgeVariant(item.severity)}>
                      {SEVERITY_LABELS[item.severity]}风险
                    </Badge>
                    <Badge variant="outline">{DIMENSION_LABELS[item.dimension]}</Badge>
                    <span className="text-sm font-medium text-foreground">{item.rule}</span>
                  </div>
                  {item.excerpt ? (
                    <p className="text-xs leading-5 text-muted-foreground">原文片段：{item.excerpt}</p>
                  ) : null}
                  {item.suggestion ? (
                    <p className="text-xs leading-5 text-foreground">修改建议：{item.suggestion}</p>
                  ) : null}
                  {item.locationHint ? (
                    <p className="text-xs leading-5 text-muted-foreground">涉及位置：{item.locationHint}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {showGate ? (
            <label className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs leading-5 text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 rounded border-input"
                checked={acknowledged}
                onChange={(event) => onAcknowledgedChange?.(event.target.checked)}
              />
              <span>我已了解上述风险，仍然继续导出。</span>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
