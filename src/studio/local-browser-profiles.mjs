import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export async function discoverLocalBrowserProfiles({
  homeDir = homedir(),
  existingProfiles = [],
  roots = defaultBrowserRoots(homeDir)
} = {}) {
  const candidates = [];
  for (const root of roots) {
    const rootInfo = await safeStat(root.userDataDir);
    if (!rootInfo?.isDirectory()) continue;
    const localState = await readJson(path.join(root.userDataDir, "Local State"), {});
    const entries = await readdir(root.userDataDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "System Profile") continue;
      const preferencesPath = path.join(root.userDataDir, entry.name, "Preferences");
      const preferenceInfo = await safeStat(preferencesPath);
      if (!preferenceInfo?.isFile()) continue;

      const preferences = await readJson(preferencesPath, {});
      const displayName = profileDisplayName(entry.name, preferences, localState);
      const candidate = {
        id: `${root.id}-${slugify(entry.name)}`,
        name: `${root.name} - ${displayName}`,
        browserName: root.name,
        browserType: root.browserType,
        browserChannel: root.browserChannel,
        mode: "playwright",
        platform: root.id,
        accountLabel: displayName,
        loginState: "unchecked",
        status: "ready",
        profileDir: root.userDataDir,
        profileDirectory: entry.name,
        headless: false,
        rateLimit: { minDelayMs: 1000, maxDelayMs: 2400, maxPerMinute: 20 },
        sessionCheck: {
          platform: root.id,
          url: "",
          accountSelector: "",
          loggedOutSelector: "",
          timeoutMs: 10_000
        },
        tags: [root.id, "local", "browser"],
        notes: `Imported from ${root.name} profile ${entry.name}.`
      };
      candidate.existingProfileId = findExistingProfileId(candidate, existingProfiles);
      candidates.push(candidate);
    }
  }
  return candidates.sort(compareLocalProfiles);
}

function defaultBrowserRoots(homeDir) {
  return [
    {
      id: "chrome",
      name: "Google Chrome",
      browserType: "chromium",
      browserChannel: "chrome",
      userDataDir: path.join(homeDir, "Library/Application Support/Google/Chrome")
    },
    {
      id: "chromium",
      name: "Chromium",
      browserType: "chromium",
      browserChannel: "",
      userDataDir: path.join(homeDir, "Library/Application Support/Chromium")
    },
    {
      id: "edge",
      name: "Microsoft Edge",
      browserType: "chromium",
      browserChannel: "msedge",
      userDataDir: path.join(homeDir, "Library/Application Support/Microsoft Edge")
    }
  ];
}

function profileDisplayName(profileDirectory, preferences, localState) {
  const cached = localState?.profile?.info_cache?.[profileDirectory]?.name;
  const preferenceName = preferences?.profile?.name;
  const firstAccount = Array.isArray(preferences?.account_info) ? preferences.account_info[0] : null;
  return String(preferenceName || cached || firstAccount?.full_name || firstAccount?.given_name || profileDirectory).trim();
}

function findExistingProfileId(candidate, profiles) {
  return profiles.find((profile) => {
    if (profile.mode !== "playwright") return false;
    const sameDir = normalizePath(profile.profileDir) === normalizePath(candidate.profileDir);
    const sameProfile = String(profile.profileDirectory ?? "") === candidate.profileDirectory;
    const sameChannel = String(profile.browserChannel ?? "") === String(candidate.browserChannel ?? "");
    return sameDir && sameProfile && sameChannel;
  })?.id ?? null;
}

function compareLocalProfiles(left, right) {
  const browser = left.browserName.localeCompare(right.browserName);
  if (browser) return browser;
  if (left.profileDirectory === "Default") return -1;
  if (right.profileDirectory === "Default") return 1;
  return left.profileDirectory.localeCompare(right.profileDirectory, undefined, { numeric: true });
}

async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizePath(value) {
  if (!value) return "";
  return path.resolve(String(value));
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "profile";
}
