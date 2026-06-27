import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { StudioStore, createRunQueue, defineWorkflow, normalizePickerEvent, probeProfileSession } from "../src/index.mjs";
import { createWorkflowDebugSlice } from "../src/studio/debug-workflow.mjs";
import { discoverLocalBrowserProfiles } from "../src/studio/local-browser-profiles.mjs";

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
    const localProfile = profiles.find((profile) => profile.id === "local-chromium");
    assert.equal(localProfile.profileDir, path.join(dir, "browser-profiles", "local-chromium"));
    assert.equal(localProfile.browserChannel, "chrome");
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

test("normalizes picker events away from generated class selectors", () => {
  const pickerEvent = normalizePickerEvent({
    url: "https://www.douyin.com/",
    title: "抖音",
    selector: "div.YDoaql1z",
    recommendedSelector: "div.YDoaql1z",
    target: {
      tagName: "div",
      attributes: {
        id: "picker_351d97d2cdae4d1d96"
      },
      classList: ["YDoaql1z", "search-card"],
      text: "发布"
    },
    selectorCandidates: [
      { selector: "div.YDoaql1z", source: "class", score: 44, matchCount: 1, visibleCount: 1, unique: true },
      { selector: "div.search-card", source: "class", score: 40, matchCount: 1, visibleCount: 1, unique: true },
      { selector: "body > main > div:nth-of-type(1)", source: "dom-path", score: 18, matchCount: 1, visibleCount: 1, unique: true }
    ]
  });

  assert.equal(pickerEvent.recommendedSelector, "div.search-card");
  assert.deepEqual(pickerEvent.targetIdentity.classList, ["search-card"]);
  assert.equal(pickerEvent.targetIdentity.attributes.id, undefined);
  assert.ok(!pickerEvent.selectorCandidates.some((candidate) => candidate.selector.includes("YDoaql1z")));
});

test("studio store persists profile network settings", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-profile-network-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const profile = await store.saveProfile({
      id: "proxy-profile",
      name: "Proxy Profile",
      mode: "playwright",
      profileDir: path.join(dir, "browser-profile"),
      browserChannel: "chrome",
      network: {
        proxyMode: "custom",
        proxyServer: "socks5://127.0.0.1:29758",
        proxyBypass: "127.0.0.1,localhost"
      }
    });

    assert.deepEqual(profile.network, {
      proxyMode: "custom",
      proxyServer: "socks5://127.0.0.1:29758",
      proxyBypass: "127.0.0.1,localhost"
    });
    assert.deepEqual((await store.getProfile("proxy-profile")).network, profile.network);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("discovers local browser profiles from Chrome user data", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-browser-profiles-"));
  try {
    const chromeRoot = path.join(dir, "chrome");
    const defaultRoot = path.join(chromeRoot, "Default");
    const profileRoot = path.join(chromeRoot, "Profile 1");
    const genericProfileRoot = path.join(chromeRoot, "Profile 4");
    await mkdir(defaultRoot, { recursive: true });
    await mkdir(profileRoot, { recursive: true });
    await mkdir(genericProfileRoot, { recursive: true });
    await writeFile(path.join(chromeRoot, "Local State"), JSON.stringify({
      profile: {
        info_cache: {
          Default: { name: "用户1", gaia_name: "Nullin TH" },
          "Profile 1": { name: "Local Operator" },
          "Profile 4": { name: "nullinzuk", gaia_name: "nullinzuk" }
        }
      }
    }));
    await writeFile(path.join(defaultRoot, "Preferences"), JSON.stringify({
      profile: { name: "用户1" },
      account_info: [{ full_name: "Nullin TH", email: "nullin@example.invalid" }]
    }));
    await writeFile(path.join(profileRoot, "Preferences"), JSON.stringify({
      profile: { name: "Chrome Work" },
      account_info: [{ full_name: "Operator Name", email: "operator@example.invalid" }]
    }));
    await writeFile(path.join(genericProfileRoot, "Preferences"), JSON.stringify({
      profile: { name: "您的 Chrome" },
      account_info: [{ full_name: "nullinzuk", email: "profile4@example.invalid" }]
    }));

    const profiles = await discoverLocalBrowserProfiles({
      roots: [{
        id: "chrome",
        name: "Google Chrome",
        browserType: "chromium",
        browserChannel: "chrome",
        userDataDir: chromeRoot
      }],
      existingProfiles: [{
        id: "saved-chrome-work",
        mode: "playwright",
        profileDir: chromeRoot,
        profileDirectory: "Profile 1",
        browserChannel: "chrome"
      }]
    });

    const byDirectory = Object.fromEntries(profiles.map((profile) => [profile.profileDirectory, profile]));
    assert.equal(profiles.length, 3);
    assert.equal(byDirectory.Default.accountLabel, "Nullin TH");
    assert.equal(byDirectory["Profile 1"].accountLabel, "Local Operator");
    assert.equal(byDirectory["Profile 4"].accountLabel, "nullinzuk");
    assert.equal(byDirectory["Profile 1"].profileDir, chromeRoot);
    assert.equal(byDirectory["Profile 1"].profileDirectory, "Profile 1");
    assert.equal(byDirectory["Profile 1"].browserChannel, "chrome");
    assert.equal(byDirectory["Profile 1"].existingProfileId, "saved-chrome-work");
    assert.equal(JSON.stringify(profiles).includes("operator@example.invalid"), false);
    assert.equal(JSON.stringify(profiles).includes("profile4@example.invalid"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("creates a debug workflow slice to a nested operation node", () => {
  const workflow = defineWorkflow({
    name: "debug-slice-fixture",
    steps: [
      { id: "prepare", action: "checkpoint", label: "prepare" },
      {
        id: "search",
        action: "operation",
        browserSteps: [
          { id: "open", action: "goto", url: "https://example.local/search" },
          { id: "fill", action: "fill", selector: "#q", value: "{{input.query}}" },
          { id: "submit", action: "click", selector: "#submit" }
        ]
      },
      { id: "after", action: "checkpoint", label: "after" }
    ]
  });

  const debug = createWorkflowDebugSlice(workflow, "search.fill");

  assert.deepEqual(debug.steps.map((step) => step.id), ["prepare", "search"]);
  assert.equal(debug.steps[1].mode, "browser");
  assert.deepEqual(debug.steps[1].browserSteps.map((step) => step.id), ["search.open", "search.fill"]);
  assert.equal(debug.metadata.debug.targetStepId, "search.fill");
});

test("run queue executes a debug workflow override instead of the full workflow", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-debug-run-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const workflow = await store.saveWorkflow({
      id: "debug-run-fixture",
      name: "Debug run fixture",
      workflow: defineWorkflow({
        name: "debug-run-fixture",
        steps: [
          { id: "one", action: "checkpoint", label: "one" },
          { id: "two", action: "checkpoint", label: "two" }
        ]
      })
    });
    const run = await store.createRun({
      workflowId: workflow.id,
      workflowOverride: createWorkflowDebugSlice(workflow.workflow, "one"),
      debug: { mode: "run-to-node", targetStepId: "one" }
    });
    const queue = createRunQueue({ store });
    queue.enqueue(run.id);
    await waitForRun(store, run.id);

    const completed = (await store.readRunEvents(run.id)).filter((event) => event.type === "step.completed");
    assert.deepEqual(completed.map((event) => event.stepId), ["one"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run queue can explicitly hand goto-only Chrome profile debug runs to the front browser window", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-chrome-handoff-run-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const workflow = await store.saveWorkflow({
      id: "chrome-handoff-fixture",
      name: "Chrome handoff fixture",
      workflow: defineWorkflow({
        name: "chrome-handoff-fixture",
        steps: [
          { id: "open", action: "goto", url: "https://douyin.com" },
          { id: "fill", action: "fill", selector: "#q", value: "{{input.query}}" }
        ]
      })
    });
    const profile = await store.saveProfile({
      id: "chrome-profile-2",
      name: "Chrome Profile 2",
      mode: "playwright",
      browserType: "chromium",
      browserChannel: "chrome",
      profileDir: "/Users/example/Library/Application Support/Google/Chrome",
      profileDirectory: "Profile 2",
      status: "ready"
    });
    const run = await store.createRun({
      workflowId: workflow.id,
      mode: "playwright",
      profileId: profile.id,
      driverConfig: { chromeHandoff: "front-window" },
      workflowOverride: createWorkflowDebugSlice(workflow.workflow, "open"),
      debug: { mode: "run-to-node", targetStepId: "open" }
    });
    const calls = [];
    const queue = createRunQueue({
      store,
      chromeHandoffOpener: async (command, args, options) => {
        calls.push({ command, args, options });
      }
    });
    queue.enqueue(run.id);
    const completed = await waitForRun(store, run.id);

    assert.equal(completed.status, "completed");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    assert.deepEqual(calls[0].args, [
      "--profile-directory=Profile 2",
      "https://douyin.com/"
    ]);
    const events = await store.readRunEvents(run.id);
    assert.ok(events.some((event) => event.type === "step.completed" && event.stepId === "open" && event.result?.handoff === true && event.result?.handoffMethod === "browser-executable"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run queue reuses an already opened controlled profile browser session", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-controlled-profile-session-run-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const workflow = await store.saveWorkflow({
      id: "controlled-profile-session-fixture",
      name: "Controlled profile session fixture",
      workflow: defineWorkflow({
        name: "controlled-profile-session-fixture",
        steps: [
          { id: "open", action: "goto", url: "https://douyin.com" },
          { id: "fill", action: "fill", selector: "#q", value: "{{input.query}}" }
        ]
      })
    });
    const profile = await store.saveProfile({
      id: "local-chromium",
      name: "Local Chromium",
      mode: "playwright",
      browserType: "chromium",
      browserChannel: "chrome",
      profileDir: path.join(dir, "browser-profile"),
      profileDirectory: "",
      status: "ready"
    });
    const run = await store.createRun({
      workflowId: workflow.id,
      mode: "playwright",
      profileId: profile.id,
      input: { query: "storage case" },
      driverConfig: { humanTiming: false }
    });
    const driverCalls = [];
    let sessionCalls = 0;
    let handoffCalls = 0;
    const queue = createRunQueue({
      store,
      chromeHandoffOpener: async () => {
        handoffCalls += 1;
      },
      profileBrowserSessions: {
        async getDriver({ profile: requestedProfile }) {
          sessionCalls += 1;
          assert.equal(requestedProfile.id, "local-chromium");
          return {
            kind: "playwright",
            persistentProfileSession: true,
            async goto(args) {
              driverCalls.push({ action: "goto", ...args });
              return { url: args.url };
            },
            async fill(args) {
              driverCalls.push({ action: "fill", ...args });
              return { filled: true };
            },
            async currentUrl() {
              return "https://douyin.com";
            },
            async close() {}
          };
        }
      }
    });
    queue.enqueue(run.id);
    const completed = await waitForRun(store, run.id);

    assert.equal(completed.status, "completed");
    assert.equal(sessionCalls, 1);
    assert.equal(handoffCalls, 0);
    assert.deepEqual(driverCalls.map((item) => item.action), ["goto", "fill"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run queue marks locked Chrome profiles as front Chrome blocked when no executor is available", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-locked-chrome-handoff-run-"));
  try {
    const profileDir = path.join(dir, "chrome");
    await mkdir(profileDir, { recursive: true });
    await symlink(`Host-${process.pid}`, path.join(profileDir, "SingletonLock"));
    const store = new StudioStore({ dir: path.join(dir, "store") });
    await store.init();
    const workflow = await store.saveWorkflow({
      id: "locked-chrome-handoff-fixture",
      name: "Locked Chrome handoff fixture",
      workflow: defineWorkflow({
        name: "locked-chrome-handoff-fixture",
        steps: [
          { id: "open", action: "goto", url: "https://douyin.com" },
          { id: "fill", action: "fill", selector: "#q", value: "{{input.query}}" }
        ]
      })
    });
    const profile = await store.saveProfile({
      id: "chrome-profile-2",
      name: "Chrome Profile 2",
      mode: "playwright",
      browserType: "chromium",
      browserChannel: "chrome",
      profileDir,
      profileDirectory: "Profile 2",
      status: "ready"
    });
    const run = await store.createRun({
      workflowId: workflow.id,
      mode: "playwright",
      profileId: profile.id,
      input: { query: "storage case" },
      driverConfig: { humanTiming: false }
    });
    const calls = [];
    const queue = createRunQueue({
      store,
      chromeNativeExecutor: null,
      chromeHandoffOpener: async (command, args, options) => {
        calls.push({ command, args, options });
      }
    });
    queue.enqueue(run.id);
    const completed = await waitForRun(store, run.id);

    assert.equal(completed.status, "blocked");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    assert.deepEqual(calls[0].args, [
      "--profile-directory=Profile 2",
      "https://douyin.com/"
    ]);
    assert.notEqual(completed.error.code, "PROFILE_BUSY");
    assert.equal(completed.error.details.reason, "front_chrome_uncontrolled");
    assert.equal(completed.error.details.previousReason, "chrome_profile_handoff_unsupported_action");
    assert.equal(completed.error.details.blockedState, "front_chrome_uncontrolled");
    assert.equal(completed.error.details.action, "fill");
    assert.equal(completed.error.details.currentUrl, "https://douyin.com/");
    const events = await store.readRunEvents(run.id);
    assert.ok(events.some((event) => event.type === "step.completed" && event.stepId === "open" && event.result?.handoff === true && event.result?.handoffMethod === "browser-executable"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run queue completes locked Chrome profile steps through the extension executor", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-locked-chrome-executor-run-"));
  try {
    const profileDir = path.join(dir, "chrome");
    await mkdir(profileDir, { recursive: true });
    await symlink(`Host-${process.pid}`, path.join(profileDir, "SingletonLock"));
    const store = new StudioStore({ dir: path.join(dir, "store") });
    await store.init();
    const workflow = await store.saveWorkflow({
      id: "locked-chrome-executor-fixture",
      name: "Locked Chrome executor fixture",
      workflow: defineWorkflow({
        name: "locked-chrome-executor-fixture",
        steps: [
          { id: "open", action: "goto", url: "https://douyin.com" },
          { id: "fill", action: "fill", selector: "#q", value: "{{input.query}}" }
        ]
      })
    });
    const profile = await store.saveProfile({
      id: "chrome-profile-2",
      name: "Chrome Profile 2",
      mode: "playwright",
      browserType: "chromium",
      browserChannel: "chrome",
      profileDir,
      profileDirectory: "Profile 2",
      status: "ready"
    });
    const run = await store.createRun({
      workflowId: workflow.id,
      mode: "playwright",
      profileId: profile.id,
      input: { query: "storage case" },
      driverConfig: { humanTiming: false }
    });
    const calls = [];
    const executorCalls = [];
    const queue = createRunQueue({
      store,
      chromeHandoffOpener: async (command, args, options) => {
        calls.push({ command, args, options });
      },
      chromeExtensionExecutor: {
        async run(payload, options) {
          executorCalls.push({ payload, options });
          return {
            filled: true,
            value: payload.params.value,
            actualValue: payload.params.value,
            target: { selector: payload.params.selector, count: 1, visibleCount: 1 }
          };
        }
      }
    });
    queue.enqueue(run.id);
    const completed = await waitForRun(store, run.id);

    assert.equal(completed.status, "completed");
    assert.equal(calls.length, 1);
    assert.equal(executorCalls.length, 1);
    assert.equal(executorCalls[0].payload.action, "fill");
    assert.equal(executorCalls[0].payload.params.value, "storage case");
    const events = await store.readRunEvents(run.id);
    assert.ok(events.some((event) => event.type === "step.completed" && event.stepId === "fill" && event.result?.via === "chrome-extension-executor"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run queue records blocked-state classification for stalled browser work", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-studio-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const workflow = await store.saveWorkflow({
      id: "blocked-fixture",
      name: "Blocked fixture",
      workflow: defineWorkflow({
        name: "blocked-fixture",
        steps: [
          { id: "open", action: "goto", url: "https://example.local/search" },
          { id: "assert", action: "assertText", selector: ".result-title", includes: "approved-value" }
        ]
      }),
      defaultRun: {
        mode: "dry-run",
        input: {},
        context: {},
        driverConfig: {
          pages: {
            "https://example.local/search": {
              selectors: {
                ".result-title": { text: "unexpected" }
              }
            }
          }
        }
      }
    });
    const run = await store.createRun({
      workflowId: workflow.id,
      mode: "dry-run",
      driverConfig: workflow.defaultRun.driverConfig
    });
    const queue = createRunQueue({ store });
    queue.enqueue(run.id);
    const blocked = await waitForRun(store, run.id);

    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.error.details.blockedState, "selector_drift");
    assert.match(blocked.error.details.recoveryHint, /selector/i);
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
