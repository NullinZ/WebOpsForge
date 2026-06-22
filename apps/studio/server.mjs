import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StudioStore, createRunQueue } from "../../src/index.mjs";
import { probeProfileSession } from "../../src/studio/profile-session.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT ?? 4177);
const host = process.env.HOST ?? "127.0.0.1";
const store = new StudioStore();
await store.init();
const queue = createRunQueue({ store, concurrency: Number(process.env.WEBOPS_FORGE_CONCURRENCY ?? 1) });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);
    if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      sendJson(res, 204, {});
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, statusFromError(error), {
      error: {
        name: error.name ?? "Error",
        message: error.message ?? String(error),
        code: error.code ?? "ERROR"
      }
    });
  }
});

server.listen(port, host, () => {
  console.log(`WebOps Studio running at http://${host}:${port}`);
});

async function handleApi(req, res, url) {
  const { method } = req;
  const parts = url.pathname.split("/").filter(Boolean).slice(1);

  if (method === "GET" && parts[0] === "health") {
    sendJson(res, 200, { ok: true, service: "webops-forge-studio" });
    return;
  }

  if (method === "GET" && parts[0] === "runtime") {
    sendJson(res, 200, {
      queue: queue.status(),
      dataDir: store.dir,
      modes: ["dry-run", "playwright"],
      operationModes: ["browser", "api"],
      registry: summarizeRegistry(await store.getRegistry()),
      profiles: (await store.listProfiles()).length
    });
    return;
  }

  if (method === "GET" && parts[0] === "audit") {
    const limit = Number(url.searchParams.get("limit") ?? 100);
    sendJson(res, 200, { audit: await store.listAudit({ limit }) });
    return;
  }

  if (method === "GET" && parts[0] === "export") {
    sendJson(res, 200, await store.exportBundle());
    return;
  }

  if (method === "POST" && parts[0] === "import") {
    sendJson(res, 200, await store.importBundle(await readJsonBody(req)));
    return;
  }

  if (parts[0] === "workflows") {
    await handleWorkflows(req, res, parts);
    return;
  }

  if (parts[0] === "profiles") {
    await handleProfiles(req, res, parts);
    return;
  }

  if (parts[0] === "registry") {
    await handleRegistry(req, res, parts);
    return;
  }

  if (parts[0] === "runs") {
    await handleRuns(req, res, parts, url);
    return;
  }

  if (parts[0] === "picker") {
    await handlePicker(req, res, parts, url);
    return;
  }

  sendJson(res, 404, { error: { message: "API route not found" } });
}

async function handlePicker(req, res, parts, url) {
  if (parts[1] === "session") {
    if (req.method === "GET") {
      sendJson(res, 200, { session: await store.getPickerSession() });
      return;
    }
    if (req.method === "POST") {
      const session = await store.savePickerSession(await readJsonBody(req));
      sendJson(res, 201, { session });
      return;
    }
    if (req.method === "DELETE") {
      sendJson(res, 200, await store.clearPickerSession(await readJsonBody(req)));
      return;
    }
  }

  if (parts[1] === "events") {
    if (req.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      sendJson(res, 200, { events: await store.listPickerEvents({ limit }) });
      return;
    }
    if (req.method === "POST") {
      const event = await store.savePickerEvent(await readJsonBody(req));
      sendJson(res, 201, { event });
      return;
    }
  }

  sendJson(res, 404, { error: { message: "Picker route not found" } });
}

async function handleRegistry(req, res, parts) {
  const section = parts[1] ? decodeURIComponent(parts[1]) : null;
  const id = parts[2] ? decodeURIComponent(parts[2]) : null;

  if (req.method === "GET" && !section) {
    sendJson(res, 200, { registry: await store.getRegistry() });
    return;
  }

  if (req.method === "PUT" && !section) {
    sendJson(res, 200, { registry: await store.saveRegistry(await readJsonBody(req)) });
    return;
  }

  if (req.method === "POST" && section && !id) {
    const result = await store.saveRegistryItem(section, await readJsonBody(req));
    sendJson(res, 201, result);
    return;
  }

  if (req.method === "PUT" && section && id) {
    const result = await store.saveRegistryItem(section, { ...(await readJsonBody(req)), id });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "DELETE" && section && id) {
    sendJson(res, 200, await store.deleteRegistryItem(section, id));
    return;
  }

  sendJson(res, 405, { error: { message: "Registry method not allowed" } });
}

async function handleWorkflows(req, res, parts) {
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;

  if (req.method === "POST" && id === "validate") {
    const body = await readJsonBody(req);
    sendJson(res, 200, await store.validateWorkflow(body.workflow ?? body));
    return;
  }

  if (req.method === "GET" && !id) {
    sendJson(res, 200, { workflows: await store.listWorkflows() });
    return;
  }

  if (req.method === "POST" && !id) {
    const body = await readJsonBody(req);
    const workflow = await store.saveWorkflow(body);
    sendJson(res, 201, { workflow });
    return;
  }

  if (req.method === "GET" && id) {
    const workflow = await requireWorkflow(id);
    sendJson(res, 200, { workflow });
    return;
  }

  if (req.method === "PUT" && id) {
    const current = await requireWorkflow(id);
    const body = await readJsonBody(req);
    const workflow = await store.saveWorkflow({ ...current, ...body, id });
    sendJson(res, 200, { workflow });
    return;
  }

  if (req.method === "DELETE" && id) {
    sendJson(res, 200, await store.deleteWorkflow(id));
    return;
  }

  if (req.method === "POST" && id && parts[2] === "runs") {
    const workflow = await requireWorkflow(id);
    const body = await readJsonBody(req);
    const defaults = workflow.defaultRun ?? {};
    const run = await store.createRun({
      workflowId: id,
      mode: body.mode ?? defaults.mode ?? "dry-run",
      input: body.input ?? defaults.input ?? {},
      context: body.context ?? defaults.context ?? {},
      driverConfig: body.driverConfig ?? defaults.driverConfig ?? {},
      profileId: body.profileId ?? defaults.profileId ?? null
    });
    queue.enqueue(run.id);
    sendJson(res, 202, { run });
    return;
  }

  sendJson(res, 405, { error: { message: "Workflow method not allowed" } });
}

async function handleProfiles(req, res, parts) {
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;

  if (req.method === "GET" && !id) {
    sendJson(res, 200, { profiles: await store.listProfiles() });
    return;
  }

  if (req.method === "POST" && !id) {
    sendJson(res, 201, { profile: await store.saveProfile(await readJsonBody(req)) });
    return;
  }

  if (req.method === "GET" && id) {
    sendJson(res, 200, { profile: await requireProfile(id) });
    return;
  }

  if (req.method === "POST" && id && parts[2] === "check-session") {
    const current = await requireProfile(id);
    if (current.status === "busy" && current.leasedRunId) {
      const error = new Error(`Profile is busy: ${current.name}`);
      error.statusCode = 409;
      error.code = "PROFILE_BUSY";
      throw error;
    }
    const result = await probeProfileSession({
      profile: current,
      overrides: await readJsonBody(req)
    });
    const nextStatus = current.status === "disabled"
      ? "disabled"
      : result.loginState === "authenticated"
        ? "ready"
        : result.loginState === "logged-out"
          ? "blocked"
          : current.status;
    const profile = await store.saveProfile({
      ...current,
      platform: result.platform,
      accountLabel: result.accountLabel,
      loginState: result.loginState,
      status: nextStatus,
      lastCheckedAt: result.lastCheckedAt,
      sessionCheck: result.sessionCheck
    });
    await store.appendAudit({
      type: "profile.session_checked",
      profileId: id,
      profileName: profile.name,
      loginState: result.loginState,
      accountLabel: result.accountLabel
    });
    sendJson(res, 200, { profile, result });
    return;
  }

  if (req.method === "PUT" && id) {
    const current = await requireProfile(id);
    sendJson(res, 200, { profile: await store.saveProfile({ ...current, ...(await readJsonBody(req)), id }) });
    return;
  }

  if (req.method === "DELETE" && id) {
    sendJson(res, 200, await store.deleteProfile(id));
    return;
  }

  sendJson(res, 405, { error: { message: "Profile method not allowed" } });
}

async function handleRuns(req, res, parts, url) {
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;

  if (req.method === "GET" && !id) {
    const limit = Number(url.searchParams.get("limit") ?? 50);
    sendJson(res, 200, { runs: await store.listRuns({ limit }) });
    return;
  }

  if (req.method === "GET" && id && parts.length === 2) {
    const run = await requireRun(id);
    sendJson(res, 200, {
      run,
      events: await store.readRunEvents(id),
      artifacts: await store.listRunArtifacts(id)
    });
    return;
  }

  if (req.method === "POST" && id && parts[2] === "cancel") {
    await requireRun(id);
    sendJson(res, 200, await queue.cancel(id, "operator"));
    return;
  }

  if (req.method === "POST" && id && parts[2] === "retry") {
    await requireRun(id);
    const retry = await store.retryRun(id);
    queue.enqueue(retry.id);
    sendJson(res, 202, { run: retry });
    return;
  }

  if (req.method === "GET" && id && parts[2] === "events") {
    await requireRun(id);
    sendJson(res, 200, { events: await store.readRunEvents(id) });
    return;
  }

  if (req.method === "GET" && id && parts[2] === "artifacts" && parts[3]) {
    await requireRun(id);
    await serveArtifact(res, id, decodeURIComponent(parts[3]));
    return;
  }

  sendJson(res, 404, { error: { message: "Run route not found" } });
}

async function requireWorkflow(id) {
  const workflow = await store.getWorkflow(id);
  if (!workflow) {
    const error = new Error(`Workflow not found: ${id}`);
    error.statusCode = 404;
    throw error;
  }
  return workflow;
}

async function requireRun(id) {
  const run = await store.getRun(id);
  if (!run) {
    const error = new Error(`Run not found: ${id}`);
    error.statusCode = 404;
    throw error;
  }
  return run;
}

async function requireProfile(id) {
  const profile = await store.getProfile(id);
  if (!profile) {
    const error = new Error(`Profile not found: ${id}`);
    error.statusCode = 404;
    throw error;
  }
  return profile;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function serveStatic(res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = safeJoin(publicDir, requestPath);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    const indexPath = path.join(publicDir, "index.html");
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });
    createReadStream(indexPath).pipe(res);
  }
}

async function serveArtifact(res, runId, artifactName) {
  const filePath = store.getArtifactPath(runId, artifactName);
  const safeRoot = path.join(store.getRunDirFor(runId), "artifacts");
  if (!filePath.startsWith(safeRoot)) {
    sendJson(res, 403, { error: { message: "Artifact path rejected" } });
    return;
  }
  try {
    await stat(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    sendJson(res, 404, { error: { message: "Artifact not found" } });
  }
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(statusCode === 204 ? "" : JSON.stringify(value, null, 2));
}

function statusFromError(error) {
  if (error.statusCode) return error.statusCode;
  if (error.name === "ActionValidationError") return 400;
  if (error instanceof SyntaxError) return 400;
  return 500;
}

function safeJoin(root, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(root, normalized);
  if (!filePath.startsWith(root)) return path.join(root, "index.html");
  return filePath;
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function summarizeRegistry(registry) {
  return {
    sites: registry.sites?.length ?? 0,
    pages: registry.pages?.length ?? 0,
    actions: registry.actions?.length ?? 0,
    operations: registry.operations?.length ?? 0
  };
}
