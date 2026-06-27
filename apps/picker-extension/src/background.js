const STUDIO_ORIGIN = "http://127.0.0.1:4177";
const PICKER_EVENTS_URL = `${STUDIO_ORIGIN}/api/picker/events`;
const PICKER_SESSION_URL = `${STUDIO_ORIGIN}/api/picker/session`;
const EXECUTOR_JOBS_URL = `${STUDIO_ORIGIN}/api/extension-executor/jobs`;
const SIDE_PANEL_PATH = "src/sidepanel.html";
const SESSION_CACHE_MS = 1200;
const EXECUTOR_POLL_IDLE_MS = 800;
const EXECUTOR_POLL_BUSY_MS = 120;

let cachedPickerSession = null;
let sessionCacheAt = 0;
let activePick = null;
let executorPollTimer = null;
let executorPollBusy = false;

chrome.runtime.onInstalled.addListener(() => {
  initializeSidePanel().catch(() => {});
  startExecutorPolling();
});

chrome.runtime.onStartup.addListener(() => {
  initializeSidePanel().catch(() => {});
  startExecutorPolling();
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
      startExecutorPolling();
      const [studio, session] = await Promise.all([
        fetchStudioStatus(),
        fetchPickerSession({ force: true })
      ]);
      const tab = await resolvePickerTargetTab(session);
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

    if (message.type === "POLL_EXECUTOR_JOB") {
      await pollExecutorJob();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "OPEN_STUDIO") {
      sendResponse(await openOrFocusStudioTab());
      return;
    }

    if (message.type === "START_PICK") {
      const session = await fetchPickerSession({ force: true });
      const tab = await resolvePickerTargetTab(session);
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
  startExecutorPolling();
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
    const panelOptions = { tabId: tab.id, enabled: target.canOpenPanel };
    if (target.canOpenPanel) panelOptions.path = SIDE_PANEL_PATH;
    await chrome.sidePanel.setOptions(panelOptions);
    await chrome.action.setTitle({
      tabId: tab.id,
      title: target.pickable
        ? "WebOps Forge Picker: ready"
        : target.canOpenPanel
          ? "WebOps Forge Picker: open Studio to start a pick"
          : "WebOps Forge Picker: unsupported page"
    }).catch(() => {});
    if (target.canOpenPanel) {
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
  return resolveLastFocusedActiveTab();
}

async function resolvePickerTargetTab(session) {
  const [lastFocusedTab, activeTabs] = await Promise.all([
    resolveLastFocusedActiveTab(),
    chrome.tabs.query({ active: true }).catch(() => [])
  ]);
  const candidates = uniqueTabs([lastFocusedTab, ...activeTabs])
    .filter((tab) => tab?.id && isHttpUrl(tab.url));
  if (!candidates.length) return lastFocusedTab || activeTabs[0] || null;

  const sessionCandidates = candidates.filter((tab) => tabMatchesPickerSession(tab, session));
  if (sessionCandidates.length) {
    if (lastFocusedTab?.id && sessionCandidates.some((tab) => tab.id === lastFocusedTab.id)) return lastFocusedTab;
    return sortTabsByRecent(sessionCandidates)[0];
  }
  return lastFocusedTab && isHttpUrl(lastFocusedTab.url) ? lastFocusedTab : sortTabsByRecent(candidates)[0];
}

async function resolveLastFocusedActiveTab() {
  try {
    const win = await chrome.windows.getLastFocused({ populate: true, windowTypes: ["normal"] });
    return (win?.tabs || []).find((tab) => tab.active) || null;
  } catch (_) {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    return tabs[0] || null;
  }
}

function uniqueTabs(tabs) {
  const seen = new Set();
  return tabs.filter((tab) => {
    if (!tab?.id || seen.has(tab.id)) return false;
    seen.add(tab.id);
    return true;
  });
}

function sortTabsByRecent(tabs) {
  return [...tabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
}

function tabMatchesPickerSession(tab, session) {
  if (!session?.id || !isHttpUrl(tab?.url)) return false;
  const targets = [session.targetUrl, ...(session.allowedUrls || [])].filter(isHttpUrl);
  if (!targets.length) return false;
  return targets.some((targetUrl) => sameSiteUrl(tab.url, targetUrl));
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
    const stopped = await stopPickInAllTabs(reason);
    activePick = null;
    return { ok: true, stopped, reason: stopped ? reason : "picker_not_running", error: stopped ? "" : error?.message || "" };
  }
}

async function stopPickInAllTabs(reason = "sidepanel") {
  const tabs = await chrome.tabs.query({}).catch(() => []);
  const results = await Promise.all(tabs.filter((tab) => isHttpUrl(tab.url)).map((tab) => (
    chrome.tabs.sendMessage(tab.id, { type: "STOP_PICK", reason })
      .then((result) => Boolean(result?.stopped))
      .catch(() => false)
  )));
  return results.some(Boolean);
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
    return { pickable: false, canOpenPanel: false, reason: "unsupported_page", targetUrl };
  }
  if (!session?.id) {
    return { pickable: false, canOpenPanel: true, reason: "no_picker_session", targetUrl };
  }
  return { pickable: true, canOpenPanel: true, reason: "picker_session_active", targetUrl };
}

function isHttpUrl(url) {
  try {
    const parsed = new URL(url || "");
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

function sameSiteUrl(left, right) {
  try {
    return sameSiteHost(new URL(left).hostname, new URL(right).hostname);
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

function startExecutorPolling() {
  if (executorPollTimer) return;
  executorPollTimer = setTimeout(pollExecutorJob, 50);
}

function scheduleExecutorPoll(delayMs) {
  if (executorPollTimer) clearTimeout(executorPollTimer);
  executorPollTimer = setTimeout(pollExecutorJob, delayMs);
}

async function pollExecutorJob() {
  executorPollTimer = null;
  if (executorPollBusy) {
    scheduleExecutorPoll(EXECUTOR_POLL_IDLE_MS);
    return;
  }
  executorPollBusy = true;
  let nextDelay = EXECUTOR_POLL_IDLE_MS;
  try {
    const response = await fetch(`${EXECUTOR_JOBS_URL}?source=picker-extension&version=${encodeURIComponent(chrome.runtime.getManifest().version)}`, {
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    const job = body?.job;
    if (job?.id) {
      nextDelay = EXECUTOR_POLL_BUSY_MS;
      await completeExecutorJob(job, await executeExecutorJob(job));
    }
  } catch (_) {
    nextDelay = EXECUTOR_POLL_IDLE_MS * 2;
  } finally {
    executorPollBusy = false;
    scheduleExecutorPoll(nextDelay);
  }
}

async function completeExecutorJob(job, result) {
  await fetch(`${EXECUTOR_JOBS_URL}/${encodeURIComponent(job.id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result)
  }).catch(() => {});
}

async function executeExecutorJob(job) {
  try {
    const tab = await resolveExecutorTab(job);
    await ensureContentScript(tab.id);
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "WEBOPS_EXECUTE",
      job
    });
    if (!response?.ok) {
      return { ok: false, error: response?.error || { message: "extension_executor_failed" } };
    }
    return {
      ok: true,
      result: {
        ...(response.result ?? {}),
        via: "chrome-extension-executor",
        tab: compactTab(tab)
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        message: error?.message || String(error),
        reason: "front_chrome_executor_action_failed"
      }
    };
  }
}

async function resolveExecutorTab(job) {
  const active = await getActiveTab();
  if (tabMatchesExecutorJob(active, job)) return active;

  const tabs = await chrome.tabs.query({});
  const candidates = tabs
    .filter((tab) => tabMatchesExecutorJob(tab, job))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (candidates[0]?.id) return candidates[0];

  if (active?.id && isHttpUrl(active.url)) return active;
  throw new Error("No controllable Chrome tab found for the WebOps action");
}

function tabMatchesExecutorJob(tab, job) {
  if (!tab?.id || !isHttpUrl(tab.url)) return false;
  const targetUrl = job.currentUrl || job.params?.url || "";
  if (!targetUrl || !isHttpUrl(targetUrl)) return true;
  try {
    const left = new URL(tab.url);
    const right = new URL(targetUrl);
    return sameSiteHost(left.hostname, right.hostname);
  } catch (_) {
    return false;
  }
}

function sameSiteHost(left, right) {
  const l = String(left || "").replace(/^www\./, "");
  const r = String(right || "").replace(/^www\./, "");
  return l === r || l.endsWith(`.${r}`) || r.endsWith(`.${l}`) || siteKey(l) === siteKey(r);
}

function siteKey(hostname) {
  const parts = String(hostname || "").split(".").filter(Boolean);
  return parts.slice(-2).join(".");
}

startExecutorPolling();
