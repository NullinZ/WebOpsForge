import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ActionValidationError,
  BrowserActionError,
  BrowserBlockedError,
  WebOpsRunner,
  createDryRunDriver,
  createFileEvidenceStore,
  createMemoryEvidenceStore,
  createRateLimiter,
  defineWorkflow
} from "../src/index.mjs";

function createSearchWorkflow(extra = {}) {
  return defineWorkflow({
    name: "webops-forge-test",
    defaults: { timeoutMs: 100, screenshot: "on-failure" },
    steps: [
      { id: "open", action: "goto", url: "https://example.local/search" },
      { id: "fill", action: "fill", selector: "#q", value: "{{input.query}}" },
      { id: "click", action: "click", selector: "#search" },
      { id: "extract", action: "extract", selector: ".result-title", name: "title" },
      { id: "assert", action: "assertText", selector: ".result-title", includes: "storage" },
      { id: "shot", action: "screenshot", name: "result" }
    ],
    ...extra
  });
}

function createSearchDriver() {
  return createDryRunDriver({
    pages: {
      "https://example.local/search": {
        selectors: {
          "#q": { value: "" },
          "#search": { text: "Search" },
          ".result-title": { text: "Clear storage case supplier" }
        }
      }
    }
  });
}

test("runs a workflow and records evidence", async () => {
  const evidenceStore = createMemoryEvidenceStore();
  const driver = createSearchDriver();
  const runner = new WebOpsRunner({ driver, evidenceStore });

  const result = await runner.run(createSearchWorkflow(), {
    input: { query: "storage case" },
    runId: "test-run"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.outputs.title, "Clear storage case supplier");
  assert.deepEqual(driver.log.map((item) => item.action), [
    "goto",
    "fill",
    "click",
    "extract",
    "extract",
    "screenshot"
  ]);
  assert.equal(evidenceStore.list()[0].type, "workflow.started");
  assert.equal(evidenceStore.list().at(-1).type, "workflow.completed");
  assert.equal(evidenceStore.artifacts().size, 1);
});

test("applies a random delay event before every workflow step", async () => {
  const evidenceStore = createMemoryEvidenceStore();
  const runner = new WebOpsRunner({
    driver: createSearchDriver(),
    evidenceStore,
    rateLimiter: createRateLimiter({
      minDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0
    })
  });

  await runner.run(createSearchWorkflow(), {
    input: { query: "storage case" },
    runId: "delay-test"
  });

  const delayEvents = evidenceStore.list().filter((event) => event.type === "step.delay");
  assert.deepEqual(delayEvents.map((event) => event.stepId), ["open", "fill", "click", "extract", "assert", "shot"]);
  assert.ok(delayEvents.every((event) => event.delayMs === 1));
});

test("passes target identity through browser actions", async () => {
  const calls = [];
  const targetIdentity = {
    version: 1,
    tagName: "input",
    attributes: { "data-e2e": "searchbar-input" },
    classList: [],
    selectorCandidates: [{ selector: "input[data-e2e=\"searchbar-input\"]" }],
    recommendedSelector: "input[data-e2e=\"searchbar-input\"]",
    matchPolicy: { minScore: 28, ambiguityMargin: 8, requireVisible: true, preferUnique: true }
  };
  const runner = new WebOpsRunner({
    driver: {
      async goto() {},
      async fill(args) {
        calls.push(args);
      }
    },
    evidenceStore: createMemoryEvidenceStore()
  });

  await runner.run(defineWorkflow({
    name: "target-identity-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local" },
      {
        id: "fillSearch",
        action: "fill",
        selector: "input[data-e2e=\"searchbar-input\"]",
        value: "{{input.query}}",
        targetIdentity
      }
    ]
  }), {
    input: { query: "装修" }
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].targetIdentity, targetIdentity);
});

test("throws a validation error for unresolved templates", async () => {
  const runner = new WebOpsRunner({
    driver: createSearchDriver(),
    evidenceStore: createMemoryEvidenceStore()
  });

  await assert.rejects(
    runner.run(createSearchWorkflow(), { input: {} }),
    ActionValidationError
  );
});

test("throws a browser action error when a selector is missing", async () => {
  const driver = createDryRunDriver({
    pages: {
      "https://example.local/search": {
        selectors: {
          "#q": { value: "" }
        }
      }
    }
  });
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  await assert.rejects(
    runner.run(createSearchWorkflow(), { input: { query: "storage case" } }),
    BrowserActionError
  );
});

test("throws a blocked error when assertText does not match", async () => {
  const driver = createDryRunDriver({
    pages: {
      "https://example.local/search": {
        selectors: {
          "#q": { value: "" },
          "#search": { text: "Search" },
          ".result-title": { text: "Unrelated supplier" }
        }
      }
    }
  });
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  await assert.rejects(
    runner.run(createSearchWorkflow(), { input: { query: "storage case" } }),
    BrowserBlockedError
  );
});

test("writes file evidence records and artifacts", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-forge-"));
  try {
    const evidenceStore = createFileEvidenceStore({ dir });
    const runner = new WebOpsRunner({ driver: createSearchDriver(), evidenceStore });

    await runner.run(createSearchWorkflow(), {
      input: { query: "storage case" },
      runId: "file-evidence-test"
    });

    const events = await readFile(path.join(dir, "events.jsonl"), "utf8");
    assert.match(events, /workflow\.started/);
    assert.match(events, /workflow\.completed/);

    const artifact = await readFile(path.join(dir, "artifacts", "result.txt"), "utf8");
    assert.match(artifact, /dry-run screenshot/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("blocks approval gates until context approval is present", async () => {
  const workflow = defineWorkflow({
    name: "approval-test",
    steps: [
      { id: "approval", action: "approval", name: "reviewSearch", prompt: "Review search result" },
      { id: "done", action: "checkpoint", label: "done" }
    ]
  });

  const blockedRunner = new WebOpsRunner({
    driver: createSearchDriver(),
    evidenceStore: createMemoryEvidenceStore()
  });
  await assert.rejects(
    blockedRunner.run(workflow, { context: { approvals: {} } }),
    BrowserBlockedError
  );

  const approvedRunner = new WebOpsRunner({
    driver: createSearchDriver(),
    evidenceStore: createMemoryEvidenceStore()
  });
  const result = await approvedRunner.run(workflow, {
    context: { approvals: { reviewSearch: true } }
  });
  assert.equal(result.status, "completed");
});

test("asserts workflow outputs without depending on page selectors", async () => {
  const workflow = defineWorkflow({
    name: "assert-output-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/search" },
      { id: "extract", action: "extract", selector: ".result-title", name: "title" },
      { id: "assertOutput", action: "assertOutput", name: "title", includes: "storage" }
    ]
  });
  const runner = new WebOpsRunner({
    driver: createSearchDriver(),
    evidenceStore: createMemoryEvidenceStore()
  });

  const result = await runner.run(workflow);

  assert.equal(result.outputs.title, "Clear storage case supplier");
});

test("blocks when an output assertion does not match", async () => {
  const workflow = defineWorkflow({
    name: "assert-output-failure-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/search" },
      { id: "extract", action: "extract", selector: ".result-title", name: "title" },
      { id: "assertOutput", action: "assertOutput", name: "title", includes: "missing" }
    ]
  });
  const runner = new WebOpsRunner({
    driver: createSearchDriver(),
    evidenceStore: createMemoryEvidenceStore()
  });

  await assert.rejects(runner.run(workflow), BrowserBlockedError);
});

test("normalizing operation workflows is idempotent for nested step ids", async () => {
  const workflow = defineWorkflow({
    name: "operation-idempotent-test",
    steps: [
      {
        id: "searchSuppliers",
        action: "operation",
        mode: "api",
        browserSteps: [
          { id: "open", action: "goto", url: "https://example.local/search" }
        ],
        api: {
          method: "GET",
          url: "https://api.example.local/search",
          name: "title"
        }
      }
    ]
  });

  const normalizedAgain = defineWorkflow(workflow);

  assert.equal(normalizedAgain.steps[0].browserSteps[0].id, "searchSuppliers.open");
  assert.equal(normalizedAgain.steps[0].api.id, "searchSuppliers.api");
});

test("switches an operation from browser steps to an API call", async () => {
  const workflow = defineWorkflow({
    name: "operation-switch-test",
    steps: [
      {
        id: "searchSuppliers",
        action: "operation",
        mode: "{{context.operationModes.searchSuppliers}}",
        browserSteps: [
          { id: "open", action: "goto", url: "https://example.local/search" },
          { id: "extract", action: "extract", selector: ".result-title", name: "title" }
        ],
        api: {
          method: "GET",
          url: "https://api.example.local/suppliers/search",
          query: { q: "{{input.query}}" },
          extract: "json.title",
          name: "title"
        }
      },
      { id: "assert", action: "checkpoint", label: "{{outputs.title}}" }
    ]
  });
  const driver = createDryRunDriver({
    apiResponses: {
      "GET https://api.example.local/suppliers/search?q=storage": {
        json: { title: "API storage supplier" }
      }
    }
  });
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  const result = await runner.run(workflow, {
    input: { query: "storage" },
    context: { operationModes: { searchSuppliers: "api" } }
  });

  assert.equal(result.outputs.title, "API storage supplier");
  assert.deepEqual(driver.log.map((item) => item.action), ["apiCall"]);
});
