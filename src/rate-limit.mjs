import { RunCancelledError } from "./errors.mjs";

export function createRateLimiter({ minDelayMs = 0, maxDelayMs = null, maxPerMinute = null, random = Math.random } = {}) {
  const starts = [];
  const minDelay = normalizeDelay(minDelayMs, 0);
  const maxDelay = normalizeDelay(maxDelayMs ?? minDelay, minDelay);
  const sampleRandom = typeof random === "function" ? random : Math.random;

  return {
    async wait({ state = null, onDelay = null } = {}) {
      const now = Date.now();
      const delayByTiming = sampleDelay(minDelay, maxDelay, sampleRandom);
      const delayByWindow = maxPerMinute ? computeWindowDelay(starts, maxPerMinute, now) : 0;
      const delay = Math.max(delayByTiming, delayByWindow);
      if (delay > 0) {
        await onDelay?.({
          delayMs: delay,
          randomDelayMs: delayByTiming,
          windowDelayMs: delayByWindow,
          maxPerMinute
        });
        await sleep(delay, state?.abortSignal);
      }
      const startedAt = Date.now();
      starts.push(startedAt);
      prune(starts, startedAt);
      return {
        delayMs: delay,
        randomDelayMs: delayByTiming,
        windowDelayMs: delayByWindow,
        maxPerMinute
      };
    }
  };
}

function computeWindowDelay(starts, maxPerMinute, now) {
  prune(starts, now);
  if (starts.length < maxPerMinute) return 0;
  return Math.max(0, 60_000 - (now - starts[0]));
}

function prune(starts, now) {
  while (starts.length > 0 && now - starts[0] > 60_000) starts.shift();
}

function sampleDelay(minDelay, maxDelay, random) {
  if (maxDelay <= minDelay) return minDelay;
  const ratio = Math.min(0.999999, Math.max(0, Number(random()) || 0));
  return minDelay + Math.floor(ratio * (maxDelay - minDelay + 1));
}

function normalizeDelay(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function sleep(ms, abortSignal = null) {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new RunCancelledError("Run cancelled during delay", { details: { reason: abortSignal.reason ?? "operator" } }));
      return;
    }

    const timer = setTimeout(() => {
      abortSignal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      reject(new RunCancelledError("Run cancelled during delay", { details: { reason: abortSignal.reason ?? "operator" } }));
    }

    abortSignal?.addEventListener?.("abort", onAbort, { once: true });
  });
}
