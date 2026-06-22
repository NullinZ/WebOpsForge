import { BrowserActionError } from "../errors.mjs";
import { normalizeApiResult } from "../api-client.mjs";

export async function createPlaywrightDriver({
  browserType = "chromium",
  profileDir = null,
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
    const context = await type.launchPersistentContext(profileDir, {
      headless,
      viewport,
      ...launchOptions,
      ...contextOptions
    });
    const existing = context.pages()[0];
    const activePage = existing ?? await context.newPage();
    return createDriverFromPage({ page: activePage, context, ownsBrowser: true });
  }

  const browser = await type.launch({ headless, ...launchOptions });
  const context = await browser.newContext({ viewport, ...contextOptions });
  const activePage = await context.newPage();
  return createDriverFromPage({ page: activePage, context, browser, ownsBrowser: true });
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
      const locator = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.waitFor({ state, timeout: timeoutMs });
      return { selector, state };
    },
    async click({ selector, timeoutMs, targetIdentity = null }) {
      const locator = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.click({ timeout: timeoutMs });
      return { selector };
    },
    async fill({ selector, value, timeoutMs, redact = false, targetIdentity = null }) {
      const locator = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.fill(String(value), { timeout: timeoutMs });
      return { selector, filled: true, redacted: redact };
    },
    async press({ selector = null, key, timeoutMs, targetIdentity = null }) {
      if (selector) {
        const locator = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
        await locator.press(key, { timeout: timeoutMs });
      } else {
        await page.keyboard.press(key);
      }
      return { selector, key };
    },
    async extract({ selector, mode = "text", attribute = null, timeoutMs, targetIdentity = null }) {
      const locator = await resolveTargetLocator(page, { selector, timeoutMs, targetIdentity });
      await locator.waitFor({ state: "attached", timeout: timeoutMs });
      if (mode === "attribute") {
        return { selector, mode, attribute, value: await locator.getAttribute(attribute, { timeout: timeoutMs }) };
      }
      if (mode === "html") return { selector, mode, value: await locator.innerHTML({ timeout: timeoutMs }) };
      if (mode === "value") return { selector, mode, value: await locator.inputValue({ timeout: timeoutMs }) };
      return { selector, mode: "text", value: await locator.innerText({ timeout: timeoutMs }) };
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

async function resolveTargetLocator(page, { selector, timeoutMs, targetIdentity = null }) {
  if (!targetIdentity) return page.locator(selector);

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
      return locator.nth(top.index);
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
