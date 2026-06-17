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
    this.runsDir = path.join(dir, "runs");
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await mkdir(this.runsDir, { recursive: true });
    await this.#ensureJsonFile(this.workflowsFile, []);
    await this.#ensureJsonFile(this.runsFile, []);

    const workflows = await this.listWorkflows();
    if (workflows.length === 0) {
      const sample = createSampleWorkflowRecord(this.clock);
      sample.workflow = normalizeWorkflow(sample.workflow);
      await this.#writeJson(this.workflowsFile, [sample]);
    }
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

  async listRuns({ limit = 50 } = {}) {
    const runs = await this.#readJson(this.runsFile, []);
    return runs
      .sort((a, b) => String(b.queuedAt).localeCompare(String(a.queuedAt)))
      .slice(0, limit);
  }

  async getRun(id) {
    return (await this.#readJson(this.runsFile, [])).find((run) => run.id === id) ?? null;
  }

  async createRun({ workflowId, mode = "dry-run", input = {}, context = {}, driverConfig = {} }) {
    const workflow = await this.getWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    const now = this.clock().toISOString();
    const run = {
      id: createId("run"),
      workflowId,
      workflowName: workflow.name,
      mode,
      status: "queued",
      input,
      context,
      driverConfig,
      outputs: {},
      error: null,
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
    return run;
  }

  async updateRun(id, patch) {
    const runs = await this.#readJson(this.runsFile, []);
    const index = runs.findIndex((run) => run.id === id);
    if (index === -1) throw new Error(`Run not found: ${id}`);
    runs[index] = { ...runs[index], ...patch };
    await this.#writeJson(this.runsFile, runs);
    return runs[index];
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
