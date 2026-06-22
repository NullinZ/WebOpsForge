import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioStore, createRunQueue, probeProfileSession } from "../src/index.mjs";

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

    const delayedRun = await store.createRun({
      workflowId: workflows[0].id,
      mode: "dry-run",
      input: workflows[0].defaultRun.input,
      context: workflows[0].defaultRun.context,
      driverConfig: {
        ...workflows[0].defaultRun.driverConfig,
        humanTiming: { enabled: true, minDelayMs: 1, maxDelayMs: 1 }
      }
    });
    queue.enqueue(delayedRun.id);
    await waitForRun(store, delayedRun.id);
    const delayedEvents = await store.readRunEvents(delayedRun.id);
    assert.ok(delayedEvents.some((event) => event.type === "step.delay" && event.delayMs === 1));
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
    const seededRegistry = await store.getRegistry();
    assert.ok(seededRegistry.sites.some((site) => site.id === "example-marketplace"));
    assert.ok(seededRegistry.operations.some((operation) => operation.id === "example-search-suppliers"));

    const profile = await store.saveProfile({
      id: "operator-01",
      name: "Operator 01",
      mode: "dry-run",
      platform: "1688",
      accountLabel: "operator@example",
      loginState: "authenticated",
      status: "ready",
      sessionCheck: {
        platform: "1688",
        url: "https://work.1688.example",
        accountSelector: ".account-name"
      },
      tags: ["test"]
    });
    assert.equal(profile.name, "Operator 01");
    assert.equal(profile.accountLabel, "operator@example");
    assert.equal(profile.sessionCheck.accountSelector, ".account-name");

    const session = await probeProfileSession({ profile });
    assert.equal(session.loginState, "authenticated");
    assert.equal(session.accountLabel, "operator@example");

    const savedRegistryItem = await store.saveRegistryItem("sites", {
      id: "custom-site",
      name: "Custom Site",
      baseUrl: "https://custom.example",
      status: "ready"
    });
    assert.equal(savedRegistryItem.item.name, "Custom Site");
    assert.ok(savedRegistryItem.registry.sites.some((site) => site.id === "custom-site"));

    const pickerEvent = await store.savePickerEvent({
      url: "https://www.douyin.com/",
      title: "抖音",
      field: "searchBox",
      target: {
        tagName: "input",
        attributes: {
          "data-e2e": "searchbar-input",
          placeholder: "搜索"
        },
        classList: ["search-input"],
        rect: { x: 20, y: 30, width: 320, height: 36 }
      },
      selectorCandidates: [
        {
          selector: "input[data-e2e=\"searchbar-input\"]",
          source: "attribute:data-e2e",
          score: 95,
          matchCount: 1,
          visibleCount: 1,
          unique: true,
          stable: true
        }
      ]
    });
    assert.equal(pickerEvent.recommendedSelector, "input[data-e2e=\"searchbar-input\"]");
    assert.equal(pickerEvent.targetIdentity.attributes["data-e2e"], "searchbar-input");
    assert.equal(pickerEvent.suggestedAction, "fill");
    const pickerEvents = await store.listPickerEvents();
    assert.equal(pickerEvents[0].id, pickerEvent.id);

    const pickerSession = await store.savePickerSession({
      workflowId: "workflow-01",
      workflowName: "Workflow 01",
      nodeId: "fillSearch",
      nodeLabel: "Fill search",
      targetUrl: "https://www.douyin.com/",
      allowedUrls: ["https://www.douyin.com/", "https://www.douyin.com/search"]
    });
    assert.equal(pickerSession.targetUrl, "https://www.douyin.com/");
    assert.deepEqual(pickerSession.allowedUrls, ["https://www.douyin.com/", "https://www.douyin.com/search"]);
    assert.equal((await store.getPickerSession()).id, pickerSession.id);
    const clearedPickerSession = await store.clearPickerSession({ sessionId: pickerSession.id, reason: "test" });
    assert.equal(clearedPickerSession.cleared, true);
    assert.equal(await store.getPickerSession(), null);

    const workflow = (await store.listWorkflows())[0];
    const workflowWithGraph = await store.saveWorkflow({
      ...workflow,
      graph: {
        version: 1,
        layout: "sequence",
        layouts: {
          sequence: {
            positions: {
              searchSuppliers: { x: 1200, y: 900 },
              badPosition: { x: "left", y: 12 }
            },
            updatedAt: "2026-06-18T00:00:00.000Z"
          }
        }
      }
    });
    assert.equal(workflowWithGraph.graph.layout, "sequence");
    assert.deepEqual(workflowWithGraph.graph.layouts.sequence.positions.searchSuppliers, { x: 1200, y: 900 });
    assert.equal(workflowWithGraph.graph.layouts.sequence.positions.badPosition, undefined);

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
    assert.equal(
      bundle.workflows.find((item) => item.id === workflow.id).graph.layouts.sequence.positions.searchSuppliers.x,
      1200
    );
    assert.ok(bundle.profiles.some((item) => item.id === "operator-01"));
    assert.ok(bundle.registry.sites.some((site) => site.id === "custom-site"));

    const imported = await store.importBundle(bundle);
    assert.equal(imported.imported.workflows, bundle.workflows.length);
    assert.equal(imported.imported.profiles, bundle.profiles.length);
    assert.equal(imported.imported.registry, 1);

    const audit = await store.listAudit();
    assert.ok(audit.some((item) => item.type === "run.cancel_requested"));
    assert.ok(audit.some((item) => item.type === "bundle.imported"));
    assert.ok(audit.some((item) => item.type === "picker.event_received"));
    assert.ok(audit.some((item) => item.type === "picker.session_started"));
    assert.ok(audit.some((item) => item.type === "picker.session_cleared"));
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
