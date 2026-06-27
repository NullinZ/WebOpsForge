import { createFileEvidenceStore } from "../evidence.mjs";
import { WebOpsRunner } from "../runner.mjs";
import { createRateLimiter } from "../rate-limit.mjs";
import { createDryRunDriver } from "../drivers/dry-run-driver.mjs";
import { createPlaywrightDriver } from "../drivers/playwright-driver.mjs";
import { createChromeProfileHandoffDriver } from "../drivers/chrome-profile-handoff-driver.mjs";
import { classifyRunFailure } from "../blocked-state.mjs";

const DEFAULT_HUMAN_TIMING = {
  minDelayMs: 800,
  maxDelayMs: 2200
};

export function createRunQueue({ store, concurrency = 1, clock = () => new Date(), chromeHandoffOpener = null }) {
  const pending = [];
  const active = new Set();
  const controllers = new Map();

  return {
    enqueue(runId) {
      if (!pending.includes(runId) && !active.has(runId)) {
        pending.push(runId);
      }
      void drain();
    },
    async cancel(runId, reason = "operator") {
      const pendingIndex = pending.indexOf(runId);
      if (pendingIndex !== -1) {
        pending.splice(pendingIndex, 1);
        return store.cancelRun(runId, reason);
      }
      const controller = controllers.get(runId);
      if (controller) {
        controller.abort(reason);
        return store.cancelRun(runId, reason);
      }
      return store.cancelRun(runId, reason);
    },
    status() {
      return {
        pending: pending.length,
        active: active.size,
        concurrency,
        activeRunIds: Array.from(active),
        pendingRunIds: pending.slice()
      };
    }
  };

  async function drain() {
    while (active.size < concurrency && pending.length > 0) {
      const runId = pending.shift();
      active.add(runId);
      const controller = new AbortController();
      controllers.set(runId, controller);
      void execute(runId).finally(() => {
        active.delete(runId);
        controllers.delete(runId);
        void drain();
      });
    }
  }

  async function execute(runId) {
    const run = await store.getRun(runId);
    if (!run) return;
    if (run.status === "canceled" || run.status === "cancel_requested") {
      await store.updateRun(runId, {
        status: "canceled",
        completedAt: clock().toISOString()
      });
      return;
    }
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
    let leasedProfile = null;
    await store.updateRun(runId, {
      status: "running",
      startedAt: startedAt.toISOString()
    });

    const evidenceStore = createFileEvidenceStore({ dir: store.getRunDirFor(runId) });
    let driver = null;
    try {
      leasedProfile = await store.leaseProfile(run.profileId, runId);
      driver = await createDriver(run, leasedProfile, { chromeHandoffOpener });
      const rateLimiter = createRunRateLimiter(run, leasedProfile);
      const runner = new WebOpsRunner({ driver, evidenceStore, rateLimiter, clock });
      const result = await runner.run(run.workflowOverride ?? workflowRecord.workflow, {
        input: run.input,
        context: run.context,
        runId,
        abortSignal: controllers.get(runId)?.signal ?? null
      });
      const completedAt = clock();
      await runner.close();
      await store.updateRun(runId, {
        status: "completed",
        outputs: result.outputs,
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime()
      });
      await store.releaseProfile(run.profileId, runId, "ready");
    } catch (error) {
      const completedAt = clock();
      const classification = classifyRunFailure(error);
      await driver?.close?.().catch(() => {});
      await store.releaseProfile(run.profileId, runId, classification.profileStatus);
      await store.updateRun(runId, {
        status: classification.runStatus,
        error: serializeError(error, classification),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime()
      });
    }
  }
}

async function createDriver(run, profile = null, { chromeHandoffOpener = null } = {}) {
  const mergedConfig = mergeDriverConfig(run.driverConfig ?? {}, profile);
  if (run.mode === "playwright" || profile?.mode === "playwright") {
    if (shouldUseChromeProfileHandoff(run, profile)) {
      return createChromeProfileHandoffDriver({
        browserChannel: profile.browserChannel,
        profileDirectory: profile.profileDirectory,
        opener: chromeHandoffOpener ?? undefined
      });
    }
    return createPlaywrightDriver(mergedConfig);
  }
  return createDryRunDriver(mergedConfig);
}

function shouldUseChromeProfileHandoff(run, profile) {
  if (run.driverConfig?.chromeHandoff !== "front-window") return false;
  if (process.platform !== "darwin") return false;
  if (run.debug?.mode !== "run-to-node") return false;
  if (!profile?.profileDirectory) return false;
  if (!["chrome", "chromium", "msedge"].includes(String(profile.browserChannel || "chrome"))) return false;
  return isGotoOnlyWorkflow(run.workflowOverride);
}

function isGotoOnlyWorkflow(workflow) {
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  if (!steps.length) return false;
  return steps.every((step) => step?.action === "goto" || step?.action === "checkpoint");
}

function mergeDriverConfig(driverConfig, profile) {
  if (!profile) return driverConfig;
  if (profile.mode === "playwright") {
    const profileLaunchOptions = {};
    if (profile.browserChannel) profileLaunchOptions.channel = profile.browserChannel;
    if (profile.profileDirectory) {
      profileLaunchOptions.args = [`--profile-directory=${profile.profileDirectory}`];
      profileLaunchOptions.ignoreDefaultArgs = mergeIgnoreDefaultArgs(
        profileLaunchOptions.ignoreDefaultArgs,
        ["--disable-extensions"]
      );
    }
    return {
      browserType: profile.browserType ?? "chromium",
      profileDir: profile.profileDir || driverConfig.profileDir || null,
      headless: Boolean(profile.headless),
      ...driverConfig,
      launchOptions: mergeLaunchOptions(profileLaunchOptions, driverConfig.launchOptions)
    };
  }
  return driverConfig;
}

function mergeLaunchOptions(profileOptions = {}, runOptions = {}) {
  const merged = { ...profileOptions, ...runOptions };
  const args = [
    ...(Array.isArray(profileOptions.args) ? profileOptions.args : []),
    ...(Array.isArray(runOptions.args) ? runOptions.args : [])
  ];
  merged.args = dedupeProfileDirectoryArgs(args);
  merged.ignoreDefaultArgs = mergeIgnoreDefaultArgs(profileOptions.ignoreDefaultArgs, runOptions.ignoreDefaultArgs);
  return merged;
}

function mergeIgnoreDefaultArgs(profileValue, runValue) {
  if (profileValue === true || runValue === true) return true;
  const values = [
    ...(Array.isArray(profileValue) ? profileValue : []),
    ...(Array.isArray(runValue) ? runValue : [])
  ].map(String).filter(Boolean);
  return values.length ? Array.from(new Set(values)) : undefined;
}

function dedupeProfileDirectoryArgs(args) {
  const result = [];
  for (const arg of args) {
    if (String(arg).startsWith("--profile-directory=")) {
      const existingIndex = result.findIndex((item) => String(item).startsWith("--profile-directory="));
      if (existingIndex !== -1) result.splice(existingIndex, 1);
    }
    result.push(arg);
  }
  return result;
}

function createRunRateLimiter(run, profile = null) {
  const timing = resolveHumanTiming(run, profile);
  if (!timing.enabled && !timing.maxPerMinute) return null;
  return createRateLimiter({
    minDelayMs: timing.enabled ? timing.minDelayMs : 0,
    maxDelayMs: timing.enabled ? timing.maxDelayMs : 0,
    maxPerMinute: timing.maxPerMinute
  });
}

function resolveHumanTiming(run, profile = null) {
  const raw = run.driverConfig?.humanTiming;
  const rawObject = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const isPlaywright = run.mode === "playwright" || profile?.mode === "playwright";
  const explicitEnabled = typeof raw === "boolean" ? raw : rawObject.enabled;
  const enabled = explicitEnabled == null ? isPlaywright : Boolean(explicitEnabled);
  const profileRateLimit = profile?.rateLimit ?? {};
  const fixedDelay = typeof raw === "number" ? raw : null;
  const configuredMin = fixedDelay ?? rawObject.minDelayMs;
  const profileMin = numberOrNull(profileRateLimit.minDelayMs);
  const minDelayMs = enabled
    ? normalizeDelay(configuredMin ?? (profileMin && profileMin > 0 ? profileMin : DEFAULT_HUMAN_TIMING.minDelayMs), DEFAULT_HUMAN_TIMING.minDelayMs)
    : 0;
  const configuredMax = fixedDelay ?? rawObject.maxDelayMs ?? profileRateLimit.maxDelayMs;
  const maxDelayMs = enabled
    ? Math.max(minDelayMs, normalizeDelay(configuredMax ?? DEFAULT_HUMAN_TIMING.maxDelayMs, DEFAULT_HUMAN_TIMING.maxDelayMs))
    : 0;
  const maxPerMinute = rawObject.maxPerMinute ?? profileRateLimit.maxPerMinute ?? null;
  return {
    enabled,
    minDelayMs,
    maxDelayMs,
    maxPerMinute
  };
}

function normalizeDelay(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function serializeError(error, classification = classifyRunFailure(error)) {
  return {
    name: error.name ?? "Error",
    code: error.code ?? "ERROR",
    message: error.message ?? String(error),
    stepId: error.stepId ?? null,
    details: {
      ...(error.details ?? {}),
      blockedState: classification.state,
      recoveryHint: classification.recoveryHint,
      recoverable: classification.recoverable
    }
  };
}
