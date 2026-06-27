import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { BrowserActionError } from "../errors.mjs";

export function createChromeProfileHandoffDriver({
  browserChannel = "chrome",
  profileDirectory = null,
  opener = spawnDetached
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
    waitFor: unsupported("waitFor", () => currentUrl),
    click: unsupported("click", () => currentUrl),
    fill: unsupported("fill", () => currentUrl),
    press: unsupported("press", () => currentUrl),
    extract: unsupported("extract", () => currentUrl),
    extractList: unsupported("extractList", () => currentUrl),
    extractDetail: unsupported("extractDetail", () => currentUrl),
    extractMedia: unsupported("extractMedia", () => currentUrl),
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

function unsupported(action, getCurrentUrl) {
  return async () => {
    throw new BrowserActionError(
      `Chrome profile handoff opened the page in the front browser, but action ${action} requires CDP, the extension executor, or an isolated Playwright profile.`,
      {
        code: "BROWSER_ACTION_ERROR",
        details: {
          reason: "chrome_profile_handoff_unsupported_action",
          action,
          currentUrl: getCurrentUrl?.() ?? null
        }
      }
    );
  };
}
