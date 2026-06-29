import { BrowserActionError, BrowserBlockedError } from "../errors.mjs";
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
    async extractList({ selector, fields = {}, limit = null }) {
      const node = findSelector({ pages, currentUrl, selector });
      const items = Array.isArray(node.items) ? node.items : [];
      const limited = limit == null ? items : items.slice(0, Number(limit));
      const value = limited.map((item, index) => extractRecordFromFields({
        node: item,
        fields,
        values,
        currentUrl,
        index
      }));
      log.push({ action: "extractList", selector, count: value.length });
      return { selector, value, count: value.length };
    },
    async extractDetail({ fields = {} }) {
      const page = pages[currentUrl] ?? pages["*"] ?? {};
      const value = extractRecordFromFields({
        node: page,
        fields,
        values,
        currentUrl
      });
      log.push({ action: "extractDetail", fields: Object.keys(fields), count: Object.keys(value).length });
      return { value };
    },
    async extractMedia({ selector, sources = null, limit = null }) {
      const node = findSelector({ pages, currentUrl, selector });
      const nodes = Array.isArray(node.items) ? node.items : [node];
      const limited = limit == null ? nodes : nodes.slice(0, Number(limit));
      const value = limited.map((item, index) => extractMediaRecord(item, {
        currentUrl,
        sources,
        index
      })).filter((item) => item.url || Object.keys(item.attributes).length > 0);
      log.push({ action: "extractMedia", selector, count: value.length });
      return { selector, value, count: value.length };
    },
    async paginate({ nextSelector, maxPages = 1 }) {
      const visited = [];
      for (let index = 0; index < Number(maxPages ?? 1); index += 1) {
        const page = pages[currentUrl] ?? pages["*"];
        if (!page?.selectors?.[nextSelector]) break;
        const nextUrl = page.nextUrl ?? page.selectors[nextSelector]?.attributes?.href;
        if (!nextUrl) break;
        const resolved = resolveUrl(nextUrl, currentUrl);
        visited.push(resolved);
        currentUrl = resolved;
      }
      log.push({ action: "paginate", nextSelector, pages: visited.length });
      return { nextSelector, pagesVisited: visited.length, urls: visited, value: visited };
    },
    async checkSession({ accountSelector = null, loggedOutSelector = null }) {
      const page = pages[currentUrl] ?? pages["*"] ?? {};
      const loggedOutNode = loggedOutSelector ? page.selectors?.[loggedOutSelector] : null;
      if (loggedOutNode && nodeIsVisible(loggedOutNode)) {
        log.push({ action: "checkSession", loginState: "logged-out", loggedOutSelector });
        throw new BrowserBlockedError("Login required for the current browser session", {
          reason: "login_required",
          details: {
            accountSelector,
            loggedOutSelector
          }
        });
      }

      const accountNode = accountSelector ? page.selectors?.[accountSelector] : null;
      if (accountSelector && !accountNode) {
        log.push({ action: "checkSession", loginState: "unknown", accountSelector });
        throw new BrowserBlockedError("Authenticated account marker was not found", {
          reason: "login_required",
          details: {
            accountSelector,
            loggedOutSelector
          }
        });
      }

      const accountLabel = accountNode ? extractValue(accountNode, { mode: "text", values, selector: accountSelector }) : "";
      const value = {
        loginState: accountNode ? "authenticated" : "unknown",
        accountLabel
      };
      log.push({ action: "checkSession", ...value, accountSelector, loggedOutSelector });
      return { ...value, value };
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

function nodeIsVisible(node) {
  if (!node) return false;
  if (node.visible === false || node.hidden === true) return false;
  const style = node.style && typeof node.style === "object" ? node.style : {};
  return style.display !== "none" && style.visibility !== "hidden";
}

function extractRecordFromFields({ node, fields, values, currentUrl, index = null }) {
  return Object.fromEntries(Object.entries(fields).map(([name, spec]) => {
    const field = normalizeFieldSpec(spec);
    const target = field.selector
      ? node.selectors?.[field.selector] ?? node.fields?.[field.selector] ?? node[field.selector]
      : node;
    const value = target
      ? extractValue(target, { mode: field.mode, attribute: field.attribute, values, selector: field.selector ?? name })
      : field.default ?? null;
    return [name, normalizeExtractedValue(value, field, { currentUrl, index })];
  }));
}

function normalizeFieldSpec(spec) {
  if (typeof spec === "string") return { selector: spec, mode: "text", attribute: null };
  return {
    selector: spec?.selector ?? null,
    mode: spec?.mode ?? (spec?.attribute ? "attribute" : "text"),
    attribute: spec?.attribute ?? spec?.attr ?? null,
    type: spec?.type ?? "string",
    default: spec?.default ?? null
  };
}

function extractValue(node, { mode, attribute, values, selector }) {
  if (values.has(selector) && (mode === "value" || mode === "text")) return values.get(selector);
  if (mode === "attribute") return node.attributes?.[attribute] ?? "";
  if (mode === "html") return node.html ?? node.text ?? "";
  if (mode === "value") return node.value ?? "";
  return node.text ?? node.value ?? "";
}

function normalizeExtractedValue(value, field, { currentUrl }) {
  if (value == null) return value;
  if (field.type === "number") {
    const number = Number(String(value).replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(number) ? number : null;
  }
  if (field.type === "url") return resolveUrl(value, currentUrl);
  return value;
}

function extractMediaRecord(node, { currentUrl, sources = null, index = null }) {
  const attributes = node.attributes ?? {};
  const sourceNames = Array.isArray(sources) && sources.length > 0
    ? sources
    : ["src", "currentSrc", "href", "poster", "data-src", "srcset"];
  const sourceEntries = Object.fromEntries(sourceNames
    .map((name) => [name, attributes[name]])
    .filter(([, value]) => value));
  const firstSource = sourceEntries.currentSrc ?? sourceEntries.src ?? sourceEntries.href ?? sourceEntries.poster ?? sourceEntries["data-src"] ?? sourceEntries.srcset ?? "";
  return {
    index,
    tagName: node.tagName ?? node.tag ?? "",
    url: firstSource ? resolveUrl(firstSource, currentUrl) : "",
    attributes: Object.fromEntries(Object.entries({
      alt: attributes.alt,
      title: attributes.title,
      width: attributes.width,
      height: attributes.height,
      ...sourceEntries
    }).filter(([, value]) => value != null && value !== ""))
  };
}

function resolveUrl(value, baseUrl) {
  try {
    return new URL(String(value), baseUrl).toString();
  } catch {
    return String(value);
  }
}
