import {AsyncLocalStorage} from "node:async_hooks";

const executions = new AsyncLocalStorage<AbortSignal>();

/** Runtime authority only. Never use cancellation as a quality/intent decision. */
export function withExecutionSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  // Consume lazy Prisma promises inside the scope, not at the caller's await site.
  return executions.run(executionSignal(signal)!, async () => await work());
}

export function executionSignal(upstream?: AbortSignal): AbortSignal | undefined {
  const current = executions.getStore();
  return current && upstream && current !== upstream ? AbortSignal.any([current, upstream]) : current ?? upstream;
}

export function assertExecutionActive(): void {
  executions.getStore()?.throwIfAborted();
}

/**
 * 脱离当前执行信号运行收尾/清理逻辑。
 * 所属运行被取消后，执行上下文中的 Prisma 与 AI 调用都会因信号已中止而失败；
 * 作业终态收尾属于数据完整性职责，必须能在信号失效后继续完成。
 */
export function withoutExecutionSignal<T>(work: () => T): T {
  return executions.exit(work) as T;
}
