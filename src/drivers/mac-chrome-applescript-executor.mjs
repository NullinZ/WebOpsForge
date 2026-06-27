import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BrowserActionError, BrowserBlockedError } from "../errors.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 10_000;

export function createMacChromeAppleScriptExecutor({
  browserChannel = "chrome",
  osascript = runOsascript
} = {}) {
  if (process.platform !== "darwin") return null;
  const appName = appNameForChannel(browserChannel);
  return {
    kind: "mac-chrome-applescript",
    async run(payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
      const action = String(payload.action ?? "");
      const params = payload.params ?? {};
      const deadline = Date.now() + normalizeTimeout(timeoutMs);
      let lastError = null;

      while (Date.now() <= deadline) {
        const response = await executeBrowserAction({
          appName,
          osascript,
          action,
          currentUrl: payload.currentUrl ?? "",
          params,
          timeoutMs: Math.min(3000, Math.max(1000, deadline - Date.now()))
        });
        if (response.ok) {
          return {
            ...(response.result ?? {}),
            via: "mac-chrome-applescript",
            action,
            currentUrl: response.result?.url ?? payload.currentUrl ?? null
          };
        }
        lastError = response.error;
        if (lastError?.reason !== "selector_not_found") break;
        await sleep(120);
      }

      throw appleScriptActionError(lastError, { action, currentUrl: payload.currentUrl ?? null });
    }
  };
}

async function executeBrowserAction({ appName, osascript, action, currentUrl, params, timeoutMs }) {
  const targetHost = siteHost(currentUrl);
  const jsSource = browserActionSource(action, params);
  const script = appleScriptForJavascript({ appName, targetHost, jsSource });
  try {
    const stdout = await osascript(script, { timeoutMs });
    const text = String(stdout ?? "").trim();
    if (!text) {
      return { ok: false, error: { message: "Chrome returned an empty AppleScript result", reason: "front_chrome_empty_result" } };
    }
    return JSON.parse(text);
  } catch (error) {
    throw normalizeAppleScriptError(error, { action, currentUrl });
  }
}

async function runOsascript(script, { timeoutMs } = {}) {
  const result = await execFileAsync("osascript", ["-e", script], {
    timeout: normalizeTimeout(timeoutMs),
    maxBuffer: 1024 * 1024
  });
  return result.stdout;
}

function appleScriptForJavascript({ appName, targetHost, jsSource }) {
  const host = appleScriptString(targetHost);
  const source = appleScriptString(jsSource);
  return `
set targetHost to "${host}"
set jsSource to "${source}"
tell application "${appleScriptString(appName)}"
  activate
  if (count of windows) = 0 then error "No ${appleScriptString(appName)} window is open"
  set frontUrl to URL of active tab of front window
  if targetHost is not "" and frontUrl does not contain targetHost then
    error "Front Chrome tab did not match host " & targetHost & ": " & frontUrl
  end if
  return execute active tab of front window javascript jsSource
end tell
`;
}

function browserActionSource(action, params) {
  return `(() => {
const action = ${JSON.stringify(action)};
const params = ${JSON.stringify(params ?? {})};
function clean(value) {
  return String(value || "").replace(/\\s+/g, " ").trim();
}
function visible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
}
function selectors() {
  const values = [];
  if (params.selector) values.push(params.selector);
  for (const candidate of params.selectorCandidates || params.targetIdentity?.selectorCandidates || []) {
    if (candidate && candidate.selector) values.push(candidate.selector);
  }
  if (params.targetIdentity && params.targetIdentity.recommendedSelector) values.push(params.targetIdentity.recommendedSelector);
  return Array.from(new Set(values.filter(Boolean)));
}
function resolveTarget() {
  const attempts = [];
  for (const selector of selectors()) {
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(selector));
    } catch (_) {
      attempts.push({ selector, status: "invalid_selector", matchCount: 0, visibleCount: 0 });
      continue;
    }
    const visibleNodes = nodes.filter(visible);
    attempts.push({
      selector,
      status: nodes.length ? "matched" : "not_found",
      matchCount: nodes.length,
      visibleCount: visibleNodes.length
    });
    const element = visibleNodes[0] || nodes[0] || null;
    if (element) {
      return {
        element,
        selector,
        attempts,
        target: {
          selector,
          requestedSelector: params.selector || "",
          count: nodes.length,
          visibleCount: visibleNodes.length
        }
      };
    }
  }
  return {
    element: null,
    selector: params.selector || selectors()[0] || "",
    attempts,
    target: {
      selector: params.selector || selectors()[0] || "",
      requestedSelector: params.selector || "",
      count: 0,
      visibleCount: 0
    }
  };
}
function requireTarget() {
  const resolved = resolveTarget();
  if (!resolved.element) {
    const error = new Error("Selector not found: " + (params.selector || ""));
    error.reason = "selector_not_found";
    error.details = { selector: params.selector || "", attempts: resolved.attempts };
    throw error;
  }
  return resolved;
}
function setNativeValue(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor && descriptor.set) {
    descriptor.set.call(element, value);
    return;
  }
  element.value = value;
}
function currentValue(element) {
  if ("value" in element) return element.value;
  return element.textContent || "";
}
function extractValue(element, spec) {
  const mode = spec.mode || "text";
  if (mode === "html") return element.innerHTML;
  if (mode === "value") return currentValue(element);
  if (mode === "attribute") return element.getAttribute(spec.attribute || spec.attr || "") || "";
  return clean(element.textContent || currentValue(element));
}
try {
  if (action === "waitFor") {
    const resolved = requireTarget();
    const state = params.state || "visible";
    const matched = state === "attached" ? true : visible(resolved.element);
    return JSON.stringify({ ok: matched, result: { selector: resolved.selector, state, matched, target: resolved.target, url: location.href } });
  }
  if (action === "fill") {
    const resolved = requireTarget();
    const value = String(params.value ?? "");
    resolved.element.scrollIntoView({ block: "center", inline: "center" });
    resolved.element.focus();
    setNativeValue(resolved.element, value);
    resolved.element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    resolved.element.dispatchEvent(new Event("change", { bubbles: true }));
    return JSON.stringify({ ok: true, result: { selector: resolved.selector, value: params.redact ? "[redacted]" : value, actualValue: params.redact ? "[redacted]" : currentValue(resolved.element), filled: true, target: resolved.target, url: location.href } });
  }
  if (action === "click") {
    const resolved = requireTarget();
    resolved.element.scrollIntoView({ block: "center", inline: "center" });
    resolved.element.click();
    return JSON.stringify({ ok: true, result: { selector: resolved.selector, clicked: true, target: resolved.target, url: location.href } });
  }
  if (action === "press") {
    const resolved = params.selector ? requireTarget() : { element: document.activeElement, selector: "", target: null };
    const key = String(params.key || "");
    resolved.element.focus();
    for (const type of ["keydown", "keypress", "keyup"]) {
      resolved.element.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
    }
    return JSON.stringify({ ok: true, result: { selector: resolved.selector, key, pressed: true, target: resolved.target, url: location.href } });
  }
  if (action === "extract") {
    const resolved = requireTarget();
    return JSON.stringify({ ok: true, result: { selector: resolved.selector, mode: params.mode || "text", value: extractValue(resolved.element, params), target: resolved.target, url: location.href } });
  }
  if (action === "extractList") {
    const resolved = requireTarget();
    const nodes = Array.from(document.querySelectorAll(resolved.selector));
    const limit = Number(params.limit || nodes.length);
    const fields = params.fields || {};
    const rows = nodes.slice(0, limit).map((node) => {
      if (!fields || Object.keys(fields).length === 0) return clean(node.textContent || "");
      const row = {};
      for (const [name, spec] of Object.entries(fields)) {
        const fieldSpec = typeof spec === "string" ? { selector: spec, mode: "text" } : spec || {};
        const target = fieldSpec.selector ? node.querySelector(fieldSpec.selector) : node;
        row[name] = target ? extractValue(target, fieldSpec) : null;
      }
      return row;
    });
    return JSON.stringify({ ok: true, result: { selector: resolved.selector, value: rows, count: rows.length, target: resolved.target, url: location.href } });
  }
  if (action === "extractDetail") {
    const value = {};
    for (const [name, spec] of Object.entries(params.fields || {})) {
      const fieldSpec = typeof spec === "string" ? { selector: spec, mode: "text" } : spec || {};
      const node = fieldSpec.selector ? document.querySelector(fieldSpec.selector) : document.body;
      value[name] = node ? extractValue(node, fieldSpec) : null;
    }
    return JSON.stringify({ ok: true, result: { value, url: location.href } });
  }
  if (action === "extractMedia") {
    const resolved = requireTarget();
    const nodes = Array.from(document.querySelectorAll(resolved.selector));
    const limit = Number(params.limit || nodes.length);
    const rows = nodes.slice(0, limit).map((node) => ({
      src: node.currentSrc || node.src || node.getAttribute("src") || node.getAttribute("href") || "",
      alt: node.getAttribute("alt") || "",
      title: node.getAttribute("title") || ""
    }));
    return JSON.stringify({ ok: true, result: { selector: resolved.selector, value: rows, count: rows.length, target: resolved.target, url: location.href } });
  }
  throw Object.assign(new Error("Unsupported AppleScript executor action: " + action), { reason: "unsupported_applescript_executor_action" });
} catch (error) {
  return JSON.stringify({ ok: false, error: { message: error.message || String(error), reason: error.reason || "front_chrome_action_failed", details: error.details || {} } });
}
})()`;
}

function appleScriptActionError(error = {}, fallback = {}) {
  const reason = error.reason ?? "front_chrome_action_failed";
  if (reason === "selector_not_found") {
    return new BrowserActionError(error.message || "Selector not found", {
      details: {
        reason,
        action: fallback.action,
        currentUrl: fallback.currentUrl,
        ...(error.details ?? {})
      }
    });
  }
  return new BrowserBlockedError(error.message || "Front Chrome action failed", {
    reason,
    recoverable: true,
    details: {
      action: fallback.action,
      currentUrl: fallback.currentUrl,
      ...(error.details ?? {})
    }
  });
}

function normalizeAppleScriptError(error, details = {}) {
  const message = String(error?.stderr || error?.message || error || "");
  if (/执行 JavaScript 的功能已关闭|JavaScript through Apple Events is turned off|Allow JavaScript from Apple Events/i.test(message)) {
    return new BrowserBlockedError(
      "Chrome has disabled JavaScript execution from Apple Events. Enable View > Developer > Allow JavaScript from Apple Events, then rerun.",
      {
        reason: "front_chrome_javascript_disabled",
        recoverable: true,
        details
      }
    );
  }
  if (/No Chrome tab matched host|Front Chrome tab did not match host/i.test(message)) {
    return new BrowserBlockedError("No matching front Chrome tab was found for the run.", {
      reason: "front_chrome_tab_not_found",
      recoverable: true,
      details
    });
  }
  return new BrowserActionError(message || "AppleScript Chrome execution failed", {
    details: {
      reason: "front_chrome_applescript_failed",
      ...details
    }
  });
}

function appNameForChannel(channel) {
  if (channel === "msedge") return "Microsoft Edge";
  if (channel === "chromium") return "Chromium";
  return "Google Chrome";
}

function siteHost(url) {
  try {
    const hostname = new URL(String(url || "")).hostname.replace(/^www\./, "");
    const parts = hostname.split(".").filter(Boolean);
    if (parts.length >= 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return parts.slice(-2).join(".");
    return hostname;
  } catch {
    return "";
  }
}

function appleScriptString(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
}

function normalizeTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.max(1000, Math.round(number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
