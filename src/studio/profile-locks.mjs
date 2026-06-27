import { readlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function detectActiveProfileLock(profileDir, { inspectProcess = false } = {}) {
  if (!profileDir) return null;
  try {
    const target = await readlink(path.join(profileDir, "SingletonLock"));
    const pid = Number(String(target).match(/-(\d+)$/)?.[1]);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    if (!isProcessRunning(pid)) return null;
    const lock = { pid, target, profileDir };
    if (inspectProcess) {
      lock.owner = await inspectProfileLockOwner({ pid, profileDir });
    }
    return lock;
  } catch {
    return null;
  }
}

export async function releaseProfileLockOwner(profileDir, { force = false, signal = "SIGTERM" } = {}) {
  const lock = await detectActiveProfileLock(profileDir, { inspectProcess: true });
  if (!lock) {
    return { requested: false, reason: "no_active_lock", lock: null };
  }
  if (!force) {
    return { requested: false, reason: "confirmation_required", lock };
  }
  if (!lock.owner?.ownsProfile) {
    return { requested: false, reason: "owner_not_verified", lock };
  }
  process.kill(lock.pid, signal);
  return { requested: true, signal, lock };
}

export async function waitForProfileLockRelease(profileDir, { timeoutMs = 2500, intervalMs = 100 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await detectActiveProfileLock(profileDir))) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return !(await detectActiveProfileLock(profileDir));
}

async function inspectProfileLockOwner({ pid, profileDir }) {
  const command = await readProcessCommand(pid);
  const ownsProfile = commandReferencesProfile(command, profileDir);
  return {
    command,
    ownsProfile,
    kind: ownerKind(command, profileDir)
  };
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readProcessCommand(pid) {
  if (process.platform === "win32") return "";
  try {
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], {
      timeout: 1000,
      maxBuffer: 1024 * 1024
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

function commandReferencesProfile(command, profileDir) {
  if (!command || !profileDir) return false;
  return command.includes(`--user-data-dir=${profileDir}`)
    || command.includes(`--user-data-dir="${profileDir}"`)
    || command.includes(`--user-data-dir='${profileDir}'`)
    || command.includes(profileDir);
}

function ownerKind(command, profileDir) {
  if (!command) return "unknown";
  if (profileDir?.includes(`${path.sep}.webops-forge${path.sep}browser-profiles${path.sep}`)
    && command.includes("--remote-debugging-pipe")) {
    return "webops_controlled";
  }
  if (command.includes("--remote-debugging-pipe")) return "playwright_controlled";
  if (command.includes("--remote-debugging-port")) return "cdp_browser";
  return "external_browser";
}
