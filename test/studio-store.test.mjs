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

test("studio store manages profiles, cancellation, retry, and bundles", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-studio-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const profiles = await store.listProfiles();
    assert.ok(profiles.some((profile) => profile.id === "dry-run-demo"));

    const profile = await store.saveProfile({
      id: "operator-01",
      name: "Operator 01",
      mode: "dry-run",
      status: "ready",
      tags: ["test"]
    });
    assert.equal(profile.name, "Operator 01");

    const workflow = (await store.listWorkflows())[0];
    const run = await store.createRun({
      workflowId: workflow.id,
      profileId: profile.id,
      input: workflow.defaultRun.input,
      context: workflow.defaultRun.context,
      driverConfig: workflow.defaultRun.driverConfig
    });
    const queue = createRunQueue({ store });
    const canceled = await queue.cancel(run.id);
    assert.equal(canceled.run.status, "canceled");

    const retry = await store.retryRun(run.id);
    assert.equal(retry.sourceRunId, run.id);

    const bundle = await store.exportBundle();
    assert.ok(bundle.workflows.length > 0);
    assert.ok(bundle.profiles.some((item) => item.id === "operator-01"));

    const imported = await store.importBundle(bundle);
    assert.equal(imported.imported.workflows, bundle.workflows.length);
    assert.equal(imported.imported.profiles, bundle.profiles.length);

    const audit = await store.listAudit();
    assert.ok(audit.some((item) => item.type === "run.cancel_requested"));
    assert.ok(audit.some((item) => item.type === "bundle.imported"));
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
