import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { BrowserActionError } from "../errors.mjs";
import { createPlaywrightDriver } from "../drivers/playwright-driver.mjs";
import { applyProfileNetworkToLaunchOptions, normalizeProfileNetwork, profileNetworkArgs } from "./profile-network.mjs";

const DEFAULT_LOGIN_URL = "about:blank";

export async function probeProfileSession({ profile, overrides = {}, clock = () => new Date() } = {}) {
  if (!profile) throw new Error("probeProfileSession requires profile");
  const sessionCheck = normalizeSessionCheck(profile, overrides);
  const mode = overrides.mode ?? profile.mode ?? "dry-run";

  if (mode === "playwright") {
    return probePlaywrightSession({ profile, sessionCheck, overrides, clock });
  }

  const accountLabel = overrides.accountLabel ?? profile.accountLabel ?? profile.name ?? "";
  return {
    platform: sessionCheck.platform,
    accountLabel,
    loginState: accountLabel ? "authenticated" : "unknown",
    lastCheckedAt: clock().toISOString(),
    sessionCheck,
    details: {
      mode,
      source: "dry-run",
      message: "Dry-run session probes use configured profile metadata."
    }
  };
}

export async function openProfileLoginWindow({ profile, overrides = {}, opener = spawnDetached, profileBrowserSessions = null, clock = () => new Date() } = {}) {
  if (!profile) throw new Error("openProfileLoginWindow requires profile");
  if (profileBrowserSessions?.open) {
    return profileBrowserSessions.open({ profile, overrides });
  }
  const mode = overrides.mode ?? profile.mode ?? "dry-run";
  if (mode !== "playwright") {
    const error = new Error("Only Playwright browser profiles can be opened for manual login");
    error.statusCode = 400;
    throw error;
  }

  const profileDir = overrides.profileDir ?? profile.profileDir ?? "";
  if (!profileDir) {
    const error = new Error("Profile Dir is required to open a persistent login window");
    error.statusCode = 400;
    throw error;
  }

  const browserChannel = overrides.browserChannel ?? profile.browserChannel ?? "chrome";
  const profileDirectory = overrides.profileDirectory ?? profile.profileDirectory ?? "";
  const network = normalizeProfileNetwork(overrides, profile);
  const targetUrl = normalizeLoginUrl(
    overrides.url
      ?? overrides.sessionCheckUrl
      ?? overrides.targetUrl
      ?? profile.sessionCheck?.url
      ?? DEFAULT_LOGIN_URL
  );
  await mkdir(profileDir, { recursive: true });
  const command = browserExecutableForChannel(browserChannel);
  const args = loginWindowArgs({
    profileDir,
    profileDirectory,
    browserChannel,
    network,
    targetUrl
  });
  await opener(command, args);
  return {
    opened: true,
    mode,
    browserChannel,
    profileDir,
    profileDirectory,
    url: targetUrl,
    openedAt: clock().toISOString()
  };
}

function normalizeSessionCheck(profile, overrides) {
  const saved = profile.sessionCheck ?? {};
  return {
    platform: overrides.platform ?? profile.platform ?? saved.platform ?? "",
    url: overrides.url ?? overrides.sessionCheckUrl ?? saved.url ?? "",
    accountSelector: overrides.accountSelector ?? overrides.sessionCheckSelector ?? saved.accountSelector ?? "",
    loggedOutSelector: overrides.loggedOutSelector ?? saved.loggedOutSelector ?? "",
    timeoutMs: Number(overrides.timeoutMs ?? saved.timeoutMs ?? 10_000)
  };
}

async function probePlaywrightSession({ profile, sessionCheck, overrides, clock }) {
  if (!sessionCheck.url) {
    const error = new Error("Profile session check URL is required for Playwright profiles");
    error.statusCode = 400;
    throw error;
  }
  if (!profile.profileDir && !overrides.profileDir) {
    const error = new Error("Profile Dir is required to verify a persistent logged-in Playwright profile");
    error.statusCode = 400;
    throw error;
  }

  const driver = await createPlaywrightDriver({
    browserType: profile.browserType ?? "chromium",
    profileDir: overrides.profileDir ?? profile.profileDir,
    headless: Boolean(overrides.headless ?? profile.headless ?? false),
    launchOptions: createProfileLaunchOptions({ profile, overrides })
  });

  try {
    await driver.goto({ url: sessionCheck.url, timeoutMs: sessionCheck.timeoutMs });
    const loggedOutVisible = sessionCheck.loggedOutSelector
      ? await isVisible(driver, sessionCheck.loggedOutSelector, Math.min(1500, sessionCheck.timeoutMs))
      : false;
    const accountLabel = sessionCheck.accountSelector
      ? await extractOptional(driver, sessionCheck.accountSelector, sessionCheck.timeoutMs)
      : profile.accountLabel ?? "";

    const loginState = loggedOutVisible ? "logged-out" : accountLabel ? "authenticated" : "unknown";
    return {
      platform: sessionCheck.platform,
      accountLabel,
      loginState,
      lastCheckedAt: clock().toISOString(),
      sessionCheck,
      details: {
        mode: "playwright",
        source: "browser-profile",
        url: await driver.currentUrl?.()
      }
    };
  } finally {
    await driver.close?.();
  }
}

function createProfileLaunchOptions({ profile, overrides }) {
  const launchOptions = { ...(overrides.launchOptions ?? {}) };
  const browserChannel = overrides.browserChannel ?? profile.browserChannel;
  const profileDirectory = overrides.profileDirectory ?? profile.profileDirectory;
  if (browserChannel) launchOptions.channel = browserChannel;
  if (profileDirectory) {
    const args = Array.isArray(launchOptions.args) ? [...launchOptions.args] : [];
    const profileArg = `--profile-directory=${profileDirectory}`;
    const existingIndex = args.findIndex((arg) => String(arg).startsWith("--profile-directory="));
    if (existingIndex !== -1) args.splice(existingIndex, 1);
    args.unshift(profileArg);
    launchOptions.args = args;
    launchOptions.ignoreDefaultArgs = mergeIgnoreDefaultArgs(
      launchOptions.ignoreDefaultArgs,
      ["--disable-extensions"]
    );
  }
  return applyProfileNetworkToLaunchOptions(launchOptions, normalizeProfileNetwork(overrides, profile));
}

function mergeIgnoreDefaultArgs(currentValue, additionalValues) {
  if (currentValue === true) return true;
  const values = [
    ...(Array.isArray(currentValue) ? currentValue : []),
    ...additionalValues
  ].map(String).filter(Boolean);
  return values.length ? Array.from(new Set(values)) : undefined;
}

function normalizeLoginUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return DEFAULT_LOGIN_URL;
  if (value === "about:blank" || /^https?:\/\//i.test(value)) return value;
  const error = new Error("Login window URL must be http(s) or about:blank");
  error.statusCode = 400;
  throw error;
}

function browserExecutableForChannel(channel) {
  if (channel === "msedge") return "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
  if (channel === "chromium") return "/Applications/Chromium.app/Contents/MacOS/Chromium";
  return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}

function loginWindowArgs({ profileDir, profileDirectory, browserChannel, network, targetUrl }) {
  const args = profileNetworkArgs(network);
  if (shouldPassUserDataDir({ profileDir, profileDirectory, browserChannel })) {
    args.push(`--user-data-dir=${profileDir}`);
  }
  if (profileDirectory) args.push(`--profile-directory=${profileDirectory}`);
  args.push(targetUrl);
  return args;
}

function shouldPassUserDataDir({ profileDir, profileDirectory, browserChannel }) {
  if (!profileDir) return false;
  if (!profileDirectory) return true;
  return normalizePath(profileDir) !== normalizePath(defaultUserDataDirForChannel(browserChannel));
}

function defaultUserDataDirForChannel(channel) {
  if (channel === "msedge") return path.join(homedir(), "Library/Application Support/Microsoft Edge");
  if (channel === "chromium") return path.join(homedir(), "Library/Application Support/Chromium");
  return path.join(homedir(), "Library/Application Support/Google/Chrome");
}

function normalizePath(value) {
  return path.resolve(String(value ?? ""));
}

async function spawnDetached(command, args) {
  if (!existsSync(command)) {
    const error = new Error(`Browser executable not found: ${command}`);
    error.statusCode = 500;
    throw error;
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function extractOptional(driver, selector, timeoutMs) {
  try {
    const result = await driver.extract({ selector, mode: "text", timeoutMs });
    return String(result.value ?? "").trim();
  } catch (error) {
    if (error instanceof BrowserActionError || isRecoverableProbeError(error)) return "";
    throw error;
  }
}

async function isVisible(driver, selector, timeoutMs) {
  try {
    await driver.waitFor({ selector, state: "visible", timeoutMs });
    return true;
  } catch (error) {
    if (error instanceof BrowserActionError || isRecoverableProbeError(error)) return false;
    throw error;
  }
}

function isRecoverableProbeError(error) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "");
  return name.includes("Timeout") || message.includes("Timeout") || message.includes("waiting for");
}
