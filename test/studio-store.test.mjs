import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioStore, createRunQueue } from "../src/index.mjs";

test("studio store seeds workflow and queue completes a dry-run", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-studio-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const workflows = await store.listWorkflows();
    assert.equal(workflows.length, 1);

    const run = await store.createRun({
      workflowId: workflows[0].id,
      mode: "dry-run",
      input: workflows[0].defaultRun.input,
      context: workflows[0].defaultRun.context,
      driverConfig: workflows[0].defaultRun.driverConfig
    });
    const queue = createRunQueue({ store });
    queue.enqueue(run.id);
    const completed = await waitForRun(store, run.id);

    assert.equal(completed.status, "completed");
    assert.equal(completed.outputs.title, "Clear storage case supplier");
    assert.ok((await store.readRunEvents(run.id)).length > 0);
    assert.ok((await store.listRunArtifacts(run.id)).some((artifact) => artifact.name === "dry-run-search-result.txt"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function waitForRun(store, runId) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const run = await store.getRun(runId);
    if (["completed", "failed", "blocked"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for run");
}
