import { BrowserActionError, BrowserBlockedError } from "./errors.mjs";
import { createMemoryEvidenceStore } from "./evidence.mjs";
import { createRateLimiter } from "./rate-limit.mjs";
import { normalizeWorkflow } from "./workflow.mjs";
import { assertTemplateReady, resolveTemplates } from "./template.mjs";

export class WebOpsRunner {
  constructor({ driver, evidenceStore = createMemoryEvidenceStore(), rateLimiter = null, policy = null, clock = () => new Date() } = {}) {
    if (!driver) throw new Error("WebOpsRunner requires a driver");
    this.driver = driver;
    this.evidenceStore = evidenceStore;
    this.rateLimiter = rateLimiter ?? createRateLimiter();
    this.policy = policy;
    this.clock = clock;
  }

  async run(workflowInput, { input = {}, context = {}, runId = createRunId() } = {}) {
    const workflow = normalizeWorkflow(workflowInput);
    const outputs = {};
    const state = {
      runId,
      workflow: { name: workflow.name, version: workflow.version },
      input,
      context,
      outputs
    };
    await this.evidenceStore.append({ type: "workflow.started", runId, workflow: state.workflow });

    for (const step of workflow.steps) {
      await this.#runStep({ workflow, step, state });
    }

    const summary = {
      runId,
      workflow: state.workflow,
      status: "completed",
      outputs,
      completedAt: this.clock().toISOString()
    };
    await this.evidenceStore.append({ type: "workflow.completed", ...summary });
    return summary;
  }

  async close() {
    await this.driver.close?.();
  }

  async #runStep({ workflow, step, state }) {
    const startedAt = this.clock().toISOString();
    const scope = { input: state.input, context: state.context, outputs: state.outputs };
    assertTemplateReady(step, scope);
    const resolved = resolveTemplates(step, scope);
    const timeoutMs = resolved.timeoutMs ?? workflow.defaults.timeoutMs;

    await this.policy?.beforeStep?.({ step: resolved, state });
    await this.rateLimiter.wait({ step: resolved, state });
    await this.evidenceStore.append({
      type: "step.started",
      runId: state.runId,
      stepId: resolved.id,
      action: resolved.action,
      startedAt
    });

    try {
      const result = await this.#dispatch(resolved, { timeoutMs, state });
      if (resolved.action === "extract") {
        state.outputs[resolved.name] = result.value;
      }
      await this.policy?.afterStep?.({ step: resolved, state, result });
      await this.evidenceStore.append({
        type: "step.completed",
        runId: state.runId,
        stepId: resolved.id,
        action: resolved.action,
        result,
        completedAt: this.clock().toISOString()
      });
      return result;
    } catch (error) {
      if (resolved.optional) {
        await this.evidenceStore.append({
          type: "step.skipped_after_error",
          runId: state.runId,
          stepId: resolved.id,
          action: resolved.action,
          error: serializeError(error)
        });
        return { skipped: true, error: error.message };
      }
      const artifact = workflow.defaults.screenshot === "on-failure"
        ? await this.#captureFailureScreenshot(resolved).catch(() => null)
        : null;
      await this.evidenceStore.append({
        type: "step.failed",
        runId: state.runId,
        stepId: resolved.id,
        action: resolved.action,
        error: serializeError(error),
        artifact
      });
      throw error;
    }
  }

  async #dispatch(step, { timeoutMs, state }) {
    switch (step.action) {
      case "goto":
        return this.driver.goto({ url: step.url, timeoutMs, state });
      case "waitFor":
        return this.driver.waitFor({ selector: step.selector, state: step.state ?? "visible", timeoutMs });
      case "click":
        return this.driver.click({ selector: step.selector, timeoutMs });
      case "fill":
        return this.driver.fill({ selector: step.selector, value: step.value, timeoutMs, redact: Boolean(step.redact) });
      case "press":
        return this.driver.press({ selector: step.selector ?? null, key: step.key, timeoutMs });
      case "extract":
        return this.driver.extract({
          selector: step.selector,
          mode: step.mode ?? "text",
          attribute: step.attribute ?? null,
          timeoutMs
        });
      case "screenshot":
        return this.#captureNamedScreenshot(step);
      case "assertText":
        return this.#assertText(step, timeoutMs);
      case "checkpoint":
        return { label: step.label ?? step.id };
      default:
        throw new BrowserActionError(`Unsupported action: ${step.action}`, { stepId: step.id });
    }
  }

  async #assertText(step, timeoutMs) {
    const result = await this.driver.extract({ selector: step.selector, mode: "text", timeoutMs });
    if (!String(result.value ?? "").includes(step.includes)) {
      throw new BrowserBlockedError(`Expected text not found for ${step.selector}`, {
        stepId: step.id,
        reason: "assert_text_failed",
        details: { selector: step.selector, includes: step.includes, actual: result.value }
      });
    }
    return { ok: true, selector: step.selector, includes: step.includes };
  }

  async #captureNamedScreenshot(step) {
    const image = await this.driver.screenshot?.({ fullPage: Boolean(step.fullPage), name: step.name });
    if (!image) return { captured: false };
    const artifact = await this.evidenceStore.putArtifact({
      name: ensureArtifactName(step.name, image.contentType),
      contentType: image.contentType ?? "image/png",
      bytes: image.bytes,
      text: image.text
    });
    return { captured: true, artifact };
  }

  async #captureFailureScreenshot(step) {
    const image = await this.driver.screenshot?.({ fullPage: true, name: `${step.id}-failure` });
    if (!image) return null;
    return this.evidenceStore.putArtifact({
      name: ensureArtifactName(`${step.id}-failure`, image.contentType),
      contentType: image.contentType ?? "image/png",
      bytes: image.bytes,
      text: image.text
    });
  }
}

function createRunId() {
  return `webops_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

function ensureArtifactName(name, contentType = "image/png") {
  const value = String(name);
  if (/\.[a-zA-Z0-9]+$/.test(value)) return value;
  if (contentType === "text/plain") return `${value}.txt`;
  if (contentType === "application/json") return `${value}.json`;
  return `${value}.png`;
}

function serializeError(error) {
  return {
    name: error.name,
    code: error.code,
    message: error.message,
    stepId: error.stepId ?? null,
    details: error.details ?? {}
  };
}
