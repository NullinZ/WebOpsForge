import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { BrowserActionError, BrowserBlockedError } from "../errors.mjs";

export function createChromeProfileHandoffDriver({
  browserChannel = "chrome",
  profileDirectory = null,
  opener = spawnDetached,
  executor = null,
  nativeExecutor = null
} = {}) {
  const appName = appNameForChannel(browserChannel);
  const handoffTarget = handoffTargetForChannel(browserChannel, { profileDirectory });
  let currentUrl = "about:blank";

  return {
    kind: "chrome-profile-handoff",
    async goto({ url, timeoutMs }) {
      const targetUrl = normalizeHttpUrl(url);
      const args = handoffArgs({ handoffTarget, appName, profileDirectory, targetUrl });
      try {
        await opener(handoffTarget.command, args, {
          timeout: Math.min(Number(timeoutMs ?? 5000) || 5000, 10_000)
        });
      } catch (error) {
        throw new BrowserActionError(`Failed to hand off URL to ${appName}: ${error.message}`, {
          code: "BROWSER_ACTION_ERROR",
          cause: error,
          details: {
            reason: "chrome_profile_handoff_failed",
            browserChannel,
            profileDirectory,
            url: targetUrl
          }
        });
      }
      await activateBrowser(appName).catch(() => {});
      currentUrl = targetUrl;
      return {
        url: targetUrl,
        handoff: true,
        browserChannel,
        appName,
        profileDirectory,
        handoffMethod: handoffTarget.method
      };
    },
    async currentUrl() {
      return currentUrl;
    },
    async close() {},
    waitFor: runViaExecutor("waitFor", () => currentUrl, executor, nativeExecutor),
    click: runViaExecutor("click", () => currentUrl, executor, nativeExecutor),
    fill: runViaExecutor("fill", () => currentUrl, executor, nativeExecutor),
    press: runViaExecutor("press", () => currentUrl, executor, nativeExecutor),
    extract: runViaExecutor("extract", () => currentUrl, executor, nativeExecutor),
    extractList: runViaExecutor("extractList", () => currentUrl, executor, nativeExecutor),
    extractDetail: runViaExecutor("extractDetail", () => currentUrl, executor, nativeExecutor),
    extractMedia: runViaExecutor("extractMedia", () => currentUrl, executor, nativeExecutor),
    checkSession: runViaExecutor("checkSession", () => currentUrl, executor, nativeExecutor),
    paginate: unsupported("paginate", () => currentUrl),
    screenshot: unsupported("screenshot", () => currentUrl),
    apiCall: unsupported("apiCall", () => currentUrl)
  };
}

function appNameForChannel(channel) {
  if (channel === "msedge") return "Microsoft Edge";
  if (channel === "chromium") return "Chromium";
  return "Google Chrome";
}

function handoffTargetForChannel(channel, { profileDirectory = null } = {}) {
  if (!profileDirectory) return { method: "mac-open", command: "/usr/bin/open" };
  if (channel === "msedge") {
    return {
      method: "browser-executable",
      command: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    };
  }
  if (channel === "chromium") {
    return {
      method: "browser-executable",
      command: "/Applications/Chromium.app/Contents/MacOS/Chromium"
    };
  }
  return {
    method: "browser-executable",
    command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  };
}

function handoffArgs({ handoffTarget, appName, profileDirectory, targetUrl }) {
  if (handoffTarget.method === "browser-executable") {
    const args = [];
    if (profileDirectory) args.push(`--profile-directory=${profileDirectory}`);
    args.push(targetUrl);
    return args;
  }
  return ["-a", appName, targetUrl];
}

async function spawnDetached(command, args) {
  if (!existsSync(command)) {
    throw new Error(`Browser executable not found: ${command}`);
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function activateBrowser(appName) {
  if (process.platform !== "darwin") return;
  await new Promise((resolve) => {
    const child = spawn("/usr/bin/osascript", ["-e", `tell application "${String(appName).replace(/"/g, '\\"')}" to activate`], {
      stdio: "ignore"
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve();
    }, 1000);
    child.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function normalizeHttpUrl(url) {
  const parsed = new URL(String(url ?? ""));
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new BrowserActionError(`Chrome handoff only supports http/https URLs: ${url}`, {
      code: "ACTION_VALIDATION_ERROR",
      details: { reason: "unsupported_url", url }
    });
  }
  return parsed.toString();
}

function runViaExecutor(action, getCurrentUrl, executor, nativeExecutor) {
  return async (params = {}) => {
    const currentUrl = getCurrentUrl?.() ?? null;
    if (executor?.run && shouldUseExtensionExecutor(executor)) {
      try {
        const result = await executor.run({
          action,
          currentUrl,
          params
        }, {
          timeoutMs: params.timeoutMs
        });
        return {
          ...result,
          via: result?.via ?? "chrome-extension-executor",
          action,
          currentUrl: result?.url ?? currentUrl
        };
      } catch (error) {
        if (!nativeExecutor?.run || !isExtensionUnavailable(error)) throw error;
      }
    }
    if (nativeExecutor?.run) {
      return nativeExecutor.run({ action, currentUrl, params }, { timeoutMs: params.timeoutMs });
    }
    throw unsupportedActionError(action, currentUrl);
  };
}

function shouldUseExtensionExecutor(executor) {
  if (typeof executor.status !== "function") return true;
  const status = executor.status();
  if (!status?.lastSeenAt) return false;
  const lastSeenMs = new Date(status.lastSeenAt).getTime();
  return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < 5000;
}

function isExtensionUnavailable(error) {
  const reason = String(error?.reason ?? error?.details?.reason ?? "");
  return reason === "front_chrome_executor_unavailable";
}

function unsupported(action, getCurrentUrl) {
  return async () => {
    throw unsupportedActionError(action, getCurrentUrl?.() ?? null);
  };
}

function unsupportedActionError(action, currentUrl) {
  return new BrowserBlockedError(
    `Chrome profile handoff opened the page in the front browser, but action ${action} requires the WebOps Forge Picker extension executor, CDP, or an isolated Playwright profile.`,
    {
      reason: "front_chrome_uncontrolled",
      recoverable: true,
      details: {
        previousReason: "chrome_profile_handoff_unsupported_action",
        action,
        currentUrl
      }
    }
  );
}
