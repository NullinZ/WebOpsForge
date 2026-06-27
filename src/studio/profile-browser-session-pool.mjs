import { createPlaywrightDriver } from "../drivers/playwright-driver.mjs";

const DEFAULT_LOGIN_URL = "about:blank";

export function createProfileBrowserSessionPool({ clock = () => new Date() } = {}) {
  const sessions = new Map();

  return {
    status() {
      return {
        active: sessions.size,
        sessions: Array.from(sessions.values()).map((session) => sessionSummary(session))
      };
    },

    async open({ profile, overrides = {} } = {}) {
      const config = normalizeProfileConfig(profile, overrides);
      const session = await ensureSession(config);
      const targetUrl = normalizeLoginUrl(
        overrides.url
          ?? overrides.sessionCheckUrl
          ?? overrides.targetUrl
          ?? profile?.sessionCheck?.url
          ?? DEFAULT_LOGIN_URL
      );
      if (targetUrl !== DEFAULT_LOGIN_URL) {
        await session.driver.goto({ url: targetUrl, timeoutMs: config.timeoutMs });
      }
      session.lastUsedAt = clock().toISOString();
      return {
        opened: true,
        reused: session.reused,
        controlled: true,
        mode: "playwright",
        browserChannel: config.browserChannel,
        profileDir: config.profileDir,
        profileDirectory: config.profileDirectory,
        url: targetUrl,
        openedAt: session.openedAt,
        lastUsedAt: session.lastUsedAt
      };
    },

    async getDriver({ profile, overrides = {} } = {}) {
      const config = normalizeProfileConfig(profile, overrides);
      const key = sessionKey(config);
      const session = sessions.get(key);
      if (!session) return null;
      if (await isSessionClosed(session)) {
        sessions.delete(key);
        return null;
      }
      const page = await getSessionPage(session);
      if (!page) {
        sessions.delete(key);
        return null;
      }
      session.lastUsedAt = clock().toISOString();
      const driver = await createPlaywrightDriver({ page });
      driver.persistentProfileSession = true;
      return driver;
    },

    async close(profileOrId = null) {
      const targets = [];
      for (const [key, session] of sessions.entries()) {
        if (!profileOrId || session.profileId === profileOrId || session.key === profileOrId) {
          targets.push([key, session]);
        }
      }
      for (const [key, session] of targets) {
        await session.driver.close?.().catch(() => {});
        sessions.delete(key);
      }
      return { closed: targets.length };
    }
  };

  async function ensureSession(config) {
    const key = sessionKey(config);
    const existing = sessions.get(key);
    if (existing && !(await isSessionClosed(existing))) {
      existing.reused = true;
      return existing;
    }
    if (existing) sessions.delete(key);

    const driver = await createPlaywrightDriver({
      browserType: config.browserType,
      profileDir: config.profileDir,
      profileDirectory: config.profileDirectory || null,
      browserChannel: config.browserChannel || null,
      headless: false
    });
    const now = clock().toISOString();
    const session = {
      key,
      profileId: config.profileId,
      profileName: config.profileName,
      profileDir: config.profileDir,
      profileDirectory: config.profileDirectory,
      browserChannel: config.browserChannel,
      driver,
      openedAt: now,
      lastUsedAt: now,
      reused: false
    };
    sessions.set(key, session);
    return session;
  }
}

function normalizeProfileConfig(profile, overrides = {}) {
  if (!profile) throw new Error("Profile is required");
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
  return {
    profileId: profile.id ?? null,
    profileName: profile.name ?? "",
    browserType: overrides.browserType ?? profile.browserType ?? "chromium",
    browserChannel: overrides.browserChannel ?? profile.browserChannel ?? "chrome",
    profileDir,
    profileDirectory: overrides.profileDirectory ?? profile.profileDirectory ?? "",
    timeoutMs: Number(overrides.timeoutMs ?? profile.sessionCheck?.timeoutMs ?? 10_000)
  };
}

function sessionKey(config) {
  return [
    config.browserType,
    config.browserChannel,
    config.profileDir,
    config.profileDirectory
  ].map((value) => String(value ?? "")).join("\n");
}

function normalizeLoginUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return DEFAULT_LOGIN_URL;
  if (value === DEFAULT_LOGIN_URL || /^https?:\/\//i.test(value)) return value;
  const error = new Error("Login window URL must be http(s) or about:blank");
  error.statusCode = 400;
  throw error;
}

async function isSessionClosed(session) {
  try {
    if (session.driver.page?.isClosed?.()) return true;
    await session.driver.currentUrl?.();
    return false;
  } catch {
    return true;
  }
}

async function getSessionPage(session) {
  if (session.driver.page && !session.driver.page.isClosed?.()) return session.driver.page;
  const context = session.driver.context;
  if (!context?.pages) return null;
  const page = context.pages().find((item) => !item.isClosed?.()) ?? await context.newPage();
  session.driver.page = page;
  return page;
}

function sessionSummary(session) {
  return {
    profileId: session.profileId,
    profileName: session.profileName,
    profileDir: session.profileDir,
    profileDirectory: session.profileDirectory,
    browserChannel: session.browserChannel,
    openedAt: session.openedAt,
    lastUsedAt: session.lastUsedAt
  };
}
