import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSampleWorkflowRecord } from "./sample-workflows.mjs";
import { normalizeWorkflow } from "../workflow.mjs";

export class StudioStore {
  constructor({ dir = process.env.WEBOPS_FORGE_DATA_DIR ?? path.join(process.cwd(), ".webops-forge"), clock = () => new Date() } = {}) {
    this.dir = dir;
    this.clock = clock;
    this.workflowsFile = path.join(dir, "workflows.json");
    this.runsFile = path.join(dir, "runs.json");
    this.profilesFile = path.join(dir, "profiles.json");
    this.auditFile = path.join(dir, "audit.jsonl");
    this.runsDir = path.join(dir, "runs");
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.runsDir, { recursive: true });
    await this.#ensureJsonFile(this.workflowsFile, []);
    await this.#ensureJsonFile(this.runsFile, []);
    await this.#ensureJsonFile(this.profilesFile, []);

    const workflows = await this.listWorkflows();
    if (workflows.length === 0) {
      const sample = createSampleWorkflowRecord(this.clock);
      sample.workflow = normalizeWorkflow(sample.workflow);
      await this.#writeJson(this.workflowsFile, [sample]);
    }

    const profiles = await this.listProfiles();
    if (profiles.length === 0) {
      await this.#writeJson(this.profilesFile, createDefaultProfiles(this.clock));
    }

    await this.#migrateSeedData();
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
      createdAt: record.createdAt ?? now,
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
      browserType: record.browserType ?? existing?.browserType ?? "chromium",
      headless: Boolean(record.headless ?? existing?.headless ?? false),
      status,
      leasedRunId: status === "busy" ? record.leasedRunId ?? existing?.leasedRunId ?? null : record.leasedRunId ?? null,
      rateLimit: {
        minDelayMs: Number(record.rateLimit?.minDelayMs ?? existing?.rateLimit?.minDelayMs ?? 0),
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

  async listRuns({ limit = 50 } = {}) {
    const runs = await this.#readJson(this.runsFile, []);
    return runs
      .sort((a, b) => String(b.queuedAt).localeCompare(String(a.queuedAt)))
      .slice(0, limit);
  }

  async getRun(id) {
    return (await this.#readJson(this.runsFile, [])).find((run) => run.id === id) ?? null;
  }

  async createRun({ workflowId, mode = "dry-run", input = {}, context = {}, driverConfig = {}, profileId = null, sourceRunId = null }) {
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
      runs: await this.listRuns({ limit: 500 })
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
    const defaults = createDefaultProfiles(this.clock);
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

function createDefaultProfiles(clock = () => new Date()) {
  const now = clock().toISOString();
  return [
    {
      id: "dry-run-demo",
      name: "Dry-run Demo",
      mode: "dry-run",
      platform: "example.local",
      accountLabel: "demo-operator",
      loginState: "authenticated",
      profileDir: "",
      browserType: "chromium",
      headless: true,
      status: "ready",
      leasedRunId: null,
      rateLimit: { minDelayMs: 0, maxPerMinute: null },
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
      profileDir: "",
      browserType: "chromium",
      headless: false,
      status: "ready",
      leasedRunId: null,
      rateLimit: { minDelayMs: 1000, maxPerMinute: 20 },
      sessionCheck: {
        platform: "",
        url: "",
        accountSelector: "",
        loggedOutSelector: "",
        timeoutMs: 10_000
      },
      tags: ["local", "browser"],
      notes: "Use for controlled local Playwright workflows. Add a profileDir before using logged-in sites.",
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      lastCheckedAt: null
    }
  ];
}
