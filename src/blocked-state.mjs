const RECOVERY_HINTS = {
  approval_required: "Review the approval gate and rerun after approval.",
  captcha_or_verification: "Complete the verification in the browser profile, then retry the run.",
  login_required: "Refresh the profile session and confirm the account is logged in.",
  permission_denied: "Check account permissions or the service credential used by the run.",
  profile_busy: "Wait for the profile lease to clear or choose another profile.",
  rate_limited: "Reduce run frequency or wait for the platform limit to reset.",
  selector_drift: "Refresh the selector with browser picking or update the adapter.",
  navigation_timeout: "Check page reachability, network state, and timeout settings.",
  empty_result: "Confirm the source page has data and the extraction selector is still valid.",
  browser_blocked: "Inspect the live browser state and retry after clearing the blocker.",
  unknown_failure: "Inspect evidence and retry after fixing the failing step."
};

const BLOCKED_STATES = new Set([
  "approval_required",
  "captcha_or_verification",
  "login_required",
  "permission_denied",
  "profile_busy",
  "rate_limited",
  "selector_drift",
  "empty_result",
  "browser_blocked"
]);

const PROFILE_BLOCKING_STATES = new Set([
  "captcha_or_verification",
  "login_required",
  "browser_blocked"
]);

export function classifyRunFailure(error) {
  const state = detectBlockedState(error);
  return {
    state,
    reason: reasonFor(error, state),
    recoverable: recoverableFor(error, state),
    runStatus: statusFor(error, state),
    profileStatus: PROFILE_BLOCKING_STATES.has(state) ? "blocked" : "ready",
    recoveryHint: RECOVERY_HINTS[state] ?? RECOVERY_HINTS.unknown_failure
  };
}

export function detectBlockedState(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? error ?? "");
  const details = error?.details ?? {};
  const reason = String(error?.reason ?? details.reason ?? "").toLowerCase();
  const haystack = `${code} ${error?.name ?? ""} ${reason} ${message}`.toLowerCase();
  const status = Number(details.status ?? details.statusCode ?? error?.status ?? 0);

  if (code === "RUN_CANCELLED") return "run_canceled";
  if (code === "PROFILE_BUSY" || reason.includes("profile_busy")) return "profile_busy";
  if (code === "BROWSER_BLOCKED") return normalizeBlockedReason(reason);
  if (status === 401 || haystack.includes("401")) return "login_required";
  if (status === 403 || haystack.includes("403")) return "permission_denied";
  if (status === 429 || haystack.includes("429")) return "rate_limited";
  if (/captcha|verification|verify|challenge|bot check/.test(haystack)) return "captcha_or_verification";
  if (/login required|logged out|not logged in|signin|sign in|authentication|unauthorized/.test(haystack)) return "login_required";
  if (/permission denied|forbidden|not allowed|access denied/.test(haystack)) return "permission_denied";
  if (/rate limit|too many requests|throttle/.test(haystack)) return "rate_limited";
  if (/selector not found|target identity could not be matched|strict mode violation|element is not attached/.test(haystack)) return "selector_drift";
  if (/timeout|timed out|navigation failed|net::/.test(haystack)) return "navigation_timeout";
  if (/empty result|no rows|no records|not found for outputs?/.test(haystack)) return "empty_result";
  return "unknown_failure";
}

function normalizeBlockedReason(reason) {
  if (/approval/.test(reason)) return "approval_required";
  if (/captcha|verification|verify|challenge|bot/.test(reason)) return "captcha_or_verification";
  if (/login|auth|logged/.test(reason)) return "login_required";
  if (/permission|forbidden|access/.test(reason)) return "permission_denied";
  if (/rate|throttle|429/.test(reason)) return "rate_limited";
  if (/selector|identity|drift|assert_text|assert_output/.test(reason)) return "selector_drift";
  if (/empty/.test(reason)) return "empty_result";
  return "browser_blocked";
}

function recoverableFor(error, state) {
  if (state === "run_canceled") return false;
  const details = error?.details ?? {};
  if (typeof error?.recoverable === "boolean") return error.recoverable;
  if (typeof details.recoverable === "boolean") return details.recoverable;
  return BLOCKED_STATES.has(state) || state === "navigation_timeout";
}

function statusFor(error, state) {
  if (state === "run_canceled" || error?.code === "RUN_CANCELLED") return "canceled";
  return BLOCKED_STATES.has(state) ? "blocked" : "failed";
}

function reasonFor(error, state) {
  return error?.reason ?? error?.details?.reason ?? state;
}
