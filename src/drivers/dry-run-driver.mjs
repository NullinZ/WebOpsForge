import { BrowserActionError } from "../errors.mjs";

export function createDryRunDriver({ pages = {}, initialUrl = "about:blank" } = {}) {
  let currentUrl = initialUrl;
  const log = [];
  const values = new Map();

  return {
    kind: "dry-run",
    log,
    async goto({ url }) {
      currentUrl = url;
      log.push({ action: "goto", url });
      return { url };
    },
    async waitFor({ selector, state = "visible" }) {
      findSelector({ pages, currentUrl, selector });
      log.push({ action: "waitFor", selector, state });
      return { selector, state };
    },
    async click({ selector }) {
      findSelector({ pages, currentUrl, selector });
      log.push({ action: "click", selector });
      return { selector };
    },
    async fill({ selector, value, redact = false }) {
      findSelector({ pages, currentUrl, selector });
      values.set(selector, value);
      log.push({ action: "fill", selector, value: redact ? "[redacted]" : value });
      return { selector, filled: true, redacted: redact };
    },
    async press({ selector = null, key }) {
      if (selector) findSelector({ pages, currentUrl, selector });
      log.push({ action: "press", selector, key });
      return { selector, key };
    },
    async extract({ selector, mode = "text", attribute = null }) {
      const node = findSelector({ pages, currentUrl, selector });
      const value = extractValue(node, { mode, attribute, values, selector });
      log.push({ action: "extract", selector, mode, attribute, value });
      return { selector, mode, attribute, value };
    },
    async screenshot({ name, fullPage = false }) {
      const text = `dry-run screenshot: ${name} ${currentUrl} fullPage=${fullPage}`;
      log.push({ action: "screenshot", name, fullPage });
      return { contentType: "text/plain", text };
    },
    async currentUrl() {
      return currentUrl;
    },
    async close() {
      log.push({ action: "close" });
    }
  };
}

function findSelector({ pages, currentUrl, selector }) {
  const page = pages[currentUrl] ?? pages["*"];
  const node = page?.selectors?.[selector];
  if (!node) {
    throw new BrowserActionError(`Selector not found in dry-run page: ${selector}`, {
      details: { currentUrl, selector }
    });
  }
  return node;
}

function extractValue(node, { mode, attribute, values, selector }) {
  if (values.has(selector) && (mode === "value" || mode === "text")) return values.get(selector);
  if (mode === "attribute") return node.attributes?.[attribute] ?? "";
  if (mode === "html") return node.html ?? node.text ?? "";
  if (mode === "value") return node.value ?? "";
  return node.text ?? node.value ?? "";
}
