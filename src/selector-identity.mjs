import { randomUUID } from "node:crypto";

const STABLE_ATTRIBUTE_WEIGHTS = {
  "data-e2e": 34,
  "data-testid": 34,
  "data-test": 32,
  "data-cy": 32,
  "aria-label": 24,
  placeholder: 24,
  name: 20,
  role: 18,
  type: 14,
  title: 14,
  href: 10,
  id: 18
};

const ATTRIBUTE_ALLOWLIST = new Set([
  "id",
  "role",
  "type",
  "name",
  "placeholder",
  "aria-label",
  "aria-labelledby",
  "title",
  "href",
  "autocomplete",
  "data-e2e",
  "data-testid",
  "data-test",
  "data-cy"
]);

export function normalizePickerEvent(raw, { clock = () => new Date() } = {}) {
  if (!raw || typeof raw !== "object") {
    const error = new Error("Picker event must be an object");
    error.statusCode = 400;
    throw error;
  }

  const now = clock().toISOString();
  const target = raw.target && typeof raw.target === "object" ? raw.target : {};
  const candidates = normalizeSelectorCandidates(raw.selectorCandidates ?? raw.candidates ?? []);
  const recommendedSelector = firstString(raw.recommendedSelector, raw.selector, candidates[0]?.selector);
  const attributes = normalizeAttributes(target.attributes ?? raw.attributes ?? {});
  const tagName = cleanToken(target.tagName ?? target.tag ?? raw.tagName).toLowerCase();
  const classList = normalizeStringArray(target.classList ?? raw.classList).slice(0, 12);
  const text = cleanText(target.text ?? raw.text, 160);
  const labelText = cleanText(target.labelText ?? raw.labelText, 160);
  const accessibleName = cleanText(target.accessibleName ?? raw.accessibleName, 160);
  const confidence = normalizeConfidence(raw.confidence, candidates, attributes);

  const targetIdentity = {
    version: 1,
    tagName,
    role: firstString(target.role, attributes.role),
    inputType: firstString(target.inputType, attributes.type),
    attributes,
    classList,
    text,
    labelText,
    accessibleName,
    rect: normalizeRect(target.rect ?? raw.rect),
    pageUrl: firstString(raw.url, raw.pageUrl, target.pageUrl),
    frameUrl: firstString(raw.frameUrl, target.frameUrl),
    selectorCandidates: candidates,
    recommendedSelector,
    confidence,
    matchPolicy: {
      minScore: Number(raw.matchPolicy?.minScore ?? 28),
      ambiguityMargin: Number(raw.matchPolicy?.ambiguityMargin ?? 8),
      requireVisible: raw.matchPolicy?.requireVisible !== false,
      preferUnique: raw.matchPolicy?.preferUnique !== false
    }
  };

  return {
    id: firstString(raw.id) || `picker_${randomUUID().replaceAll("-", "").slice(0, 18)}`,
    source: firstString(raw.source) || "chrome-extension",
    field: firstString(raw.field) || "",
    suggestedAction: normalizeSuggestedAction(raw.suggestedAction, tagName, attributes),
    recommendedSelector,
    selectorCandidates: candidates,
    targetIdentity,
    pickedFrom: {
      url: targetIdentity.pageUrl,
      frameUrl: targetIdentity.frameUrl,
      title: cleanText(raw.title ?? raw.pageTitle, 160),
      platform: firstString(raw.platform, raw.platformId),
      tabId: raw.tabId ?? null,
      timestamp: Number(raw.timestamp ?? Date.now())
    },
    confidence,
    createdAt: firstString(raw.createdAt) || now
  };
}

export function createTargetIdentityFromPickerEvent(event) {
  const normalized = normalizePickerEvent(event);
  return normalized.targetIdentity;
}

function normalizeSelectorCandidates(candidates) {
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => {
      if (typeof candidate === "string") return { selector: candidate };
      if (!candidate || typeof candidate !== "object") return null;
      return candidate;
    })
    .filter(Boolean)
    .map((candidate) => {
      const selector = firstString(candidate.selector);
      if (!selector || seen.has(selector)) return null;
      seen.add(selector);
      const matchCount = finiteNumber(candidate.matchCount, null);
      const visibleCount = finiteNumber(candidate.visibleCount, null);
      return {
        selector,
        source: firstString(candidate.source) || "generated",
        reason: firstString(candidate.reason) || "",
        score: finiteNumber(candidate.score, 0),
        matchCount,
        visibleCount,
        unique: Boolean(candidate.unique ?? (matchCount === 1)),
        stable: Boolean(candidate.stable ?? candidate.source?.startsWith?.("attribute"))
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.score) - Number(a.score));
}

function normalizeAttributes(attributes) {
  const output = {};
  if (!attributes || typeof attributes !== "object") return output;
  for (const [key, value] of Object.entries(attributes)) {
    const name = String(key || "").toLowerCase();
    if (!name) continue;
    if (!ATTRIBUTE_ALLOWLIST.has(name) && !name.startsWith("data-")) continue;
    const text = firstString(value);
    if (!text || text.length > 240) continue;
    output[name] = text;
  }
  return output;
}

function normalizeConfidence(rawConfidence, candidates, attributes) {
  if (Number.isFinite(Number(rawConfidence))) return Math.max(0, Math.min(100, Number(rawConfidence)));
  const best = candidates[0];
  let score = best?.score ?? 0;
  if (best?.unique) score += 10;
  for (const [name, value] of Object.entries(attributes)) {
    if (!value) continue;
    score += STABLE_ATTRIBUTE_WEIGHTS[name] ?? (name.startsWith("data-") ? 24 : 0);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeSuggestedAction(action, tagName, attributes) {
  const explicit = firstString(action);
  if (["click", "fill", "press", "extract", "waitFor"].includes(explicit)) return explicit;
  if (["input", "textarea", "select"].includes(tagName)) return "fill";
  if (attributes.role === "button" || tagName === "button" || tagName === "a") return "click";
  return "click";
}

function normalizeRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const next = {
    x: finiteNumber(rect.x, 0),
    y: finiteNumber(rect.y, 0),
    width: finiteNumber(rect.width, 0),
    height: finiteNumber(rect.height, 0)
  };
  if (!next.width && !next.height) return null;
  return next;
}

function normalizeStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => firstString(item))
    .filter(Boolean);
}

function cleanToken(value) {
  return firstString(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

function cleanText(value, limit) {
  return firstString(value).replace(/\s+/g, " ").trim().slice(0, limit);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
