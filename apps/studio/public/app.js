const state = {
  workflows: [],
  profiles: [],
  runs: [],
  audit: [],
  selectedWorkflowId: null,
  selectedProfileId: null,
  selectedRunId: null,
  selectedRunDetail: null,
  registry: null,
  selectedRegistrySection: "sites",
  selectedRegistryId: null,
  selectedRegistryDraft: null,
  registryFormKey: null,
  runtime: null,
  language: localStorage.getItem("webops-forge-language") || "en",
  graphPositions: {},
  graphDrag: null,
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
    autoLayout: "Auto Layout",
    baseUrl: "Base URL",
    buildWorkflow: "Build Workflow",
    cancel: "Cancel",
    checkSession: "Check Session",
    context: "Context",
    dataDir: "data: {path}",
    delete: "Delete",
    definition: "Definition",
    definitionJson: "Definition JSON",
    description: "Description",
    driver: "Driver",
    evidence: "Evidence",
    export: "Export",
    exportReady: "Export ready",
    graph: "Graph",
    import: "Import",
    importedBundle: "Imported {workflows} workflows, {profiles} profiles, and {registry} registry set",
    input: "Input",
    language: "Language",
    legendCompleted: "completed",
    legendFailed: "failed",
    legendIdle: "idle",
    legendRunning: "running",
    actionIds: "Action IDs",
    actionRegistry: "Action Registry",
    actionType: "Action Type",
    actions: "Actions",
    loginState: "Login State",
    maxPerMinute: "Max Per Minute",
    mode: "Mode",
    name: "Name",
    new: "New",
    newProfile: "New Profile",
    newResource: "New Resource",
    newWorkflow: "New Workflow",
    noArtifacts: "No artifacts",
    noAuditRecords: "No audit records",
    noRegistryRecords: "No resources registered",
    noWorkflowSelected: "No workflow selected",
    noProfile: "no profile",
    none: "none",
    operationModes: "Operation Modes",
    operationRegistry: "Operation Registry",
    operations: "Operations",
    outputName: "Output Name",
    page: "Page",
    pageRegistry: "Page Registry",
    pages: "Pages",
    platform: "Platform",
    profile: "Profile",
    profileDetails: "Profile Details",
    profileDir: "Profile Dir",
    profileIdRequired: "Profile ID is required",
    profileSaved: "Profile saved",
    profiles: "Profiles",
    refresh: "Refresh",
    registry: "Registry",
    registryCenter: "Registry Center",
    registryCenterNote: "Register sites, pages, page actions, and reusable operations before composing workflows.",
    deleteResourceConfirm: "Delete this resource?",
    resourceDeleted: "Resource deleted",
    resourceIdRequired: "Resource ID is required",
    resourceSaved: "Resource saved",
    retry: "Retry",
    retryQueued: "Retry queued",
    runConfig: "Run Config",
    runQueued: "Run queued",
    runWorkflow: "Run Workflow",
    runs: "Runs",
    save: "Save",
    saveProfile: "Save Profile",
    saveResource: "Save Resource",
    schemaJson: "Schema JSON",
    selectedRun: "Selected Run",
    selector: "Selector",
    sessionCheckUrl: "Session Check URL",
    sessionResult: "Session {state}{account}",
    site: "Site",
    siteRegistry: "Site Registry",
    sites: "Sites",
    status: "Status",
    stepCount: "{count} steps",
    tags: "Tags",
    urlPattern: "URL Pattern",
    validate: "Validate",
    valueTemplate: "Value Template",
    workflow: "Workflow",
    workflowBuilt: "Workflow built from operation",
    workflowGraph: "Workflow Graph",
    workflowGraphNote: "Drag nodes to arrange the execution map.",
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
    autoLayout: "自动布局",
    baseUrl: "基础地址",
    buildWorkflow: "生成工作流",
    cancel: "取消",
    checkSession: "检查会话",
    context: "上下文",
    dataDir: "数据目录：{path}",
    delete: "删除",
    definition: "定义",
    definitionJson: "定义 JSON",
    description: "描述",
    driver: "驱动配置",
    evidence: "证据",
    export: "导出",
    exportReady: "导出已准备好",
    graph: "图谱",
    import: "导入",
    importedBundle: "已导入 {workflows} 个工作流、{profiles} 个 Profile 和 {registry} 套注册表",
    input: "输入",
    language: "语言",
    legendCompleted: "已完成",
    legendFailed: "失败",
    legendIdle: "空闲",
    legendRunning: "运行中",
    actionIds: "动作 ID",
    actionRegistry: "页面动作注册",
    actionType: "动作类型",
    actions: "动作",
    loginState: "登录态",
    maxPerMinute: "每分钟上限",
    mode: "模式",
    name: "名称",
    new: "新建",
    newProfile: "新建 Profile",
    newResource: "新建资源",
    newWorkflow: "新建工作流",
    noArtifacts: "暂无产物",
    noAuditRecords: "暂无审计记录",
    noRegistryRecords: "暂无注册资源",
    noWorkflowSelected: "未选择工作流",
    noProfile: "不使用 Profile",
    none: "无",
    operationModes: "动作执行方式",
    operationRegistry: "业务操作注册",
    operations: "业务操作",
    outputName: "输出名",
    page: "页面",
    pageRegistry: "页面注册",
    pages: "页面",
    platform: "平台",
    profile: "Profile",
    profileDetails: "Profile 详情",
    profileDir: "Profile 目录",
    profileIdRequired: "必须填写 Profile ID",
    profileSaved: "Profile 已保存",
    profiles: "Profiles",
    refresh: "刷新",
    registry: "注册中心",
    registryCenter: "注册中心",
    registryCenterNote: "先注册站点、页面、页面动作和可复用业务操作，再把它们编排成工作流。",
    deleteResourceConfirm: "确认删除这个资源吗？",
    resourceDeleted: "资源已删除",
    resourceIdRequired: "必须填写资源 ID",
    resourceSaved: "资源已保存",
    retry: "重试",
    retryQueued: "重试已入队",
    runConfig: "运行配置",
    runQueued: "运行已入队",
    runWorkflow: "运行工作流",
    runs: "运行记录",
    save: "保存",
    saveProfile: "保存 Profile",
    saveResource: "保存资源",
    schemaJson: "结构 JSON",
    selectedRun: "当前运行",
    selector: "选择器",
    sessionCheckUrl: "会话检查 URL",
    sessionResult: "会话 {state}{account}",
    site: "站点",
    siteRegistry: "站点注册",
    sites: "站点",
    status: "状态",
    stepCount: "{count} 步",
    tags: "标签",
    urlPattern: "URL 模式",
    validate: "校验",
    valueTemplate: "值模板",
    workflow: "工作流",
    workflowBuilt: "已从业务操作生成工作流",
    workflowGraph: "工作流图谱",
    workflowGraphNote: "拖动节点来整理执行流程。",
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
    deprecated: "deprecated",
    draft: "draft",
    failed: "failed",
    idle: "idle",
    "logged-out": "logged out",
    queued: "queued",
    ready: "ready",
    running: "running",
    skipped: "skipped",
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
    deprecated: "已弃用",
    draft: "草稿",
    failed: "失败",
    idle: "空闲",
    "logged-out": "未登录",
    queued: "排队中",
    ready: "就绪",
    running: "运行中",
    skipped: "已跳过",
    unchecked: "未检查",
    unknown: "未知"
  }
};

const REGISTRY_SECTIONS = [
  { id: "sites", labelKey: "sites", detailKey: "siteRegistry" },
  { id: "pages", labelKey: "pages", detailKey: "pageRegistry" },
  { id: "actions", labelKey: "actions", detailKey: "actionRegistry" },
  { id: "operations", labelKey: "operations", detailKey: "operationRegistry" }
];

const elements = {
  languageToggle: document.querySelector("#languageToggle"),
  runtimeStatus: document.querySelector("#runtimeStatus"),
  queueStatus: document.querySelector("#queueStatus"),
  registryMetrics: document.querySelector("#registryMetrics"),
  registrySectionTabs: document.querySelector("#registrySectionTabs"),
  registryItemList: document.querySelector("#registryItemList"),
  registryKindLabel: document.querySelector("#registryKindLabel"),
  registryDetailTitle: document.querySelector("#registryDetailTitle"),
  registryDetailStatus: document.querySelector("#registryDetailStatus"),
  registryItemId: document.querySelector("#registryItemId"),
  registryItemName: document.querySelector("#registryItemName"),
  registryItemStatus: document.querySelector("#registryItemStatus"),
  registryItemSite: document.querySelector("#registryItemSite"),
  registryItemPage: document.querySelector("#registryItemPage"),
  registryItemActionType: document.querySelector("#registryItemActionType"),
  registryItemBaseUrl: document.querySelector("#registryItemBaseUrl"),
  registryItemUrlPattern: document.querySelector("#registryItemUrlPattern"),
  registryItemSelector: document.querySelector("#registryItemSelector"),
  registryItemValueTemplate: document.querySelector("#registryItemValueTemplate"),
  registryItemOutputName: document.querySelector("#registryItemOutputName"),
  registryItemTags: document.querySelector("#registryItemTags"),
  registryItemDescription: document.querySelector("#registryItemDescription"),
  registryItemActionIds: document.querySelector("#registryItemActionIds"),
  registryItemDefinitionJson: document.querySelector("#registryItemDefinitionJson"),
  registryItemSchemaJson: document.querySelector("#registryItemSchemaJson"),
  workflowList: document.querySelector("#workflowList"),
  profileList: document.querySelector("#profileList"),
  runList: document.querySelector("#runList"),
  workflowName: document.querySelector("#workflowName"),
  workflowId: document.querySelector("#workflowId"),
  workflowDescription: document.querySelector("#workflowDescription"),
  workflowGraph: document.querySelector("#workflowGraph"),
  graphEdges: document.querySelector("#graphEdges"),
  graphNodeLayer: document.querySelector("#graphNodeLayer"),
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

elements.languageToggle.addEventListener("click", () => setLanguage(state.language === "zh" ? "en" : "zh"));
document.querySelector("#autoLayoutButton").addEventListener("click", () => autoLayoutSelectedWorkflow());
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
document.querySelector("#newRegistryItemButton").addEventListener("click", () => createBlankRegistryItem());
document.querySelector("#saveRegistryItemButton").addEventListener("click", () => saveSelectedRegistryItem());
document.querySelector("#deleteRegistryItemButton").addEventListener("click", () => deleteSelectedRegistryItem());
document.querySelector("#buildWorkflowFromOperationButton").addEventListener("click", () => buildWorkflowFromSelectedOperation());
document.querySelector("#cancelRunButton").addEventListener("click", () => cancelSelectedRun());
document.querySelector("#retryRunButton").addEventListener("click", () => retrySelectedRun());
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
});
document.addEventListener("pointermove", (event) => moveGraphNode(event));
document.addEventListener("pointerup", () => endGraphDrag());

applyStaticTranslations();
await refreshAll();
startPolling();

async function refreshAll() {
  await Promise.all([loadRuntime(), loadRegistry(), loadWorkflows(), loadProfiles(), loadRuns(), loadAudit()]);
  if (!state.selectedWorkflowId && state.workflows[0]) selectWorkflow(state.workflows[0].id);
  if (!state.selectedProfileId && state.profiles[0]) selectProfile(state.profiles[0].id);
  if (!state.selectedRegistryId) selectDefaultRegistryItem();
  render();
}

async function loadRuntime() {
  state.runtime = await api("/api/runtime");
}

async function loadWorkflows() {
  const data = await api("/api/workflows");
  state.workflows = data.workflows;
}

async function loadRegistry() {
  const data = await api("/api/registry");
  state.registry = data.registry;
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
  renderRegistry();
  renderWorkflows();
  renderProfiles();
  renderRuns();
  renderGraph();
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

function renderGraph() {
  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflowId);
  if (!workflow) {
    elements.graphNodeLayer.innerHTML = `<div class="graph-empty">${escapeHtml(t("noWorkflowSelected"))}</div>`;
    elements.graphEdges.innerHTML = "";
    return;
  }

  const graph = buildGraphData(workflow.workflow);
  const statusByStep = buildStepStatusMap(
    state.selectedRunDetail?.run?.workflowId === workflow.id ? state.selectedRunDetail.events : []
  );
  const positions = loadGraphPositions(workflow.id, graph.nodes);
  state.graphPositions = positions;
  const size = graphCanvasSize(graph.nodes, positions);

  elements.workflowGraph.style.minWidth = `${size.width}px`;
  elements.workflowGraph.style.minHeight = `${size.height}px`;
  elements.graphNodeLayer.innerHTML = "";
  elements.graphNodeLayer.style.width = `${size.width}px`;
  elements.graphNodeLayer.style.height = `${size.height}px`;

  for (const node of graph.nodes) {
    const position = positions[node.id];
    const status = statusByStep[node.id] ?? "idle";
    const item = document.createElement("div");
    item.className = `workflow-node ${node.depth ? "child" : "root"} ${statusClassForNode(status)}`;
    item.dataset.nodeId = node.id;
    item.style.left = `${position.x}px`;
    item.style.top = `${position.y}px`;
    item.innerHTML = `
      <div class="node-head">
        <span class="node-action">${escapeHtml(node.action)}</span>
        <span class="node-status">${escapeHtml(statusLabel(status))}</span>
      </div>
      <strong>${escapeHtml(node.label)}</strong>
      <span class="node-meta">${escapeHtml(node.meta)}</span>
    `;
    item.addEventListener("pointerdown", (event) => startGraphDrag(event, node.id));
    elements.graphNodeLayer.append(item);
  }

  renderGraphEdges(graph.edges, positions, size);
}

function buildGraphData(workflow) {
  const nodes = [];
  const edges = [];
  let previousTopLevel = null;
  for (const [topIndex, step] of (workflow.steps ?? []).entries()) {
    nodes.push(createGraphNode(step, { depth: 0, topIndex, childIndex: 0, branch: "main" }));
    if (previousTopLevel) edges.push({ from: previousTopLevel, to: step.id, kind: "main" });
    previousTopLevel = step.id;

    if (step.action === "operation") {
      let previousBrowserStep = null;
      for (const [childIndex, child] of (step.browserSteps ?? []).entries()) {
        nodes.push(createGraphNode(child, { depth: 1, topIndex, childIndex, branch: "browser" }));
        edges.push({ from: step.id, to: child.id, kind: "branch" });
        if (previousBrowserStep) edges.push({ from: previousBrowserStep, to: child.id, kind: "branch" });
        previousBrowserStep = child.id;
      }
      if (step.api) {
        nodes.push(createGraphNode(step.api, {
          depth: 1,
          topIndex,
          childIndex: (step.browserSteps ?? []).length,
          branch: "api"
        }));
        edges.push({ from: step.id, to: step.api.id, kind: "branch" });
      }
    }
  }
  return { nodes, edges };
}

function createGraphNode(step, { depth, topIndex, childIndex, branch }) {
  return {
    id: step.id,
    action: step.action,
    depth,
    topIndex,
    childIndex,
    branch,
    label: shortStepLabel(step),
    meta: stepMeta(step, branch)
  };
}

function shortStepLabel(step) {
  const parts = String(step.id ?? step.action).split(".");
  return parts.at(-1) || step.action;
}

function stepMeta(step, branch) {
  const details = [];
  if (branch && branch !== "main") details.push(branch);
  if (step.selector) details.push(step.selector);
  if (step.url) details.push(shorten(step.url));
  if (step.name) details.push(step.name);
  if (step.includes) details.push(`includes ${step.includes}`);
  return details.join(" · ") || step.id;
}

function buildStepStatusMap(events = []) {
  const map = {};
  for (const event of events) {
    if (!event.stepId) continue;
    if (event.type === "step.started") map[event.stepId] = "running";
    if (event.type === "step.completed") map[event.stepId] = "completed";
    if (event.type === "step.failed") map[event.stepId] = event.error?.code === "BROWSER_BLOCKED" ? "blocked" : "failed";
    if (event.type === "step.skipped_after_error") map[event.stepId] = "skipped";
  }
  return map;
}

function loadGraphPositions(workflowId, nodes) {
  const defaults = defaultGraphPositions(nodes);
  try {
    const saved = JSON.parse(localStorage.getItem(graphStorageKey(workflowId)) || "{}");
    return Object.fromEntries(nodes.map((node) => [node.id, saved[node.id] ?? defaults[node.id]]));
  } catch {
    return defaults;
  }
}

function defaultGraphPositions(nodes) {
  return Object.fromEntries(nodes.map((node) => [
    node.id,
    node.depth === 0
      ? { x: 48 + node.topIndex * 270, y: 58 }
      : { x: 48 + node.topIndex * 270 + (node.childIndex % 2) * 230, y: 220 + Math.floor(node.childIndex / 2) * 124 }
  ]));
}

function graphCanvasSize(nodes, positions) {
  const maxX = Math.max(...nodes.map((node) => positions[node.id]?.x ?? 0), 780);
  const maxY = Math.max(...nodes.map((node) => positions[node.id]?.y ?? 0), 420);
  return { width: maxX + 280, height: maxY + 160 };
}

function renderGraphEdges(edges, positions, size = null) {
  const graphSize = size ?? graphCanvasSize(
    Object.keys(positions).map((id) => ({ id })),
    positions
  );
  elements.graphEdges.setAttribute("width", graphSize.width);
  elements.graphEdges.setAttribute("height", graphSize.height);
  elements.graphEdges.setAttribute("viewBox", `0 0 ${graphSize.width} ${graphSize.height}`);
  elements.graphEdges.innerHTML = `
    <defs>
      <marker id="graphArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#9aa8b7"></path>
      </marker>
    </defs>
    ${edges.map((edge) => edgePath(edge, positions)).join("")}
  `;
}

function edgePath(edge, positions) {
  const from = positions[edge.from];
  const to = positions[edge.to];
  if (!from || !to) return "";
  const startX = from.x + 220;
  const startY = from.y + 45;
  const endX = to.x;
  const endY = to.y + 45;
  const curve = Math.max(60, Math.abs(endX - startX) / 2);
  const path = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
  return `<path class="graph-edge ${edge.kind}" d="${path}" marker-end="url(#graphArrow)"></path>`;
}

function autoLayoutSelectedWorkflow() {
  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflowId);
  if (!workflow) return;
  const graph = buildGraphData(workflow.workflow);
  state.graphPositions = defaultGraphPositions(graph.nodes);
  saveGraphPositions(workflow.id, state.graphPositions);
  renderGraph();
}

function startGraphDrag(event, nodeId) {
  if (event.button !== 0) return;
  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflowId);
  if (!workflow) return;
  const current = state.graphPositions[nodeId];
  if (!current) return;
  event.preventDefault();
  event.currentTarget.classList.add("dragging");
  state.graphDrag = {
    workflowId: workflow.id,
    nodeId,
    startX: event.clientX,
    startY: event.clientY,
    originX: current.x,
    originY: current.y
  };
}

function moveGraphNode(event) {
  if (!state.graphDrag) return;
  const { nodeId, startX, startY, originX, originY } = state.graphDrag;
  const next = {
    x: Math.max(16, originX + event.clientX - startX),
    y: Math.max(16, originY + event.clientY - startY)
  };
  state.graphPositions[nodeId] = next;
  const node = elements.graphNodeLayer.querySelector(`[data-node-id="${cssEscape(nodeId)}"]`);
  if (node) {
    node.style.left = `${next.x}px`;
    node.style.top = `${next.y}px`;
  }
  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflowId);
  if (workflow) {
    const graph = buildGraphData(workflow.workflow);
    const size = graphCanvasSize(graph.nodes, state.graphPositions);
    renderGraphEdges(graph.edges, state.graphPositions, size);
  }
}

function endGraphDrag() {
  if (!state.graphDrag) return;
  const workflowId = state.graphDrag.workflowId;
  const node = elements.graphNodeLayer.querySelector(`[data-node-id="${cssEscape(state.graphDrag.nodeId)}"]`);
  node?.classList.remove("dragging");
  state.graphDrag = null;
  saveGraphPositions(workflowId, state.graphPositions);
}

function saveGraphPositions(workflowId, positions) {
  try {
    localStorage.setItem(graphStorageKey(workflowId), JSON.stringify(positions));
  } catch {
    // Local storage is best-effort; graph dragging still works for the current session.
  }
}

function graphStorageKey(workflowId) {
  return `webops-forge-graph:${workflowId}`;
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
  renderGraph();
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
  state.selectedRunDetail = data;
  renderRunDetail(data);
  renderRuns();
  renderGraph();
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

function renderRegistry() {
  if (!state.registry) return;
  renderRegistryMetrics();
  renderRegistrySectionTabs();
  renderRegistryItemList();

  const item = currentRegistryItem() ?? createBlankRegistryRecord(state.selectedRegistrySection);
  syncRegistryForm(item);
  const canBuildWorkflow = state.selectedRegistrySection === "operations" && Boolean(item.id);
  document.querySelector("#buildWorkflowFromOperationButton").disabled = !canBuildWorkflow;
}

function renderRegistryMetrics() {
  elements.registryMetrics.innerHTML = REGISTRY_SECTIONS.map((section) => {
    const count = state.registry?.[section.id]?.length ?? 0;
    return `
      <button class="registry-metric ${state.selectedRegistrySection === section.id ? "active" : ""}" type="button" data-section="${section.id}">
        <span>${escapeHtml(t(section.labelKey))}</span>
        <strong>${count}</strong>
      </button>
    `;
  }).join("");
  elements.registryMetrics.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => selectRegistrySection(button.dataset.section));
  });
}

function renderRegistrySectionTabs() {
  elements.registrySectionTabs.innerHTML = REGISTRY_SECTIONS.map((section) => `
    <button class="registry-section-button ${state.selectedRegistrySection === section.id ? "active" : ""}" type="button" data-section="${section.id}">
      ${escapeHtml(t(section.labelKey))}
    </button>
  `).join("");
  elements.registrySectionTabs.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => selectRegistrySection(button.dataset.section));
  });
}

function renderRegistryItemList() {
  const items = registryItemsFor(state.selectedRegistrySection);
  elements.registryItemList.innerHTML = "";
  if (items.length === 0) {
    elements.registryItemList.innerHTML = `<div class="registry-empty">${escapeHtml(t("noRegistryRecords"))}</div>`;
    return;
  }
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `registry-item-row ${item.id === state.selectedRegistryId ? "active" : ""}`;
    button.innerHTML = `
      <span class="row-title">${escapeHtml(item.name)}</span>
      <span class="row-meta">${escapeHtml(item.id)} · ${escapeHtml(statusLabel(item.status))}${item.tags?.length ? ` · ${escapeHtml(item.tags.join(", "))}` : ""}</span>
    `;
    button.addEventListener("click", () => selectRegistryItem(state.selectedRegistrySection, item.id));
    elements.registryItemList.append(button);
  }
}

function syncRegistryForm(item) {
  const formKey = `${state.selectedRegistrySection}:${state.selectedRegistryId ?? "__draft__"}`;
  populateRegistrySelects(item);
  setRegistryFieldState(state.selectedRegistrySection);
  if (state.registryFormKey === formKey) {
    updateRegistryDetailChrome(item);
    return;
  }
  fillRegistryForm(item);
  state.registryFormKey = formKey;
}

function fillRegistryForm(item) {
  updateRegistryDetailChrome(item);
  elements.registryItemId.value = item.id ?? "";
  elements.registryItemName.value = item.name ?? "";
  elements.registryItemStatus.value = item.status ?? "draft";
  elements.registryItemDescription.value = item.description ?? "";
  elements.registryItemTags.value = Array.isArray(item.tags) ? item.tags.join(", ") : "";
  elements.registryItemSite.value = item.siteId ?? item.id ?? "";
  elements.registryItemPage.value = item.pageId ?? "";
  elements.registryItemActionType.value = item.actionType ?? "click";
  elements.registryItemBaseUrl.value = item.baseUrl ?? "";
  elements.registryItemUrlPattern.value = item.urlPattern ?? "";
  elements.registryItemSelector.value = item.selector ?? item.stateSelector ?? "";
  elements.registryItemValueTemplate.value = item.valueTemplate ?? "";
  elements.registryItemOutputName.value = item.outputName ?? "";
  elements.registryItemActionIds.value = Array.isArray(item.actionIds) ? item.actionIds.join("\n") : "";
  elements.registryItemDefinitionJson.value = formatJson(item.definition ?? {});
  elements.registryItemSchemaJson.value = formatJson({
    inputSchema: item.inputSchema ?? {},
    outputSchema: item.outputSchema ?? {},
    workflowTemplate: item.workflowTemplate ?? null
  });
}

function updateRegistryDetailChrome(item) {
  const section = REGISTRY_SECTIONS.find((entry) => entry.id === state.selectedRegistrySection) ?? REGISTRY_SECTIONS[0];
  elements.registryKindLabel.textContent = t(section.detailKey);
  elements.registryDetailTitle.textContent = item?.name || t("newResource");
  elements.registryDetailStatus.textContent = statusLabel(item?.status ?? "draft");
  elements.registryDetailStatus.className = `pill ${statusClass(item?.status ?? "draft")}`;
}

function setRegistryFieldState(section) {
  const enables = {
    sites: ["registryItemBaseUrl"],
    pages: ["registryItemSite", "registryItemUrlPattern", "registryItemSelector"],
    actions: ["registryItemSite", "registryItemPage", "registryItemActionType", "registryItemSelector", "registryItemValueTemplate", "registryItemOutputName"],
    operations: ["registryItemSite", "registryItemActionIds", "registryItemSchemaJson"]
  }[section] ?? [];
  const optionalIds = [
    "registryItemSite",
    "registryItemPage",
    "registryItemActionType",
    "registryItemBaseUrl",
    "registryItemUrlPattern",
    "registryItemSelector",
    "registryItemValueTemplate",
    "registryItemOutputName",
    "registryItemActionIds",
    "registryItemSchemaJson"
  ];
  for (const id of optionalIds) {
    elements[id].disabled = !enables.includes(id);
  }
}

function populateRegistrySelects(item = {}) {
  const selectedSite = item.siteId ?? elements.registryItemSite.value;
  const selectedPage = item.pageId ?? elements.registryItemPage.value;
  elements.registryItemSite.innerHTML = `<option value="">${escapeHtml(t("none"))}</option>${registryItemsFor("sites")
    .map((site) => `<option value="${escapeHtml(site.id)}">${escapeHtml(site.name)}</option>`)
    .join("")}`;
  elements.registryItemPage.innerHTML = `<option value="">${escapeHtml(t("none"))}</option>${registryItemsFor("pages")
    .map((page) => `<option value="${escapeHtml(page.id)}">${escapeHtml(page.name)}${page.siteId ? ` / ${escapeHtml(page.siteId)}` : ""}</option>`)
    .join("")}`;
  if ([...elements.registryItemSite.options].some((option) => option.value === selectedSite)) {
    elements.registryItemSite.value = selectedSite;
  }
  if ([...elements.registryItemPage.options].some((option) => option.value === selectedPage)) {
    elements.registryItemPage.value = selectedPage;
  }
}

function selectRegistrySection(section) {
  if (!REGISTRY_SECTIONS.some((entry) => entry.id === section)) return;
  state.selectedRegistrySection = section;
  state.selectedRegistryDraft = null;
  state.registryFormKey = null;
  const first = registryItemsFor(section)[0];
  state.selectedRegistryId = first?.id ?? null;
  renderRegistry();
}

function selectRegistryItem(section, id) {
  state.selectedRegistrySection = section;
  state.selectedRegistryId = id;
  state.selectedRegistryDraft = null;
  state.registryFormKey = null;
  renderRegistry();
}

function selectDefaultRegistryItem() {
  if (!state.registry) return;
  const section = REGISTRY_SECTIONS.some((entry) => entry.id === state.selectedRegistrySection)
    ? state.selectedRegistrySection
    : "sites";
  state.selectedRegistrySection = section;
  const items = registryItemsFor(section);
  state.selectedRegistryId = items.some((item) => item.id === state.selectedRegistryId)
    ? state.selectedRegistryId
    : items[0]?.id ?? null;
}

function createBlankRegistryItem() {
  state.selectedRegistryDraft = createBlankRegistryRecord(state.selectedRegistrySection);
  state.selectedRegistryId = null;
  state.registryFormKey = null;
  renderRegistry();
}

function createBlankRegistryRecord(section) {
  const suffix = Date.now().toString(36);
  const firstSite = registryItemsFor("sites")[0];
  const firstPage = registryItemsFor("pages")[0];
  const base = {
    id: `${section.slice(0, -1) || "registry"}-${suffix}`,
    name: t("newResource"),
    description: "",
    status: "draft",
    tags: [],
    definition: {}
  };
  if (section === "sites") {
    return { ...base, baseUrl: "", authMode: "profile", profileStrategy: "one-profile-per-account" };
  }
  if (section === "pages") {
    return { ...base, siteId: firstSite?.id ?? "", urlPattern: "", stateSelector: "", accountSelector: "" };
  }
  if (section === "actions") {
    return { ...base, siteId: firstSite?.id ?? "", pageId: firstPage?.id ?? "", actionType: "click", selector: "", valueTemplate: "", outputName: "" };
  }
  return { ...base, siteId: firstSite?.id ?? "", actionIds: [], inputSchema: {}, outputSchema: {}, workflowTemplate: null };
}

async function saveSelectedRegistryItem() {
  try {
    const section = state.selectedRegistrySection;
    const body = registryItemFromForm(section);
    if (!body.id) throw new Error(t("resourceIdRequired"));
    const exists = registryItemsFor(section).some((item) => item.id === body.id);
    const data = await api(exists ? `/api/registry/${section}/${encodeURIComponent(body.id)}` : `/api/registry/${section}`, {
      method: exists ? "PUT" : "POST",
      body
    });
    state.registry = data.registry;
    state.selectedRegistryId = data.item.id;
    state.selectedRegistryDraft = null;
    state.registryFormKey = null;
    await loadAudit();
    render();
    showToast(t("resourceSaved"));
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteSelectedRegistryItem() {
  if (!state.selectedRegistryId) return;
  if (!window.confirm(t("deleteResourceConfirm"))) return;
  try {
    const section = state.selectedRegistrySection;
    const data = await api(`/api/registry/${section}/${encodeURIComponent(state.selectedRegistryId)}`, { method: "DELETE" });
    state.registry = data.registry;
    state.selectedRegistryId = registryItemsFor(section)[0]?.id ?? null;
    state.selectedRegistryDraft = null;
    state.registryFormKey = null;
    await loadAudit();
    render();
    showToast(t("resourceDeleted"));
  } catch (error) {
    showToast(error.message);
  }
}

async function buildWorkflowFromSelectedOperation() {
  try {
    if (state.selectedRegistrySection !== "operations") return;
    const operation = registryItemFromForm("operations");
    if (!operation.id) throw new Error(t("resourceIdRequired"));
    const workflowRecord = createWorkflowRecordFromOperation(operation);
    const data = await api("/api/workflows", { method: "POST", body: workflowRecord });
    await Promise.all([loadWorkflows(), loadAudit()]);
    state.selectedWorkflowId = data.workflow.id;
    selectWorkflow(data.workflow.id);
    selectTab("graph");
    render();
    showToast(t("workflowBuilt"));
  } catch (error) {
    showToast(error.message);
  }
}

function registryItemFromForm(section) {
  const existing = currentRegistryItem() ?? createBlankRegistryRecord(section);
  const base = {
    ...existing,
    id: elements.registryItemId.value.trim(),
    name: elements.registryItemName.value.trim() || elements.registryItemId.value.trim(),
    description: elements.registryItemDescription.value.trim(),
    status: elements.registryItemStatus.value,
    tags: parseList(elements.registryItemTags.value),
    definition: parseJson(elements.registryItemDefinitionJson.value, "Definition")
  };
  if (section === "sites") {
    return {
      ...base,
      baseUrl: elements.registryItemBaseUrl.value.trim(),
      authMode: existing.authMode ?? "profile",
      profileStrategy: existing.profileStrategy ?? "one-profile-per-account"
    };
  }
  if (section === "pages") {
    return {
      ...base,
      siteId: elements.registryItemSite.value,
      urlPattern: elements.registryItemUrlPattern.value.trim(),
      stateSelector: elements.registryItemSelector.value.trim(),
      accountSelector: existing.accountSelector ?? ""
    };
  }
  if (section === "actions") {
    return {
      ...base,
      siteId: elements.registryItemSite.value,
      pageId: elements.registryItemPage.value,
      actionType: elements.registryItemActionType.value,
      selector: elements.registryItemSelector.value.trim(),
      valueTemplate: elements.registryItemValueTemplate.value.trim(),
      outputName: elements.registryItemOutputName.value.trim()
    };
  }
  const schemas = parseJson(elements.registryItemSchemaJson.value, "Schema");
  return {
    ...base,
    siteId: elements.registryItemSite.value,
    actionIds: parseList(elements.registryItemActionIds.value),
    inputSchema: schemas.inputSchema ?? {},
    outputSchema: schemas.outputSchema ?? {},
    workflowTemplate: schemas.workflowTemplate ?? null
  };
}

function currentRegistryItem() {
  if (state.selectedRegistryDraft) return state.selectedRegistryDraft;
  return registryItemsFor(state.selectedRegistrySection).find((item) => item.id === state.selectedRegistryId) ?? null;
}

function registryItemsFor(section) {
  return Array.isArray(state.registry?.[section]) ? state.registry[section] : [];
}

function createWorkflowRecordFromOperation(operation) {
  const workflow = operation.workflowTemplate
    ? structuredCloneSafe(operation.workflowTemplate)
    : createWorkflowDefinitionFromOperation(operation);
  workflow.name = workflow.name || slugify(operation.name || operation.id);
  workflow.version = workflow.version || "0.1.0";
  const baseId = `${slugify(operation.id)}-workflow`;
  const id = state.workflows.some((item) => item.id === baseId) ? `${baseId}-${Date.now().toString(36)}` : baseId;
  return {
    id,
    name: operation.name,
    description: operation.description,
    workflow,
    defaultRun: {
      mode: "dry-run",
      profileId: state.profiles.some((profile) => profile.id === "dry-run-demo") ? "dry-run-demo" : null,
      input: sampleInputFromSchema(operation.inputSchema),
      context: {
        operationModes: detectOperationModes(workflow)
      },
      driverConfig: createDriverConfigFromOperation(operation)
    }
  };
}

function createWorkflowDefinitionFromOperation(operation) {
  const stepId = templateSafeId(operation.id);
  const actions = operation.actionIds
    .map((id) => registryItemsFor("actions").find((action) => action.id === id))
    .filter(Boolean);
  const browserSteps = actions
    .filter((action) => action.actionType !== "apiCall")
    .map((action) => actionToWorkflowStep(action));
  const apiAction = actions.find((action) => action.actionType === "apiCall");
  const api = createApiStepFromOperation(operation, apiAction);
  return {
    name: slugify(operation.name || operation.id),
    version: "0.1.0",
    defaults: { timeoutMs: 5000, screenshot: "on-failure" },
    steps: [
      {
        id: stepId,
        action: "operation",
        mode: `{{context.operationModes.${stepId}}}`,
        browserSteps: browserSteps.length ? browserSteps : [{ id: `${slugify(operation.id)}.checkpoint`, action: "checkpoint", label: operation.name }],
        api
      }
    ]
  };
}

function actionToWorkflowStep(action) {
  const explicitStep = action.definition?.step;
  if (explicitStep && typeof explicitStep === "object") {
    return { id: slugify(action.id), ...structuredCloneSafe(explicitStep) };
  }
  const id = slugify(action.id);
  if (action.actionType === "goto") return { id, action: "goto", url: action.valueTemplate || pageUrlForAction(action) };
  if (action.actionType === "fill") return { id, action: "fill", selector: action.selector, value: action.valueTemplate };
  if (action.actionType === "waitFor") return { id, action: "waitFor", selector: action.selector };
  if (action.actionType === "press") return { id, action: "press", selector: action.selector || null, key: action.valueTemplate || "Enter" };
  if (action.actionType === "extract") return { id, action: "extract", selector: action.selector, name: action.outputName || id };
  if (action.actionType === "screenshot") return { id, action: "screenshot", name: action.outputName || id };
  if (action.actionType === "approval") return { id, action: "approval", name: action.outputName || id, prompt: action.description || action.name };
  return { id, action: "click", selector: action.selector };
}

function createApiStepFromOperation(operation, apiAction) {
  const branch = operation.definition?.apiBranch;
  if (branch && typeof branch === "object") {
    return { id: `${slugify(operation.id)}.api`, action: "apiCall", method: "GET", ...structuredCloneSafe(branch) };
  }
  if (!apiAction) return null;
  const explicitStep = apiAction.definition?.step;
  if (explicitStep && typeof explicitStep === "object") {
    return { id: `${slugify(operation.id)}.api`, action: "apiCall", ...structuredCloneSafe(explicitStep) };
  }
  return {
    id: `${slugify(operation.id)}.api`,
    action: "apiCall",
    method: "GET",
    url: apiAction.valueTemplate || apiAction.selector
  };
}

function createDriverConfigFromOperation(operation) {
  const selectors = {};
  for (const actionId of operation.actionIds ?? []) {
    const action = registryItemsFor("actions").find((item) => item.id === actionId);
    if (!action?.selector) continue;
    selectors[action.selector] = action.actionType === "extract" || action.actionType === "waitFor"
      ? { text: action.outputName ? `Sample ${action.outputName}` : action.name }
      : { value: "" };
  }
  const site = registryItemsFor("sites").find((item) => item.id === operation.siteId);
  const page = registryItemsFor("pages").find((item) => item.siteId === operation.siteId) ?? registryItemsFor("pages")[0];
  const pageUrl = page?.urlPattern || site?.baseUrl || "https://example.local";
  return {
    pages: {
      [pageUrl]: { selectors }
    }
  };
}

function pageUrlForAction(action) {
  const page = registryItemsFor("pages").find((item) => item.id === action.pageId);
  const site = registryItemsFor("sites").find((item) => item.id === action.siteId);
  return action.valueTemplate || page?.urlPattern || site?.baseUrl || "https://example.local";
}

function sampleInputFromSchema(schema = {}) {
  return Object.fromEntries(Object.entries(schema).map(([key, field]) => {
    if (field && typeof field === "object" && "default" in field) return [key, field.default];
    if (field?.type === "number" || field?.type === "integer") return [key, 0];
    if (field?.type === "boolean") return [key, true];
    return [key, `sample ${key}`];
  }));
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
    showToast(t("workflowSaved"));
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
    showToast(t("workflowValid", { count: result.stepCount }));
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
    showToast(t("profileSaved"));
  } catch (error) {
    showToast(error.message);
  }
}

async function checkSelectedProfile() {
  try {
    const id = elements.profileId.value.trim();
    if (!id) throw new Error(t("profileIdRequired"));
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
    showToast(t("sessionResult", {
      state: statusLabel(data.result.loginState),
      account: data.result.accountLabel ? `: ${data.result.accountLabel}` : ""
    }));
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
    showToast(t("runQueued"));
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
    showToast(statusLabel("cancel_requested"));
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
    showToast(t("retryQueued"));
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
    showToast(t("exportReady"));
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
    showToast(t("importedBundle", {
      workflows: result.imported.workflows,
      profiles: result.imported.profiles,
      registry: result.imported.registry ?? 0
    }));
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
    name: t("newWorkflow"),
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
    name: t("newProfile"),
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
    await Promise.all([loadRuntime(), loadRegistry(), loadRuns(), loadProfiles(), loadAudit()]);
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

function setLanguage(language) {
  state.language = language === "zh" ? "zh" : "en";
  localStorage.setItem("webops-forge-language", state.language);
  applyStaticTranslations();
  render();
  if (state.selectedRunId) {
    void selectRun(state.selectedRunId);
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelector("#newWorkflowButton")?.setAttribute("aria-label", t("newWorkflow"));
  document.querySelector("#newProfileButton")?.setAttribute("aria-label", t("newProfile"));
  elements.languageToggle.setAttribute("aria-label", t("language"));
  elements.languageToggle.setAttribute("aria-pressed", String(state.language === "zh"));
  elements.languageToggle.querySelectorAll("[data-lang-code]").forEach((node) => {
    node.classList.toggle("active", node.dataset.langCode === state.language);
  });
  translateStatusOptions(elements.profileLoginState);
  translateStatusOptions(elements.profileStatus);
  translateStatusOptions(elements.registryItemStatus);
}

function translateStatusOptions(select) {
  for (const option of select.options) {
    option.textContent = statusLabel(option.value);
  }
}

function t(key, params = {}) {
  const message = I18N[state.language]?.[key] ?? I18N.en[key] ?? key;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => String(params[name] ?? ""));
}

function statusLabel(value) {
  return STATUS_LABELS[state.language]?.[value] ?? STATUS_LABELS.en[value] ?? String(value ?? "");
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

function statusClassForNode(status) {
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  if (status === "running" || status === "queued") return "running";
  if (status === "skipped") return "skipped";
  return "ready";
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

function shorten(value, max = 42) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function parseList(value) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || `item-${Date.now().toString(36)}`;
}

function templateSafeId(value) {
  const text = String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-zA-Z_]/.test(text) ? text : `operation_${text || Date.now().toString(36)}`;
}

function structuredCloneSafe(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
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
