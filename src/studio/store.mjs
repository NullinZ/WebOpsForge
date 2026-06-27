import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSampleWorkflowRecord } from "./sample-workflows.mjs";
import { normalizeProfileNetwork } from "./profile-network.mjs";
import { normalizeWorkflow } from "../workflow.mjs";
import { normalizePickerEvent } from "../selector-identity.mjs";

export class StudioStore {
  constructor({ dir = process.env.WEBOPS_FORGE_DATA_DIR ?? path.join(process.cwd(), ".webops-forge"), clock = () => new Date() } = {}) {
    this.dir = dir;
    this.clock = clock;
    this.workflowsFile = path.join(dir, "workflows.json");
    this.runsFile = path.join(dir, "runs.json");
    this.profilesFile = path.join(dir, "profiles.json");
    this.registryFile = path.join(dir, "registry.json");
    this.pickerEventsFile = path.join(dir, "picker-events.json");
    this.pickerSessionFile = path.join(dir, "picker-session.json");
    this.auditFile = path.join(dir, "audit.jsonl");
    this.runsDir = path.join(dir, "runs");
    this.browserProfilesDir = path.join(dir, "browser-profiles");
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.runsDir, { recursive: true });
    await mkdir(this.browserProfilesDir, { recursive: true });
    await this.#ensureJsonFile(this.workflowsFile, []);
    await this.#ensureJsonFile(this.runsFile, []);
    await this.#ensureJsonFile(this.profilesFile, []);
    await this.#ensureJsonFile(this.registryFile, createDefaultRegistry(this.clock));
    await this.#ensureJsonFile(this.pickerEventsFile, []);
    await this.#ensureJsonFile(this.pickerSessionFile, null);

    const workflows = await this.listWorkflows();
    if (workflows.length === 0) {
      const sample = createSampleWorkflowRecord(this.clock);
      sample.workflow = normalizeWorkflow(sample.workflow);
      await this.#writeJson(this.workflowsFile, [sample]);
    }

    const profiles = await this.listProfiles();
    if (profiles.length === 0) {
      await this.#writeJson(this.profilesFile, createDefaultProfiles(this.clock, {
        browserProfilesDir: this.browserProfilesDir
      }));
    }

    await this.#migrateSeedData();
  }

  async getRegistry() {
    return normalizeRegistry(await this.#readJson(this.registryFile, createDefaultRegistry(this.clock)), this.clock);
  }

  async saveRegistry(registry) {
    const normalized = normalizeRegistry(registry, this.clock);
    await this.#writeJson(this.registryFile, normalized);
    await this.appendAudit({ type: "registry.saved" });
    return normalized;
  }

  async saveRegistryItem(section, record) {
    const registry = await this.getRegistry();
    if (!registry[section]) throw new Error(`Unknown registry section: ${section}`);
    const now = this.clock().toISOString();
    const id = record.id || createId(section.slice(0, -1) || "registry");
    const existing = registry[section].find((item) => item.id === id);
    const normalized = normalizeRegistryItem(section, {
      ...existing,
      ...record,
      id,
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: now
    });
    registry[section] = registry[section].filter((item) => item.id !== id);
    registry[section].push(normalized);
    const saved = await this.saveRegistry(registry);
    await this.appendAudit({ type: "registry.item_saved", section, id, name: normalized.name });
    return { registry: saved, item: normalized };
  }

  async deleteRegistryItem(section, id) {
    const registry = await this.getRegistry();
    if (!registry[section]) throw new Error(`Unknown registry section: ${section}`);
    const previous = registry[section].length;
    registry[section] = registry[section].filter((item) => item.id !== id);
    const saved = await this.saveRegistry(registry);
    await this.appendAudit({ type: "registry.item_deleted", section, id });
    return { registry: saved, deleted: previous !== registry[section].length };
  }

  async listWorkflows() {
    const workflows = await this.#readJson(this.workflowsFile, []);
    return workflows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async getWorkflow(id) {
    return (await this.listWorkflows()).find((workflow) => workflow.id === id) ?? null;
  }

  async saveWorkflow(record) {
    const workflows = await this.listWorkflows();
    const now = this.clock().toISOString();
    const id = record.id || createId("workflow");
    const existing = workflows.find((workflow) => workflow.id === id);
    const normalized = {
      id,
      name: record.name || record.workflow?.name || id,
      description: record.description ?? "",
      workflow: normalizeWorkflow(record.workflow),
      defaultRun: record.defaultRun ?? {
        mode: "dry-run",
        input: {},
        context: {},
        driverConfig: {}
      },
      graph: normalizeWorkflowGraph(record.graph ?? existing?.graph ?? {}),
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: now
    };
    const next = workflows.filter((workflow) => workflow.id !== id);
    next.push(normalized);
    await this.#writeJson(this.workflowsFile, next);
    return normalized;
  }

  async deleteWorkflow(id) {
    const workflows = await this.listWorkflows();
    const next = workflows.filter((workflow) => workflow.id !== id);
    await this.#writeJson(this.workflowsFile, next);
    return { deleted: workflows.length !== next.length };
  }

  async validateWorkflow(workflow) {
    const normalized = normalizeWorkflow(workflow);
    return {
      ok: true,
      workflow: normalized,
      stepCount: normalized.steps.length,
      actions: normalized.steps.map((step) => step.action)
    };
  }

  async listProfiles() {
    const profiles = await this.#readJson(this.profilesFile, []);
    return profiles.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  async getProfile(id) {
    return (await this.listProfiles()).find((profile) => profile.id === id) ?? null;
  }

  async saveProfile(record) {
    const profiles = await this.listProfiles();
    const now = this.clock().toISOString();
    const id = record.id || createId("profile");
    const existing = profiles.find((profile) => profile.id === id);
    const status = record.status ?? existing?.status ?? "ready";
    const normalized = {
      id,
      name: record.name || existing?.name || id,
      mode: record.mode || existing?.mode || "dry-run",
      platform: record.platform ?? existing?.platform ?? "",
      accountLabel: record.accountLabel ?? existing?.accountLabel ?? "",
      loginState: record.loginState ?? existing?.loginState ?? "unchecked",
      profileDir: record.profileDir ?? existing?.profileDir ?? "",
      profileDirectory: record.profileDirectory ?? existing?.profileDirectory ?? "",
      browserType: record.browserType ?? existing?.browserType ?? "chromium",
      browserChannel: record.browserChannel ?? existing?.browserChannel ?? "",
      headless: Boolean(record.headless ?? existing?.headless ?? false),
      network: normalizeProfileNetwork(record, existing),
      status,
      leasedRunId: status === "busy" ? record.leasedRunId ?? existing?.leasedRunId ?? null : record.leasedRunId ?? null,
      rateLimit: {
        minDelayMs: Number(record.rateLimit?.minDelayMs ?? existing?.rateLimit?.minDelayMs ?? 0),
        maxDelayMs: record.rateLimit?.maxDelayMs ?? existing?.rateLimit?.maxDelayMs ?? null,
        maxPerMinute: record.rateLimit?.maxPerMinute ?? existing?.rateLimit?.maxPerMinute ?? null
      },
      sessionCheck: {
        platform: record.sessionCheck?.platform ?? record.platform ?? existing?.sessionCheck?.platform ?? existing?.platform ?? "",
        url: record.sessionCheck?.url ?? existing?.sessionCheck?.url ?? "",
        accountSelector: record.sessionCheck?.accountSelector ?? existing?.sessionCheck?.accountSelector ?? "",
        loggedOutSelector: record.sessionCheck?.loggedOutSelector ?? existing?.sessionCheck?.loggedOutSelector ?? "",
        timeoutMs: Number(record.sessionCheck?.timeoutMs ?? existing?.sessionCheck?.timeoutMs ?? 10_000)
      },
      tags: Array.isArray(record.tags) ? record.tags : existing?.tags ?? [],
      notes: record.notes ?? existing?.notes ?? "",
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      updatedAt: now,
      lastRunAt: record.lastRunAt ?? existing?.lastRunAt ?? null,
      lastCheckedAt: record.lastCheckedAt ?? existing?.lastCheckedAt ?? null
    };
    const next = profiles.filter((profile) => profile.id !== id);
    next.push(normalized);
    await this.#writeJson(this.profilesFile, next);
    await this.appendAudit({ type: "profile.saved", profileId: id, profileName: normalized.name });
    return normalized;
  }

  async deleteProfile(id) {
    const profiles = await this.listProfiles();
    const profile = profiles.find((item) => item.id === id);
    const next = profiles.filter((item) => item.id !== id);
    await this.#writeJson(this.profilesFile, next);
    await this.appendAudit({ type: "profile.deleted", profileId: id, profileName: profile?.name ?? id });
    return { deleted: profiles.length !== next.length };
  }

  async leaseProfile(profileId, runId) {
    if (!profileId) return null;
    const profile = await this.getProfile(profileId);
    if (!profile) throw new Error(`Profile not found: ${profileId}`);
    if (profile.status === "busy" && profile.leasedRunId && profile.leasedRunId !== runId) {
      const error = new Error(`Profile is busy: ${profile.name}`);
      error.code = "PROFILE_BUSY";
      throw error;
    }
    const leased = await this.saveProfile({
      ...profile,
      status: "busy",
      leasedRunId: runId,
      lastRunAt: this.clock().toISOString()
    });
    await this.appendAudit({ type: "profile.leased", profileId, runId });
    return leased;
  }

  async releaseProfile(profileId, runId, status = "ready") {
    if (!profileId) return null;
    const profile = await this.getProfile(profileId);
    if (!profile) return null;
    if (profile.leasedRunId && profile.leasedRunId !== runId) return profile;
    const released = await this.saveProfile({
      ...profile,
      status,
      leasedRunId: null
    });
    await this.appendAudit({ type: "profile.released", profileId, runId, status });
    return released;
  }

  async listRuns({ limit = 50, offset = 0 } = {}) {
    const runs = await this.#readJson(this.runsFile, []);
    const sorted = runs.sort((a, b) => String(b.queuedAt).localeCompare(String(a.queuedAt)));
    const start = Math.max(0, Number(offset) || 0);
    const size = Math.max(1, Number(limit) || 50);
    return {
      runs: sorted.slice(start, start + size),
      total: sorted.length,
      offset: start,
      limit: size,
      hasMore: start + size < sorted.length,
      nextOffset: start + size < sorted.length ? start + size : null
    };
  }

  async clearDebugRuns() {
    const runs = await this.#readJson(this.runsFile, []);
    const debugRuns = runs.filter((run) => run.debug);
    const retained = runs.filter((run) => !run.debug);
    await this.#writeJson(this.runsFile, retained);
    for (const run of debugRuns) {
      if (run.evidenceDir) await rm(run.evidenceDir, { recursive: true, force: true });
      else await rm(this.getRunDirFor(run.id), { recursive: true, force: true });
    }
    await this.appendAudit({ type: "run.debug_cleared", count: debugRuns.length });
    return { cleared: debugRuns.length, retained: retained.length };
  }

  async savePickerEvent(event) {
    const normalized = normalizePickerEvent(event, { clock: this.clock });
    const events = await this.#readJson(this.pickerEventsFile, []);
    events.push(normalized);
    const next = events
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .slice(-200);
    await this.#writeJson(this.pickerEventsFile, next);
    await this.appendAudit({
      type: "picker.event_received",
      pickerEventId: normalized.id,
      selector: normalized.recommendedSelector,
      confidence: normalized.confidence
    });
    return normalized;
  }

  async getPickerSession() {
    const session = normalizePickerSession(await this.#readJson(this.pickerSessionFile, null), this.clock);
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= this.clock().getTime()) {
      await this.clearPickerSession({ sessionId: session.id, reason: "expired" });
      return null;
    }
    return session;
  }

  async savePickerSession(session) {
    const normalized = normalizePickerSession(session, this.clock);
    if (!normalized) throw new Error("Picker session must be an object");
    await this.#writeJson(this.pickerSessionFile, normalized);
    await this.appendAudit({
      type: "picker.session_started",
      pickerSessionId: normalized.id,
      workflowId: normalized.workflowId,
      nodeId: normalized.nodeId,
      targetUrl: normalized.targetUrl
    });
    return normalized;
  }

  async clearPickerSession({ sessionId = null, reason = "cleared" } = {}) {
    const current = await this.#readJson(this.pickerSessionFile, null);
    if (!current?.id) return { cleared: false, session: null };
    if (sessionId && current.id !== sessionId) return { cleared: false, session: normalizePickerSession(current, this.clock) };
    await this.#writeJson(this.pickerSessionFile, null);
    await this.appendAudit({
      type: "picker.session_cleared",
      pickerSessionId: current.id,
      reason
    });
    return { cleared: true, session: null };
  }

  async listPickerEvents({ limit = 20 } = {}) {
    const events = await this.#readJson(this.pickerEventsFile, []);
    return events
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }

  async getRun(id) {
    return (await this.#readJson(this.runsFile, [])).find((run) => run.id === id) ?? null;
  }

  async createRun({ workflowId, mode = "dry-run", input = {}, context = {}, driverConfig = {}, profileId = null, sourceRunId = null, workflowOverride = null, debug = null }) {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    const profile = profileId ? await this.getProfile(profileId) : null;
    if (profileId && !profile) throw new Error(`Profile not found: ${profileId}`);
    const now = this.clock().toISOString();
    const run = {
      id: createId("run"),
      workflowId,
      workflowName: workflow.name,
      mode,
      profileId,
      profileName: profile?.name ?? null,
      status: "queued",
      input,
      context,
      driverConfig,
      workflowOverride,
      debug,
      outputs: {},
      error: null,
      sourceRunId,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      evidenceDir: null
    };
    run.evidenceDir = this.getRunDirFor(run.id);
    const runs = await this.#readJson(this.runsFile, []);
    runs.push(run);
    await this.#writeJson(this.runsFile, runs);
    await mkdir(run.evidenceDir, { recursive: true });
    await this.appendAudit({ type: "run.created", runId: run.id, workflowId, profileId, sourceRunId });
    return run;
  }

  async updateRun(id, patch) {
    const runs = await this.#readJson(this.runsFile, []);
    const index = runs.findIndex((run) => run.id === id);
    if (index === -1) throw new Error(`Run not found: ${id}`);
    const previousStatus = runs[index].status;
    runs[index] = { ...runs[index], ...patch };
    await this.#writeJson(this.runsFile, runs);
    if (patch.status && patch.status !== previousStatus) {
      await this.appendAudit({ type: "run.status", runId: id, status: patch.status });
    }
    return runs[index];
  }

  async cancelRun(id, reason = "operator") {
    const run = await this.getRun(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    if (["completed", "failed", "blocked", "canceled"].includes(run.status)) {
      return { run, changed: false };
    }
    const status = run.status === "queued" ? "canceled" : "cancel_requested";
    const patch = {
      status,
      error: {
        name: "RunCancelled",
        code: "RUN_CANCEL_REQUESTED",
        message: `Cancellation requested: ${reason}`
      },
      completedAt: status === "canceled" ? this.clock().toISOString() : run.completedAt
    };
    const updated = await this.updateRun(id, patch);
    await this.appendAudit({ type: "run.cancel_requested", runId: id, reason });
    return { run: updated, changed: true };
  }

  async retryRun(id) {
    const run = await this.getRun(id);
    if (!run) throw new Error(`Run not found: ${id}`);
    const retry = await this.createRun({
      workflowId: run.workflowId,
      mode: run.mode,
      input: structuredClone(run.input ?? {}),
      context: structuredClone(run.context ?? {}),
      driverConfig: structuredClone(run.driverConfig ?? {}),
      profileId: run.profileId ?? null,
      sourceRunId: run.id
    });
    await this.appendAudit({ type: "run.retry_created", runId: retry.id, sourceRunId: run.id });
    return retry;
  }

  getRunDirFor(runId) {
    return path.join(this.runsDir, sanitizePathSegment(runId));
  }

  async readRunEvents(runId) {
    const eventsFile = path.join(this.getRunDirFor(runId), "events.jsonl");
    try {
      const content = await readFile(eventsFile, "utf8");
      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => enrichEvent(JSON.parse(line), runId));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async listRunArtifacts(runId) {
    const dir = path.join(this.getRunDirFor(runId), "artifacts");
    try {
      const entries = await readdir(dir);
      const artifacts = [];
      for (const entry of entries) {
        const artifactPath = path.join(dir, entry);
        const info = await stat(artifactPath);
        if (info.isFile()) {
          artifacts.push({
            name: entry,
            size: info.size,
            url: `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(entry)}`
          });
        }
      }
      return artifacts.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async exportBundle() {
    return {
      exportedAt: this.clock().toISOString(),
      version: "0.1.0",
      workflows: await this.listWorkflows(),
      profiles: await this.listProfiles(),
      registry: await this.getRegistry(),
      runs: (await this.listRuns({ limit: 500 })).runs
    };
  }

  async importBundle(bundle) {
    if (!bundle || typeof bundle !== "object") throw new Error("Import bundle must be an object");
    const imported = { workflows: 0, profiles: 0 };
    if (Array.isArray(bundle.workflows)) {
      for (const workflow of bundle.workflows) {
        await this.saveWorkflow(workflow);
        imported.workflows += 1;
      }
    }
    if (Array.isArray(bundle.profiles)) {
      for (const profile of bundle.profiles) {
        await this.saveProfile(profile);
        imported.profiles += 1;
      }
    }
    if (bundle.registry) {
      await this.saveRegistry(bundle.registry);
      imported.registry = 1;
    }
    await this.appendAudit({ type: "bundle.imported", imported });
    return { imported };
  }

  async appendAudit(record) {
    await mkdir(path.dirname(this.auditFile), { recursive: true });
    const normalized = {
      createdAt: this.clock().toISOString(),
      ...record
    };
    await writeFile(this.auditFile, `${JSON.stringify(normalized)}\n`, { flag: "a" });
    return normalized;
  }

  async listAudit({ limit = 100 } = {}) {
    try {
      const content = await readFile(this.auditFile, "utf8");
      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .slice(-limit)
        .reverse();
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  getArtifactPath(runId, artifactName) {
    const safeName = sanitizePathSegment(artifactName);
    return path.join(this.getRunDirFor(runId), "artifacts", safeName);
  }

  async reset() {
    await rm(this.dir, { recursive: true, force: true });
    await this.init();
  }

  async #ensureJsonFile(file, fallback) {
    try {
      await readFile(file, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.#writeJson(file, fallback);
    }
  }

  async #readJson(file, fallback) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }
  }

  async #writeJson(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  async #migrateSeedData() {
    const defaults = createDefaultProfiles(this.clock, {
      browserProfilesDir: this.browserProfilesDir
    });
    const profiles = await this.#readJson(this.profilesFile, []);
    let profilesChanged = false;
    const migratedProfiles = profiles.map((profile) => {
      const fallback = defaults.find((item) => item.id === profile.id);
      if (!fallback) return profile;
      const migrated = {
        ...fallback,
        ...profile,
        platform: profile.platform ?? fallback.platform,
        accountLabel: profile.accountLabel ?? fallback.accountLabel,
        loginState: profile.loginState ?? fallback.loginState,
        sessionCheck: {
          ...fallback.sessionCheck,
          ...(profile.sessionCheck ?? {})
        },
        lastCheckedAt: profile.lastCheckedAt ?? fallback.lastCheckedAt,
        leasedRunId: profile.status === "busy" ? profile.leasedRunId ?? null : null
      };
      if (profile.id === "local-chromium" && !profile.profileDir) {
        migrated.profileDir = fallback.profileDir;
        migrated.browserChannel = profile.browserChannel || fallback.browserChannel;
        migrated.notes = fallback.notes;
      }
      profilesChanged ||= JSON.stringify(migrated) !== JSON.stringify(profile);
      return migrated;
    });
    if (profilesChanged) await this.#writeJson(this.profilesFile, migratedProfiles);

    const workflows = await this.#readJson(this.workflowsFile, []);
    const sample = createSampleWorkflowRecord(this.clock);
    const migratedWorkflows = workflows.map((workflow) => {
      if (workflow.id !== sample.id) return workflow;
      const hasOperation = workflow.workflow?.steps?.some((step) => step.action === "operation");
      const hasOutputAssert = workflow.workflow?.steps?.some((step) => step.action === "assertOutput");
      if (hasOperation && hasOutputAssert) return workflow;
      return {
        ...workflow,
        name: sample.name,
        description: sample.description,
        workflow: normalizeWorkflow(sample.workflow),
        defaultRun: sample.defaultRun,
        updatedAt: sample.updatedAt
      };
    });
    if (JSON.stringify(migratedWorkflows) !== JSON.stringify(workflows)) {
      await this.#writeJson(this.workflowsFile, migratedWorkflows);
    }
  }
}

function createId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function normalizePickerSession(session, clock = () => new Date()) {
  if (!session || typeof session !== "object" || Array.isArray(session)) return null;
  const now = clock();
  const allowedUrls = uniqueStrings([session.targetUrl, ...(Array.isArray(session.allowedUrls) ? session.allowedUrls : [])])
    .filter((url) => /^https?:\/\//i.test(url));
  const startedAt = typeof session.startedAt === "string" ? session.startedAt : now.toISOString();
  const expiresAt = typeof session.expiresAt === "string"
    ? session.expiresAt
    : new Date(now.getTime() + 20 * 60 * 1000).toISOString();
  return {
    id: session.id || createId("picker_session"),
    status: session.status || "waiting",
    workflowId: session.workflowId ?? null,
    workflowName: session.workflowName ?? "",
    nodeId: session.nodeId ?? null,
    nodeLabel: session.nodeLabel ?? "",
    targetUrl: allowedUrls[0] ?? "",
    allowedUrls,
    startedAt,
    expiresAt,
    createdAt: session.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeWorkflowGraph(graph = {}) {
  const layouts = {};
  const rawLayouts = graph && typeof graph === "object" && graph.layouts && typeof graph.layouts === "object"
    ? graph.layouts
    : {};

  for (const [layout, layoutRecord] of Object.entries(rawLayouts)) {
    if (!layoutRecord || typeof layoutRecord !== "object") continue;
    const positions = {};
    const rawPositions = layoutRecord.positions && typeof layoutRecord.positions === "object"
      ? layoutRecord.positions
      : {};
    for (const [nodeId, point] of Object.entries(rawPositions)) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!nodeId || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      positions[nodeId] = { x, y };
    }
    layouts[layout] = {
      positions,
      updatedAt: typeof layoutRecord.updatedAt === "string" ? layoutRecord.updatedAt : null
    };
  }

  return {
    version: 1,
    layout: typeof graph?.layout === "string" ? graph.layout : "sequence",
    layouts
  };
}

function sanitizePathSegment(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "item";
}

function enrichEvent(event, runId) {
  const copy = structuredClone(event);
  addArtifactUrl(copy.result?.artifact, runId);
  addArtifactUrl(copy.artifact, runId);
  return copy;
}

function addArtifactUrl(artifact, runId) {
  if (!artifact?.ref) return;
  const name = path.basename(String(artifact.ref));
  artifact.url = `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(name)}`;
}

function normalizeRegistry(registry, clock = () => new Date()) {
  const base = createDefaultRegistry(clock);
  return {
    version: registry?.version ?? base.version,
    sites: normalizeRegistrySection("sites", registry?.sites ?? base.sites),
    pages: normalizeRegistrySection("pages", registry?.pages ?? base.pages),
    actions: normalizeRegistrySection("actions", registry?.actions ?? base.actions),
    operations: normalizeRegistrySection("operations", registry?.operations ?? base.operations)
  };
}

function normalizeRegistrySection(section, items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizeRegistryItem(section, item))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function normalizeRegistryItem(section, item = {}) {
  const now = new Date().toISOString();
  const base = {
    id: item.id || createId(section.slice(0, -1) || "registry"),
    name: item.name || item.id || "Untitled",
    description: item.description ?? "",
    status: item.status ?? "draft",
    tags: Array.isArray(item.tags) ? item.tags : [],
    definition: item.definition && typeof item.definition === "object" ? item.definition : {},
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? now
  };

  if (section === "sites") {
    return {
      ...base,
      baseUrl: item.baseUrl ?? "",
      authMode: item.authMode ?? "profile",
      profileStrategy: item.profileStrategy ?? "one-profile-per-account"
    };
  }
  if (section === "pages") {
    return {
      ...base,
      siteId: item.siteId ?? "",
      urlPattern: item.urlPattern ?? "",
      stateSelector: item.stateSelector ?? "",
      accountSelector: item.accountSelector ?? ""
    };
  }
  if (section === "actions") {
    return {
      ...base,
      siteId: item.siteId ?? "",
      pageId: item.pageId ?? "",
      actionType: item.actionType ?? "click",
      selector: item.selector ?? "",
      valueTemplate: item.valueTemplate ?? "",
      outputName: item.outputName ?? ""
    };
  }
  if (section === "operations") {
    return {
      ...base,
      siteId: item.siteId ?? "",
      actionIds: Array.isArray(item.actionIds) ? item.actionIds : [],
      inputSchema: item.inputSchema && typeof item.inputSchema === "object" ? item.inputSchema : {},
      outputSchema: item.outputSchema && typeof item.outputSchema === "object" ? item.outputSchema : {},
      workflowTemplate: item.workflowTemplate && typeof item.workflowTemplate === "object" ? item.workflowTemplate : null
    };
  }
  return base;
}

function createDefaultRegistry(clock = () => new Date()) {
  const now = clock().toISOString();
  return {
    version: "0.1.0",
    sites: [
      {
        id: "example-marketplace",
        name: "Example Marketplace",
        description: "Demo site registry entry used by the open-source Studio.",
        status: "ready",
        baseUrl: "https://example.local",
        authMode: "profile",
        profileStrategy: "one-profile-per-account",
        tags: ["demo"],
        definition: {
          allowedHosts: ["example.local"],
          notes: "Private adapters should register their own platform details outside this open-source sample."
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    pages: [
      {
        id: "example-search-page",
        siteId: "example-marketplace",
        name: "Search Page",
        description: "Search page with a query input and result title.",
        status: "ready",
        urlPattern: "https://example.local/search",
        stateSelector: ".result-title",
        accountSelector: ".account-name",
        tags: ["demo", "search"],
        definition: {
          pageType: "search",
          blockedSelectors: [".captcha", ".login-required"]
        },
        createdAt: now,
        updatedAt: now
      }
    ],
    actions: [
      {
        id: "example-open-search",
        siteId: "example-marketplace",
        pageId: "example-search-page",
        name: "Open Search Page",
        description: "Navigate to the search page.",
        status: "ready",
        actionType: "goto",
        selector: "",
        valueTemplate: "https://example.local/search",
        outputName: "",
        tags: ["demo"],
        definition: { step: { action: "goto", url: "https://example.local/search" } },
        createdAt: now,
        updatedAt: now
      },
      {
        id: "example-fill-query",
        siteId: "example-marketplace",
        pageId: "example-search-page",
        name: "Fill Query",
        description: "Fill the search keyword input.",
        status: "ready",
        actionType: "fill",
        selector: "#q",
        valueTemplate: "{{input.query}}",
        outputName: "",
        tags: ["demo"],
        definition: { step: { action: "fill", selector: "#q", value: "{{input.query}}" } },
        createdAt: now,
        updatedAt: now
      },
      {
        id: "example-extract-title",
        siteId: "example-marketplace",
        pageId: "example-search-page",
        name: "Extract Result Title",
        description: "Extract the first result title.",
        status: "ready",
        actionType: "extract",
        selector: ".result-title",
        valueTemplate: "",
        outputName: "title",
        tags: ["demo"],
        definition: { step: { action: "extract", selector: ".result-title", name: "title" } },
        createdAt: now,
        updatedAt: now
      }
    ],
    operations: [
      {
        id: "example-search-suppliers",
        siteId: "example-marketplace",
        name: "Search Suppliers",
        description: "Reusable demo operation with browser and API branches.",
        status: "ready",
        actionIds: ["example-open-search", "example-fill-query", "example-extract-title"],
        inputSchema: { query: { type: "string", required: true } },
        outputSchema: { title: { type: "string" } },
        tags: ["demo", "operation"],
        definition: {
          browserBranch: ["example-open-search", "example-fill-query", "example-extract-title"],
          apiBranch: { method: "GET", url: "https://api.example.local/suppliers/search" }
        },
        workflowTemplate: createSampleWorkflowRecord(clock).workflow,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

function createDefaultProfiles(clock = () => new Date(), { browserProfilesDir = null } = {}) {
  const now = clock().toISOString();
  const localChromiumProfileDir = browserProfilesDir
    ? path.join(browserProfilesDir, "local-chromium")
    : "";
  return [
    {
      id: "dry-run-demo",
      name: "Dry-run Demo",
      mode: "dry-run",
      platform: "example.local",
      accountLabel: "demo-operator",
      loginState: "authenticated",
      profileDir: "",
      profileDirectory: "",
      browserType: "chromium",
      browserChannel: "",
      headless: true,
      status: "ready",
      leasedRunId: null,
      rateLimit: { minDelayMs: 0, maxDelayMs: null, maxPerMinute: null },
      sessionCheck: {
        platform: "example.local",
        url: "https://example.local/search",
        accountSelector: ".account-name",
        loggedOutSelector: "",
        timeoutMs: 3000
      },
      tags: ["demo", "safe"],
      notes: "Fixture-backed dry-run profile for local workflow validation.",
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      lastCheckedAt: now
    },
    {
      id: "local-chromium",
      name: "Local Chromium",
      mode: "playwright",
      platform: "",
      accountLabel: "",
      loginState: "unchecked",
      profileDir: localChromiumProfileDir,
      profileDirectory: "",
      browserType: "chromium",
      browserChannel: "chrome",
      headless: false,
      network: { proxyMode: "system", proxyServer: "", proxyBypass: "127.0.0.1,::1,localhost" },
      status: "ready",
      leasedRunId: null,
      rateLimit: { minDelayMs: 1000, maxDelayMs: 2400, maxPerMinute: 20 },
      sessionCheck: {
        platform: "",
        url: "",
        accountSelector: "",
        loggedOutSelector: "",
        timeoutMs: 10_000
      },
      tags: ["local", "browser"],
      notes: "Dedicated WebOps Forge Chrome user-data directory. Open it once, log in manually, then reuse it for controlled Playwright workflows.",
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      lastCheckedAt: null
    }
  ];
}
