export function createRateLimiter({ minDelayMs = 0, maxPerMinute = null } = {}) {
  let lastRunAt = 0;
  const starts = [];

  return {
    async wait() {
      const now = Date.now();
      const delayByGap = Math.max(0, lastRunAt + minDelayMs - now);
      const delayByWindow = maxPerMinute ? computeWindowDelay(starts, maxPerMinute, now) : 0;
      const delay = Math.max(delayByGap, delayByWindow);
      if (delay > 0) await sleep(delay);
      const startedAt = Date.now();
      lastRunAt = startedAt;
      starts.push(startedAt);
      prune(starts, startedAt);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
