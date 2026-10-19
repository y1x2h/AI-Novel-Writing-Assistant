import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NovelComplianceScope } from "@ai-novel/shared/types/novelCompliance";
import { getNovelComplianceReport, runNovelCompliancePrecheck } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";

/**
 * 读取与刷新一本书的合规预检报告。
 * 只负责取数与发起预检，不参与自动导演状态机，也不阻断任何生成链路。
 */
export function useNovelCompliance(
  novelId: string,
  options?: { enabled?: boolean },
) {
  const enabled = Boolean(novelId) && (options?.enabled ?? true);
  const queryClient = useQueryClient();

  const reportQuery = useQuery({
    queryKey: queryKeys.novels.complianceReport(novelId),
    queryFn: async () => (await getNovelComplianceReport(novelId)).data ?? null,
    enabled,
    staleTime: 30_000,
  });

  const precheckMutation = useMutation({
    mutationFn: (scope: NovelComplianceScope) => runNovelCompliancePrecheck(novelId, scope),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.complianceReport(novelId),
      });
      toast.success(
        result.data?.level === "pass"
          ? "合规预检完成，未发现明显风险。"
          : "合规预检完成，请查看风险清单。",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "合规预检失败，请稍后重试。");
    },
  });

  return {
    report: reportQuery.data ?? null,
    isLoading: reportQuery.isLoading,
    isFetching: reportQuery.isFetching,
    isRunning: precheckMutation.isPending,
    runPrecheck: (scope: NovelComplianceScope) => precheckMutation.mutate(scope),
  };
}
