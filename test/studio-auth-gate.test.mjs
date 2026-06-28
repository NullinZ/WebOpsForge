import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizeStudioRequest,
  extractAuthTokens,
  isLocalDevRequest,
  studioAuthConfigFromEnv
} from "../apps/studio/auth-gate.mjs";

function request({ url = "/api/runtime", host = "123.120.59.216", headers = {}, remoteAddress = "203.0.113.20" } = {}) {
  return {
    url,
    headers: { host, ...headers },
    socket: { remoteAddress }
  };
}

function config(extra = {}) {
  return {
    ...studioAuthConfigFromEnv({
      WEBOPS_FORGE_AUTH_USERINFO_URL: "https://auth.example.test/me",
      WEBOPS_FORGE_AUTH_TIMEOUT_SECONDS: "1"
    }),
    ...extra
  };
}

test("studio auth rejects anonymous remote requests", async () => {
  const result = await authorizeStudioRequest(request(), config(), async () => {
    throw new Error("should not call auth provider without a token");
  });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
  assert.equal(result.code, "auth_required");
});

test("studio auth allows loopback local development requests", async () => {
  const req = request({ host: "localhost:4177", remoteAddress: "127.0.0.1" });

  assert.equal(isLocalDevRequest(req, config()), true);
  assert.equal((await authorizeStudioRequest(req, config())).ok, true);
});

test("studio auth does not trust spoofed localhost host from a forwarded public client", async () => {
  const req = request({
    host: "localhost:4177",
    headers: { "x-real-ip": "203.0.113.20" },
    remoteAddress: "127.0.0.1"
  });

  assert.equal(isLocalDevRequest(req, config()), false);
  const result = await authorizeStudioRequest(req, config());
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 401);
});

test("studio auth extracts bearer and configured token cookies", () => {
  const tokens = extractAuthTokens(
    request({
      headers: {
        authorization: "Bearer bearer-token",
        cookie: "admin_token=admin-cookie; theme=dark"
      }
    }),
    config()
  );

  assert.deepEqual(tokens, [
    { value: "bearer-token", source: "bearer" },
    { value: "admin-cookie", source: "cookie" }
  ]);
});

test("studio auth allows super admin roles from the configured userinfo endpoint", async () => {
  const calls = [];
  const result = await authorizeStudioRequest(
    request({ headers: { authorization: "Bearer good-token" } }),
    config(),
    async (url, options) => {
      calls.push({ url, authorization: options.headers.authorization });
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: { roles: ["super_admin"] } };
        }
      };
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.tokenSource, "bearer");
  assert.deepEqual(calls, [
    {
      url: "https://auth.example.test/me",
      authorization: "Bearer good-token"
    }
  ]);
});

test("studio auth rejects authenticated non-super-admin users", async () => {
  const result = await authorizeStudioRequest(
    request({ headers: { authorization: "Bearer regular-token" } }),
    config(),
    async () => ({
      ok: true,
      status: 200,
      async json() {
        return { data: { role: "admin" } };
      }
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.code, "auth_forbidden");
});
