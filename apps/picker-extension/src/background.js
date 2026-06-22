const STUDIO_ORIGIN = "http://127.0.0.1:4177";
const PICKER_EVENTS_URL = `${STUDIO_ORIGIN}/api/picker/events`;
const PICKER_SESSION_URL = `${STUDIO_ORIGIN}/api/picker/session`;
const SIDE_PANEL_PATH = "src/sidepanel.html";
const SESSION_CACHE_MS = 1200;

let cachedPickerSession = null;
let sessionCacheAt = 0;
let activePick = null;

chrome.runtime.onInstalled.addListener(() => {
  initializeSidePanel().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  initializeSidePanel().catch(() => {});
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateSidePanelForTab(tab, { forceSessionRefresh: true });
  } catch (_) {
    // Restricted browser pages can reject tab access.
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  if (changeInfo.url && activePick?.tabId === tabId) activePick = null;
  updateSidePanelForTab({ ...tab, id: tabId }, { forceSessionRefresh: Boolean(changeInfo.url) }).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activePick?.tabId === tabId) activePick = null;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "GET_PICKER_STATUS") {
      const tab = await getActiveTab();
      const [studio, session] = await Promise.all([
        fetchStudioStatus(),
        fetchPickerSession({ force: true })
      ]);
      const target = evaluateTabTarget(tab, session);
      sendResponse({
        ok: true,
        tab: compactTab(tab, target),
        studio,
        session,
        activePick: compactActivePick(activePick)
      });
      return;
    }

    if (message.type === "OPEN_STUDIO") {
      sendResponse(await openOrFocusStudioTab());
      return;
    }

    if (message.type === "START_PICK") {
      const tab = await getActiveTab();
      const session = await fetchPickerSession({ force: true });
      const target = evaluateTabTarget(tab, session);
      if (!target.pickable) {
        sendResponse({
          ok: false,
          error: target.reason,
          targetUrl: target.targetUrl || ""
        });
        return;
      }
      await ensureContentScript(tab.id);
      const result = await chrome.tabs.sendMessage(tab.id, {
        type: "START_PICK",
        field: message.field || "targetElement",
        actionHint: message.actionHint || ""
      });
      if (result?.ok) {
        activePick = {
          tabId: tab.id,
          windowId: tab.windowId ?? null,
          title: tab.title || "",
          url: tab.url || "",
          field: message.field || "targetElement",
          actionHint: message.actionHint || "",
          startedAt: Date.now()
        };
        sendResponse({ ok: true, tab: compactTab(tab, target), session, activePick: compactActivePick(activePick) });
      } else {
        sendResponse({ ok: false, error: result?.error || "start_pick_failed" });
      }
      return;
    }

    if (message.type === "STOP_PICK") {
      sendResponse(await stopActivePick(message.reason || "sidepanel"));
      return;
    }

    if (message.type === "PICKER_EVENT") {
      if (sender?.tab?.id && activePick?.tabId === sender.tab.id) activePick = null;
      const session = await fetchPickerSession({ force: true });
      const posted = await postPickerEvent({
        ...message.event,
        pickerSessionId: session?.id ?? null,
        pickerTargetUrl: session?.targetUrl ?? "",
        tabId: sender?.tab?.id ?? message.event?.tabId ?? null
      });
      if (posted.ok && session?.id) {
        await clearStudioPickerSession(session.id, "posted");
        await refreshAllTabsSidePanels();
      }
      await chrome.storage.local.set({ latestPickerPost: posted });
      sendResponse({ ok: true, posted });
      return;
    }

    if (message.type === "PICKER_CANCELLED") {
      if (!sender?.tab?.id || activePick?.tabId === sender.tab.id) activePick = null;
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "unknown_message" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error?.message || String(error) });
  });
  return true;
});

async function initializeSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await refreshAllTabsSidePanels({ forceSessionRefresh: true });
}

async function refreshAllTabsSidePanels({ forceSessionRefresh = true } = {}) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => updateSidePanelForTab(tab, { forceSessionRefresh })));
}

async function updateSidePanelForTab(tab, { forceSessionRefresh = false } = {}) {
  if (!tab?.id) return;
  try {
    const session = await fetchPickerSession({ force: forceSessionRefresh });
    const target = evaluateTabTarget(tab, session);
    const panelOptions = { tabId: tab.id, enabled: target.pickable };
    if (target.pickable) panelOptions.path = SIDE_PANEL_PATH;
    await chrome.sidePanel.setOptions(panelOptions);
    await chrome.action.setTitle({
      tabId: tab.id,
      title: target.pickable
        ? "WebOps Forge Picker: ready"
        : "WebOps Forge Picker: waiting for a Studio picker session"
    }).catch(() => {});
    if (target.pickable) {
      await chrome.action.enable(tab.id);
    } else {
      await chrome.action.disable(tab.id);
      await closeSidePanelForTab(tab);
    }
  } catch (_) {
    // Chrome internal tabs may reject extension UI updates.
  }
}

async function closeSidePanelForTab(tab) {
  if (typeof chrome.sidePanel.close !== "function") return;
  try {
    await chrome.sidePanel.close({ tabId: tab.id });
  } catch (_) {
    // The panel may already be closed or only a global panel may exist.
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function openOrFocusStudioTab() {
  const tabs = await chrome.tabs.query({});
  const studioTab = tabs
    .filter((tab) => isStudioTab(tab))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  if (!studioTab?.id) {
    const tab = await chrome.tabs.create({ url: STUDIO_ORIGIN });
    return { ok: true, reused: false, tab: compactTab(tab) };
  }

  await chrome.tabs.update(studioTab.id, { active: true });
  if (studioTab.windowId != null) {
    await chrome.windows.update(studioTab.windowId, { focused: true }).catch(() => {});
  }
  return { ok: true, reused: true, tab: compactTab(studioTab) };
}

function isStudioTab(tab) {
  try {
    const origin = new URL(tab?.url || "").origin;
    return origin === STUDIO_ORIGIN || origin === "http://localhost:4177";
  } catch (_) {
    return false;
  }
}

async function stopActivePick(reason = "sidepanel") {
  const tabId = activePick?.tabId ?? (await getActiveTab())?.id;
  if (!tabId) {
    activePick = null;
    return { ok: true, stopped: false, reason: "no_active_tab" };
  }

  try {
    const result = await chrome.tabs.sendMessage(tabId, { type: "STOP_PICK", reason });
    activePick = null;
    return { ok: true, stopped: Boolean(result?.stopped), reason };
  } catch (error) {
    activePick = null;
    return { ok: true, stopped: false, reason: "picker_not_running", error: error?.message || "" };
  }
}

function compactTab(tab, target = evaluateTabTarget(tab, cachedPickerSession)) {
  if (!tab) return null;
  return {
    id: tab.id,
    title: tab.title || "",
    url: tab.url || "",
    pickable: target.pickable,
    reason: target.reason,
    targetUrl: target.targetUrl || ""
  };
}

function compactActivePick(pick) {
  if (!pick) return { active: false };
  return {
    active: true,
    tabId: pick.tabId,
    title: pick.title || "",
    url: pick.url || "",
    field: pick.field || "",
    startedAt: pick.startedAt || null
  };
}

function evaluateTabTarget(tab, session) {
  const targetUrl = session?.targetUrl || session?.allowedUrls?.[0] || "";
  if (!isHttpUrl(tab?.url)) {
    return { pickable: false, reason: "unsupported_page", targetUrl };
  }
  if (!session?.id) {
    return { pickable: false, reason: "no_picker_session", targetUrl };
  }
  return { pickable: true, reason: "picker_session_active", targetUrl };
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url || "");
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    if (ping?.ok) return true;
  } catch (_) {
    // Inject below.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content.js"]
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const ping = await chrome.tabs.sendMessage(tabId, { type: "PING" });
  return Boolean(ping?.ok);
}

async function fetchStudioStatus() {
  try {
    const response = await fetch(`${STUDIO_ORIGIN}/api/health`);
    return {
      ok: response.ok,
      status: response.status,
      origin: STUDIO_ORIGIN
    };
  } catch (error) {
    return {
      ok: false,
      origin: STUDIO_ORIGIN,
      error: error?.message || "studio_unreachable"
    };
  }
}

async function fetchPickerSession({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - sessionCacheAt < SESSION_CACHE_MS) return cachedPickerSession;
  sessionCacheAt = now;
  try {
    const response = await fetch(PICKER_SESSION_URL, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    cachedPickerSession = response.ok ? body.session ?? null : null;
  } catch (_) {
    cachedPickerSession = null;
  }
  return cachedPickerSession;
}

async function clearStudioPickerSession(sessionId, reason) {
  try {
    await fetch(PICKER_SESSION_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason })
    });
  } catch (_) {
    // Studio polling will expire or replace the session if this request fails.
  } finally {
    cachedPickerSession = null;
    sessionCacheAt = 0;
  }
}

async function postPickerEvent(event) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(PICKER_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "webops-forge-picker-extension",
        ...event
      }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      id: body?.event?.id || null,
      selector: body?.event?.recommendedSelector || event.recommendedSelector || ""
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === "AbortError" ? "studio_timeout" : error?.message || "studio_unreachable"
    };
  } finally {
    clearTimeout(timeout);
  }
}
