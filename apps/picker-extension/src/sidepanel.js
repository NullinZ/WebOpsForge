const tabText = document.querySelector("#tabText");
const studioText = document.querySelector("#studioText");
const targetText = document.querySelector("#targetText");
const feedback = document.querySelector("#feedback");
const latestPost = document.querySelector("#latestPost");
const openStudioBtn = document.querySelector("#openStudioBtn");
const stopPickBtn = document.querySelector("#stopPickBtn");

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

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "GET_PICKER_STATUS" });
  const tab = status?.tab;
  const session = status?.session;
  tabText.textContent = tab?.pickable
    ? `${tab.title || "当前页面"} · ${tab.url}`
    : statusMessage(tab?.reason, tab?.targetUrl);
  studioText.textContent = status?.studio?.ok
    ? `已连接 ${status.studio.origin}`
    : `未连接 ${status?.studio?.origin || "Studio"}`;
  targetText.textContent = session?.targetUrl
    ? `参考页：${session.targetUrl}`
    : "先在 Studio 点击“拾取节点”";
  const picking = Boolean(status?.activePick?.active);
  setButtonsEnabled(Boolean(tab?.pickable && status?.studio?.ok), { picking });
  setStopEnabled(picking);

  const stored = await chrome.storage.local.get("latestPickerPost");
  latestPost.textContent = JSON.stringify(stored.latestPickerPost || {}, null, 2);
}

async function startPick(button) {
  let started = false;
  setBusy(button, true);
  setStopEnabled(false);
  feedback.textContent = "请在当前网页点击目标元素，ESC 取消。";
  try {
    const response = await chrome.runtime.sendMessage({
      type: "START_PICK",
      field: button.dataset.pick,
      actionHint: button.dataset.action
    });
    if (!response?.ok) {
      feedback.textContent = `启动失败：${statusMessage(response?.error, response?.targetUrl)}`;
      return;
    }
    feedback.textContent = "拾取已启动，请点击网页里的目标控件；可点“停止拾取”或按 ESC 取消。";
    started = true;
  } catch (error) {
    feedback.textContent = `启动失败：${error?.message || "unknown"}`;
  } finally {
    setBusy(button, false);
    if (started) {
      setButtonsEnabled(true, { picking: true });
      setStopEnabled(true);
    }
  }
}

async function stopPick() {
  setBusy(stopPickBtn, true);
  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP_PICK" });
    feedback.textContent = response?.stopped ? "已停止拾取。" : "当前没有正在进行的拾取。";
  } catch (error) {
    feedback.textContent = `停止失败：${error?.message || "unknown"}`;
  } finally {
    setBusy(stopPickBtn, false);
    setStopEnabled(false);
    await refreshStatus();
  }
}

function statusMessage(reason, targetUrl = "") {
  if (reason === "picker_session_active") return targetUrl ? `待拾取：${targetUrl}` : "待拾取";
  if (reason === "no_picker_session") return "没有待拾取节点，会自动收起";
  if (reason === "unsupported_page") return "当前页面不支持拾取";
  return "等待拾取会话";
}

function setButtonsEnabled(enabled, { picking = false } = {}) {
  document.querySelectorAll("[data-pick]").forEach((button) => {
    button.disabled = !enabled || picking;
  });
}

function setStopEnabled(enabled) {
  stopPickBtn.disabled = !enabled;
}

function setBusy(button, busy) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? "启动中" : button.dataset.label;
}

refreshStatus();
setInterval(refreshStatus, 2000);
