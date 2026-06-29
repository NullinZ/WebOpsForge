import { BrowserActionError, BrowserBlockedError, RunCancelledError } from "./errors.mjs";
import { createMemoryEvidenceStore } from "./evidence.mjs";
import { createRateLimiter } from "./rate-limit.mjs";
import { normalizeWorkflow } from "./workflow.mjs";
import { assertTemplateReady, getPath, resolveTemplates } from "./template.mjs";
import { createFetchApiClient, executeApiCall } from "./api-client.mjs";
import { classifyRunFailure } from "./blocked-state.mjs";

export class WebOpsRunner {
  constructor({ driver = null, apiClient = createFetchApiClient(), evidenceStore = createMemoryEvidenceStore(), rateLimiter = null, policy = null, clock = () => new Date() } = {}) {
    if (!driver && !apiClient) throw new Error("WebOpsRunner requires a driver or apiClient");
    this.driver = driver ?? {};
    this.apiClient = apiClient;
    this.evidenceStore = evidenceStore;
    this.rateLimiter = rateLimiter ?? createRateLimiter();
    this.policy = policy;
    this.clock = clock;
  }

  async run(workflowInput, { input = {}, context = {}, runId = createRunId(), abortSignal = null } = {}) {
    const workflow = normalizeWorkflow(workflowInput);
    const outputs = {};
    const state = {
      runId,
      workflow: { name: workflow.name, version: workflow.version },
      input,
      context,
      outputs,
      abortSignal
    };
    await this.evidenceStore.append({ type: "workflow.started", runId, workflow: state.workflow });

    for (const step of workflow.steps) {
      assertNotCancelled(state);
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
    assertNotCancelled(state);
    const startedAt = this.clock().toISOString();
    const scope = { input: state.input, context: state.context, outputs: state.outputs };
    let templatedStep;
    let resolved;
    try {
      templatedStep = selectActiveOperationBranch(step, scope, state);
      assertTemplateReady(templatedStep, scope);
      resolved = resolveTemplates(templatedStep, scope);
    } catch (error) {
      const failedStep = templatedStep ?? step;
      await this.evidenceStore.append({
        type: failedStep.optional ? "step.skipped_after_error" : "step.failed",
        runId: state.runId,
        stepId: failedStep.id ?? step.id,
        action: failedStep.action ?? step.action,
        details: stepEvidenceDetails(failedStep, failedStep, scope),
        error: serializeError(error),
        failedAt: this.clock().toISOString()
      });
      if (failedStep.optional) return { skipped: true, error: error.message };
      throw error;
    }
    const timeoutMs = resolved.timeoutMs ?? workflow.defaults.timeoutMs;

    await this.policy?.beforeStep?.({ step: resolved, state });
    await this.evidenceStore.append({
      type: "step.started",
      runId: state.runId,
      stepId: resolved.id,
      action: resolved.action,
      details: stepEvidenceDetails(resolved, templatedStep, scope),
      startedAt
    });
    await this.rateLimiter.wait({
      step: resolved,
      state,
      onDelay: (delay) => this.evidenceStore.append({
        type: "step.delay",
        runId: state.runId,
        stepId: resolved.id,
        action: resolved.action,
        ...delay,
        createdAt: this.clock().toISOString()
      })
    });

    try {
      const result = await this.#dispatch(resolved, { timeoutMs, state, workflow });
      assertNotCancelled(state);
      applyStepOutput(resolved, result, state);
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

  async #dispatch(step, { timeoutMs, state, workflow }) {
    switch (step.action) {
      case "goto":
        return this.driver.goto({ url: step.url, timeoutMs, state });
      case "waitFor":
        return this.driver.waitFor({ selector: step.selector, state: step.state ?? "visible", timeoutMs, targetIdentity: step.targetIdentity ?? null });
      case "click":
        return this.driver.click({ selector: step.selector, timeoutMs, targetIdentity: step.targetIdentity ?? null });
      case "fill":
        return this.driver.fill({ selector: step.selector, value: step.value, timeoutMs, redact: Boolean(step.redact), targetIdentity: step.targetIdentity ?? null });
      case "press":
        return this.driver.press({ selector: step.selector ?? null, key: step.key, timeoutMs, targetIdentity: step.targetIdentity ?? null });
      case "extract":
        return this.driver.extract({
          selector: step.selector,
          mode: step.mode ?? "text",
          attribute: step.attribute ?? null,
          timeoutMs,
          targetIdentity: step.targetIdentity ?? null
        });
      case "extractList":
        return this.driver.extractList({
          selector: step.selector,
          fields: step.fields ?? {},
          limit: step.limit ?? null,
          timeoutMs,
          targetIdentity: step.targetIdentity ?? null
        });
      case "extractDetail":
        return this.driver.extractDetail({
          fields: step.fields ?? {},
          timeoutMs
        });
      case "extractMedia":
        return this.driver.extractMedia({
          selector: step.selector,
          sources: step.sources ?? null,
          limit: step.limit ?? null,
          timeoutMs,
          targetIdentity: step.targetIdentity ?? null
        });
      case "paginate":
        return this.driver.paginate({
          nextSelector: step.nextSelector,
          maxPages: step.maxPages ?? 1,
          waitForSelector: step.waitForSelector ?? null,
          timeoutMs
        });
      case "checkSession":
        return this.#checkSession(step, timeoutMs);
      case "setOutput":
        return { name: step.name, value: step.value };
      case "apiCall":
        return executeApiCall({ step, driver: this.driver, apiClient: this.apiClient, timeoutMs });
      case "operation":
        return this.#runOperation(step, { workflow, state });
      case "screenshot":
        return this.#captureNamedScreenshot(step);
      case "approval":
        return this.#requestApproval(step, state);
      case "assertText":
        return this.#assertText(step, timeoutMs);
      case "assertOutput":
        return this.#assertOutput(step, state);
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

  async #checkSession(step, timeoutMs) {
    if (!this.driver.checkSession) {
      throw new BrowserActionError(`Driver does not support checkSession`, {
        stepId: step.id,
        details: { reason: "unsupported_driver_action", action: "checkSession" }
      });
    }
    return this.driver.checkSession({
      accountSelector: step.accountSelector ?? null,
      loggedOutSelector: step.loggedOutSelector ?? null,
      timeoutMs
    });
  }

  async #assertOutput(step, state) {
    const path = step.path ?? `outputs.${step.name}`;
    const value = getPath({ input: state.input, context: state.context, outputs: state.outputs }, path);
    if (!String(value ?? "").includes(step.includes)) {
      throw new BrowserBlockedError(`Expected output not found for ${path}`, {
        stepId: step.id,
        reason: "assert_output_failed",
        details: { path, includes: step.includes, actual: value }
      });
    }
    return { ok: true, path, includes: step.includes };
  }

  async #requestApproval(step, state) {
    const approvalName = step.name ?? step.id;
    const policyDecision = await this.policy?.requestApproval?.({ step, state, approvalName });
    if (policyDecision?.approved) {
      return {
        approved: true,
        name: approvalName,
        approver: policyDecision.approver ?? "policy"
      };
    }

    const contextApproved = state.context?.approvals?.[approvalName] === true;
    if (contextApproved) {
      return {
        approved: true,
        name: approvalName,
        approver: "context"
      };
    }

    throw new BrowserBlockedError(`Approval required: ${approvalName}`, {
      stepId: step.id,
      reason: "approval_required",
      recoverable: true,
      details: {
        name: approvalName,
        prompt: step.prompt ?? "",
        requiredRole: step.requiredRole ?? null
      }
    });
  }

  async #runOperation(step, { workflow, state }) {
    const mode = normalizeOperationMode(step.mode);
    if (mode === "api") {
      if (!step.api) {
        throw new BrowserActionError(`Operation ${step.id} does not define an API branch`, { stepId: step.id });
      }
      const result = await this.#runStep({ workflow, step: step.api, state });
      return { mode, result };
    }

    const steps = step.browserSteps ?? [];
    if (steps.length === 0) {
      throw new BrowserActionError(`Operation ${step.id} does not define browser steps`, { stepId: step.id });
    }
    const results = [];
    for (const childStep of steps) {
      assertNotCancelled(state);
      results.push(await this.#runStep({ workflow, step: childStep, state }));
    }
    return { mode, steps: steps.map((item) => item.id), results };
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

function selectActiveOperationBranch(step, scope, state) {
  if (step.action !== "operation") return step;
  const modeSource = step.mode ?? state.context?.operationModes?.[step.id] ?? "browser";
  const modeStep = { id: step.id, action: step.action, mode: modeSource };
  assertTemplateReady(modeStep, scope);
  const mode = normalizeOperationMode(resolveTemplates(modeSource, scope));
  if (mode === "api") {
    return { ...step, mode, browserSteps: [] };
  }
  return { ...step, mode, api: null };
}

function normalizeOperationMode(mode) {
  const value = String(mode ?? "browser").toLowerCase();
  if (value === "ui" || value === "browser" || value === "playwright") return "browser";
  if (value === "api" || value === "http") return "api";
  throw new BrowserActionError(`Unsupported operation mode: ${mode}`, {
    reason: "unsupported_operation_mode",
    details: { mode }
  });
}

function applyStepOutput(step, result, state) {
  if (["extract", "extractList", "extractDetail", "extractMedia"].includes(step.action)) {
    state.outputs[step.name] = result.value;
    return;
  }
  if (step.action === "checkSession" && (step.name || step.output || step.outputName)) {
    const name = step.name ?? step.output ?? step.outputName;
    state.outputs[name] = result.value ?? result;
    return;
  }
  if (step.action === "setOutput") {
    state.outputs[step.name] = result.value;
    return;
  }
  if (step.action === "paginate" && (step.name || step.output || step.outputName)) {
    const name = step.name ?? step.output ?? step.outputName;
    state.outputs[name] = result.value ?? result;
    return;
  }
  if ((step.action === "apiCall" || step.action === "operation") && (step.name || step.output || step.outputName)) {
    const name = step.name ?? step.output ?? step.outputName;
    state.outputs[name] = result.value ?? result.result?.value ?? result;
  }
}

function stepEvidenceDetails(step, templatedStep, scope) {
  const details = {};
  if (step.selector) details.selector = step.selector;
  if (step.url) details.url = step.url;
  if (step.key) details.key = step.key;
  if (step.name) details.name = step.name;
  if (Object.hasOwn(step, "value")) {
    details.value = step.redact ? "[redacted]" : step.value;
  }
  const templateValues = collectTemplateValues(templatedStep, scope, Boolean(step.redact));
  if (templateValues.length) details.templateValues = templateValues;
  return details;
}

function collectTemplateValues(value, scope, redact = false) {
  const templatePattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const paths = new Set();
  JSON.stringify(value ?? {}).replace(templatePattern, (_match, path) => {
    paths.add(path);
    return "";
  });
  return [...paths].sort().map((path) => ({
    path,
    value: redact ? "[redacted]" : getPath(scope, path)
  }));
}

function assertNotCancelled(state) {
  if (state.abortSignal?.aborted) {
    throw new RunCancelledError("Run cancelled by operator", {
      details: { runId: state.runId }
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
  const classification = classifyRunFailure(error);
  return {
    name: error.name,
    code: error.code,
    message: error.message,
    stepId: error.stepId ?? null,
    details: {
      ...(error.details ?? {}),
      blockedState: classification.state,
      recoveryHint: classification.recoveryHint,
      recoverable: classification.recoverable
    }
  };
}
