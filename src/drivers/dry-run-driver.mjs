import { BrowserActionError } from "../errors.mjs";
import { normalizeApiResult } from "../api-client.mjs";

export function createDryRunDriver({ pages = {}, apiResponses = {}, initialUrl = "about:blank" } = {}) {
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
    async apiCall(request) {
      const response = findApiResponse(apiResponses, request);
      const result = normalizeApiResult(response);
      log.push({ action: "apiCall", method: request.method, url: request.url, status: result.status });
      return result;
    },
    async currentUrl() {
      return currentUrl;
    },
    async close() {
      log.push({ action: "close" });
    }
  };
}

function findApiResponse(apiResponses, request) {
  const key = `${request.method} ${request.url}`;
  const response = apiResponses[key] ?? apiResponses[request.url] ?? apiResponses["*"];
  if (response == null) {
    throw new BrowserActionError(`API response not found in dry-run driver: ${key}`, {
      details: { method: request.method, url: request.url }
    });
  }
  if (typeof response === "string") return { status: 200, ok: true, body: response };
  if (response.json != null && response.body == null) {
    return {
      status: response.status ?? 200,
      ok: response.ok ?? true,
      headers: response.headers ?? { "content-type": "application/json" },
      body: JSON.stringify(response.json),
      json: response.json
    };
  }
  return response;
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
