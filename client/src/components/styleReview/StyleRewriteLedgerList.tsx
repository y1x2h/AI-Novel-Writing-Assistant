import { useQuery } from "@tanstack/react-query";
import { STYLE_REWRITE_LEDGER_DEFAULT_LIMIT, type StyleRewriteLedgerEntry } from "@ai-novel/shared/types/styleEngine";
import { getStyleRewriteLedger } from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";

const STATUS_LABEL: Record<StyleRewriteLedgerEntry["checkStatus"], string> = {
  accepted: "已采用",
  blocked: "保留原稿",
  needs_review: "需人工复核",
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 改动台账：只读展示这本书最近几次局部修订改了哪几处、依据哪条规则、最终有没有被采用。 */
export function StyleRewriteLedgerList({ novelId, chapterId }: { novelId: string; chapterId?: string }) {
  const ledgerQuery = useQuery({
    queryKey: queryKeys.styleEngine.styleRewriteLedger(novelId, chapterId),
    queryFn: () => getStyleRewriteLedger({
      novelId,
      chapterId,
      limit: STYLE_REWRITE_LEDGER_DEFAULT_LIMIT,
    }),
    enabled: Boolean(novelId),
  });
  const records = ledgerQuery.data?.data ?? [];

  if (!novelId) {
    return null;
  }

  return (
    <div className="space-y-3 py-2">
      <div className="space-y-1">
        <div className="text-base font-semibold text-slate-950">改动台账</div>
        <div className="text-sm leading-6 text-slate-500">
          这里只记录已经发生过的局部修订：改了哪几处、依据哪条规则、最终是采用改写还是保留原稿。
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-sm leading-6 text-muted-foreground">
          {ledgerQuery.isLoading ? "正在读取改动记录…" : "这本书还没有局部修订记录。"}
        </div>
      ) : (
        <ul className="space-y-4">
          {records.map((record) => (
            <li key={record.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{formatTime(record.createdAt)}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{record.entries.length} 处改动</span>
                {record.chapterId ? (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span>章节 {record.chapterId}</span>
                  </>
                ) : null}
              </div>
              <ul className="divide-y divide-border/40">
                {record.entries.map((entry, index) => (
                  <li key={`${record.id}-${index}`} className="space-y-1 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-foreground">{entry.ruleName || entry.issueId || "局部修订"}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {STATUS_LABEL[entry.checkStatus]}
                      </span>
                    </div>
                    {entry.targetExcerpt ? (
                      <div className="break-all text-xs leading-5 text-muted-foreground">
                        原文：{entry.targetExcerpt}
                        {entry.checkStatus === "accepted" && entry.replacement
                          ? `　改为：${entry.replacement}`
                          : ""}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
