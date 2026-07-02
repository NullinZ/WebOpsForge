import { readFile } from "node:fs/promises";

const DEFAULT_STUDIO = "http://127.0.0.1:4177";
const DEFAULT_PROFILE_ID = "chrome-default";
const SMOKE_WORKFLOW_ID = "live-douyin-local-chrome-clicktext-smoke";
const EXPECTED_EXTENSION_VERSION = await readExpectedExtensionVersion();

const args = parseArgs(process.argv.slice(2));
const studio = String(args.studio ?? DEFAULT_STUDIO).replace(/\/+$/, "");
const profileId = String(args.profile ?? DEFAULT_PROFILE_ID);
const waitSeconds = Number(args.wait ?? 0);
const runSmoke = Boolean(args["run-smoke"]);

if (args.help) {
  printHelp();
  process.exit(0);
}

const report = {
  studio,
  profileId,
  checkedAt: new Date().toISOString(),
  health: null,
  extensionExecutor: null,
  expectedExtensionVersion: EXPECTED_EXTENSION_VERSION,
  profile: null,
  ready: false,
  smoke: null,
  nextAction: null
};

try {
  report.health = await request("/api/health");
  report.profile = await findProfile(profileId);
  report.extensionExecutor = await waitForExtensionExecutor({ seconds: waitSeconds });
  report.ready = isReadyExecutor(report.extensionExecutor);

  if (!report.ready) {
    report.nextAction = extensionNextAction(report.extensionExecutor);
    printReport(report);
    process.exit(2);
  }

  if (runSmoke) {
    report.smoke = await runClickTextSmoke({ profileId });
    if (report.smoke.status !== "completed") {
      report.nextAction = "Inspect the smoke run events and refresh the visible-text target or Chrome profile state.";
      printReport(report);
      process.exit(3);
    }
  }

  report.nextAction = runSmoke
    ? "Front Chrome clickText smoke completed. Continue by picking message-list selectors and running the DM workflow to approval."
    : "Extension executor is ready. Rerun with --run-smoke to verify the Douyin private-message entry click.";
  printReport(report);
} catch (error) {
  report.error = {
    message: error.message,
    code: error.code ?? "ERROR"
  };
  report.nextAction = "Start Studio on the configured URL and reload the Chrome extension before retrying.";
  printReport(report);
  process.exit(1);
}

async function findProfile(id) {
  const body = await request("/api/profiles");
  const profile = (body.profiles ?? []).find((item) => item.id === id);
  if (!profile) {
    const error = new Error(`Profile not found: ${id}`);
    error.code = "PROFILE_NOT_FOUND";
    throw error;
  }
  return {
    id: profile.id,
    name: profile.name,
    mode: profile.mode,
    browserChannel: profile.browserChannel,
    profileDirectory: profile.profileDirectory,
    status: profile.status,
    loginState: profile.loginState ?? null
  };
}

async function waitForExtensionExecutor({ seconds }) {
  const deadline = Date.now() + Math.max(0, seconds) * 1000;
  let status = await executorStatus();
  while (!isReadyExecutor(status) && Date.now() < deadline) {
    await sleep(1000);
    status = await executorStatus();
  }
  return status;
}

async function executorStatus() {
  const status = await request("/api/extension-executor/status");
  return {
    ...status,
    fresh: isFreshExecutor(status),
    versionMatches: status?.lastSeenBy?.version === EXPECTED_EXTENSION_VERSION,
    expectedVersion: EXPECTED_EXTENSION_VERSION,
    ageMs: executorAgeMs(status)
  };
}

function isFreshExecutor(status) {
  const ageMs = executorAgeMs(status);
  return ageMs != null && ageMs < 15_000;
}

function isReadyExecutor(status) {
  return Boolean(status?.fresh && status?.versionMatches);
}

function executorAgeMs(status) {
  if (!status?.lastSeenAt) return null;
  const lastSeenMs = new Date(status.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) return null;
  return Date.now() - lastSeenMs;
}

async function readExpectedExtensionVersion() {
  const manifest = JSON.parse(await readFile(new URL("../apps/picker-extension/manifest.json", import.meta.url), "utf8"));
  return String(manifest.version ?? "");
}

function extensionNextAction(status) {
  if (!status?.lastSeenAt) {
    return "Reload the unpacked WebOps Forge Picker extension in Chrome, then rerun this preflight.";
  }
  if (!status.versionMatches) {
    return `Reload the unpacked WebOps Forge Picker extension. Studio sees version ${status.lastSeenBy?.version || "unknown"}, but local files expect ${EXPECTED_EXTENSION_VERSION}.`;
  }
  return "Wait for a fresh WebOps Forge Picker heartbeat, then rerun this preflight.";
}

async function runClickTextSmoke({ profileId }) {
  await request("/api/workflows", {
    method: "POST",
    body: {
      id: SMOKE_WORKFLOW_ID,
      name: "Live Douyin local Chrome clickText smoke",
      description: "Read-only smoke for front Chrome handoff and clickText private-message entry.",
      workflow: {
        name: "live-douyin-local-chrome-clicktext-smoke",
        version: "0.1.0",
        defaults: { timeoutMs: 20_000, screenshot: "off" },
        steps: [
          { id: "openDouyin", action: "goto", url: "https://www.douyin.com/" },
          { id: "bodyReady", action: "waitFor", selector: "body", state: "visible", timeoutMs: 20_000 },
          { id: "openMessages", action: "clickText", text: "私信", exact: true, timeoutMs: 20_000 },
          { id: "afterDmClickReady", action: "waitFor", selector: "body", state: "visible", timeoutMs: 10_000 }
        ]
      }
    }
  });

  const created = await request(`/api/workflows/${encodeURIComponent(SMOKE_WORKFLOW_ID)}/runs`, {
    method: "POST",
    body: {
      mode: "playwright",
      profileId,
      driverConfig: {
        chromeHandoff: "front-window",
        closeDelayMs: false,
        humanTiming: { enabled: false }
      }
    }
  });
  const runId = created.run?.id;
  if (!runId) throw new Error("Studio did not return a run id for smoke workflow.");

  let detail = null;
  for (let index = 0; index < 90; index += 1) {
    await sleep(1000);
    detail = await request(`/api/runs/${encodeURIComponent(runId)}`);
    const status = detail.run?.status;
    if (status && !["queued", "running", "pending"].includes(status)) break;
  }

  const run = detail?.run ?? {};
  return {
    id: runId,
    status: run.status ?? "unknown",
    error: run.error ? summarizeError(run.error) : null,
    events: summarizeSmokeEvents(detail?.events ?? [])
  };
}

function summarizeSmokeEvents(events) {
  return events
    .filter((event) => event.type === "step.completed" || event.type === "step.failed")
    .map((event) => ({
      type: event.type,
      stepId: event.stepId,
      action: event.action,
      via: event.result?.via,
      handoff: event.result?.handoff,
      url: event.result?.url,
      currentUrl: event.result?.currentUrl,
      target: event.result?.target ? {
        strategy: event.result.target.strategy,
        selector: event.result.target.selector,
        count: event.result.target.count,
        visibleCount: event.result.target.visibleCount,
        score: event.result.target.score,
        secondScore: event.result.target.secondScore,
        clickTagName: event.result.target.clickTagName
      } : null,
      error: event.error ? summarizeError(event.error) : null
    }));
}

function summarizeError(error) {
  return {
    message: error.message,
    reason: error.details?.reason ?? error.reason ?? null,
    details: error.details ? {
      action: error.details.action,
      currentUrl: error.details.currentUrl,
      blockedState: error.details.blockedState,
      recoverable: error.details.recoverable
    } : null
  };
}

async function request(path, { method = "GET", body = null } = {}) {
  const response = await fetch(`${studio}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(payload.error?.message || `${response.status} ${response.statusText}`);
    error.code = payload.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (["run-smoke", "help"].includes(key)) {
      parsed[key] = true;
    } else {
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function printReport(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`Usage: node examples/douyin-live-preflight.mjs [options]

Options:
  --studio URL       Studio origin. Default: ${DEFAULT_STUDIO}
  --profile ID      Studio profile id. Default: ${DEFAULT_PROFILE_ID}
  --wait SECONDS    Wait for a fresh extension executor heartbeat.
  --run-smoke       Run a read-only Douyin clickText smoke after preflight passes.
  --help            Show this help.
`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
