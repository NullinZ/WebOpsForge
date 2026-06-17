import { BrowserActionError } from "../errors.mjs";

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
    async waitFor({ selector, state = "visible", timeoutMs }) {
      await page.locator(selector).waitFor({ state, timeout: timeoutMs });
      return { selector, state };
    },
    async click({ selector, timeoutMs }) {
      await page.locator(selector).click({ timeout: timeoutMs });
      return { selector };
    },
    async fill({ selector, value, timeoutMs, redact = false }) {
      await page.locator(selector).fill(String(value), { timeout: timeoutMs });
      return { selector, filled: true, redacted: redact };
    },
    async press({ selector = null, key, timeoutMs }) {
      if (selector) {
        await page.locator(selector).press(key, { timeout: timeoutMs });
      } else {
        await page.keyboard.press(key);
      }
      return { selector, key };
    },
    async extract({ selector, mode = "text", attribute = null, timeoutMs }) {
      const locator = page.locator(selector);
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
