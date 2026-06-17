export class WebOpsForgeError extends Error {
  constructor(message, { code = "WEBOPS_FORGE_ERROR", stepId = null, cause = null, details = {} } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.stepId = stepId;
    this.details = details;
    if (cause) this.cause = cause;
  }
}

export class ActionValidationError extends WebOpsForgeError {
  constructor(message, options = {}) {
    super(message, { code: "ACTION_VALIDATION_ERROR", ...options });
  }
}

export class BrowserActionError extends WebOpsForgeError {
  constructor(message, options = {}) {
    super(message, { code: "BROWSER_ACTION_ERROR", ...options });
  }
}

export class BrowserBlockedError extends WebOpsForgeError {
  constructor(message, { reason = "blocked", recoverable = true, ...options } = {}) {
    const details = { reason, recoverable, ...(options.details ?? {}) };
    super(message, {
      ...options,
      code: "BROWSER_BLOCKED",
      details
    });
    this.reason = reason;
    this.recoverable = recoverable;
  }
}

export class RunCancelledError extends WebOpsForgeError {
  constructor(message = "Run cancelled", options = {}) {
    super(message, { code: "RUN_CANCELLED", ...options });
  }
}
