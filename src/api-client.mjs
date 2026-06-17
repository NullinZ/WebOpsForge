import { BrowserActionError } from "./errors.mjs";
import { getPath } from "./template.mjs";

export function createFetchApiClient({ fetchImpl = globalThis.fetch } = {}) {
  if (!fetchImpl) {
    throw new BrowserActionError("No fetch implementation is available for API calls");
  }

  return {
    kind: "fetch",
    async call(request) {
      const controller = new AbortController();
      const timer = request.timeoutMs ? setTimeout(() => controller.abort(), request.timeoutMs) : null;
      try {
        const headers = normalizeHeaders(request.headers);
        const body = prepareBody(request.body, headers);
        const response = await fetchImpl(request.url, {
          method: request.method,
          headers,
          body,
          signal: controller.signal
        });
        return normalizeFetchResponse(response);
      } catch (error) {
        throw new BrowserActionError(`API call failed: ${request.method} ${request.url}`, {
          cause: error,
          details: { method: request.method, url: request.url }
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  };
}

export async function executeApiCall({ step, driver, apiClient, timeoutMs }) {
  const request = buildApiRequest(step, timeoutMs);
  const session = step.session ?? step.auth ?? "none";
  const caller = (session === "browser" || driver?.kind === "dry-run") && driver?.apiCall
    ? { call: driver.apiCall.bind(driver) }
    : apiClient;
  if (!caller?.call) {
    throw new BrowserActionError("No API client is configured for apiCall", {
      stepId: step.id,
      details: { url: request.url }
    });
  }

  const response = await caller.call(request);
  const result = normalizeApiResult(response, step);
  if (!result.ok && step.failOnStatus !== false) {
    throw new BrowserActionError(`API call returned HTTP ${result.status}: ${request.method} ${request.url}`, {
      stepId: step.id,
      details: {
        status: result.status,
        method: request.method,
        url: request.url,
        body: result.body?.slice?.(0, 500) ?? ""
      }
    });
  }
  return result;
}

export function buildApiRequest(step, timeoutMs = null) {
  return {
    method: String(step.method ?? "GET").toUpperCase(),
    url: withQuery(step.url, step.query),
    headers: normalizeHeaders(step.headers),
    body: step.body ?? step.json ?? null,
    timeoutMs: step.timeoutMs ?? timeoutMs ?? null
  };
}

export function normalizeApiResult(response, step = {}) {
  const result = {
    status: Number(response.status ?? 200),
    ok: Boolean(response.ok ?? isOkStatus(response.status ?? 200)),
    headers: normalizeHeaders(response.headers),
    body: response.body ?? "",
    json: response.json ?? parseJsonMaybe(response.body ?? "")
  };
  const extractPath = step.extract ?? (result.json == null ? "body" : "json");
  result.value = getPath({ ...result, response: result }, extractPath);
  return result;
}

async function normalizeFetchResponse(response) {
  const headers = Object.fromEntries(response.headers.entries());
  const body = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    headers,
    body,
    json: parseJsonMaybe(body)
  };
}

function withQuery(urlValue, query) {
  if (!query || typeof query !== "object") return String(urlValue);
  const url = new URL(String(urlValue));
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      url.searchParams.delete(key);
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function prepareBody(body, headers) {
  if (body == null) return undefined;
  if (typeof body === "string" || body instanceof Uint8Array) return body;
  if (!hasHeader(headers, "content-type")) headers["content-type"] = "application/json";
  return JSON.stringify(body);
}

function normalizeHeaders(headers = {}) {
  if (!headers || typeof headers !== "object") return {};
  if (typeof headers.entries === "function") return Object.fromEntries(headers.entries());
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value != null)
      .map(([key, value]) => [String(key).toLowerCase(), String(value)])
  );
}

function hasHeader(headers, name) {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function parseJsonMaybe(body) {
  if (!body || typeof body !== "string") return null;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isOkStatus(status) {
  return Number(status) >= 200 && Number(status) < 300;
}
