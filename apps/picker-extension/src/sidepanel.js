const tabText = document.querySelector("#tabText");
const studioText = document.querySelector("#studioText");
const targetText = document.querySelector("#targetText");
const feedback = document.querySelector("#feedback");
const latestPost = document.querySelector("#latestPost");
const openStudioBtn = document.querySelector("#openStudioBtn");
const stopPickBtn = document.querySelector("#stopPickBtn");
const AUTO_CLOSE_DELAY_MS = 60_000;

const panelState = {
  picking: false,
  lastFeedbackKind: "idle",
  autoCloseTimer: null,
  autoCloseCompletedAt: 0
};

document.querySelectorAll("[data-pick]").forEach((button) => {
  button.addEventListener("click", () => startPick(button));
});

openStudioBtn.addEventListener("click", async () => {
  setBusy(openStudioBtn, true);
  try {
    const response = await chrome.runtime.sendMessage({ type: "OPEN_STUDIO" });
    feedback.textContent = response?.reused ? "已切回已有 Studio 标签。" : "已打开 Studio。";
  } catch (error) {
    feedback.textContent = `打开 Studio 失败：${error?.message || "unknown"}`;
  } finally {
    setBusy(openStudioBtn, false);
  }
});

stopPickBtn.addEventListener("click", async () => {
  await stopPick();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  stopPick().catch(() => {});
});

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "GET_PICKER_STATUS" });
  const tab = status?.tab;
  const session = status?.session;
  const stored = await chrome.storage.local.get("latestPickerPost");
  const latest = stored.latestPickerPost || {};
  const picking = Boolean(status?.activePick?.active);
  const pickable = Boolean(tab?.pickable && status?.studio?.ok);
  const completionAgeMs = latest?.ok && latest.completedAt ? Date.now() - Number(latest.completedAt) : Number.POSITIVE_INFINITY;
  const recentPost = completionAgeMs < AUTO_CLOSE_DELAY_MS;
  const autoCloseRemainingMs = Math.max(0, AUTO_CLOSE_DELAY_MS - completionAgeMs);

  tabText.textContent = tab?.pickable
    ? `${tab.title || "当前页面"} · ${tab.url}`
    : statusMessage(tab?.reason, tab?.targetUrl);
  studioText.textContent = status?.studio?.ok
    ? `已连接 ${status.studio.origin}`
    : `未连接 ${status?.studio?.origin || "Studio"}`;
  targetText.textContent = session?.targetUrl
    ? `参考页：${session.targetUrl}`
    : "先在 Studio 点击“拾取节点”";
  panelState.picking = picking;
  setButtonsEnabled(pickable, { picking });
  setStopState(picking);
  syncAutoClose({ picking, session, latest, recentPost, autoCloseRemainingMs });
  syncFeedback({ picking, pickable, session, tab, latest, recentPost, autoCloseRemainingMs });

  latestPost.textContent = JSON.stringify(latest, null, 2);
}

async function startPick(button) {
  let started = false;
  cancelAutoClose();
  panelState.lastFeedbackKind = "starting";
  setBusy(button, true, "启动中");
  setStopState(false);
  feedback.textContent = "请在当前网页点击目标元素，ESC 取消。";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "START_PICK",
      field: button.dataset.pick,
      actionHint: button.dataset.action
    });
    if (!response?.ok) {
      feedback.textContent = `启动失败：${statusMessage(response?.error, response?.targetUrl)}`;
      panelState.lastFeedbackKind = "error";
      return;
    }
    feedback.textContent = `拾取已启动：${tabSummary(response.tab)}。请点击网页里的目标控件；可点“停止拾取”或按 ESC 取消。`;
    panelState.lastFeedbackKind = "picking";
    started = true;
  } catch (error) {
    feedback.textContent = `启动失败：${error?.message || "unknown"}`;
  } finally {
    setBusy(button, false);
    if (started) {
      setButtonsEnabled(true, { picking: true });
      setStopState(true);
    }
  }
}

async function stopPick() {
  cancelAutoClose();
  setBusy(stopPickBtn, true, "停止中");
  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP_PICK" });
    feedback.textContent = response?.stopped || response?.sessionCleared ? "已取消当前拾取。" : "当前没有正在监听点击的拾取。";
    panelState.lastFeedbackKind = "stopped";
  } catch (error) {
    feedback.textContent = `停止失败：${error?.message || "unknown"}`;
    panelState.lastFeedbackKind = "error";
  } finally {
    setBusy(stopPickBtn, false);
    setStopState(false);
    await refreshStatus();
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.latestPickerPost) return;
  refreshStatus().catch(() => {});
});

function statusMessage(reason, targetUrl = "") {
  if (reason === "picker_session_active") return targetUrl ? `待拾取：${targetUrl}` : "待拾取";
  if (reason === "no_picker_session") return "没有待拾取节点，请先在 Studio 点击“拾取节点”";
  if (reason === "unsupported_page") return "当前页面不支持拾取";
  return "等待拾取会话";
}

function tabSummary(tab) {
  if (!tab) return "当前网页";
  return tab.title || tab.url || "当前网页";
}

function setButtonsEnabled(enabled, { picking = false } = {}) {
  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.disabled = !enabled || picking;
  });
}

function setStopState(enabled) {
  stopPickBtn.disabled = !enabled;
  stopPickBtn.textContent = enabled ? "停止拾取" : "没有正在拾取";
}

function setBusy(button, busy, busyText = "处理中") {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.label;
}

function syncFeedback({ picking, pickable, session, tab, latest, recentPost, autoCloseRemainingMs }) {
  if (picking) {
    feedback.textContent = `拾取进行中：${tabSummary(tab)}。请点击网页里的目标控件；可点“停止拾取”或按 ESC 取消。`;
    panelState.lastFeedbackKind = "picking";
    return;
  }
  if (recentPost) {
    const selector = latest.selector ? `：${latest.selector}` : "";
    const seconds = Math.max(1, Math.ceil(autoCloseRemainingMs / 1000));
    feedback.textContent = `已发送到 Studio${selector}。本次拾取已完成，无需停止；${seconds} 秒后自动关闭。`;
    panelState.lastFeedbackKind = "completed";
    return;
  }
  if (session?.id && pickable) {
    feedback.textContent = "Studio 已准备好。请选择目标元素、输入框、点击控件或提取文本开始拾取。";
    panelState.lastFeedbackKind = "ready";
    return;
  }
  if (!session?.id) {
    feedback.textContent = "没有待拾取节点。请先在 Studio 点击“拾取节点”。";
    panelState.lastFeedbackKind = "idle";
    return;
  }
  feedback.textContent = statusMessage(tab?.reason, tab?.targetUrl);
  panelState.lastFeedbackKind = "blocked";
}

function syncAutoClose({ picking, session, latest, recentPost, autoCloseRemainingMs }) {
  if (picking || session?.id || !recentPost) {
    cancelAutoClose();
    return;
  }
  const completedAt = Number(latest.completedAt || 0);
  if (!completedAt || panelState.autoCloseCompletedAt === completedAt) return;
  cancelAutoClose();
  panelState.autoCloseCompletedAt = completedAt;
  panelState.autoCloseTimer = setTimeout(() => {
    requestAutoClose(completedAt).catch(() => {});
  }, Math.max(0, autoCloseRemainingMs));
}

function cancelAutoClose() {
  if (panelState.autoCloseTimer) clearTimeout(panelState.autoCloseTimer);
  panelState.autoCloseTimer = null;
  panelState.autoCloseCompletedAt = 0;
}

async function requestAutoClose(expectedCompletedAt) {
  const status = await chrome.runtime.sendMessage({ type: "GET_PICKER_STATUS" });
  const stored = await chrome.storage.local.get("latestPickerPost");
  const latest = stored.latestPickerPost || {};
  const stillSameCompletion = Number(latest.completedAt || 0) === Number(expectedCompletedAt);
  const picking = Boolean(status?.activePick?.active);
  const hasSession = Boolean(status?.session?.id);
  if (!stillSameCompletion || picking || hasSession) return;
  await chrome.runtime.sendMessage({ type: "CLOSE_SIDE_PANEL" });
}

refreshStatus();
setInterval(refreshStatus, 2000);
setInterval(() => {
  chrome.runtime.sendMessage({ type: "POLL_EXECUTOR_JOB" }).catch(() => {});
}, 500);
