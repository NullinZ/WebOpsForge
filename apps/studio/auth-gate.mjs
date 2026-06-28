import net from "node:net";

const DEFAULT_TOKEN_COOKIE_NAMES = ["admin_token", "ai_cases_token", "token", "designer_token"];
const DEFAULT_LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1"];
const DEFAULT_USERINFO_BASE_URLS = ["http://127.0.0.1:8011", "http://localhost:8011", "http://192.168.1.8:88"];

export function studioAuthConfigFromEnv(env = process.env) {
  const userInfoUrls = userInfoUrlsFromEnv(env);
  return {
    mode: authModeFromText(env.WEBOPS_FORGE_AUTH_MODE ?? env.AHPROJECTMGR_TOOLS_AUTH_MODE ?? "super_admin"),
    userInfoUrls,
    tokenCookieNames: envList(env.WEBOPS_FORGE_AUTH_TOKEN_COOKIE_NAMES, DEFAULT_TOKEN_COOKIE_NAMES),
    localHosts: envList(env.WEBOPS_FORGE_AUTH_LOCAL_HOSTS, DEFAULT_LOCAL_HOSTS),
    loginUrl: envText(env.WEBOPS_FORGE_AUTH_LOGIN_URL) || "/ai-cases/login?redirect={redirect}",
    timeoutMs: envSeconds(env.WEBOPS_FORGE_AUTH_TIMEOUT_SECONDS, 3) * 1000
  };
}

export async function authorizeStudioRequest(req, config, fetchImpl = globalThis.fetch) {
  if (!isAuthEnabled(config)) return { ok: true, tokenSource: "disabled" };
  if (isLocalDevRequest(req, config)) return { ok: true, tokenSource: "local_dev" };

  const tokens = extractAuthTokens(req, config);
  if (tokens.length === 0) {
    return {
      ok: false,
      statusCode: 401,
      code: "auth_required",
      message: "Authentication required."
    };
  }

  return await verifyAnySuperAdminToken(tokens, config, fetchImpl);
}

export function sendStudioAuthFailure(req, res, config, result) {
  if (result.statusCode === 401 && acceptsHtml(req) && !requestPath(req).startsWith("/api/")) {
    res.writeHead(302, { location: loginRedirectUrl(config, req.url ?? "/") });
    res.end();
    return;
  }

  const body = JSON.stringify({ error: result.message, code: result.code });
  res.writeHead(result.statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "www-authenticate": "Bearer"
  });
  res.end(body);
}

export function isAuthEnabled(config) {
  return !["0", "false", "off", "none", "disabled"].includes(String(config.mode ?? "").trim().toLowerCase());
}

export function isLocalDevRequest(req, config) {
  const host = headerValue(req.headers, "host").split(":")[0]?.trim().toLowerCase() ?? "";
  if (!config.localHosts.includes(host)) return false;
  const ips = clientIpValues(req);
  return ips.length > 0 && ips.every((item) => isLoopbackIp(item));
}

export function extractAuthTokens(req, config) {
  const tokens = [];
  const authorization = headerValue(req.headers, "authorization");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) tokens.push({ value: bearer, source: "bearer" });

  const cookies = parseCookieHeader(headerValue(req.headers, "cookie"));
  for (const cookieName of config.tokenCookieNames) {
    const token = cookies.get(cookieName);
    if (token && !tokens.some((item) => item.value === token)) {
      tokens.push({ value: token, source: "cookie" });
    }
  }
  return tokens;
}

async function verifyAnySuperAdminToken(tokens, config, fetchImpl) {
  if (!fetchImpl || config.userInfoUrls.length === 0) {
    return {
      ok: false,
      statusCode: 503,
      code: "auth_provider_unavailable",
      message: "Authentication provider is unavailable."
    };
  }

  let sawForbidden = false;
  for (const token of tokens) {
    const result = await verifySuperAdminToken(token, config, fetchImpl);
    if (result.ok) return result;
    if (result.statusCode === 403) sawForbidden = true;
    if (result.statusCode === 503) continue;
    if (result.statusCode === 401) continue;
  }

  if (sawForbidden) {
    return {
      ok: false,
      statusCode: 403,
      code: "auth_forbidden",
      message: "Current user is not allowed to access WebOps Forge."
    };
  }
  return {
    ok: false,
    statusCode: 401,
    code: "auth_invalid",
    message: "Invalid or expired authentication token."
  };
}

async function verifySuperAdminToken(token, config, fetchImpl) {
  for (const userInfoUrl of config.userInfoUrls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, config.timeoutMs));
    try {
      const response = await fetchImpl(userInfoUrl, {
        method: "GET",
        headers: { authorization: `Bearer ${token.value}` },
        signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) {
        continue;
      }
      if (!response.ok) {
        continue;
      }
      const payload = await response.json().catch(() => ({}));
      const roles = roleValues(payload);
      if (roles.includes("super_admin")) {
        return { ok: true, tokenSource: token.source, roles };
      }
      return {
        ok: false,
        statusCode: 403,
        code: "auth_forbidden",
        message: "Current user is not allowed to access WebOps Forge."
      };
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    statusCode: 503,
    code: "auth_provider_unavailable",
    message: "Authentication provider is unavailable."
  };
}

function userInfoUrlsFromEnv(env) {
  const explicit = envList(env.WEBOPS_FORGE_AUTH_USERINFO_URL);
  if (explicit.length > 0) return explicit;

  const bases = envList(
    env.WEBOPS_FORGE_AUTH_BASE_URLS ?? env.AHOUSE_USER_SERVICE_BASE_URL ?? env.USER_SERVICE_BASE_URL,
    DEFAULT_USERINFO_BASE_URLS
  );
  const path = envText(env.WEBOPS_FORGE_AUTH_USERINFO_PATH ?? env.AHOUSE_USER_SERVICE_ME_PATH ?? env.USER_SERVICE_ME_PATH)
    || "/api/v1/auth/me";
  return bases.map((base) => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`);
}

function authModeFromText(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (["0", "false", "off", "none", "disabled"].includes(text)) return "off";
  return "super_admin";
}

function envList(value, fallback = []) {
  const items = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

function envText(value) {
  return String(value ?? "").trim();
}

function envSeconds(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function headerValue(headers = {}, name) {
  const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? "";
  if (Array.isArray(value)) return value.join(",");
  return String(value ?? "");
}

function parseCookieHeader(value) {
  const cookies = new Map();
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    cookies.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
  }
  return cookies;
}

function clientIpValues(req) {
  const values = [];
  const realIp = headerValue(req.headers, "x-real-ip").trim();
  if (realIp) values.push(realIp);
  for (const item of headerValue(req.headers, "x-forwarded-for").split(",")) {
    const value = item.trim();
    if (value) values.push(value);
  }
  const remoteAddress = req.socket?.remoteAddress ?? req.connection?.remoteAddress ?? "";
  if (remoteAddress) values.push(remoteAddress);
  return values;
}

function isLoopbackIp(value) {
  const text = normalizeIp(value);
  return text === "127.0.0.1" || text === "::1" || text.startsWith("127.");
}

function normalizeIp(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith("::ffff:")) return text.slice("::ffff:".length);
  if (net.isIP(text)) return text;
  return "";
}

function acceptsHtml(req) {
  return headerValue(req.headers, "accept").toLowerCase().includes("text/html");
}

function requestPath(req) {
  try {
    return new URL(req.url ?? "/", `http://${headerValue(req.headers, "host") || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function loginRedirectUrl(config, requestUrl) {
  const redirect = encodeURIComponent(requestUrl || "/");
  if (config.loginUrl.includes("{redirect}")) {
    return config.loginUrl.replaceAll("{redirect}", redirect);
  }
  return `${config.loginUrl}${config.loginUrl.includes("?") ? "&" : "?"}redirect=${redirect}`;
}

function roleValues(payload) {
  const values = new Set();
  for (const candidate of profileCandidates(payload)) {
    for (const field of ["role", "roles", "tag", "tags", "groups", "permissions"]) {
      collectRoleValues(candidate[field], values);
    }
  }
  return Array.from(values);
}

function profileCandidates(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const root = payload;
  const candidates = [root];
  for (const key of ["data", "user", "profile", "account"]) {
    const nested = root[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      candidates.push(nested);
    }
  }
  return candidates;
}

function collectRoleValues(value, output) {
  if (Array.isArray(value)) {
    for (const item of value) collectRoleValues(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const field of ["value", "name", "role", "tag"]) {
      const role = normalizeRole(value[field]);
      if (role) output.add(role);
    }
    return;
  }
  const role = normalizeRole(value);
  if (role) output.add(role);
}

function normalizeRole(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (text.includes(".")) text = text.split(".").at(-1) ?? text;
  return text;
}
