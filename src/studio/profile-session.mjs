import { BrowserActionError } from "../errors.mjs";
import { createPlaywrightDriver } from "../drivers/playwright-driver.mjs";

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
    headless: Boolean(overrides.headless ?? profile.headless ?? false)
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
