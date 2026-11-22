/**
 * 回归测试：startPipelineJob 的 directorNext 冲突检测。
 *
 * 背景：历史上同范围存在 queued/running 且 runId 不同的正文作业时一律抛错。
 * 归属导演运行已进入终态（或记录缺失）的遗留作业没有任何执行者会恢复
 * （watchdog 不接管 directorNext 作业），会永久阻塞同范围新创作。
 * 修复后：孤儿作业自动取消放行；归属运行仍活跃的作业保持阻塞。
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const servicePath = path.resolve(__dirname, "../dist/services/novel/novelCorePipelineService.js");
const routingPipelinePath = path.resolve(__dirname, "../dist/modules/novel/director-routing/pipeline.js");

function orphanJobRow(runId, overrides = {}) {
  return {
    id: overrides.id || "job-orphan",
    novelId: "novel-1",
    startOrder: 4,
    endOrder: 6,
    status: "queued",
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    heartbeatAt: null,
    progress: 0,
    totalItems: 3,
    completedItems: 0,
    error: null,
    payload: JSON.stringify({ directorNext: { runId, decisions: [] } }),
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-01T00:00:00Z"),
    ...overrides,
  };
}

function createdJobRow() {
  return orphanJobRow("run-B", { id: "job-new", payload: JSON.stringify({ directorNext: { runId: "run-B", decisions: [] } }) });
}

function loadService(behavior) {
  const calls = { updateMany: [], create: [], runControlLookup: [] };
  const mockPrisma = {
    generationJob: {
      findMany: async (args) => {
        // directorNext 冲突检测分支：按范围查询，无 status 过滤。
        if (!args.where || !args.where.status) return behavior.rangeJobs;
        // listActivePipelineJobsForRange：带 status/pendingManualRecovery 过滤。
        return behavior.activeJobs ?? [];
      },
      updateMany: async (args) => {
        calls.updateMany.push(args);
        return { count: args.where.id.in.length };
      },
      create: async () => {
        calls.create.push(true);
        return createdJobRow();
      },
    },
    directorNextRunControl: {
      findUnique: async (args) => {
        calls.runControlLookup.push(args.where.runId);
        return behavior.runControl(args.where.runId);
      },
    },
    chapter: {
      aggregate: async () => ({ _min: { order: 1 }, _max: { order: 10 }, _count: { order: 10 } }),
      findMany: async () => [
        { id: "ch4", content: null, generationState: null, chapterStatus: null, riskFlags: null, artifactSyncCheckpoints: [] },
      ],
    },
    // 新版入口会先做原稿隔离判断，本用例只关心孤儿作业清理，因此按普通小说放行。
    manuscriptProject: { findUnique: async () => null },
  };

  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (parent && parent.filename === servicePath) {
      if (request === "../../db/prisma") return { prisma: mockPrisma };
      if (request === "./novelCoreSupport") return { ensureNovelCharacters: async () => {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[servicePath];
    const { NovelCorePipelineService } = require(servicePath);
    const service = new NovelCorePipelineService(async () => {});
    service.withStartLock = async (_key, fn) => fn();
    service.resolveIssuePolicySnapshot = async () => null;
    service.resolveStyleSignalPolicy = async () => null;
    service.schedulePipelineExecution = () => {};
    return { service, calls };
  } finally {
    Module._load = originalLoad;
  }
}

const baseOptions = {
  startOrder: 4,
  endOrder: 6,
  skipCompleted: true,
  directorNext: { runId: "run-B", phaseId: "phase-1", directorTaskId: "task-1", decisions: [] },
};

test("归属运行已终态的遗留作业自动取消放行，不再永久阻塞新创作", async () => {
  const { service, calls } = loadService({
    rangeJobs: [orphanJobRow("run-A")],
    runControl: () => ({ status: "cancelled" }),
  });
  const result = await service.startPipelineJob("novel-1", baseOptions);
  assert.equal(result.id, "job-new");
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where.id.in, ["job-orphan"]);
  assert.equal(calls.updateMany[0].data.status, "cancelled");
  assert.equal(calls.create.length, 1);
});

test("归属运行记录缺失的遗留作业同样视为孤儿清理", async () => {
  const { service, calls } = loadService({
    rangeJobs: [orphanJobRow("run-ghost")],
    runControl: () => null,
  });
  const result = await service.startPipelineJob("novel-1", baseOptions);
  assert.equal(result.id, "job-new");
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where.id.in, ["job-orphan"]);
});

test("归属运行仍活跃（paused/running）的作业保持阻塞", async () => {
  for (const status of ["paused", "running", "waiting_gate", "queued"]) {
    const { service, calls } = loadService({
      rangeJobs: [orphanJobRow("run-A")],
      runControl: () => ({ status }),
    });
    await assert.rejects(
      () => service.startPipelineJob("novel-1", baseOptions),
      /同一章节范围存在其他运行的正文作业/,
      `status=${status} 应阻塞`,
    );
    assert.equal(calls.updateMany.length, 0, `status=${status} 不应清理`);
    assert.equal(calls.create.length, 0, `status=${status} 不应创建新作业`);
  }
});

test("同一 run 的已有作业直接复用，不触发孤儿清理", async () => {
  const own = orphanJobRow("run-B", { id: "job-own" });
  const { service, calls } = loadService({
    rangeJobs: [own],
    runControl: () => ({ status: "running" }),
  });
  const result = await service.startPipelineJob("novel-1", baseOptions);
  assert.equal(result.id, "job-own");
  assert.equal(calls.runControlLookup.length, 0);
  assert.equal(calls.updateMany.length, 0);
  assert.equal(calls.create.length, 0);
});

test("非导演来源的作业（无 directorNext 归属）保持阻塞", async () => {
  const manual = orphanJobRow("run-B", { id: "job-manual", payload: JSON.stringify({ workflowTaskId: "wf-1" }) });
  const { service, calls } = loadService({
    rangeJobs: [manual],
    runControl: () => null,
  });
  await assert.rejects(
    () => service.startPipelineJob("novel-1", baseOptions),
    /同一章节范围存在其他运行的正文作业/,
  );
  assert.equal(calls.updateMany.length, 0);
  assert.equal(calls.create.length, 0);
});

function loadCancelFinalization(behavior) {
  const mockPrisma = {
    generationJob: { findUnique: async () => behavior.job },
    directorNextRunControl: { findUnique: async () => behavior.control },
    novelWorkflowTask: { findUnique: async () => behavior.task ?? null },
  };
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (parent && parent.filename === routingPipelinePath && request === "../../../db/prisma") {
      return { prisma: mockPrisma };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[routingPipelinePath];
    const { canFinalizeCancelledPipelineJob } = require(routingPipelinePath);
    return canFinalizeCancelledPipelineJob;
  } finally {
    Module._load = originalLoad;
  }
}

test("取消收尾：所属导演运行已终态或缺失时，遗留作业允许直接取消", async () => {
  for (const control of [{ status: "cancelled" }, { status: "failed" }, { status: "completed" }, null]) {
    const canFinalize = loadCancelFinalization({
      job: { payload: JSON.stringify({ directorNext: { runId: "run-A", decisions: [] } }) },
      control,
    });
    assert.equal(await canFinalize("job-1"), true, `control=${JSON.stringify(control)} 应允许取消`);
  }
});

test("取消收尾：所属导演运行仍活跃（paused/running）时不越权收尾", async () => {
  for (const status of ["paused", "running", "queued", "waiting_gate"]) {
    const canFinalize = loadCancelFinalization({
      job: { payload: JSON.stringify({ directorNext: { runId: "run-A", decisions: [] } }) },
      control: { status },
    });
    assert.equal(await canFinalize("job-1"), false, `status=${status} 不应取消`);
  }
});

test("取消收尾：混合归属的作业继续走原恢复判定", async () => {
  const canFinalize = loadCancelFinalization({
    job: { payload: JSON.stringify({ directorNext: { runId: "run-A" }, workflowTaskId: "wf-1" }) },
    control: { status: "cancelled" },
  });
  assert.equal(await canFinalize("job-1"), false);
});
