import { normalizeWorkflow } from "../workflow.mjs";

export function createWorkflowDebugSlice(workflowInput, targetStepId) {
  const workflow = normalizeWorkflow(workflowInput);
  const targetId = String(targetStepId ?? "").trim();
  if (!targetId) {
    const error = new Error("Debug target step id is required");
    error.statusCode = 400;
    throw error;
  }

  const steps = [];
  for (const step of workflow.steps) {
    if (step.id === targetId) {
      steps.push(step);
      return debugWorkflow(workflow, steps, targetId, "top-level");
    }

    const partial = partialOperationStep(step, targetId);
    if (partial) {
      steps.push(partial.step);
      return debugWorkflow(workflow, steps, targetId, partial.kind);
    }

    steps.push(step);
  }

  const error = new Error(`Debug target step not found: ${targetId}`);
  error.statusCode = 404;
  throw error;
}

function partialOperationStep(step, targetId) {
  if (step.action !== "operation") return null;

  if (step.api?.id === targetId) {
    return {
      kind: "operation-api",
      step: {
        ...step,
        mode: "api",
        browserSteps: []
      }
    };
  }

  const browserSteps = Array.isArray(step.browserSteps) ? step.browserSteps : [];
  const index = browserSteps.findIndex((child) => child.id === targetId);
  if (index === -1) return null;
  return {
    kind: "operation-browser",
    step: {
      ...step,
      mode: "browser",
      api: null,
      browserSteps: browserSteps.slice(0, index + 1)
    }
  };
}

function debugWorkflow(workflow, steps, targetStepId, targetKind) {
  return {
    ...workflow,
    name: `${workflow.name} debug to ${targetStepId}`,
    metadata: {
      ...workflow.metadata,
      debug: {
        mode: "run-to-node",
        targetStepId,
        targetKind,
        createdAt: new Date().toISOString()
      }
    },
    steps
  };
}
