import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { getTaskDetail } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";

export function isStyleExtractionTaskActive(task: UnifiedTaskDetail | null | undefined): boolean {
  return task?.status === "queued" || task?.status === "running";
}

function buildFailureMessage(task: UnifiedTaskDetail): string {
  if (task.failureSummary) {
    return task.failureSummary;
  }
  if (task.lastError) {
    return task.lastError;
  }
  return task.status === "cancelled" ? "写法提取任务已取消。" : "写法提取任务失败，请稍后重试。";
}

interface UseStyleExtractionTaskWatcherOptions {
  onSucceeded: (task: UnifiedTaskDetail) => void | Promise<void>;
  onFailed: (message: string, task: UnifiedTaskDetail) => void;
  onMissing: () => void;
}

/**
 * 跟踪后台写法提取任务，在任务进入终态时触发一次回调。
 * 调用方只需要在提交成功后把任务传给 watch(task)。
 */
export function useStyleExtractionTaskWatcher(options: UseStyleExtractionTaskWatcherOptions) {
  const [pendingTaskId, setPendingTaskId] = useState("");
  const handledTerminalTaskIdRef = useRef("");
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("style_extraction", pendingTaskId || "none"),
    queryFn: () => getTaskDetail("style_extraction", pendingTaskId),
    enabled: Boolean(pendingTaskId),
    refetchInterval: (query) => {
      const task = query.state.data?.data ?? null;
      return isStyleExtractionTaskActive(task) ? 3000 : false;
    },
    retry: false,
  });

  const task = taskQuery.data?.data ?? null;

  useEffect(() => {
    if (!pendingTaskId) {
      handledTerminalTaskIdRef.current = "";
      return;
    }

    if (taskQuery.status !== "success") {
      return;
    }

    if (!task) {
      if (handledTerminalTaskIdRef.current === pendingTaskId) {
        return;
      }
      handledTerminalTaskIdRef.current = pendingTaskId;
      setPendingTaskId("");
      callbacksRef.current.onMissing();
      return;
    }

    if (isStyleExtractionTaskActive(task)) {
      return;
    }

    if (handledTerminalTaskIdRef.current === task.id) {
      return;
    }
    handledTerminalTaskIdRef.current = task.id;
    setPendingTaskId("");

    if (task.status === "succeeded") {
      void callbacksRef.current.onSucceeded(task);
      return;
    }

    callbacksRef.current.onFailed(buildFailureMessage(task), task);
  }, [pendingTaskId, task, taskQuery.status]);

  const watch = (nextTask: UnifiedTaskDetail) => {
    handledTerminalTaskIdRef.current = "";
    setPendingTaskId(nextTask.id);
  };

  const clear = () => {
    handledTerminalTaskIdRef.current = "";
    setPendingTaskId("");
  };

  return {
    task,
    isActive: isStyleExtractionTaskActive(task),
    watch,
    clear,
  };
}
