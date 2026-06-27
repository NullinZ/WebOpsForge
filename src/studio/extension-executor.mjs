import { randomUUID } from "node:crypto";
import { BrowserActionError, BrowserBlockedError } from "../errors.mjs";

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;

export function createExtensionExecutor({ clock = () => new Date(), maxCompletedMs = 60_000 } = {}) {
  const jobs = new Map();
  const pending = [];
  let lastSeenAt = null;
  let lastSeenBy = null;

  return {
    status() {
      pruneSettled();
      return {
        pending: pending.length,
        active: Array.from(jobs.values()).filter((job) => job.status === "dispatched").length,
        lastSeenAt,
        lastSeenBy
      };
    },

    async run(payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      const actionTimeoutMs = normalizeTimeout(timeoutMs);
      const now = clock();
      const job = {
        id: `exec_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
        status: "pending",
        payload,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + actionTimeoutMs).toISOString(),
        settledAt: null,
        timer: null,
        resolve: null,
        reject: null
      };

      const result = new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
        job.timer = setTimeout(() => {
          jobs.delete(job.id);
          removePending(job.id);
          reject(new BrowserBlockedError(
            "Chrome extension executor did not pick up the browser action. Reload or enable the WebOps Forge Picker extension in that Chrome profile, then rerun.",
            {
              reason: "front_chrome_executor_unavailable",
              recoverable: true,
              details: {
                action: payload.action ?? null,
                currentUrl: payload.currentUrl ?? null,
                timeoutMs: actionTimeoutMs
              }
            }
          ));
        }, actionTimeoutMs);
      });

      jobs.set(job.id, job);
      pending.push(job.id);
      return result;
    },

    claimNext(meta = {}) {
      lastSeenAt = clock().toISOString();
      lastSeenBy = sanitizeMeta(meta);
      pruneSettled();
      while (pending.length) {
        const id = pending.shift();
        const job = jobs.get(id);
        if (!job || job.status !== "pending") continue;
        job.status = "dispatched";
        job.dispatchedAt = clock().toISOString();
        job.claimedBy = sanitizeMeta(meta);
        return publicJob(job);
      }
      return null;
    },

    complete(id, body = {}) {
      lastSeenAt = clock().toISOString();
      const job = jobs.get(id);
      if (!job) {
        return { accepted: false, reason: "job_not_found" };
      }

      clearTimeout(job.timer);
      job.status = body.ok === false ? "failed" : "completed";
      job.settledAt = clock().toISOString();
      jobs.delete(id);
      removePending(id);

      if (body.ok === false) {
        job.reject(extensionJobError(body.error, job.payload));
        return { accepted: true, status: job.status };
      }

      job.resolve(body.result ?? {});
      return { accepted: true, status: job.status };
    }
  };

  function removePending(id) {
    const index = pending.indexOf(id);
    if (index !== -1) pending.splice(index, 1);
  }

  function pruneSettled() {
    const cutoff = clock().getTime() - maxCompletedMs;
    for (const [id, job] of jobs) {
      if (!job.settledAt) continue;
      if (new Date(job.settledAt).getTime() < cutoff) jobs.delete(id);
    }
  }
}

function publicJob(job) {
  return {
    id: job.id,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    ...job.payload
  };
}

function extensionJobError(error = {}, payload = {}) {
  const details = {
    reason: error.reason ?? error.details?.reason ?? "front_chrome_executor_action_failed",
    action: payload.action ?? null,
    currentUrl: payload.currentUrl ?? null,
    ...(error.details ?? {})
  };
  return new BrowserActionError(error.message || "Chrome extension executor action failed", {
    code: error.code ?? "BROWSER_ACTION_ERROR",
    details
  });
}

function normalizeTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1000, Math.round(number)));
}

function sanitizeMeta(meta = {}) {
  return {
    source: String(meta.source ?? "").slice(0, 80),
    version: String(meta.version ?? "").slice(0, 40)
  };
}
