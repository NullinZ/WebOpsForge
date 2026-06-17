import { createFileEvidenceStore } from "../evidence.mjs";
import { WebOpsRunner } from "../runner.mjs";
import { createDryRunDriver } from "../drivers/dry-run-driver.mjs";
import { createPlaywrightDriver } from "../drivers/playwright-driver.mjs";

export function createRunQueue({ store, concurrency = 1, clock = () => new Date() }) {
  const pending = [];
  const active = new Set();

  return {
    enqueue(runId) {
      pending.push(runId);
      void drain();
    },
    status() {
      return {
        pending: pending.length,
        active: active.size,
        concurrency
      };
    }
  };

  async function drain() {
    while (active.size < concurrency && pending.length > 0) {
      const runId = pending.shift();
      active.add(runId);
      void execute(runId).finally(() => {
        active.delete(runId);
        void drain();
      });
    }
  }

  async function execute(runId) {
    const run = await store.getRun(runId);
    if (!run) return;
    const workflowRecord = await store.getWorkflow(run.workflowId);
    if (!workflowRecord) {
      await store.updateRun(runId, {
        status: "failed",
        error: { name: "WorkflowNotFound", message: `Workflow not found: ${run.workflowId}` },
        completedAt: clock().toISOString()
      });
      return;
    }

    const startedAt = clock();
    await store.updateRun(runId, {
      status: "running",
      startedAt: startedAt.toISOString()
    });

    const evidenceStore = createFileEvidenceStore({ dir: store.getRunDirFor(runId) });
    let driver = null;
    try {
      driver = await createDriver(run);
      const runner = new WebOpsRunner({ driver, evidenceStore, clock });
      const result = await runner.run(workflowRecord.workflow, {
        input: run.input,
        context: run.context,
        runId
      });
      const completedAt = clock();
      await runner.close();
      await store.updateRun(runId, {
        status: "completed",
        outputs: result.outputs,
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime()
      });
    } catch (error) {
      const completedAt = clock();
      await driver?.close?.().catch(() => {});
      await store.updateRun(runId, {
        status: error.code === "BROWSER_BLOCKED" ? "blocked" : "failed",
        error: serializeError(error),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime()
      });
    }
  }
}

async function createDriver(run) {
  if (run.mode === "playwright") {
    return createPlaywrightDriver(run.driverConfig ?? {});
  }
  return createDryRunDriver(run.driverConfig ?? {});
}

function serializeError(error) {
  return {
    name: error.name ?? "Error",
    code: error.code ?? "ERROR",
    message: error.message ?? String(error),
    stepId: error.stepId ?? null,
    details: error.details ?? {}
  };
}
