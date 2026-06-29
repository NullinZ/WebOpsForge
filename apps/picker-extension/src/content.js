(function initWebOpsPickerContent() {
  if (globalThis.__WEBOPS_FORGE_PICKER_CONTENT__) return;
  globalThis.__WEBOPS_FORGE_PICKER_CONTENT__ = true;

  const OVERLAY_ID = "__webops_forge_picker_overlay__";
  const STABLE_SELECTOR_ATTRIBUTES = [
    "data-e2e",
    "data-testid",
    "data-test",
    "data-cy",
    "aria-label",
    "placeholder",
    "name",
    "role",
    "type",
    "title"
  ];
  const ATTRIBUTE_SELECTOR_SCORES = {
    "data-e2e": 92,
    "data-testid": 92,
    "data-test": 88,
    "data-cy": 88,
    "aria-label": 78,
    placeholder: 78,
    name: 68,
    role: 56,
    type: 42,
    title: 42
  };
  const TRANSIENT_CLASS_NAMES = new Set([
    "active",
    "checked",
    "current",
    "disabled",
    "focus",
    "focused",
    "hidden",
    "hover",
    "is-active",
    "is-checked",
    "is-current",
    "is-disabled",
    "is-hidden",
    "is-open",
    "open",
    "selected",
    "show"
  ]);

  const picker = {
    active: false,
    field: "",
    actionHint: ""
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ ok: true, url: location.href });
      return false;
    }
    if (message.type === "START_PICK") {
      startPick(message.field || "targetElement", message.actionHint || "");
      sendResponse({ ok: true });
      return false;
    }
    if (message.type === "STOP_PICK") {
      const stopped = cancelPick({ notify: false });
      sendResponse({ ok: true, stopped });
      return false;
    }
    if (message.type === "WEBOPS_EXECUTE") {
      executeWebOpsJob(message.job)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: serializeExecutorError(error) }));
      return true;
    }
    return false;
  });

  function startPick(field, actionHint) {
    cancelPick({ notify: false });
    picker.active = true;
    picker.field = field;
    picker.actionHint = actionHint;
    createOverlay(field);
    window.addEventListener("keydown", handlePickKeydown, true);
    document.addEventListener("click", handlePickClick, true);
    document.addEventListener("keydown", handlePickKeydown, true);
  }

  function cancelPick({ notify = false, reason = "cancelled" } = {}) {
    const wasActive = picker.active;
    picker.active = false;
    picker.field = "";
    picker.actionHint = "";
    removeOverlay();
    window.removeEventListener("keydown", handlePickKeydown, true);
    document.removeEventListener("click", handlePickClick, true);
    document.removeEventListener("keydown", handlePickKeydown, true);
    if (wasActive && notify) {
      chrome.runtime.sendMessage({ type: "PICKER_CANCELLED", reason }).catch(() => {});
    }
    return wasActive;
  }

  function handlePickKeydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cancelPick({ notify: true, reason: "escape" });
  }

  function handlePickClick(event) {
    if (!picker.active) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const payload = createElementPickPayload(event.target, picker.field, picker.actionHint);
    chrome.runtime.sendMessage({ type: "PICKER_EVENT", event: payload }).catch(() => {});
    cancelPick({ notify: false });
  }

  function createOverlay(field) {
    removeOverlay();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.textContent = `WebOps picking: click target element (${field}). Press ESC or use the side panel stop button to cancel.`;
    overlay.style.position = "fixed";
    overlay.style.zIndex = "2147483647";
    overlay.style.left = "0";
    overlay.style.right = "0";
    overlay.style.top = "0";
    overlay.style.padding = "8px 12px";
    overlay.style.background = "rgba(15, 23, 42, 0.92)";
    overlay.style.color = "#fff";
    overlay.style.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    document.documentElement.appendChild(overlay);
  }

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function createElementPickPayload(el, field, actionHint) {
    const selectorCandidates = buildSelectorCandidates(el);
    const recommendedSelector = selectorCandidates[0]?.selector || createCssSelector(el);
    const target = describeTargetElement(el);
    const confidence = Math.max(0, Math.min(100, Math.round((selectorCandidates[0]?.score || 0) + stableAttributeBonus(target.attributes))));
    return {
      field,
      suggestedAction: suggestedActionForTarget(el, field, actionHint),
      selector: recommendedSelector,
      recommendedSelector,
      selectorCandidates,
      target,
      url: location.href,
      frameUrl: location.href,
      title: document.title || "",
      confidence,
      timestamp: Date.now()
    };
  }

  function buildSelectorCandidates(el) {
    const candidates = [];
    const tag = el.nodeName.toLowerCase();

    for (const name of STABLE_SELECTOR_ATTRIBUTES) {
      const value = el.getAttribute(name);
      if (!value || value.length > 180) continue;
      const baseScore = ATTRIBUTE_SELECTOR_SCORES[name] || 40;
      pushSelectorCandidate(candidates, `${tag}[${name}="${cssAttributeValue(value)}"]`, `attribute:${name}`, baseScore, `${name} exact match`);
      if (name.startsWith("data-") || ["aria-label", "placeholder", "name"].includes(name)) {
        pushSelectorCandidate(candidates, `[${name}="${cssAttributeValue(value)}"]`, `attribute:${name}`, baseScore - 4, `${name} exact match`);
      }
    }

    if (el.id && !looksGeneratedToken(el.id)) {
      const idScore = 66;
      pushSelectorCandidate(candidates, `#${CSS.escape(el.id)}`, "id", idScore, "id exact match");
      pushSelectorCandidate(candidates, `${tag}#${CSS.escape(el.id)}`, "id", idScore - 4, "tag and id exact match");
    }

    if (tag === "input") {
      const type = el.getAttribute("type");
      if (type) pushSelectorCandidate(candidates, `input[type="${cssAttributeValue(type)}"]`, "input:type", 38, "input type");
    }

    const classSelector = classSelectorFor(el, 2);
    if (classSelector) {
      pushSelectorCandidate(candidates, `${tag}${classSelector}`, "class", 30, "tag and class");
    }

    pushSelectorCandidate(candidates, createCssSelector(el), "dom-path", 18, "unique DOM path");

    return candidates
      .filter((candidate) => candidate.matchCount > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  function pushSelectorCandidate(candidates, selector, source, baseScore, reason) {
    if (!selector || candidates.some((candidate) => candidate.selector === selector)) return;
    const validation = validateSelectorCandidate(selector);
    if (!validation.ok) return;
    candidates.push({
      selector,
      source,
      reason,
      score: baseScore + (validation.unique ? 12 : 0) + Math.min(validation.visibleCount * 2, 8),
      matchCount: validation.matchCount,
      visibleCount: validation.visibleCount,
      unique: validation.unique,
      stable: source !== "dom-path" && source !== "class"
    });
  }

  function validateSelectorCandidate(selector) {
    try {
      const nodes = Array.from(document.querySelectorAll(selector));
      const visibleCount = nodes.filter((node) => isVisibleElement(node)).length;
      return {
        ok: true,
        matchCount: nodes.length,
        visibleCount,
        unique: nodes.length === 1
      };
    } catch (_) {
      return { ok: false, matchCount: 0, visibleCount: 0, unique: false };
    }
  }

  function describeTargetElement(el) {
    const rect = el.getBoundingClientRect();
    const attributes = {};
    const names = new Set([
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
      ...STABLE_SELECTOR_ATTRIBUTES
    ]);
    for (const name of names) {
      const value = el.getAttribute?.(name);
      if (name === "id" && looksGeneratedToken(value)) continue;
      if (value && value.length <= 240) attributes[name] = value;
    }
    for (const attr of Array.from(el.attributes || [])) {
      if (attr.name.startsWith("data-") && attr.value && attr.value.length <= 240) {
        attributes[attr.name] = attr.value;
      }
    }
    return {
      tagName: el.nodeName.toLowerCase(),
      role: el.getAttribute("role") || "",
      inputType: el.getAttribute("type") || "",
      attributes,
      classList: stableClassListFor(el, 12),
      text: cleanPickerText(el.textContent || ""),
      labelText: associatedLabelText(el),
      accessibleName: accessibleName(el),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }
    };
  }

  function createCssSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id && !looksGeneratedToken(el.id)) return `#${CSS.escape(el.id)}`;

    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && current !== document.body) {
      let part = current.nodeName.toLowerCase();
      const classSelector = classSelectorFor(current, 1);
      if (classSelector) part += classSelector;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((child) => child.nodeName === current.nodeName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      const joined = parts.join(" > ");
      try {
        if (document.querySelectorAll(joined).length === 1) return joined;
      } catch (_) {
        // Try the next parent.
      }
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function suggestedActionForTarget(el, field, actionHint) {
    if (["click", "fill", "press", "extract", "waitFor"].includes(actionHint)) return actionHint;
    if (field === "extractTarget") return "extract";
    if (field === "inputTarget") return "fill";
    if (field === "clickTarget") return "click";
    const tag = el.nodeName.toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) return "fill";
    if (tag === "button" || tag === "a" || el.getAttribute("role") === "button") return "click";
    return "click";
  }

  function associatedLabelText(el) {
    const labels = Array.from(el.labels || []).map((label) => label.textContent || "");
    const labelledBy = (el.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "");
    return cleanPickerText([...labels, ...labelledBy].filter(Boolean).join(" "));
  }

  function accessibleName(el) {
    return cleanPickerText([
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      associatedLabelText(el),
      el.getAttribute("title"),
      el.textContent
    ].filter(Boolean).join(" "));
  }

  function classSelectorFor(el, limit) {
    return stableClassListFor(el, limit)
      .slice(0, limit)
      .map((className) => `.${CSS.escape(className)}`)
      .join("");
  }

  function stableClassListFor(el, limit = 12) {
    return Array.from(el?.classList || [])
      .filter(isStableClassName)
      .slice(0, limit);
  }

  function isStableClassName(className) {
    const text = String(className || "").trim();
    return /^[a-zA-Z0-9_-]+$/.test(text)
      && !TRANSIENT_CLASS_NAMES.has(text)
      && !looksGeneratedToken(text)
      && !looksGeneratedClassName(text);
  }

  function isVisibleElement(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function cssAttributeValue(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function cleanPickerText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  async function executeWebOpsJob(job) {
    const params = job?.params || {};
    const timeoutMs = Number(params.timeoutMs || 10_000);
    switch (job?.action) {
      case "waitFor":
        return waitForWebOpsTarget(params, timeoutMs);
      case "click":
        return clickWebOpsTarget(params, timeoutMs);
      case "fill":
        return fillWebOpsTarget(params, timeoutMs);
      case "press":
        return pressWebOpsTarget(params, timeoutMs);
      case "extract":
        return extractWebOpsTarget(params, timeoutMs);
      case "extractList":
        return extractListWebOpsTarget(params, timeoutMs);
      case "extractDetail":
        return extractDetailWebOpsTarget(params, timeoutMs);
      case "extractMedia":
        return extractMediaWebOpsTarget(params, timeoutMs);
      case "checkSession":
        return checkSessionWebOpsTarget(params, timeoutMs);
      default:
        throw executorError(`Unsupported extension executor action: ${job?.action || ""}`, {
          reason: "unsupported_extension_executor_action",
          action: job?.action || ""
        });
    }
  }

  async function waitForWebOpsTarget(params, timeoutMs) {
    const state = params.state || "visible";
    const resolved = await waitForResolvedTarget(params, state, timeoutMs);
    return {
      selector: resolved.selector,
      state,
      matched: Boolean(resolved.element),
      target: resolved.target,
      url: location.href
    };
  }

  async function clickWebOpsTarget(params, timeoutMs) {
    const resolved = await waitForResolvedTarget(params, "visible", timeoutMs);
    resolved.element.scrollIntoView({ block: "center", inline: "center" });
    resolved.element.click();
    return {
      selector: resolved.selector,
      clicked: true,
      target: resolved.target,
      url: location.href
    };
  }

  async function fillWebOpsTarget(params, timeoutMs) {
    const resolved = await waitForResolvedTarget(params, "visible", timeoutMs);
    const value = String(params.value ?? "");
    resolved.element.scrollIntoView({ block: "center", inline: "center" });
    resolved.element.focus();
    setNativeValue(resolved.element, value);
    resolved.element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value
    }));
    resolved.element.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      selector: resolved.selector,
      value: params.redact ? "[redacted]" : value,
      actualValue: params.redact ? "[redacted]" : currentElementValue(resolved.element),
      filled: true,
      target: resolved.target,
      url: location.href
    };
  }

  async function pressWebOpsTarget(params, timeoutMs) {
    const key = String(params.key || "");
    const resolved = params.selector
      ? await waitForResolvedTarget(params, "visible", timeoutMs)
      : { element: document.activeElement, selector: "", target: null };
    if (!resolved.element) {
      throw executorError("No active element for key press", { reason: "selector_not_found", key });
    }
    resolved.element.focus?.();
    for (const type of ["keydown", "keypress", "keyup"]) {
      resolved.element.dispatchEvent(new KeyboardEvent(type, {
        key,
        code: key,
        bubbles: true,
        cancelable: true
      }));
    }
    return {
      selector: resolved.selector,
      key,
      pressed: true,
      target: resolved.target,
      url: location.href
    };
  }

  async function extractWebOpsTarget(params, timeoutMs) {
    const resolved = await waitForResolvedTarget(params, "visible", timeoutMs);
    return {
      selector: resolved.selector,
      mode: params.mode || "text",
      value: extractValue(resolved.element, params),
      target: resolved.target,
      url: location.href
    };
  }

  async function extractListWebOpsTarget(params, timeoutMs) {
    const resolved = await waitForResolvedTarget(params, "attached", timeoutMs);
    const nodes = Array.from(document.querySelectorAll(resolved.selector));
    const limit = Number(params.limit || nodes.length);
    const fields = params.fields || {};
    const rows = nodes.slice(0, limit).map((node) => {
      if (!fields || Object.keys(fields).length === 0) return cleanPickerText(node.textContent || "");
      const row = {};
      for (const [name, spec] of Object.entries(fields)) {
        const fieldSpec = typeof spec === "string" ? { selector: spec, mode: "text" } : spec || {};
        const target = fieldSpec.selector ? node.querySelector(fieldSpec.selector) : node;
        row[name] = target ? extractValue(target, fieldSpec) : null;
      }
      return row;
    });
    return {
      selector: resolved.selector,
      value: rows,
      count: rows.length,
      target: resolved.target,
      url: location.href
    };
  }

  async function extractDetailWebOpsTarget(params, timeoutMs) {
    const fields = params.fields || {};
    const value = {};
    for (const [name, spec] of Object.entries(fields)) {
      const fieldSpec = typeof spec === "string" ? { selector: spec, mode: "text" } : spec || {};
      const resolved = await waitForResolvedTarget(fieldSpec, fieldSpec.required === false ? "attached_or_missing" : "attached", timeoutMs);
      value[name] = resolved.element ? extractValue(resolved.element, fieldSpec) : null;
    }
    return { value, url: location.href };
  }

  async function extractMediaWebOpsTarget(params, timeoutMs) {
    const resolved = await waitForResolvedTarget(params, "attached", timeoutMs);
    const nodes = Array.from(document.querySelectorAll(resolved.selector));
    const limit = Number(params.limit || nodes.length);
    const rows = nodes.slice(0, limit).map((node) => ({
      src: node.currentSrc || node.src || node.getAttribute("src") || node.getAttribute("href") || "",
      alt: node.getAttribute("alt") || "",
      title: node.getAttribute("title") || ""
    }));
    return {
      selector: resolved.selector,
      value: rows,
      count: rows.length,
      target: resolved.target,
      url: location.href
    };
  }

  async function checkSessionWebOpsTarget(params, timeoutMs) {
    const loggedOutSelector = params.loggedOutSelector || "";
    if (loggedOutSelector) {
      const loggedOut = await waitForResolvedTarget({ selector: loggedOutSelector }, "attached_or_missing", Math.min(timeoutMs, 1200));
      if (loggedOut.element && isVisibleElement(loggedOut.element)) {
        throw executorError("Login required for the current browser session", {
          reason: "login_required",
          accountSelector: params.accountSelector || "",
          loggedOutSelector
        });
      }
    }

    const accountSelector = params.accountSelector || "";
    if (!accountSelector) {
      return {
        loginState: "unknown",
        accountLabel: "",
        value: { loginState: "unknown", accountLabel: "" },
        url: location.href
      };
    }

    const account = await waitForResolvedTarget({ selector: accountSelector }, "attached", timeoutMs);
    const accountLabel = cleanPickerText(account.element?.textContent || currentElementValue(account.element) || "");
    const value = {
      loginState: "authenticated",
      accountLabel
    };
    return {
      ...value,
      accountSelector,
      loggedOutSelector,
      value,
      target: account.target,
      url: location.href
    };
  }

  async function waitForResolvedTarget(params, state, timeoutMs) {
    const deadline = Date.now() + Math.max(500, timeoutMs || 10_000);
    let last = null;
    while (Date.now() <= deadline) {
      last = resolveWebOpsTarget(params);
      if (state === "attached_or_missing") return last;
      if (targetSatisfiesState(last, state)) return last;
      await sleep(120);
    }
    if (last?.identityMode && last?.attempts?.some((attempt) => ["low_score", "ambiguous", "no_visible_match"].includes(attempt.status))) {
      throw executorError(`Target identity could not be matched safely for selector: ${params.selector || ""}`, {
        reason: "target_identity_not_matched",
        selector: params.selector || "",
        attempts: last.attempts || []
      });
    }
    throw executorError(`Selector not found: ${params.selector || ""}`, {
      reason: "selector_not_found",
      selector: params.selector || "",
      attempts: last?.attempts || []
    });
  }

  function resolveWebOpsTarget(params) {
    const selectors = candidateSelectors(params);
    const identity = params.targetIdentity && typeof params.targetIdentity === "object" ? params.targetIdentity : null;
    const attempts = [];
    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = Array.from(document.querySelectorAll(selector));
      } catch (_) {
        attempts.push({ selector, status: "invalid_selector", matchCount: 0, visibleCount: 0 });
        continue;
      }
      const visibleNodes = nodes.filter((node) => isVisibleElement(node));
      if (identity) {
        const resolved = resolveIdentityMatch(nodes, identity);
        attempts.push({
          selector,
          status: nodes.length ? resolved.status : "not_found",
          matchCount: nodes.length,
          visibleCount: resolved.visibleCount,
          topScore: resolved.topScore,
          secondScore: resolved.secondScore,
          truncated: resolved.truncated
        });
        if (resolved.element) {
          return {
            element: resolved.element,
            selector,
            attempts,
            identityMode: true,
            target: {
              selector,
              requestedSelector: params.selector || "",
              strategy: "targetIdentity",
              index: resolved.index,
              count: nodes.length,
              visibleCount: resolved.visibleCount,
              score: resolved.topScore,
              secondScore: resolved.secondScore,
              attempts
            }
          };
        }
        continue;
      }

      attempts.push({
        selector,
        status: nodes.length ? "matched" : "not_found",
        matchCount: nodes.length,
        visibleCount: visibleNodes.length
      });
      const element = visibleNodes[0] || nodes[0] || null;
      if (element) {
        return {
          element,
          selector,
          attempts,
          identityMode: false,
          target: {
            selector,
            requestedSelector: params.selector || "",
            count: nodes.length,
            visibleCount: visibleNodes.length
          }
        };
      }
    }
    return {
      element: null,
      selector: params.selector || selectors[0] || "",
      attempts,
      identityMode: Boolean(identity),
      target: {
        selector: params.selector || selectors[0] || "",
        requestedSelector: params.selector || "",
        count: 0,
        visibleCount: 0
      }
    };
  }

  function candidateSelectors(params) {
    const selectors = [];
    if (params.targetIdentity?.recommendedSelector) selectors.push(params.targetIdentity.recommendedSelector);
    if (params.selector) selectors.push(params.selector);
    for (const candidate of params.selectorCandidates || params.targetIdentity?.selectorCandidates || []) {
      if (candidate?.selector) selectors.push(candidate.selector);
    }
    selectors.push(...identityFallbackSelectors(params.targetIdentity));
    return Array.from(new Set(selectors.filter(Boolean)));
  }

  function identityFallbackSelectors(identity) {
    if (!identity || typeof identity !== "object") return [];
    const tag = cleanTagName(identity.tagName);
    const attributes = identity.attributes && typeof identity.attributes === "object" ? identity.attributes : {};
    const selectors = [];
    for (const name of STABLE_SELECTOR_ATTRIBUTES) {
      const value = attributes[name];
      if (!value || String(value).length > 180) continue;
      if (name === "id" && looksGeneratedToken(value)) continue;
      const attrSelector = `[${name}="${cssAttributeValue(value)}"]`;
      if (tag) selectors.push(`${tag}${attrSelector}`);
      selectors.push(attrSelector);
    }
    const classSelector = (Array.isArray(identity.classList) ? identity.classList : [])
      .filter(isStableClassName)
      .slice(0, 2)
      .map((className) => `.${CSS.escape(className)}`)
      .join("");
    if (tag && classSelector) selectors.push(`${tag}${classSelector}`);
    if (tag && ["a", "button", "input", "select", "textarea"].includes(tag)) selectors.push(tag);
    if (tag && identityHasTextSignal(identity)) selectors.push(tag);
    return selectors;
  }

  function resolveIdentityMatch(nodes, identity) {
    const minScore = Number(identity.matchPolicy?.minScore ?? 28);
    const ambiguityMargin = Number(identity.matchPolicy?.ambiguityMargin ?? 8);
    const cappedNodes = nodes.length > 2000 ? nodes.slice(0, 2000) : nodes;
    const scored = scoreElementsForIdentity(cappedNodes, identity);
    const visibleScored = identity.matchPolicy?.requireVisible === false
      ? scored
      : scored.filter((item) => item.visible);
    const ranked = visibleScored.sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const second = ranked[1];
    const base = {
      element: null,
      index: -1,
      visibleCount: visibleScored.length,
      topScore: top?.score ?? 0,
      secondScore: second?.score ?? 0,
      truncated: cappedNodes.length !== nodes.length
    };
    if (!top) return { ...base, status: "no_visible_match" };
    if (top.score < minScore) return { ...base, status: "low_score" };
    if (ranked.length > 1 && top.score - (second?.score ?? 0) < ambiguityMargin) {
      return { ...base, status: "ambiguous" };
    }
    return {
      ...base,
      status: "scored",
      element: cappedNodes[top.index] || null,
      index: top.index
    };
  }

  function scoreElementsForIdentity(nodes, identity) {
    const weights = {
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
    const expectedAttributes = identity.attributes && typeof identity.attributes === "object" ? identity.attributes : {};
    const expectedClasses = Array.isArray(identity.classList) ? identity.classList.filter(isStableClassName) : [];
    const expectedText = normalizeIdentityText(identity.text || identity.labelText || identity.accessibleName || "");

    return nodes.map((node, index) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const visible = rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      const tagName = node.nodeName.toLowerCase();
      let score = visible ? 6 : 0;
      if (identity.tagName && tagName === cleanTagName(identity.tagName)) score += 10;

      for (const [name, expectedValue] of Object.entries(expectedAttributes)) {
        const actualValue = node.getAttribute(name);
        if (!expectedValue || !actualValue) continue;
        if (name === "id" && looksGeneratedToken(expectedValue)) continue;
        if (actualValue === expectedValue) {
          score += weights[name] ?? (name.startsWith("data-") ? 24 : 8);
        } else if (name === "href" && actualValue.includes(expectedValue)) {
          score += 6;
        }
      }

      const classMatches = expectedClasses.filter((className) => node.classList.contains(className)).length;
      score += Math.min(classMatches * 3, 12);

      const actualText = normalizeIdentityText([
        node.getAttribute("aria-label"),
        node.getAttribute("placeholder"),
        node.getAttribute("title"),
        node.textContent
      ].filter(Boolean).join(" "));
      if (expectedText && actualText) {
        if (actualText === expectedText) score += 20;
        else if (actualText.includes(expectedText) || expectedText.includes(actualText)) score += 10;
      }

      return {
        index,
        score,
        visible,
        tagName
      };
    });
  }

  function cleanTagName(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  }

  function identityHasTextSignal(identity) {
    return Boolean(normalizeIdentityText(identity.text || identity.labelText || identity.accessibleName || ""));
  }

  function normalizeIdentityText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function targetSatisfiesState(resolved, state) {
    if (state === "detached") return !resolved.element;
    if (state === "hidden") return !resolved.element || !isVisibleElement(resolved.element);
    if (state === "attached") return Boolean(resolved.element);
    return Boolean(resolved.element && isVisibleElement(resolved.element));
  }

  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }
    element.value = value;
  }

  function currentElementValue(element) {
    if ("value" in element) return element.value;
    return element.textContent || "";
  }

  function extractValue(element, params) {
    const mode = params.mode || "text";
    if (mode === "html") return element.innerHTML;
    if (mode === "value") return currentElementValue(element);
    if (mode === "attribute") return element.getAttribute(params.attribute || params.attr || "") || "";
    return cleanPickerText(element.textContent || currentElementValue(element));
  }

  function executorError(message, details = {}) {
    const error = new Error(message);
    error.code = "BROWSER_ACTION_ERROR";
    error.details = details;
    return error;
  }

  function serializeExecutorError(error) {
    return {
      message: error?.message || String(error),
      code: error?.code || "BROWSER_ACTION_ERROR",
      reason: error?.details?.reason || error?.reason || "front_chrome_executor_action_failed",
      details: error?.details || {}
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function looksGeneratedToken(value) {
    const text = String(value || "");
    return text.length > 28
      || /[a-f0-9]{10,}/i.test(text)
      || /__[a-zA-Z0-9_-]{6,}/.test(text);
  }

  function looksGeneratedClassName(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (/^(?:css|jss|sc|jsx|emotion|_ngcontent|ng)-?[a-zA-Z0-9_-]{4,}$/i.test(text)) return true;
    if (/^[a-zA-Z0-9]{7,14}$/.test(text) && /[a-z]/.test(text) && /[A-Z]/.test(text) && /\d/.test(text)) return true;
    return false;
  }

  function stableAttributeBonus(attributes) {
    if (!attributes || typeof attributes !== "object") return 0;
    if (attributes["data-e2e"] || attributes["data-testid"]) return 8;
    if (attributes.placeholder || attributes["aria-label"]) return 6;
    return 0;
  }
})();
