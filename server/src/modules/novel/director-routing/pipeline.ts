import {prisma} from "../../../db/prisma";
import {AppError} from "../../../middleware/errorHandler";
import {assertLegacyTaskExecution, assertV2RunExecution, canExecuteLegacyTask} from "./ownership";

export interface DirectorPipelineOwner {directorNext?: {runId: string}; workflowTaskId?: string}

export function sameDirectorPipelineOwner(left: DirectorPipelineOwner, right: DirectorPipelineOwner): boolean {
  const key = (owner: DirectorPipelineOwner): string | null => {
    if (owner.directorNext && owner.workflowTaskId) return null;
    if (owner.directorNext) return typeof owner.directorNext.runId === "string" && owner.directorNext.runId ? `v2:${owner.directorNext.runId}` : null;
    if (owner.workflowTaskId !== undefined) return typeof owner.workflowTaskId === "string" && owner.workflowTaskId ? `workflow:${owner.workflowTaskId}` : null;
    return "manual";
  };
  const leftKey = key(left);
  return leftKey !== null && leftKey === key(right);
}

export async function assertDirectorPipelineOwner(novelId: string, payload: DirectorPipelineOwner): Promise<void> {
  if (payload.directorNext && payload.workflowTaskId) throw new AppError("正文作业不能同时属于两个导演流程。", 409);
  if (payload.directorNext) {
    const run = await prisma.directorNextRun.findUnique({where: {id: payload.directorNext.runId}, select: {novelId: true}});
    if (run?.novelId !== novelId) throw new AppError("正文作业与导演 V2 小说归属不一致。", 409);
    await assertV2RunExecution(payload.directorNext.runId);
  } else if (payload.workflowTaskId) {
    const task = await prisma.novelWorkflowTask.findUnique({where: {id: payload.workflowTaskId}, select: {novelId: true, lane: true}});
    if (!task || task.novelId !== novelId) throw new AppError("正文作业与创作任务归属不一致。", 409);
    if (task.lane === "auto_director") await assertLegacyTaskExecution(payload.workflowTaskId);
  }
}

/**
 * 取消收尾与"恢复执行"是两种不同的判定：
 * directorNext 作业没有 watchdog 执行者，只有所属创作运行能推进它；当所属运行已进入
 * 终态（或运行记录缺失）时，等待取消的作业必须由服务侧直接收尾，否则会一直停留在
 * 运行中并阻塞同范围新创作。仍处于活跃状态（含 paused）的运行不在此列。
 */
export async function canFinalizeCancelledPipelineJob(jobId: string): Promise<boolean> {
  const job = await prisma.generationJob.findUnique({where: {id: jobId}, select: {payload: true}});
  if (!job) return false;
  let payload: DirectorPipelineOwner;
  try {payload = JSON.parse(job.payload || "{}");} catch {return false;}
  if (!payload.directorNext) return canRecoverLegacyPipelineJob(jobId);
  if (payload.workflowTaskId) return false;
  const control = await prisma.directorNextRunControl.findUnique({where: {runId: payload.directorNext.runId}, select: {status: true}});
  return !control || control.status === "completed" || control.status === "failed" || control.status === "cancelled";
}

export async function canRecoverLegacyPipelineJob(jobId: string): Promise<boolean> {
  const job = await prisma.generationJob.findUnique({where: {id: jobId}, select: {payload: true}});
  if (!job) return false;
  let payload: DirectorPipelineOwner;
  try {payload = JSON.parse(job.payload || "{}");} catch {return false;}
  if (payload.directorNext) return false;
  if (!payload.workflowTaskId) return true;
  const task = await prisma.novelWorkflowTask.findUnique({where: {id: payload.workflowTaskId}, select: {lane: true}});
  if (!task) return false;
  return task.lane !== "auto_director" || await canExecuteLegacyTask(payload.workflowTaskId);
}
