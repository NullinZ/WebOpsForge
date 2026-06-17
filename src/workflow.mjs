import { ActionValidationError } from "./errors.mjs";

const SUPPORTED_ACTIONS = new Set([
  "goto",
  "waitFor",
  "click",
  "fill",
  "press",
  "extract",
  "screenshot",
  "approval",
  "assertText",
  "checkpoint"
]);

const REQUIRED_FIELDS = {
  goto: ["url"],
  waitFor: ["selector"],
  click: ["selector"],
  fill: ["selector", "value"],
  press: ["key"],
  extract: ["selector", "name"],
  screenshot: ["name"],
  approval: ["name"],
  assertText: ["selector", "includes"],
  checkpoint: []
};

export function defineWorkflow(workflow) {
  return normalizeWorkflow(workflow);
}

export function normalizeWorkflow(workflow) {
  if (!workflow || typeof workflow !== "object") {
    throw new ActionValidationError("Workflow must be an object");
  }
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new ActionValidationError("Workflow must contain at least one step");
  }

  const seen = new Set();
  const steps = workflow.steps.map((step, index) => normalizeStep(step, index, seen));
  return {
    name: workflow.name ?? "unnamed-webops-workflow",
    version: workflow.version ?? "0.1.0",
    description: workflow.description ?? "",
    defaults: {
      timeoutMs: Number(workflow.defaults?.timeoutMs ?? 10_000),
      screenshot: workflow.defaults?.screenshot ?? "on-failure"
    },
    metadata: workflow.metadata ?? {},
    steps
  };
}

export function validateStep(step, index = 0) {
  return normalizeStep(step, index, new Set());
}

function normalizeStep(step, index, seen) {
  if (!step || typeof step !== "object") {
    throw new ActionValidationError(`Step ${index + 1} must be an object`);
  }
  const action = step.action;
  if (!SUPPORTED_ACTIONS.has(action)) {
    throw new ActionValidationError(`Unsupported action: ${action}`, { stepId: step.id ?? null });
  }
  const id = step.id ?? `${action}_${index + 1}`;
  if (seen.has(id)) {
    throw new ActionValidationError(`Duplicate step id: ${id}`, { stepId: id });
  }
  seen.add(id);

  for (const field of REQUIRED_FIELDS[action]) {
    if (step[field] == null || step[field] === "") {
      throw new ActionValidationError(`Step ${id} is missing required field: ${field}`, { stepId: id });
    }
  }

  return {
    ...step,
    id,
    action,
    timeoutMs: step.timeoutMs == null ? null : Number(step.timeoutMs),
    optional: Boolean(step.optional),
    evidence: step.evidence ?? "auto"
  };
}
