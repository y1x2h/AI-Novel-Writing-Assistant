import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStyleFragmentRule,
  deleteStyleFragmentRule,
  getStyleFragmentRules,
  updateStyleFragmentRule,
} from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

/**
 * 禁改清单：作者按书声明「必须原样保留」的片段。
 * 修文命中这些片段时会保留原稿，而不是改写它们。
 */
export function StyleProtectedFragmentEditor({ novelId }: { novelId: string }) {
  const queryClient = useQueryClient();
  const [fragment, setFragment] = useState("");
  const [note, setNote] = useState("");

  const rulesQuery = useQuery({
    queryKey: queryKeys.styleEngine.styleFragmentRules(novelId),
    queryFn: () => getStyleFragmentRules(novelId),
    enabled: Boolean(novelId),
  });
  const rules = rulesQuery.data?.data ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.styleFragmentRules(novelId) });

  const createMutation = useMutation({
    mutationFn: () => createStyleFragmentRule({ novelId, fragment, note: note.trim() || undefined }),
    onSuccess: async () => {
      setFragment("");
      setNote("");
      await refresh();
      toast.success("已加入禁改清单。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "保存禁改片段失败。"),
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { id: string; enabled: boolean }) =>
      updateStyleFragmentRule(payload.id, { enabled: payload.enabled }),
    onSuccess: refresh,
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新禁改片段失败。"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStyleFragmentRule(id),
    onSuccess: async () => {
      await refresh();
      toast.success("已从禁改清单移除。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "删除禁改片段失败。"),
  });

  if (!novelId) {
    return (
      <div className="space-y-2 py-2">
        <div className="text-base font-semibold text-slate-950">禁改清单</div>
        <div className="text-sm leading-6 text-muted-foreground">
          从小说页进入这本书的写法设置后，可以在这里登记必须原样保留的片段。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1">
        <div className="text-base font-semibold text-slate-950">禁改清单</div>
        <div className="text-sm leading-6 text-slate-500">
          登记必须原样保留的片段，例如专名、设定名词、角色口头禅。局部修订碰到这些片段时会直接保留原稿，只对本书生效。
        </div>
      </div>

      <div className="space-y-2">
        <Input
          value={fragment}
          onChange={(event) => setFragment(event.target.value)}
          placeholder="要原样保留的片段，2-80 个字"
          maxLength={80}
        />
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="备注（可选）：为什么不能改"
          maxLength={200}
        />
        <div>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || Array.from(fragment.trim()).length < 2}
          >
            加入禁改清单
          </Button>
        </div>
      </div>

      {rules.length > 0 ? (
        <ul className="divide-y divide-border/40">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1">
                <div className="break-all text-sm text-foreground">{rule.fragment}</div>
                {rule.note ? (
                  <div className="text-xs leading-5 text-muted-foreground">{rule.note}</div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, enabled: checked })}
                  />
                  {rule.enabled ? "生效中" : "已停用"}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(rule.id)}
                  disabled={deleteMutation.isPending}
                >
                  移除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-sm leading-6 text-muted-foreground">
          还没有登记片段。留空时局部修订按常规保护规则执行。
        </div>
      )}
    </div>
  );
}
