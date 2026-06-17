const state = {
  workflows: [],
  runs: [],
  selectedWorkflowId: null,
  selectedRunId: null,
  runtime: null,
  polling: null
};

const elements = {
  runtimeStatus: document.querySelector("#runtimeStatus"),
  queueStatus: document.querySelector("#queueStatus"),
  workflowList: document.querySelector("#workflowList"),
  runList: document.querySelector("#runList"),
  workflowName: document.querySelector("#workflowName"),
  workflowId: document.querySelector("#workflowId"),
  workflowDescription: document.querySelector("#workflowDescription"),
  workflowJson: document.querySelector("#workflowJson"),
  runMode: document.querySelector("#runMode"),
  approvalToggle: document.querySelector("#approvalToggle"),
  runInputJson: document.querySelector("#runInputJson"),
  runContextJson: document.querySelector("#runContextJson"),
  driverConfigJson: document.querySelector("#driverConfigJson"),
  selectedRunStatus: document.querySelector("#selectedRunStatus"),
  runSummary: document.querySelector("#runSummary"),
  eventTimeline: document.querySelector("#eventTimeline"),
  artifactList: document.querySelector("#artifactList"),
  toast: document.querySelector("#toast")
};

document.querySelector("#refreshButton").addEventListener("click", () => refreshAll());
document.querySelector("#runButton").addEventListener("click", () => runSelectedWorkflow());
document.querySelector("#saveWorkflowButton").addEventListener("click", () => saveSelectedWorkflow());
document.querySelector("#newWorkflowButton").addEventListener("click", () => createBlankWorkflow());
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
});

await refreshAll();
startPolling();

async function refreshAll() {
  await Promise.all([loadRuntime(), loadWorkflows(), loadRuns()]);
  if (!state.selectedWorkflowId && state.workflows[0]) selectWorkflow(state.workflows[0].id);
  render();
}

async function loadRuntime() {
  state.runtime = await api("/api/runtime");
}

async function loadWorkflows() {
  const data = await api("/api/workflows");
  state.workflows = data.workflows;
}

async function loadRuns() {
  const data = await api("/api/runs?limit=30");
  state.runs = data.runs;
}

function render() {
  renderRuntime();
  renderWorkflows();
  renderRuns();
}

function renderRuntime() {
  if (!state.runtime) return;
  elements.runtimeStatus.textContent = `data: ${state.runtime.dataDir}`;
  const queue = state.runtime.queue;
  elements.queueStatus.textContent = queue.active ? `${queue.active} running` : queue.pending ? `${queue.pending} queued` : "idle";
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
      <span class="row-meta">${escapeHtml(workflow.workflow.name)} · ${workflow.workflow.steps.length} steps</span>
    `;
    button.addEventListener("click", () => selectWorkflow(workflow.id));
    elements.workflowList.append(button);
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
      <span class="row-meta">${escapeHtml(run.status)} · ${escapeHtml(run.mode)} · ${formatTime(run.queuedAt)}</span>
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
  elements.approvalToggle.value = "keep";
  elements.runInputJson.value = formatJson(workflow.defaultRun?.input ?? {});
  elements.runContextJson.value = formatJson(workflow.defaultRun?.context ?? {});
  elements.driverConfigJson.value = formatJson(workflow.defaultRun?.driverConfig ?? {});
  renderWorkflows();
}

async function selectRun(id) {
  state.selectedRunId = id;
  const data = await api(`/api/runs/${encodeURIComponent(id)}`);
  renderRunDetail(data);
  renderRuns();
}

function renderRunDetail({ run, events, artifacts }) {
  elements.selectedRunStatus.textContent = run.status;
  elements.selectedRunStatus.className = `pill ${statusClass(run.status)}`;
  elements.runSummary.textContent = formatJson({
    id: run.id,
    status: run.status,
    mode: run.mode,
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
    elements.artifactList.innerHTML = `<div class="event-meta">No artifacts</div>`;
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

async function saveSelectedWorkflow() {
  try {
    const id = elements.workflowId.value.trim();
    const body = {
      id,
      name: elements.workflowName.value.trim(),
      description: elements.workflowDescription.value.trim(),
      workflow: parseJson(elements.workflowJson.value, "Workflow"),
      defaultRun: {
        mode: elements.runMode.value,
        input: parseJson(elements.runInputJson.value, "Input"),
        context: parseJson(elements.runContextJson.value, "Context"),
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

async function runSelectedWorkflow() {
  if (!state.selectedWorkflowId) return;
  try {
    const context = parseJson(elements.runContextJson.value, "Context");
    applyApprovalToggle(context);
    const data = await api(`/api/workflows/${encodeURIComponent(state.selectedWorkflowId)}/runs`, {
      method: "POST",
      body: {
        mode: elements.runMode.value,
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

function selectTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${name}Panel`).classList.add("active");
}

function startPolling() {
  state.polling = setInterval(async () => {
    const hasActive = state.runs.some((run) => ["queued", "running"].includes(run.status));
    if (!hasActive && !state.selectedRunId) return;
    await Promise.all([loadRuntime(), loadRuns()]);
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
