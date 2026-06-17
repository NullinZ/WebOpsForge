import { ActionValidationError } from "./errors.mjs";

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function resolveTemplates(value, scope) {
  if (typeof value === "string") {
    return value.replace(TEMPLATE_PATTERN, (_, path) => {
      const resolved = getPath(scope, path);
      if (resolved == null) return "";
      return String(resolved);
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, scope));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, scope)]));
  }
  return value;
}

export function getPath(source, path) {
  const parts = String(path).split(".");
  let cursor = source;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object" || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

export function assertTemplateReady(step, scope) {
  const unresolved = [];
  JSON.stringify(step).replace(TEMPLATE_PATTERN, (_, path) => {
    if (getPath(scope, path) == null) unresolved.push(path);
    return "";
  });
  if (unresolved.length > 0) {
    throw new ActionValidationError(`Unresolved template values: ${unresolved.join(", ")}`, {
      stepId: step.id,
      details: { unresolved }
    });
  }
}
