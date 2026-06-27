import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BrowserActionError } from "../errors.mjs";

const execFileAsync = promisify(execFile);

export function createChromeProfileHandoffDriver({
  browserChannel = "chrome",
  profileDirectory = null,
  opener = execFileAsync
} = {}) {
  const appName = appNameForChannel(browserChannel);
  let currentUrl = "about:blank";

  return {
    kind: "chrome-profile-handoff",
    async goto({ url, timeoutMs }) {
      const targetUrl = normalizeHttpUrl(url);
      const args = ["-a", appName, targetUrl];
      if (profileDirectory) {
        args.push("--args", `--profile-directory=${profileDirectory}`);
      }
      try {
        await opener("/usr/bin/open", args, {
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
        profileDirectory
      };
    },
    async currentUrl() {
      return currentUrl;
    },
    async close() {},
    waitFor: unsupported("waitFor"),
    click: unsupported("click"),
    fill: unsupported("fill"),
    press: unsupported("press"),
    extract: unsupported("extract"),
    extractList: unsupported("extractList"),
    extractDetail: unsupported("extractDetail"),
    extractMedia: unsupported("extractMedia"),
    paginate: unsupported("paginate"),
    screenshot: unsupported("screenshot"),
    apiCall: unsupported("apiCall")
  };
}

function appNameForChannel(channel) {
  if (channel === "msedge") return "Microsoft Edge";
  if (channel === "chromium") return "Chromium";
  return "Google Chrome";
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

function unsupported(action) {
  return async () => {
    throw new BrowserActionError(
      `Chrome profile handoff can only open URLs. Action ${action} requires CDP, the extension executor, or an isolated Playwright profile.`,
      {
        code: "BROWSER_ACTION_ERROR",
        details: {
          reason: "chrome_profile_handoff_unsupported_action",
          action
        }
      }
    );
  };
}
