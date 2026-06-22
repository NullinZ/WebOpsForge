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
    return false;
  });

  function startPick(field, actionHint) {
    cancelPick({ notify: false });
    picker.active = true;
    picker.field = field;
    picker.actionHint = actionHint;
    createOverlay(field);
    document.addEventListener("click", handlePickClick, true);
    document.addEventListener("keydown", handlePickKeydown, true);
  }

  function cancelPick({ notify = false, reason = "cancelled" } = {}) {
    const wasActive = picker.active;
    picker.active = false;
    picker.field = "";
    picker.actionHint = "";
    removeOverlay();
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

    if (el.id) {
      const idScore = looksGeneratedToken(el.id) ? 42 : 66;
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
      classList: Array.from(el.classList || []).slice(0, 12),
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
    if (el.id) return `#${CSS.escape(el.id)}`;

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
    return Array.from(el.classList || [])
      .filter((className) => /^[a-zA-Z0-9_-]+$/.test(className) && !looksGeneratedToken(className))
      .slice(0, limit)
      .map((className) => `.${CSS.escape(className)}`)
      .join("");
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

  function looksGeneratedToken(value) {
    const text = String(value || "");
    return text.length > 28 || /[a-f0-9]{10,}/i.test(text) || /__[a-zA-Z0-9_-]{6,}/.test(text);
  }

  function stableAttributeBonus(attributes) {
    if (!attributes || typeof attributes !== "object") return 0;
    if (attributes["data-e2e"] || attributes["data-testid"]) return 8;
    if (attributes.placeholder || attributes["aria-label"]) return 6;
    return 0;
  }
})();
