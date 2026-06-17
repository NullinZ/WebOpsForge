const state = {
  workflows: [],
  profiles: [],
  runs: [],
  audit: [],
  selectedWorkflowId: null,
  selectedProfileId: null,
  selectedRunId: null,
  runtime: null,
  language: localStorage.getItem("webops-forge-language") || "en",
  polling: null
};

const I18N = {
  en: {
    accountLabel: "Account Label",
    accountSelector: "Account Selector",
    approvalApprove: "approve all sample gates",
    approvalBlock: "block approval gates",
    approvalGates: "Approval Gates",
    approvalKeep: "use context",
    artifacts: "Artifacts",
    audit: "Audit",
    cancel: "Cancel",
    checkSession: "Check Session",
    context: "Context",
    dataDir: "data: {path}",
    definition: "Definition",
    description: "Description",
    driver: "Driver",
    evidence: "Evidence",
    export: "Export",
    exportReady: "Export ready",
    import: "Import",
    importedBundle: "Imported {workflows} workflows and {profiles} profiles",
    input: "Input",
    language: "Language",
    loginState: "Login State",
    maxPerMinute: "Max Per Minute",
    mode: "Mode",
    name: "Name",
    new: "New",
    newProfile: "New Profile",
    newWorkflow: "New Workflow",
    noArtifacts: "No artifacts",
    noAuditRecords: "No audit records",
    noProfile: "no profile",
    none: "none",
    operationModes: "Operation Modes",
    platform: "Platform",
    profile: "Profile",
    profileDetails: "Profile Details",
    profileDir: "Profile Dir",
    profileIdRequired: "Profile ID is required",
    profileSaved: "Profile saved",
    profiles: "Profiles",
    refresh: "Refresh",
    retry: "Retry",
    retryQueued: "Retry queued",
    runConfig: "Run Config",
    runQueued: "Run queued",
    runWorkflow: "Run Workflow",
    runs: "Runs",
    save: "Save",
    saveProfile: "Save Profile",
    selectedRun: "Selected Run",
    sessionCheckUrl: "Session Check URL",
    sessionResult: "Session {state}{account}",
    status: "Status",
    stepCount: "{count} steps",
    validate: "Validate",
    workflow: "Workflow",
    workflowSaved: "Workflow saved",
    workflowValid: "Workflow valid: {count} steps",
    workflows: "Workflows",
    queueIdle: "idle",
    queueQueued: "{count} queued",
    queueRunning: "{count} running"
  },
  zh: {
    accountLabel: "账号标签",
    accountSelector: "账号选择器",
    approvalApprove: "通过全部示例审批",
    approvalBlock: "阻断审批节点",
    approvalGates: "审批闸口",
    approvalKeep: "使用上下文",
    artifacts: "产物",
    audit: "审计",
    cancel: "取消",
    checkSession: "检查会话",
    context: "上下文",
    dataDir: "数据目录：{path}",
    definition: "定义",
    description: "描述",
    driver: "驱动配置",
    evidence: "证据",
    export: "导出",
    exportReady: "导出已准备好",
    import: "导入",
    importedBundle: "已导入 {workflows} 个工作流和 {profiles} 个 Profile",
    input: "输入",
    language: "语言",
    loginState: "登录态",
    maxPerMinute: "每分钟上限",
    mode: "模式",
    name: "名称",
    new: "新建",
    newProfile: "新建 Profile",
    newWorkflow: "新建工作流",
    noArtifacts: "暂无产物",
    noAuditRecords: "暂无审计记录",
    noProfile: "不使用 Profile",
    none: "无",
    operationModes: "动作执行方式",
    platform: "平台",
    profile: "Profile",
    profileDetails: "Profile 详情",
    profileDir: "Profile 目录",
    profileIdRequired: "必须填写 Profile ID",
    profileSaved: "Profile 已保存",
    profiles: "Profiles",
    refresh: "刷新",
    retry: "重试",
    retryQueued: "重试已入队",
    runConfig: "运行配置",
    runQueued: "运行已入队",
    runWorkflow: "运行工作流",
    runs: "运行记录",
    save: "保存",
    saveProfile: "保存 Profile",
    selectedRun: "当前运行",
    sessionCheckUrl: "会话检查 URL",
    sessionResult: "会话 {state}{account}",
    status: "状态",
    stepCount: "{count} 步",
    validate: "校验",
    workflow: "工作流",
    workflowSaved: "工作流已保存",
    workflowValid: "工作流有效：{count} 步",
    workflows: "工作流",
    queueIdle: "空闲",
    queueQueued: "{count} 个排队中",
    queueRunning: "{count} 个运行中"
  }
};

const STATUS_LABELS = {
  en: {
    authenticated: "authenticated",
    blocked: "blocked",
    busy: "busy",
    canceled: "canceled",
    cancel_requested: "cancel requested",
    completed: "completed",
    disabled: "disabled",
    failed: "failed",
    "logged-out": "logged out",
    queued: "queued",
    ready: "ready",
    running: "running",
    unchecked: "unchecked",
    unknown: "unknown"
  },
  zh: {
    authenticated: "已登录",
    blocked: "已阻断",
    busy: "占用中",
    canceled: "已取消",
    cancel_requested: "取消中",
    completed: "已完成",
    disabled: "已禁用",
    failed: "失败",
    "logged-out": "未登录",
    queued: "排队中",
    ready: "就绪",
    running: "运行中",
    unchecked: "未检查",
    unknown: "未知"
  }
};

const elements = {
  languageSelect: document.querySelector("#languageSelect"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  queueStatus: document.querySelector("#queueStatus"),
  workflowList: document.querySelector("#workflowList"),
  profileList: document.querySelector("#profileList"),
  runList: document.querySelector("#runList"),
  workflowName: document.querySelector("#workflowName"),
  workflowId: document.querySelector("#workflowId"),
  workflowDescription: document.querySelector("#workflowDescription"),
  workflowJson: document.querySelector("#workflowJson"),
  runMode: document.querySelector("#runMode"),
  profileSelect: document.querySelector("#profileSelect"),
  approvalToggle: document.querySelector("#approvalToggle"),
  operationModesJson: document.querySelector("#operationModesJson"),
  runInputJson: document.querySelector("#runInputJson"),
  runContextJson: document.querySelector("#runContextJson"),
  driverConfigJson: document.querySelector("#driverConfigJson"),
  profileId: document.querySelector("#profileId"),
  profileName: document.querySelector("#profileName"),
  profileMode: document.querySelector("#profileMode"),
  profilePlatform: document.querySelector("#profilePlatform"),
  profileAccountLabel: document.querySelector("#profileAccountLabel"),
  profileLoginState: document.querySelector("#profileLoginState"),
  profileStatus: document.querySelector("#profileStatus"),
  profileDir: document.querySelector("#profileDir"),
  profileCheckUrl: document.querySelector("#profileCheckUrl"),
  profileAccountSelector: document.querySelector("#profileAccountSelector"),
  profileRate: document.querySelector("#profileRate"),
  selectedRunStatus: document.querySelector("#selectedRunStatus"),
  runSummary: document.querySelector("#runSummary"),
  eventTimeline: document.querySelector("#eventTimeline"),
  artifactList: document.querySelector("#artifactList"),
  auditList: document.querySelector("#auditList"),
  importFile: document.querySelector("#importFile"),
  toast: document.querySelector("#toast")
};

elements.languageSelect.value = state.language;
elements.languageSelect.addEventListener("change", () => setLanguage(elements.languageSelect.value));
document.querySelector("#refreshButton").addEventListener("click", () => refreshAll());
document.querySelector("#exportButton").addEventListener("click", () => exportBundle());
document.querySelector("#importButton").addEventListener("click", () => elements.importFile.click());
document.querySelector("#importFile").addEventListener("change", (event) => importBundle(event.target.files[0]));
document.querySelector("#runButton").addEventListener("click", () => runSelectedWorkflow());
document.querySelector("#saveWorkflowButton").addEventListener("click", () => saveSelectedWorkflow());
document.querySelector("#validateWorkflowButton").addEventListener("click", () => validateSelectedWorkflow());
document.querySelector("#newWorkflowButton").addEventListener("click", () => createBlankWorkflow());
document.querySelector("#newProfileButton").addEventListener("click", () => createBlankProfile());
document.querySelector("#saveProfileButton").addEventListener("click", () => saveSelectedProfile());
document.querySelector("#checkProfileButton").addEventListener("click", () => checkSelectedProfile());
document.querySelector("#cancelRunButton").addEventListener("click", () => cancelSelectedRun());
document.querySelector("#retryRunButton").addEventListener("click", () => retrySelectedRun());
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
});

applyStaticTranslations();
await refreshAll();
startPolling();

async function refreshAll() {
  await Promise.all([loadRuntime(), loadWorkflows(), loadProfiles(), loadRuns(), loadAudit()]);
  if (!state.selectedWorkflowId && state.workflows[0]) selectWorkflow(state.workflows[0].id);
  if (!state.selectedProfileId && state.profiles[0]) selectProfile(state.profiles[0].id);
  render();
}

async function loadRuntime() {
  state.runtime = await api("/api/runtime");
}

async function loadWorkflows() {
  const data = await api("/api/workflows");
  state.workflows = data.workflows;
}

async function loadProfiles() {
  const data = await api("/api/profiles");
  state.profiles = data.profiles;
}

async function loadRuns() {
  const data = await api("/api/runs?limit=30");
  state.runs = data.runs;
}

async function loadAudit() {
  const data = await api("/api/audit?limit=30");
  state.audit = data.audit;
}

function render() {
  renderRuntime();
  renderWorkflows();
  renderProfiles();
  renderRuns();
  renderAudit();
}

function renderRuntime() {
  if (!state.runtime) return;
  elements.runtimeStatus.textContent = t("dataDir", { path: state.runtime.dataDir });
  const queue = state.runtime.queue;
  elements.queueStatus.textContent = queue.active
    ? t("queueRunning", { count: queue.active })
    : queue.pending
      ? t("queueQueued", { count: queue.pending })
      : t("queueIdle");
  elements.queueStatus.className = `pill ${queue.active ? "warning" : queue.pending ? "" : "muted"}`;
}

function renderWorkflows() {
  elements.workflowList.innerHTML = "";
  for (const workflow of state.workflows) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `workflow-row ${workflow.id === state.selectedWorkflowId ? "active" : ""}`;
    button.innerHTML = `
      <span class="row-title">${escapeHtml(workflow.name)}</span>
      <span class="row-meta">${escapeHtml(workflow.workflow.name)} · ${escapeHtml(t("stepCount", { count: workflow.workflow.steps.length }))}</span>
    `;
    button.addEventListener("click", () => selectWorkflow(workflow.id));
    elements.workflowList.append(button);
  }
}

function renderProfiles() {
  elements.profileList.innerHTML = "";
  elements.profileSelect.innerHTML = `<option value="">${escapeHtml(t("noProfile"))}</option>`;
  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${profile.name}${profile.accountLabel ? ` / ${profile.accountLabel}` : ""} (${profile.mode})`;
    elements.profileSelect.append(option);

    const button = document.createElement("button");
    button.type = "button";
    button.className = `profile-row ${profile.id === state.selectedProfileId ? "active" : ""}`;
    const identity = profile.accountLabel || profile.platform || profile.mode;
    button.innerHTML = `
      <span class="row-title">${escapeHtml(profile.name)}</span>
      <span class="row-meta">${escapeHtml(statusLabel(profile.status))} · ${escapeHtml(statusLabel(profile.loginState ?? "unchecked"))} · ${escapeHtml(identity)}${profile.leasedRunId ? ` · ${escapeHtml(profile.leasedRunId)}` : ""}</span>
    `;
    button.addEventListener("click", () => selectProfile(profile.id));
    elements.profileList.append(button);
  }

  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflowId);
  const selectedProfile = workflow?.defaultRun?.profileId ?? state.selectedProfileId ?? "";
  if ([...elements.profileSelect.options].some((option) => option.value === selectedProfile)) {
    elements.profileSelect.value = selectedProfile;
  }
}

function renderRuns() {
  elements.runList.innerHTML = "";
  for (const run of state.runs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `run-row ${run.id === state.selectedRunId ? "active" : ""}`;
    button.innerHTML = `
      <span class="row-title">${escapeHtml(run.workflowName)}</span>
      <span class="row-meta">${escapeHtml(statusLabel(run.status))} · ${escapeHtml(run.mode)} · ${formatTime(run.queuedAt)}</span>
    `;
    button.addEventListener("click", () => selectRun(run.id));
    elements.runList.append(button);
  }
}

function selectWorkflow(id) {
  const workflow = state.workflows.find((item) => item.id === id);
  if (!workflow) return;
  state.selectedWorkflowId = id;
  elements.workflowName.value = workflow.name;
  elements.workflowId.value = workflow.id;
  elements.workflowDescription.value = workflow.description ?? "";
  elements.workflowJson.value = formatJson(workflow.workflow);
  elements.runMode.value = workflow.defaultRun?.mode ?? "dry-run";
  elements.profileSelect.value = workflow.defaultRun?.profileId ?? "";
  elements.approvalToggle.value = "keep";
  elements.operationModesJson.value = formatJson(workflow.defaultRun?.context?.operationModes ?? detectOperationModes(workflow.workflow));
  elements.runInputJson.value = formatJson(workflow.defaultRun?.input ?? {});
  elements.runContextJson.value = formatJson(workflow.defaultRun?.context ?? {});
  elements.driverConfigJson.value = formatJson(workflow.defaultRun?.driverConfig ?? {});
  renderWorkflows();
}

function selectProfile(id) {
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) return;
  state.selectedProfileId = id;
  elements.profileId.value = profile.id;
  elements.profileName.value = profile.name;
  elements.profileMode.value = profile.mode;
  elements.profilePlatform.value = profile.platform ?? profile.sessionCheck?.platform ?? "";
  elements.profileAccountLabel.value = profile.accountLabel ?? "";
  elements.profileLoginState.value = profile.loginState ?? "unchecked";
  elements.profileStatus.value = profile.status;
  elements.profileDir.value = profile.profileDir ?? "";
  elements.profileCheckUrl.value = profile.sessionCheck?.url ?? "";
  elements.profileAccountSelector.value = profile.sessionCheck?.accountSelector ?? "";
  elements.profileRate.value = profile.rateLimit?.maxPerMinute ?? "";
  renderProfiles();
}

async function selectRun(id) {
  state.selectedRunId = id;
  const data = await api(`/api/runs/${encodeURIComponent(id)}`);
  renderRunDetail(data);
  renderRuns();
}

function renderRunDetail({ run, events, artifacts }) {
  elements.selectedRunStatus.textContent = statusLabel(run.status);
  elements.selectedRunStatus.className = `pill ${statusClass(run.status)}`;
  elements.runSummary.textContent = formatJson({
    id: run.id,
    status: run.status,
    mode: run.mode,
    profile: run.profileName,
    sourceRunId: run.sourceRunId,
    durationMs: run.durationMs,
    outputs: run.outputs,
    error: run.error
  });

  elements.eventTimeline.innerHTML = "";
  for (const event of events) {
    const row = document.createElement("div");
    row.className = "event-row";
    const artifact = event.result?.artifact ?? event.artifact;
    const artifactLink = artifact?.url
      ? `<a href="${artifact.url}" target="_blank" rel="noreferrer">${escapeHtml(artifact.name ?? "artifact")}</a>`
      : "";
    row.innerHTML = `
      <strong>${escapeHtml(event.type)}${event.stepId ? ` · ${escapeHtml(event.stepId)}` : ""}</strong>
      <span class="event-meta">${escapeHtml(event.action ?? event.workflow?.name ?? "")} ${artifactLink}</span>
    `;
    elements.eventTimeline.append(row);
  }

  elements.artifactList.innerHTML = "";
  if (artifacts.length === 0) {
    elements.artifactList.innerHTML = `<div class="event-meta">${escapeHtml(t("noArtifacts"))}</div>`;
  }
  for (const artifact of artifacts) {
    const row = document.createElement("div");
    row.className = "artifact-row";
    row.innerHTML = `
      <a href="${artifact.url}" target="_blank" rel="noreferrer">${escapeHtml(artifact.name)}</a>
      <span class="event-meta">${formatBytes(artifact.size)}</span>
    `;
    elements.artifactList.append(row);
  }
}

function renderAudit() {
  elements.auditList.innerHTML = "";
  if (state.audit.length === 0) {
    elements.auditList.innerHTML = `<div class="event-meta">${escapeHtml(t("noAuditRecords"))}</div>`;
  }
  for (const item of state.audit) {
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `
      <strong>${escapeHtml(item.type)}</strong>
      <span class="event-meta">${escapeHtml(item.runId ?? item.workflowId ?? item.profileName ?? "")} · ${formatTime(item.createdAt)}</span>
    `;
    elements.auditList.append(row);
  }
}

async function saveSelectedWorkflow() {
  try {
    const id = elements.workflowId.value.trim();
    const context = parseJson(elements.runContextJson.value, "Context");
    applyOperationModes(context);
    const body = {
      id,
      name: elements.workflowName.value.trim(),
      description: elements.workflowDescription.value.trim(),
      workflow: parseJson(elements.workflowJson.value, "Workflow"),
      defaultRun: {
        mode: elements.runMode.value,
        profileId: elements.profileSelect.value || null,
        input: parseJson(elements.runInputJson.value, "Input"),
        context,
        driverConfig: parseJson(elements.driverConfigJson.value, "Driver")
      }
    };
    const method = state.workflows.some((workflow) => workflow.id === id) ? "PUT" : "POST";
    const url = method === "PUT" ? `/api/workflows/${encodeURIComponent(id)}` : "/api/workflows";
    const data = await api(url, { method, body });
    await loadWorkflows();
    state.selectedWorkflowId = data.workflow.id;
    selectWorkflow(data.workflow.id);
    showToast("Workflow saved");
  } catch (error) {
    showToast(error.message);
  }
}

async function validateSelectedWorkflow() {
  try {
    const workflow = parseJson(elements.workflowJson.value, "Workflow");
    const result = await api("/api/workflows/validate", {
      method: "POST",
      body: { workflow }
    });
    showToast(`Workflow valid: ${result.stepCount} steps`);
  } catch (error) {
    showToast(error.message);
  }
}

async function saveSelectedProfile() {
  try {
    const id = elements.profileId.value.trim();
    const body = {
      id,
      name: elements.profileName.value.trim(),
      mode: elements.profileMode.value,
      platform: elements.profilePlatform.value.trim(),
      accountLabel: elements.profileAccountLabel.value.trim(),
      loginState: elements.profileLoginState.value,
      status: elements.profileStatus.value,
      profileDir: elements.profileDir.value.trim(),
      sessionCheck: profileSessionCheckFromForm(),
      rateLimit: {
        maxPerMinute: elements.profileRate.value ? Number(elements.profileRate.value) : null
      }
    };
    const exists = state.profiles.some((profile) => profile.id === id);
    const data = await api(exists ? `/api/profiles/${encodeURIComponent(id)}` : "/api/profiles", {
      method: exists ? "PUT" : "POST",
      body
    });
    await Promise.all([loadProfiles(), loadAudit()]);
    selectProfile(data.profile.id);
    render();
    showToast("Profile saved");
  } catch (error) {
    showToast(error.message);
  }
}

async function checkSelectedProfile() {
  try {
    const id = elements.profileId.value.trim();
    if (!id) throw new Error("Profile ID is required");
    const data = await api(`/api/profiles/${encodeURIComponent(id)}/check-session`, {
      method: "POST",
      body: {
        platform: elements.profilePlatform.value.trim(),
        accountLabel: elements.profileAccountLabel.value.trim(),
        ...profileSessionCheckFromForm()
      }
    });
    await Promise.all([loadProfiles(), loadAudit()]);
    selectProfile(data.profile.id);
    render();
    showToast(`Session ${data.result.loginState}${data.result.accountLabel ? `: ${data.result.accountLabel}` : ""}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function runSelectedWorkflow() {
  if (!state.selectedWorkflowId) return;
  try {
    const context = parseJson(elements.runContextJson.value, "Context");
    applyOperationModes(context);
    applyApprovalToggle(context);
    const data = await api(`/api/workflows/${encodeURIComponent(state.selectedWorkflowId)}/runs`, {
      method: "POST",
      body: {
        mode: elements.runMode.value,
        profileId: elements.profileSelect.value || null,
        input: parseJson(elements.runInputJson.value, "Input"),
        context,
        driverConfig: parseJson(elements.driverConfigJson.value, "Driver")
      }
    });
    state.selectedRunId = data.run.id;
    await loadRuns();
    renderRuns();
    await selectRun(data.run.id);
    showToast("Run queued");
  } catch (error) {
    showToast(error.message);
  }
}

async function cancelSelectedRun() {
  if (!state.selectedRunId) return;
  try {
    await api(`/api/runs/${encodeURIComponent(state.selectedRunId)}/cancel`, { method: "POST", body: {} });
    await refreshAll();
    await selectRun(state.selectedRunId);
    showToast("Cancellation requested");
  } catch (error) {
    showToast(error.message);
  }
}

async function retrySelectedRun() {
  if (!state.selectedRunId) return;
  try {
    const data = await api(`/api/runs/${encodeURIComponent(state.selectedRunId)}/retry`, { method: "POST", body: {} });
    state.selectedRunId = data.run.id;
    await refreshAll();
    await selectRun(data.run.id);
    showToast("Retry queued");
  } catch (error) {
    showToast(error.message);
  }
}

async function exportBundle() {
  try {
    const bundle = await api("/api/export");
    const blob = new Blob([formatJson(bundle)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `webops-forge-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Export ready");
  } catch (error) {
    showToast(error.message);
  }
}

async function importBundle(file) {
  if (!file) return;
  try {
    const bundle = JSON.parse(await file.text());
    const result = await api("/api/import", { method: "POST", body: bundle });
    await refreshAll();
    showToast(`Imported ${result.imported.workflows} workflows and ${result.imported.profiles} profiles`);
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.importFile.value = "";
  }
}

function createBlankWorkflow() {
  const id = `workflow-${Date.now().toString(36)}`;
  const workflow = {
    id,
    name: "New Workflow",
    description: "",
    workflow: {
      name: "new-workflow",
      version: "0.1.0",
      steps: [
        { id: "open", action: "goto", url: "https://example.local" },
        { id: "checkpoint", action: "checkpoint", label: "opened" }
      ]
    },
    defaultRun: {
      mode: "dry-run",
      profileId: "dry-run-demo",
      input: {},
      context: {},
      driverConfig: {
        pages: {
          "https://example.local": {
            selectors: {}
          }
        }
      }
    }
  };
  state.workflows.unshift(workflow);
  selectWorkflow(id);
  renderWorkflows();
}

function createBlankProfile() {
  const id = `profile-${Date.now().toString(36)}`;
  const profile = {
    id,
    name: "New Profile",
    mode: "dry-run",
    platform: "",
    accountLabel: "",
    loginState: "unchecked",
    status: "ready",
    profileDir: "",
    sessionCheck: {
      platform: "",
      url: "",
      accountSelector: "",
      loggedOutSelector: "",
      timeoutMs: 10000
    },
    rateLimit: { maxPerMinute: null }
  };
  state.profiles.unshift(profile);
  selectProfile(id);
  renderProfiles();
}

function selectTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${name}Panel`).classList.add("active");
}

function startPolling() {
  state.polling = setInterval(async () => {
    const hasActive = state.runs.some((run) => ["queued", "running"].includes(run.status));
    if (!hasActive && !state.selectedRunId) return;
    await Promise.all([loadRuntime(), loadRuns(), loadProfiles(), loadAudit()]);
    render();
    if (state.selectedRunId) await selectRun(state.selectedRunId);
  }, 1500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `Request failed: ${response.status}`);
  return data;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error.message}`);
  }
}

function applyApprovalToggle(context) {
  if (elements.approvalToggle.value === "keep") return;
  context.approvals = context.approvals ?? {};
  if (elements.approvalToggle.value === "approve") {
    context.approvals.reviewSearch = true;
  }
  if (elements.approvalToggle.value === "block") {
    context.approvals.reviewSearch = false;
  }
}

function applyOperationModes(context) {
  const modes = parseJson(elements.operationModesJson.value, "Operation Modes");
  context.operationModes = modes;
  return context;
}

function detectOperationModes(workflow) {
  const modes = {};
  for (const step of workflow?.steps ?? []) {
    if (step.action === "operation") {
      modes[step.id] = step.mode && !String(step.mode).includes("{{") ? step.mode : "browser";
    }
  }
  return modes;
}

function profileSessionCheckFromForm() {
  return {
    platform: elements.profilePlatform.value.trim(),
    url: elements.profileCheckUrl.value.trim(),
    accountSelector: elements.profileAccountSelector.value.trim(),
    loggedOutSelector: "",
    timeoutMs: 10000
  };
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function statusClass(status) {
  if (status === "completed") return "success";
  if (status === "blocked") return "warning";
  if (status === "failed") return "danger";
  if (status === "running" || status === "queued") return "";
  return "muted";
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  setTimeout(() => elements.toast.classList.remove("visible"), 2800);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
