import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ActionValidationError,
  applyProfileNetworkToLaunchOptions,
  BrowserActionError,
  BrowserBlockedError,
  StudioStore,
  WebOpsRunner,
  classifyRunFailure,
  createFixtureDriverConfig,
  createChromeProfileHandoffDriver,
  createDryRunDriver,
  createFileEvidenceStore,
  createMemoryEvidenceStore,
  createMacChromeAppleScriptExecutor,
  openProfileLoginWindow,
  createPlaywrightDriver,
  createRateLimiter,
  createRegistryPack,
  detectActiveProfileLock,
  detectBlockedState,
  defineAdapter,
  defineWorkflow,
  profileNetworkArgs,
  releaseProfileLockOwner
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
  const evidenceStore = createMemoryEvidenceStore();
  const runner = new WebOpsRunner({ driver, evidenceStore });

  await assert.rejects(
    runner.run(createSearchWorkflow(), { input: { query: "storage case" } }),
    BrowserBlockedError
  );
  const failed = evidenceStore.list().find((event) => event.type === "step.failed");
  assert.equal(failed.error.details.blockedState, "selector_drift");
  assert.match(failed.error.details.recoveryHint, /selector/i);
});

test("classifies common commercial run blockers", () => {
  const approval = classifyRunFailure(new BrowserBlockedError("Approval required", { reason: "approval_required" }));
  assert.equal(approval.state, "approval_required");
  assert.equal(approval.runStatus, "blocked");
  assert.equal(approval.profileStatus, "ready");

  assert.equal(detectBlockedState(new BrowserActionError("Selector not found in dry-run page: .price")), "selector_drift");
  assert.equal(detectBlockedState(new BrowserActionError("Chrome profile is already open", { code: "PROFILE_BUSY" })), "profile_busy");
  assert.equal(detectBlockedState({ message: "Captcha verification required" }), "captcha_or_verification");
  assert.equal(detectBlockedState({ details: { status: 429 }, message: "Too many requests" }), "rate_limited");
});

test("blocks persistent profile launch when Chrome owns the profile lock", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-locked-profile-"));
  try {
    await symlink(`local-${process.pid}`, path.join(dir, "SingletonLock"));
    await assert.rejects(
      createPlaywrightDriver({
        profileDir: dir,
        profileDirectory: "Profile 2",
        browserChannel: "chrome"
      }),
      (error) => {
        assert.equal(error.code, "PROFILE_BUSY");
        assert.equal(error.details.blockedState, undefined);
        assert.equal(error.details.reason, "profile_busy");
        assert.equal(error.details.profileDirectory, "Profile 2");
        assert.equal(error.details.browserChannel, "chrome");
        assert.equal(error.details.lockPid, process.pid);
        return true;
      }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("profile lock release refuses to signal an unverified owner", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-lock-release-"));
  try {
    await symlink(`local-${process.pid}`, path.join(dir, "SingletonLock"));
    const lock = await detectActiveProfileLock(dir, { inspectProcess: true });
    assert.equal(lock.pid, process.pid);
    assert.equal(lock.owner.ownsProfile, false);

    const release = await releaseProfileLockOwner(dir, { force: true });
    assert.equal(release.requested, false);
    assert.equal(release.reason, "owner_not_verified");
    assert.equal(release.lock.pid, process.pid);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("profile network settings produce deterministic browser launch options", () => {
  assert.deepEqual(profileNetworkArgs({ proxyMode: "direct" }), ["--no-proxy-server"]);
  assert.deepEqual(profileNetworkArgs({
    proxyMode: "custom",
    proxyServer: "socks5://127.0.0.1:29758",
    proxyBypass: "127.0.0.1,::1,localhost"
  }), [
    "--proxy-server=socks5://127.0.0.1:29758",
    "--proxy-bypass-list=127.0.0.1,::1,localhost"
  ]);

  const launchOptions = applyProfileNetworkToLaunchOptions({
    args: ["--profile-directory=Profile 2", "--no-proxy-server"]
  }, {
    proxyMode: "custom",
    proxyServer: "socks5://127.0.0.1:29758",
    proxyBypass: "localhost"
  });
  assert.deepEqual(launchOptions.args, [
    "--profile-directory=Profile 2",
    "--proxy-server=socks5://127.0.0.1:29758",
    "--proxy-bypass-list=localhost"
  ]);
  assert.deepEqual(launchOptions.proxy, {
    server: "socks5://127.0.0.1:29758",
    bypass: "localhost"
  });
});

test("opens a persistent browser profile for manual login without closing it", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-login-profile-"));
  try {
    const calls = [];
    const result = await openProfileLoginWindow({
      profile: {
        id: "local-chromium",
        name: "Local Chromium",
        mode: "playwright",
        profileDir: dir,
        profileDirectory: "",
        browserChannel: "chrome",
        sessionCheck: { url: "https://www.douyin.com/" }
      },
      opener: async (command, args) => {
        calls.push({ command, args });
      },
      clock: () => new Date("2026-06-27T10:00:00.000Z")
    });

    assert.equal(result.opened, true);
    assert.equal(result.profileDir, dir);
    assert.equal(result.url, "https://www.douyin.com/");
    assert.equal(result.openedAt, "2026-06-27T10:00:00.000Z");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    assert.deepEqual(calls[0].args, [
      `--user-data-dir=${dir}`,
      "https://www.douyin.com/"
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("opens manual login through a reusable controlled profile session when provided", async () => {
  const calls = [];
  const profileBrowserSessions = {
    async open(payload) {
      calls.push(payload);
      return {
        opened: true,
        controlled: true,
        profileDir: payload.profile.profileDir,
        url: payload.overrides.url || "about:blank"
      };
    }
  };
  const result = await openProfileLoginWindow({
    profile: {
      id: "local-chromium",
      name: "Local Chromium",
      mode: "playwright",
      profileDir: "/tmp/webops-profile",
      profileDirectory: "",
      browserChannel: "chrome"
    },
    overrides: {},
    profileBrowserSessions
  });

  assert.equal(result.controlled, true);
  assert.equal(result.url, "about:blank");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].profile.id, "local-chromium");
});

test("hands goto URLs to a local Chrome profile", async () => {
  const calls = [];
  const driver = createChromeProfileHandoffDriver({
    browserChannel: "chrome",
    profileDirectory: "Profile 2",
    opener: async (command, args, options) => {
      calls.push({ command, args, options });
    }
  });

  const result = await driver.goto({ url: "https://douyin.com", timeoutMs: 7000 });

  assert.equal(result.handoff, true);
  assert.equal(result.profileDirectory, "Profile 2");
  assert.equal(result.handoffMethod, "browser-executable");
  assert.equal(calls[0].command, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  assert.deepEqual(calls[0].args, [
    "--profile-directory=Profile 2",
    "https://douyin.com/"
  ]);
  await assert.rejects(
    driver.fill({ selector: "#q", value: "chrome" }),
    (error) => {
      assert.match(error.message, /opened the page in the front browser/);
      assert.equal(error.code, "BROWSER_BLOCKED");
      assert.equal(error.details.reason, "front_chrome_uncontrolled");
      assert.equal(error.details.previousReason, "chrome_profile_handoff_unsupported_action");
      assert.equal(error.details.action, "fill");
      assert.equal(error.details.currentUrl, "https://douyin.com/");
      return true;
    }
  );
});

test("hands front Chrome actions to an extension executor", async () => {
  const calls = [];
  const executorCalls = [];
  const driver = createChromeProfileHandoffDriver({
    browserChannel: "chrome",
    profileDirectory: "Profile 2",
    opener: async (command, args, options) => {
      calls.push({ command, args, options });
    },
    executor: {
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

  await driver.goto({ url: "https://douyin.com", timeoutMs: 7000 });
  const result = await driver.fill({ selector: "#q", value: "chrome", timeoutMs: 1200 });

  assert.equal(calls.length, 1);
  assert.equal(executorCalls.length, 1);
  assert.equal(executorCalls[0].payload.action, "fill");
  assert.equal(executorCalls[0].payload.currentUrl, "https://douyin.com/");
  assert.equal(executorCalls[0].payload.params.selector, "#q");
  assert.equal(executorCalls[0].payload.params.value, "chrome");
  assert.equal(executorCalls[0].options.timeoutMs, 1200);
  assert.equal(result.via, "chrome-extension-executor");
  assert.equal(result.actualValue, "chrome");
});

test("hands front Chrome session checks to an extension executor", async () => {
  const executorCalls = [];
  const driver = createChromeProfileHandoffDriver({
    browserChannel: "chrome",
    profileDirectory: "Profile 2",
    opener: async () => {},
    executor: {
      async run(payload, options) {
        executorCalls.push({ payload, options });
        return {
          loginState: "authenticated",
          accountLabel: "家具运营号",
          value: { loginState: "authenticated", accountLabel: "家具运营号" }
        };
      }
    }
  });

  await driver.goto({ url: "https://douyin.com", timeoutMs: 7000 });
  const result = await driver.checkSession({
    accountSelector: ".account-name",
    loggedOutSelector: ".login-button",
    timeoutMs: 1200
  });

  assert.equal(executorCalls.length, 1);
  assert.equal(executorCalls[0].payload.action, "checkSession");
  assert.equal(executorCalls[0].payload.params.accountSelector, ".account-name");
  assert.equal(result.via, "chrome-extension-executor");
  assert.equal(result.value.accountLabel, "家具运营号");
});

test("hands front Chrome actions to a native AppleScript executor when the extension is inactive", async () => {
  const calls = [];
  const nativeCalls = [];
  const driver = createChromeProfileHandoffDriver({
    browserChannel: "chrome",
    profileDirectory: "Profile 2",
    opener: async (command, args, options) => {
      calls.push({ command, args, options });
    },
    executor: {
      status() {
        return { lastSeenAt: null };
      },
      async run() {
        throw new Error("extension should be skipped");
      }
    },
    nativeExecutor: {
      async run(payload, options) {
        nativeCalls.push({ payload, options });
        return {
          via: "mac-chrome-applescript",
          actualValue: payload.params.value,
          target: { selector: payload.params.selector, count: 1, visibleCount: 1 }
        };
      }
    }
  });

  await driver.goto({ url: "https://douyin.com", timeoutMs: 7000 });
  const result = await driver.fill({ selector: "#q", value: "chrome", timeoutMs: 1200 });

  assert.equal(calls.length, 1);
  assert.equal(nativeCalls.length, 1);
  assert.equal(nativeCalls[0].payload.action, "fill");
  assert.equal(nativeCalls[0].payload.currentUrl, "https://douyin.com/");
  assert.equal(nativeCalls[0].payload.params.selector, "#q");
  assert.equal(result.via, "mac-chrome-applescript");
  assert.equal(result.actualValue, "chrome");
});

test("reports disabled Chrome Apple Events JavaScript from the native executor", async () => {
  const executor = createMacChromeAppleScriptExecutor({
    osascript: async () => {
      const error = new Error("execution error: JavaScript through Apple Events is turned off");
      error.stderr = "JavaScript through Apple Events is turned off";
      throw error;
    }
  });

  if (!executor) return;

  await assert.rejects(
    executor.run({
      action: "fill",
      currentUrl: "https://douyin.com/",
      params: { selector: "#q", value: "chrome", timeoutMs: 1000 }
    }, { timeoutMs: 1000 }),
    (error) => {
      assert.equal(error.code, "BROWSER_BLOCKED");
      assert.equal(error.details.reason, "front_chrome_javascript_disabled");
      return true;
    }
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

test("checks session state and writes templated outputs", async () => {
  const workflow = defineWorkflow({
    name: "session-and-template-output-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/inbox" },
      {
        id: "checkSession",
        action: "checkSession",
        accountSelector: ".account-name",
        loggedOutSelector: ".login-button",
        name: "session"
      },
      { id: "extractMessage", action: "extract", selector: ".latest-message", name: "latestMessage" },
      { id: "draftReply", action: "setOutput", name: "replyDraft", value: "已收到：{{outputs.latestMessage}}" },
      { id: "fillReply", action: "fill", selector: ".reply-box", value: "{{outputs.replyDraft}}" }
    ]
  });
  const driver = createDryRunDriver({
    pages: {
      "https://example.local/inbox": {
        selectors: {
          ".account-name": { text: "家具运营号" },
          ".latest-message": { text: "今天下午发货吗？" },
          ".reply-box": { value: "" }
        }
      }
    }
  });
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  const result = await runner.run(workflow);

  assert.deepEqual(result.outputs.session, {
    loginState: "authenticated",
    accountLabel: "家具运营号"
  });
  assert.equal(result.outputs.replyDraft, "已收到：今天下午发货吗？");
  assert.deepEqual(driver.log.map((item) => item.action), [
    "goto",
    "checkSession",
    "extract",
    "fill"
  ]);
});

test("blocks session checks when a logged-out marker is visible", async () => {
  const workflow = defineWorkflow({
    name: "session-logged-out-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/inbox" },
      {
        id: "checkSession",
        action: "checkSession",
        accountSelector: ".account-name",
        loggedOutSelector: ".login-button",
        name: "session"
      }
    ]
  });
  const runner = new WebOpsRunner({
    driver: createDryRunDriver({
      pages: {
        "https://example.local/inbox": {
          selectors: {
            ".login-button": { text: "登录" }
          }
        }
      }
    }),
    evidenceStore: createMemoryEvidenceStore()
  });

  await assert.rejects(
    runner.run(workflow),
    (error) => {
      assert.equal(error.code, "BROWSER_BLOCKED");
      assert.equal(error.details.reason, "login_required");
      return true;
    }
  );
});

test("extracts structured lists, details, and media into workflow outputs", async () => {
  const workflow = defineWorkflow({
    name: "structured-extraction-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/search" },
      {
        id: "extractCards",
        action: "extractList",
        selector: ".result-card",
        name: "candidates",
        fields: {
          title: { selector: ".title" },
          price: { selector: ".price", type: "number" },
          imageUrl: { selector: "img", mode: "attribute", attribute: "src", type: "url" },
          detailUrl: { selector: "a", mode: "attribute", attribute: "href", type: "url" }
        }
      },
      {
        id: "extractDetail",
        action: "extractDetail",
        name: "detail",
        fields: {
          title: { selector: ".detail-title" },
          description: { selector: ".description" }
        }
      },
      {
        id: "extractMedia",
        action: "extractMedia",
        selector: ".media",
        name: "media",
        sources: ["src", "poster"]
      },
      { id: "assertTitle", action: "assertOutput", path: "outputs.candidates.0.title", name: "candidates", includes: "storage" }
    ]
  });
  const driver = createDryRunDriver({
    pages: {
      "https://example.local/search": {
        selectors: {
          ".result-card": {
            items: [
              {
                selectors: {
                  ".title": { text: "Clear storage case supplier" },
                  ".price": { text: "$12.50" },
                  "img": { tagName: "img", attributes: { src: "/images/storage-case.jpg", alt: "Storage case" } },
                  "a": { attributes: { href: "/detail/storage-case" } }
                }
              },
              {
                selectors: {
                  ".title": { text: "Stackable organizer" },
                  ".price": { text: "$8" },
                  "img": { tagName: "img", attributes: { src: "https://cdn.example.local/organizer.jpg" } },
                  "a": { attributes: { href: "https://example.local/detail/organizer" } }
                }
              }
            ]
          },
          ".detail-title": { text: "Clear storage case supplier" },
          ".description": { text: "Transparent stackable storage case." },
          ".media": {
            tagName: "img",
            attributes: {
              src: "/images/detail-storage-case.jpg",
              alt: "Detail image",
              width: "640",
              height: "480"
            }
          }
        }
      }
    }
  });
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  const result = await runner.run(workflow);

  assert.equal(result.outputs.candidates.length, 2);
  assert.equal(result.outputs.candidates[0].price, 12.5);
  assert.equal(result.outputs.candidates[0].imageUrl, "https://example.local/images/storage-case.jpg");
  assert.equal(result.outputs.candidates[0].detailUrl, "https://example.local/detail/storage-case");
  assert.deepEqual(result.outputs.detail, {
    title: "Clear storage case supplier",
    description: "Transparent stackable storage case."
  });
  assert.equal(result.outputs.media[0].url, "https://example.local/images/detail-storage-case.jpg");
  assert.deepEqual(driver.log.map((item) => item.action), [
    "goto",
    "extractList",
    "extractDetail",
    "extractMedia"
  ]);
});

test("paginates through configured next links", async () => {
  const workflow = defineWorkflow({
    name: "pagination-test",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/page-1" },
      { id: "paginate", action: "paginate", nextSelector: "#next", maxPages: 3, name: "visitedPages" }
    ]
  });
  const driver = createDryRunDriver({
    pages: {
      "https://example.local/page-1": {
        selectors: {
          "#next": { attributes: { href: "/page-2" } }
        }
      },
      "https://example.local/page-2": {
        selectors: {
          "#next": { attributes: { href: "/page-3" } }
        }
      },
      "https://example.local/page-3": {
        selectors: {}
      }
    }
  });
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  const result = await runner.run(workflow);

  assert.deepEqual(result.outputs.visitedPages, [
    "https://example.local/page-2",
    "https://example.local/page-3"
  ]);
  assert.deepEqual(driver.log.map((item) => item.action), ["goto", "paginate"]);
});

test("defines adapter packs with reusable dry-run fixtures", async () => {
  const adapter = defineAdapter({
    id: "demo-marketplace",
    name: "Demo Marketplace",
    registry: createRegistryPack({
      sites: [{ id: "demo-site", name: "Demo Site", baseUrl: "https://example.local" }],
      pages: [{ id: "demo-search", siteId: "demo-site", name: "Search", urlPattern: "https://example.local/search" }],
      actions: [{ id: "demo-read-cards", siteId: "demo-site", pageId: "demo-search", name: "Read Cards", actionType: "extractList", selector: ".result-card" }],
      operations: [{ id: "demo-keyword-search", siteId: "demo-site", name: "Keyword Search", actionIds: ["demo-read-cards"] }]
    }),
    fixtures: {
      search: {
        pages: {
          "https://example.local/search": {
            selectors: {
              ".result-card": {
                items: [
                  { selectors: { ".title": { text: "Adapter storage result" } } }
                ]
              }
            }
          }
        }
      }
    }
  });
  const workflow = defineWorkflow({
    name: "adapter-fixture-workflow",
    steps: [
      { id: "open", action: "goto", url: "https://example.local/search" },
      {
        id: "extractCards",
        action: "extractList",
        selector: ".result-card",
        name: "cards",
        fields: { title: { selector: ".title" } }
      }
    ]
  });
  const driver = createDryRunDriver(createFixtureDriverConfig(adapter, "search"));
  const runner = new WebOpsRunner({ driver, evidenceStore: createMemoryEvidenceStore() });

  const result = await runner.run(workflow);

  assert.equal(adapter.registry.operations[0].id, "demo-keyword-search");
  assert.equal(result.outputs.cards[0].title, "Adapter storage result");
});

test("installs adapter registry packs into the Studio store", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "webops-adapter-store-"));
  try {
    const store = new StudioStore({ dir });
    await store.init();
    const adapter = defineAdapter({
      id: "installable-demo",
      registry: createRegistryPack({
        sites: [{ id: "installable-site", name: "Installable Site", baseUrl: "https://installable.example" }]
      }),
      workflows: [
        {
          id: "installable-workflow",
          name: "Installable workflow",
          workflow: {
            name: "installable-workflow",
            steps: [{ id: "done", action: "checkpoint", label: "done" }]
          }
        }
      ]
    });

    const result = await import("../src/index.mjs").then(({ installAdapterToStore }) => installAdapterToStore({ adapter, store }));
    const registry = await store.getRegistry();
    const workflow = await store.getWorkflow("installable-workflow");

    assert.equal(result.imported.sites, 1);
    assert.ok(registry.sites.some((site) => site.id === "installable-site"));
    assert.equal(workflow.name, "Installable workflow");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
