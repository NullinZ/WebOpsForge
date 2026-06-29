import { BrowserActionError, BrowserBlockedError } from "../errors.mjs";
import { normalizeApiResult } from "../api-client.mjs";
import { detectActiveProfileLock } from "../studio/profile-locks.mjs";

export async function createPlaywrightDriver({
  browserType = "chromium",
  profileDir = null,
  profileDirectory = null,
  browserChannel = null,
  headless = false,
  launchOptions = {},
  contextOptions = {},
  viewport = null,
  page = null
} = {}) {
  if (page) return createDriverFromPage({ page, ownsBrowser: false });

  const playwright = await importPlaywright();
  const type = playwright[browserType];
  if (!type) throw new BrowserActionError(`Unsupported Playwright browser type: ${browserType}`);

  if (profileDir) {
    const persistentLaunchOptions = normalizePersistentLaunchOptions({
      launchOptions,
      browserChannel,
      profileDirectory
    });
    const launchProfileDirectory = profileDirectory ?? profileDirectoryFromArgs(persistentLaunchOptions.args);
    const launchBrowserChannel = browserChannel ?? persistentLaunchOptions.channel;
    const activeLock = await detectActiveProfileLock(profileDir, { inspectProcess: true });
    if (activeLock) {
      throw persistentProfileBusyError({
        profileDir,
        profileDirectory: launchProfileDirectory,
        browserChannel: launchBrowserChannel,
        activeLock
      });
    }
    let context;
    try {
      context = await type.launchPersistentContext(profileDir, {
        headless,
        viewport,
        ...persistentLaunchOptions,
        ...contextOptions
      });
    } catch (error) {
      throw normalizePersistentProfileLaunchError(error, {
        profileDir,
        profileDirectory: launchProfileDirectory,
        browserChannel: launchBrowserChannel
      });
    }
    const existing = context.pages()[0];
    const activePage = existing ?? await context.newPage();
    return createDriverFromPage({ page: activePage, context, ownsBrowser: true });
  }

  const browser = await type.launch({ headless, ...launchOptions });
  const context = await browser.newContext({ viewport, ...contextOptions });
  const activePage = await context.newPage();
  return createDriverFromPage({ page: activePage, context, browser, ownsBrowser: true });
}

function normalizePersistentLaunchOptions({ launchOptions = {}, browserChannel = null, profileDirectory = null }) {
  const next = { ...launchOptions };
  if (browserChannel) next.channel = browserChannel;
  if (profileDirectory) {
    const args = Array.isArray(next.args) ? [...next.args] : [];
    const existingIndex = args.findIndex((arg) => String(arg).startsWith("--profile-directory="));
    if (existingIndex !== -1) args.splice(existingIndex, 1);
    args.unshift(`--profile-directory=${profileDirectory}`);
    next.args = args;
  }
  return next;
}

function normalizePersistentProfileLaunchError(error, { profileDir, profileDirectory, browserChannel }) {
  const message = String(error?.message ?? error);
  if (!isExistingBrowserSessionError(message)) return error;
  return persistentProfileBusyError({
    profileDir,
    profileDirectory,
    browserChannel,
    originalMessage: message,
    cause: error
  });
}

function persistentProfileBusyError({
  profileDir,
  profileDirectory,
  browserChannel,
  originalMessage = null,
  activeLock = null,
  cause = null
}) {
  const label = [browserChannel || "Chromium", profileDirectory].filter(Boolean).join(" ");
  return new BrowserActionError(
    `${label || "Browser profile"} is already open in the normal browser. Quit Chrome completely before rerunning this profile, or use a clean Local Chromium profile. WebOps Forge cannot attach to a Chrome session that was started without remote debugging.`,
    {
      code: "PROFILE_BUSY",
      cause,
      details: {
        reason: "profile_busy",
        profileDir,
        profileDirectory,
        browserChannel,
        lockPid: activeLock?.pid ?? null,
        lockTarget: activeLock?.target ?? null,
        lockOwnerKind: activeLock?.owner?.kind ?? null,
        lockOwnerVerified: activeLock?.owner?.ownsProfile ?? null,
        originalMessage
      }
    }
  );
}

function isExistingBrowserSessionError(message) {
  return /正在现有的浏览器会话中打开|opening in existing browser session|processsingleton|user data directory is already in use/i.test(message);
}

function profileDirectoryFromArgs(args) {
  if (!Array.isArray(args)) return null;
  const arg = args.find((item) => String(item).startsWith("--profile-directory="));
  return arg ? String(arg).slice("--profile-directory=".length) : null;
}

function createDriverFromPage({ page, context = null, browser = null, ownsBrowser = false }) {
  return {
    kind: "playwright",
    page,
    context,
    async goto({ url, timeoutMs }) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      return { url: page.url() };
    },
    async waitFor({ selector, state = "visible", timeoutMs, targetIdentity = null }) {
      const { locator, target } = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity, preWait: false });
      await locator.waitFor({ state, timeout: timeoutMs });
      return { selector, state, target: await describeTarget(locator, target) };
    },
    async click({ selector, timeoutMs, targetIdentity = null }) {
      const { locator, target } = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.click({ timeout: timeoutMs });
      return { selector, target: await describeTarget(locator, target) };
    },
    async fill({ selector, value, timeoutMs, redact = false, targetIdentity = null }) {
      const { locator, target } = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      const stringValue = String(value);
      await locator.fill(stringValue, { timeout: timeoutMs });
      const actualValue = await locator.inputValue({ timeout: Math.min(Number(timeoutMs ?? 10_000), 1000) }).catch(() => null);
      return {
        selector,
        target: await describeTarget(locator, target),
        value: redact ? "[redacted]" : stringValue,
        actualValue: redact ? "[redacted]" : actualValue,
        filled: true,
        redacted: redact
      };
    },
    async press({ selector = null, key, timeoutMs, targetIdentity = null }) {
      let target = null;
      if (selector) {
        const resolved = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
        const locator = resolved.locator;
        target = await describeTarget(locator, resolved.target);
        await locator.press(key, { timeout: timeoutMs });
      } else {
        await page.keyboard.press(key);
      }
      return { selector, key, target };
    },
    async extract({ selector, mode = "text", attribute = null, timeoutMs, targetIdentity = null }) {
      const { locator, target } = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.waitFor({ state: "attached", timeout: timeoutMs });
      if (mode === "attribute") {
        return { selector, mode, attribute, target: await describeTarget(locator, target), value: await locator.getAttribute(attribute, { timeout: timeoutMs }) };
      }
      if (mode === "html") return { selector, mode, target: await describeTarget(locator, target), value: await locator.innerHTML({ timeout: timeoutMs }) };
      if (mode === "value") return { selector, mode, target: await describeTarget(locator, target), value: await locator.inputValue({ timeout: timeoutMs }) };
      return { selector, mode: "text", target: await describeTarget(locator, target), value: await locator.innerText({ timeout: timeoutMs }) };
    },
    async extractList({ selector, fields = {}, limit = null, timeoutMs, targetIdentity = null }) {
      const { locator, target } = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
      const count = await locator.count();
      const max = limit == null ? count : Math.min(count, Number(limit));
      const value = [];
      for (let index = 0; index < max; index += 1) {
        value.push(await extractRecordFromLocator(locator.nth(index), fields, { timeoutMs, page }));
      }
      return { selector, target: await describeTarget(locator, target), value, count: value.length };
    },
    async extractDetail({ fields = {}, timeoutMs }) {
      return {
        value: await extractRecordFromLocator(page.locator(":root"), fields, { timeoutMs, page })
      };
    },
    async extractMedia({ selector, sources = null, limit = null, timeoutMs, targetIdentity = null }) {
      const { locator, target } = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
      const count = await locator.count();
      const max = limit == null ? count : Math.min(count, Number(limit));
      const value = [];
      for (let index = 0; index < max; index += 1) {
        value.push(await locator.nth(index).evaluate(extractMediaElement, {
          sources,
          index
        }));
      }
      return { selector, target: await describeTarget(locator, target), value, count: value.length };
    },
    async paginate({ nextSelector, maxPages = 1, waitForSelector = null, timeoutMs }) {
      const urls = [];
      for (let index = 0; index < Number(maxPages ?? 1); index += 1) {
        const next = page.locator(nextSelector).first();
        try {
          await next.waitFor({ state: "visible", timeout: timeoutMs });
        } catch {
          break;
        }
        const before = page.url();
        await next.click({ timeout: timeoutMs });
        if (waitForSelector) await page.locator(waitForSelector).first().waitFor({ state: "attached", timeout: timeoutMs });
        else await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
        const after = page.url();
        urls.push(after);
        if (after === before && urls.length > 1 && urls.at(-2) === after) break;
      }
      return { nextSelector, pagesVisited: urls.length, urls, value: urls };
    },
    async checkSession({ accountSelector = null, loggedOutSelector = null, timeoutMs }) {
      if (loggedOutSelector) {
        const loggedOut = page.locator(loggedOutSelector).first();
        const loggedOutVisible = await loggedOut.isVisible({ timeout: Math.min(Number(timeoutMs ?? 10_000), 1200) }).catch(() => false);
        if (loggedOutVisible) {
          throw new BrowserBlockedError("Login required for the current browser session", {
            reason: "login_required",
            details: {
              accountSelector,
              loggedOutSelector,
              url: page.url()
            }
          });
        }
      }

      let accountLabel = "";
      if (accountSelector) {
        const account = page.locator(accountSelector).first();
        try {
          await account.waitFor({ state: "attached", timeout: timeoutMs });
          accountLabel = await account.innerText({ timeout: Math.min(Number(timeoutMs ?? 10_000), 1200) }).catch(() => "");
        } catch (error) {
          throw new BrowserBlockedError("Authenticated account marker was not found", {
            reason: "login_required",
            cause: error,
            details: {
              accountSelector,
              loggedOutSelector,
              url: page.url()
            }
          });
        }
      }

      const value = {
        loginState: accountSelector ? "authenticated" : "unknown",
        accountLabel: accountLabel.replace(/\s+/g, " ").trim()
      };
      return {
        ...value,
        accountSelector,
        loggedOutSelector,
        url: page.url(),
        value
      };
    },
    async screenshot({ fullPage = false }) {
      const bytes = await page.screenshot({ fullPage, type: "png" });
      return { contentType: "image/png", bytes };
    },
    async apiCall(request) {
      const requestContext = context?.request ?? page.context().request;
      const response = await requestContext.fetch(request.url, {
        method: request.method,
        headers: request.headers,
        data: request.body ?? undefined,
        timeout: request.timeoutMs ?? undefined
      });
      const body = await response.text();
      return normalizeApiResult({
        status: response.status(),
        ok: response.ok(),
        headers: response.headers(),
        body
      });
    },
    async currentUrl() {
      return page.url();
    },
    async close() {
      if (!ownsBrowser) return;
      if (context && !browser) {
        await context.close();
      } else {
        await browser?.close();
      }
    }
  };
}

async function extractRecordFromLocator(rootLocator, fields, { timeoutMs, page }) {
  const entries = [];
  for (const [name, rawSpec] of Object.entries(fields ?? {})) {
    const spec = normalizeFieldSpec(rawSpec);
    const target = spec.selector ? rootLocator.locator(spec.selector).first() : rootLocator;
    let value = spec.default ?? null;
    try {
      await target.waitFor({ state: "attached", timeout: Math.min(Number(timeoutMs ?? 10_000), 5000) });
      value = await extractLocatorValue(target, spec, timeoutMs);
    } catch (error) {
      if (spec.required) throw error;
    }
    entries.push([name, normalizeExtractedValue(value, spec, page.url())]);
  }
  return Object.fromEntries(entries);
}

function normalizeFieldSpec(spec) {
  if (typeof spec === "string") return { selector: spec, mode: "text", attribute: null, type: "string" };
  return {
    selector: spec?.selector ?? null,
    mode: spec?.mode ?? (spec?.attribute || spec?.attr ? "attribute" : "text"),
    attribute: spec?.attribute ?? spec?.attr ?? null,
    type: spec?.type ?? "string",
    required: Boolean(spec?.required),
    default: spec?.default ?? null
  };
}

async function extractLocatorValue(locator, spec, timeoutMs) {
  if (spec.mode === "attribute") return locator.getAttribute(spec.attribute, { timeout: timeoutMs });
  if (spec.mode === "html") return locator.innerHTML({ timeout: timeoutMs });
  if (spec.mode === "value") return locator.inputValue({ timeout: timeoutMs });
  return locator.innerText({ timeout: timeoutMs });
}

function normalizeExtractedValue(value, spec, baseUrl) {
  if (value == null) return value;
  if (spec.type === "number") {
    const number = Number(String(value).replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(number) ? number : null;
  }
  if (spec.type === "url") {
    try {
      return new URL(String(value), baseUrl).toString();
    } catch {
      return String(value);
    }
  }
  return value;
}

function extractMediaElement(node, { sources = null, index = null } = {}) {
  const sourceNames = Array.isArray(sources) && sources.length > 0
    ? sources
    : ["currentSrc", "src", "href", "poster", "data-src", "srcset"];
  const attributes = {};
  for (const attr of node.getAttributeNames()) {
    const value = node.getAttribute(attr);
    if (value != null) attributes[attr] = value;
  }
  const sourceEntries = {};
  for (const name of sourceNames) {
    const value = name === "currentSrc" ? node.currentSrc : node.getAttribute(name);
    if (value) sourceEntries[name] = value;
  }
  const sourceChildren = Array.from(node.querySelectorAll?.("source") ?? []).map((source) => ({
    src: source.src || source.getAttribute("src") || "",
    type: source.getAttribute("type") || ""
  })).filter((source) => source.src);
  const firstSource = sourceEntries.currentSrc ?? sourceEntries.src ?? sourceEntries.href ?? sourceEntries.poster ?? sourceEntries["data-src"] ?? sourceChildren[0]?.src ?? sourceEntries.srcset ?? "";
  const absolute = (value) => {
    try {
      return new URL(value, location.href).toString();
    } catch {
      return value;
    }
  };
  return {
    index,
    tagName: node.nodeName.toLowerCase(),
    url: firstSource ? absolute(firstSource) : "",
    attributes: {
      alt: attributes.alt,
      title: attributes.title,
      width: attributes.width,
      height: attributes.height,
      ...sourceEntries
    },
    sources: sourceChildren.map((source) => ({ ...source, src: absolute(source.src) }))
  };
}

async function resolveTargetLocator(page, { selector, timeoutMs, targetIdentity = null, preWait = true }) {
  if (!targetIdentity) {
    const locator = page.locator(selector);
    if (preWait) await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
    return {
      locator,
      target: {
        selector,
        strategy: "selector"
      }
    };
  }

  const candidates = candidateSelectors(selector, targetIdentity);
  const attempts = [];
  const minScore = Number(targetIdentity.matchPolicy?.minScore ?? 28);
  const ambiguityMargin = Number(targetIdentity.matchPolicy?.ambiguityMargin ?? 8);

  for (const [index, candidate] of candidates.entries()) {
    const locator = page.locator(candidate);
    try {
      const waitTimeout = index === 0
        ? timeoutMs
        : Math.min(Number(timeoutMs ?? 10_000), 1200);
      await locator.first().waitFor({ state: "attached", timeout: waitTimeout });
    } catch (error) {
      attempts.push({ selector: candidate, status: "missing", message: error.message });
      continue;
    }

    const scored = await locator.evaluateAll(scoreElementsForIdentity, targetIdentity);
    const visibleScored = targetIdentity.matchPolicy?.requireVisible === false
      ? scored
      : scored.filter((item) => item.visible);
    const ranked = visibleScored.sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const second = ranked[1];
    attempts.push({
      selector: candidate,
      status: top ? "scored" : "no-visible-match",
      count: scored.length,
      visibleCount: visibleScored.length,
      topScore: top?.score ?? 0,
      secondScore: second?.score ?? 0
    });

    if (!top || top.score < minScore) continue;
    if (ranked.length === 1 || top.score - (second?.score ?? 0) >= ambiguityMargin) {
      return {
        locator: locator.nth(top.index),
        target: {
          selector: candidate,
          requestedSelector: selector,
          strategy: "targetIdentity",
          index: top.index,
          count: scored.length,
          visibleCount: visibleScored.length,
          score: top.score,
          secondScore: second?.score ?? 0,
          attempts
        }
      };
    }
  }

  throw new BrowserActionError(`Target identity could not be matched safely for selector: ${selector}`, {
    details: {
      selector,
      recommendedSelector: targetIdentity.recommendedSelector ?? null,
      minScore,
      ambiguityMargin,
      attempts
    }
  });
}

async function describeTarget(locator, target) {
  const count = await locator.count().catch(() => null);
  const visibleCount = await locator.evaluateAll((nodes) => nodes.filter((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }).length).catch(() => null);
  return {
    ...(target ?? {}),
    ...(count == null || target?.count != null ? {} : { count }),
    ...(visibleCount == null || target?.visibleCount != null ? {} : { visibleCount }),
    ...(count == null ? {} : { resolvedCount: count }),
    ...(visibleCount == null ? {} : { resolvedVisibleCount: visibleCount })
  };
}

function candidateSelectors(selector, targetIdentity) {
  const selectors = [
    targetIdentity.recommendedSelector,
    selector,
    ...(targetIdentity.selectorCandidates ?? []).map((candidate) => candidate?.selector)
  ];
  return [...new Set(selectors.map((item) => String(item || "").trim()).filter(Boolean))];
}

function scoreElementsForIdentity(nodes, identity) {
  const weights = {
    "data-e2e": 34,
    "data-testid": 34,
    "data-test": 32,
    "data-cy": 32,
    "aria-label": 24,
    placeholder: 24,
    name: 20,
    role: 18,
    type: 14,
    title: 14,
    href: 10,
    id: 18
  };
  const expectedAttributes = identity.attributes || {};
  const expectedClasses = Array.isArray(identity.classList) ? identity.classList : [];
  const expectedText = normalizeText(identity.text || identity.labelText || identity.accessibleName || "");

  return nodes.map((node, index) => {
    const rect = node.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden" && getComputedStyle(node).display !== "none";
    let score = visible ? 6 : 0;
    const tagName = node.nodeName.toLowerCase();
    if (identity.tagName && tagName === String(identity.tagName).toLowerCase()) score += 10;

    for (const [name, expectedValue] of Object.entries(expectedAttributes)) {
      const actualValue = node.getAttribute(name);
      if (!expectedValue || !actualValue) continue;
      if (actualValue === expectedValue) {
        score += weights[name] ?? (name.startsWith("data-") ? 24 : 8);
      } else if (name === "href" && actualValue.includes(expectedValue)) {
        score += 6;
      }
    }

    const classMatches = expectedClasses.filter((className) => node.classList.contains(className)).length;
    score += Math.min(classMatches * 3, 12);

    const actualText = normalizeText([
      node.getAttribute("aria-label"),
      node.getAttribute("placeholder"),
      node.getAttribute("title"),
      node.textContent
    ].filter(Boolean).join(" "));
    if (expectedText && actualText) {
      if (actualText === expectedText) score += 20;
      else if (actualText.includes(expectedText) || expectedText.includes(actualText)) score += 10;
    }

    return {
      index,
      score,
      visible,
      tagName
    };
  });

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new BrowserActionError("Playwright is not installed. Install it in the host project to use createPlaywrightDriver().", {
      cause: error,
      details: { install: "npm install -D playwright" }
    });
  }
}
