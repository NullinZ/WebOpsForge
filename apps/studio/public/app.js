const state = {
  workflows: [],
  profiles: [],
  runs: [],
  audit: [],
  pickerEvents: [],
  selectedPickerEventId: null,
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
  graphPan: null,
  graphGesture: null,
  graphSize: null,
  graphZoom: Number(localStorage.getItem("webops-forge-graph-zoom") || "1") || 1,
  graphLayout: localStorage.getItem("webops-forge-graph-layout") || "sequence",
  graphViewportCenterKey: null,
  selectedGraphNodeId: null,
  nodeEditorSyncing: false,
  resizeDrag: null,
  polling: null
};

const GRAPH_CANVAS_SCALE = 10;
const GRAPH_LAYOUT_VERSION = "v3";
const GRAPH_MIN_ZOOM = 0.2;
const GRAPH_MAX_ZOOM = 2.5;
const GRAPH_WHEEL_ZOOM_SENSITIVITY = 0.0015;
const GRAPH_NODE_WIDTH = 220;
const GRAPH_NODE_HEIGHT = 92;
const GRAPH_CHILD_NODE_WIDTH = 210;
const GRAPH_MIN_CONTENT_WIDTH = 780;
const GRAPH_MIN_CONTENT_HEIGHT = 420;
const GRAPH_CANVAS_MARGIN = 160;
const GRAPH_LAYOUT_CONFIGS = {
  sequence: {
    groupMinWidth: 520,
    groupGap: 260,
    groupPadding: 160,
    childColumns: "all",
    childColumnStep: 360,
    childRowStep: 170,
    mainToBranchY: 240
  },
  grouped: {
    groupMinWidth: 620,
    groupGap: 280,
    groupPadding: 160,
    childColumns: "balanced",
    childColumnStep: 380,
    childRowStep: 190,
    mainToBranchY: 240
  },
  compact: {
    groupMinWidth: 460,
    groupGap: 170,
    groupPadding: 100,
    childColumns: "balanced",
    childColumnStep: 285,
    childRowStep: 145,
    mainToBranchY: 180
  }
};
const NODE_EDITOR_FIELDS = [
  {
    element: "nodeEditorId",
    read: (step) => step.id ?? "",
    write: (step, value) => {
      const nextId = value.trim();
      if (nextId) step.id = nextId;
    }
  },
  {
    element: "nodeEditorAction",
    read: (step) => step.action ?? "checkpoint",
    write: (step, value) => {
      const nextAction = value.trim();
      if (nextAction) step.action = nextAction;
    }
  },
  {
    element: "nodeEditorName",
    read: (step) => step.name ?? step.label ?? "",
    write: (step, value) => writeAliasField(step, ["name", "label"], value)
  },
  { element: "nodeEditorSelector", field: "selector" },
  { element: "nodeEditorUrl", field: "url" },
  { element: "nodeEditorValue", field: "value", parseJsonLike: true },
  { element: "nodeEditorKey", field: "key" },
  { element: "nodeEditorIncludes", field: "includes" },
  { element: "nodeEditorMethod", field: "method" },
  { element: "nodeEditorExtract", field: "extract" }
];
const RESIZE_STORAGE_PREFIX = "webops-forge-resize";
const RESIZE_STEP = 24;
const resizableLayouts = new Map();
const RESIZABLE_LAYOUTS = [
  {
    id: "workspace",
    root: ".workspace",
    panes: {
      sidebar: {
        selector: ":scope > .sidebar",
        variable: "--workspace-sidebar-size",
        defaultSize: 280,
        minSize: 150,
        collapseAt: 96,
        label: "Workflows"
      },
      inspector: {
        selector: ":scope > .inspector",
        variable: "--workspace-inspector-size",
        defaultSize: 360,
        minSize: 220,
        collapseAt: 120,
        label: "Runs"
      }
    },
    handles: [
      {
        before: ":scope > .sidebar",
        controls: "sidebar",
        direction: 1,
        axis: () => window.matchMedia("(max-width: 760px)").matches ? "y" : "x"
      },
      {
        before: ":scope > .editor-pane",
        controls: "inspector",
        direction: -1,
        axis: () => window.matchMedia("(max-width: 1120px)").matches ? "y" : "x"
      }
    ]
  },
  {
    id: "graph",
    root: "#graphPanel",
    panes: {
      nodeEditor: {
        selector: ":scope > #graphNodeEditor",
        variable: "--graph-node-editor-size",
        defaultSize: 360,
        minSize: 220,
        collapseAt: 130,
        label: "Node Editor"
      }
    },
    handles: [
      {
        before: ":scope > #workflowGraph",
        controls: "nodeEditor",
        direction: -1,
        axis: () => window.matchMedia("(max-width: 1120px)").matches ? "y" : "x"
      }
    ]
  },
  {
    id: "registry",
    root: ".registry-workbench",
    panes: {
      navigation: {
        selector: ":scope > .registry-navigation",
        variable: "--registry-navigation-size",
        defaultSize: 300,
        minSize: 180,
        collapseAt: 110,
        label: "Registry List"
      }
    },
    handles: [
      {
        before: ":scope > .registry-navigation",
        controls: "navigation",
        direction: 1,
        axis: "x"
      }
    ]
  },
  {
    id: "runEditors",
    root: ".triple-editors",
    panes: {
      input: {
        selector: ':scope > [data-run-pane="input"]',
        variable: "--run-input-size",
        defaultSize: 260,
        minSize: 170,
        collapseAt: 96,
        label: "Input"
      },
      driver: {
        selector: ':scope > [data-run-pane="driver"]',
        variable: "--run-driver-size",
        defaultSize: 260,
        minSize: 170,
        collapseAt: 96,
        label: "Driver"
      }
    },
    handles: [
      {
        before: ':scope > [data-run-pane="input"]',
        controls: "input",
        direction: 1,
        axis: "x"
      },
      {
        before: ':scope > [data-run-pane="context"]',
        controls: "driver",
        direction: -1,
        axis: "x"
      }
    ]
  }
];

state.graphZoom = normalizeGraphZoom(state.graphZoom);
state.graphLayout = normalizeGraphLayout(state.graphLayout);

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
    apply: "Apply",
    applyLatestPick: "Apply Latest",
    browserPicker: "Browser Picker",
    confidence: "Confidence",
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
    extract: "Extract",
    graph: "Graph",
    id: "ID",
    import: "Import",
    importedBundle: "Imported {workflows} workflows, {profiles} profiles, and {registry} registry set",
    includes: "Includes",
    input: "Input",
    key: "Key",
    language: "Language",
    layoutCompact: "Compact",
    layoutGrouped: "Grouped",
    layoutSequence: "Sequence",
    legendCompleted: "completed",
    legendFailed: "failed",
    legendIdle: "idle",
    legendRunning: "running",
    actionIds: "Action IDs",
    actionRegistry: "Action Registry",
    actionType: "Action Type",
    actions: "Actions",
    addNode: "Add Node",
    loginState: "Login State",
    maxPerMinute: "Max Per Minute",
    method: "Method",
    mode: "Mode",
    name: "Name",
    new: "New",
    nodeEditor: "Node Editor",
    nodeEditorApi: "API branch",
    nodeEditorBrowser: "Browser step",
    nodeEditorEmpty: "No node selected",
    nodeEditorMain: "Main step",
    newProfile: "New Profile",
    newResource: "New Resource",
    newWorkflow: "New Workflow",
    noArtifacts: "No artifacts",
    noAuditRecords: "No audit records",
    noPicks: "No browser picks",
    noRegistryRecords: "No resources registered",
    noWorkflowSelected: "No workflow selected",
    nodeAdded: "Node added. Edit it to define the next step.",
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
    refreshPicks: "Refresh Picks",
    registry: "Registry",
    registryCenter: "Registry Center",
    registryCenterNote: "Register sites, pages, page actions, and reusable operations before composing workflows.",
    deleteResourceConfirm: "Delete this resource?",
    resourceDeleted: "Resource deleted",
    resourceIdRequired: "Resource ID is required",
    resourceSaved: "Resource saved",
    retry: "Retry",
    retryQueued: "Retry queued",
    runActivityCompleted: "Completed {step}",
    runActivityFailed: "Failed {step}: {error}",
    runActivityQueued: "Queued on {profile}",
    runActivityRunning: "Running {step}",
    runActivityStarting: "Starting {profile}; waiting for the first step event.",
    runActivityIdle: "Select a run to inspect live activity.",
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
    selectedPickApplied: "Picker event applied to node.",
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
    apply: "应用",
    applyLatestPick: "应用最新",
    browserPicker: "浏览器拾取",
    confidence: "置信度",
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
    extract: "提取路径",
    graph: "图谱",
    id: "ID",
    import: "导入",
    importedBundle: "已导入 {workflows} 个工作流、{profiles} 个 Profile 和 {registry} 套注册表",
    includes: "包含文本",
    input: "输入",
    key: "按键",
    language: "语言",
    layoutCompact: "紧凑",
    layoutGrouped: "分组",
    layoutSequence: "顺序",
    legendCompleted: "已完成",
    legendFailed: "失败",
    legendIdle: "空闲",
    legendRunning: "运行中",
    actionIds: "动作 ID",
    actionRegistry: "页面动作注册",
    actionType: "动作类型",
    actions: "动作",
    addNode: "新增节点",
    loginState: "登录态",
    maxPerMinute: "每分钟上限",
    method: "请求方法",
    mode: "模式",
    name: "名称",
    new: "新建",
    nodeEditor: "节点编辑",
    nodeEditorApi: "API 分支",
    nodeEditorBrowser: "浏览器步骤",
    nodeEditorEmpty: "未选择节点",
    nodeEditorMain: "主流程步骤",
    newProfile: "新建 Profile",
    newResource: "新建资源",
    newWorkflow: "新建工作流",
    noArtifacts: "暂无产物",
    noAuditRecords: "暂无审计记录",
    noPicks: "暂无浏览器拾取",
    noRegistryRecords: "暂无注册资源",
    noWorkflowSelected: "未选择工作流",
    nodeAdded: "节点已新增，请编辑它来定义下一步。",
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
    refreshPicks: "刷新拾取",
    registry: "注册中心",
    registryCenter: "注册中心",
    registryCenterNote: "先注册站点、页面、页面动作和可复用业务操作，再把它们编排成工作流。",
    deleteResourceConfirm: "确认删除这个资源吗？",
    resourceDeleted: "资源已删除",
    resourceIdRequired: "必须填写资源 ID",
    resourceSaved: "资源已保存",
    retry: "重试",
    retryQueued: "重试已入队",
    runActivityCompleted: "已完成 {step}",
    runActivityFailed: "{step} 失败：{error}",
    runActivityQueued: "已排队，Profile：{profile}",
    runActivityRunning: "正在执行 {step}",
    runActivityStarting: "正在启动 {profile}，等待第一个步骤事件。",
    runActivityIdle: "选择一条运行记录查看实时活动。",
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
    selectedPickApplied: "已把拾取结果应用到节点。",
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
  graphCanvas: document.querySelector("#graphCanvas"),
  graphEdges: document.querySelector("#graphEdges"),
  graphNodeLayer: document.querySelector("#graphNodeLayer"),
  graphZoomLevel: document.querySelector("#graphZoomLevel"),
  graphLayoutButtons: document.querySelectorAll("[data-graph-layout]"),
  graphNodeEditor: document.querySelector("#graphNodeEditor"),
  nodeEditorKind: document.querySelector("#nodeEditorKind"),
  nodeEditorEmpty: document.querySelector("#nodeEditorEmpty"),
  nodeEditorForm: document.querySelector("#nodeEditorForm"),
  nodeEditorId: document.querySelector("#nodeEditorId"),
  nodeEditorAction: document.querySelector("#nodeEditorAction"),
  nodeEditorName: document.querySelector("#nodeEditorName"),
  nodeEditorSelector: document.querySelector("#nodeEditorSelector"),
  refreshPickerButton: document.querySelector("#refreshPickerButton"),
  applyLatestPickButton: document.querySelector("#applyLatestPickButton"),
  latestPickerStatus: document.querySelector("#latestPickerStatus"),
  pickerEventList: document.querySelector("#pickerEventList"),
  nodeEditorUrl: document.querySelector("#nodeEditorUrl"),
  nodeEditorValue: document.querySelector("#nodeEditorValue"),
  nodeEditorKey: document.querySelector("#nodeEditorKey"),
  nodeEditorIncludes: document.querySelector("#nodeEditorIncludes"),
  nodeEditorMethod: document.querySelector("#nodeEditorMethod"),
  nodeEditorExtract: document.querySelector("#nodeEditorExtract"),
  nodeEditorJson: document.querySelector("#nodeEditorJson"),
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
  runActivity: document.querySelector("#runActivity"),
  runSummary: document.querySelector("#runSummary"),
  eventTimeline: document.querySelector("#eventTimeline"),
  artifactList: document.querySelector("#artifactList"),
  auditList: document.querySelector("#auditList"),
  importFile: document.querySelector("#importFile"),
  toast: document.querySelector("#toast")
};

setupResizableLayouts();

elements.languageToggle.addEventListener("click", () => setLanguage(state.language === "zh" ? "en" : "zh"));
document.querySelector("#autoLayoutButton").addEventListener("click", () => autoLayoutSelectedWorkflow());
document.querySelector("#saveGraphWorkflowButton").addEventListener("click", () => saveSelectedWorkflow());
document.querySelector("#refreshButton").addEventListener("click", () => refreshAll());
document.querySelector("#exportButton").addEventListener("click", () => exportBundle());
document.querySelector("#importButton").addEventListener("click", () => elements.importFile.click());
document.querySelector("#importFile").addEventListener("change", (event) => importBundle(event.target.files[0]));
document.querySelector("#runButton").addEventListener("click", () => runSelectedWorkflow());
document.querySelector("#saveWorkflowButton").addEventListener("click", () => saveSelectedWorkflow());
document.querySelector("#validateWorkflowButton").addEventListener("click", () => validateSelectedWorkflow());
document.querySelector("#newWorkflowButton").addEventListener("click", () => createBlankWorkflow());
document.querySelector("#addGraphNodeButton").addEventListener("click", () => addGraphNode());
elements.refreshPickerButton.addEventListener("click", async () => {
  await loadPickerEvents();
  renderPickerPanel();
});
elements.applyLatestPickButton.addEventListener("click", () => applyPickerEventToSelectedNode(state.pickerEvents[0]?.id));
elements.pickerEventList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-picker-apply]");
  if (button) {
    applyPickerEventToSelectedNode(button.dataset.pickerApply);
    return;
  }
  const row = event.target.closest("[data-picker-id]");
  if (!row) return;
  state.selectedPickerEventId = row.dataset.pickerId;
  renderPickerPanel();
});
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
elements.graphLayoutButtons.forEach((button) => {
  button.addEventListener("click", () => setGraphLayout(button.dataset.graphLayout));
});
NODE_EDITOR_FIELDS.forEach(({ element }) => {
  const control = elements[element];
  control.addEventListener("input", () => updateSelectedGraphNodeFromFields());
  control.addEventListener("change", () => updateSelectedGraphNodeFromFields());
});
elements.nodeEditorJson.addEventListener("input", () => updateSelectedGraphNodeFromJson());
elements.workflowJson.addEventListener("input", () => syncWorkflowJsonToGraph());
elements.workflowGraph.addEventListener("pointerdown", (event) => startGraphPan(event));
elements.workflowGraph.addEventListener("mousedown", (event) => startGraphPan(event));
elements.workflowGraph.addEventListener("wheel", (event) => handleGraphWheel(event), { passive: false });
elements.workflowGraph.addEventListener("gesturestart", (event) => startGraphGesture(event));
elements.workflowGraph.addEventListener("gesturechange", (event) => moveGraphGesture(event));
elements.workflowGraph.addEventListener("gestureend", () => endGraphGesture());
document.addEventListener("pointermove", (event) => {
  movePanelResize(event);
  if (state.resizeDrag) return;
  moveGraphNode(event);
  moveGraphPan(event);
});
document.addEventListener("mousemove", (event) => moveGraphPan(event));
document.addEventListener("pointerup", () => {
  endPanelResize();
  endGraphInteraction();
});
document.addEventListener("pointercancel", () => {
  endPanelResize();
  endGraphInteraction();
});
document.addEventListener("mouseup", () => endGraphPan());
updateGraphLayoutButtons();
updateGraphZoomLabel();

applyStaticTranslations();
await refreshAll();
startPolling();

async function refreshAll() {
  await Promise.all([loadRuntime(), loadRegistry(), loadWorkflows(), loadProfiles(), loadRuns(), loadAudit(), loadPickerEvents()]);
  if (!state.selectedWorkflowId && state.workflows[0]) selectWorkflow(state.workflows[0].id);
  if (!state.selectedProfileId && state.profiles[0]) selectProfile(state.profiles[0].id);
  if (!state.selectedRegistryId) selectDefaultRegistryItem();
  render();
  if (!state.selectedRunId && state.runs[0]) await selectRun(state.runs[0].id);
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

async function loadPickerEvents() {
  const data = await api("/api/picker/events?limit=10");
  state.pickerEvents = data.events ?? [];
  if (!state.selectedPickerEventId && state.pickerEvents[0]) {
    state.selectedPickerEventId = state.pickerEvents[0].id;
  }
}

function render() {
  renderRuntime();
  renderRegistry();
  renderWorkflows();
  renderProfiles();
  renderRuns();
  renderGraph();
  renderAudit();
  renderPickerPanel();
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
    const profile = run.profileName || run.profileId || t("noProfile");
    button.innerHTML = `
      <span class="row-title">${escapeHtml(run.workflowName)}</span>
      <span class="row-meta">${escapeHtml(statusLabel(run.status))} · ${escapeHtml(run.mode)} · ${escapeHtml(profile)} · ${formatTime(run.queuedAt)}</span>
    `;
    button.addEventListener("click", () => selectRun(run.id));
    elements.runList.append(button);
  }
}

function setupResizableLayouts() {
  for (const config of RESIZABLE_LAYOUTS) {
    const root = document.querySelector(config.root);
    if (!root) continue;
    const runtime = {
      config,
      root,
      panes: hydrateResizablePanes(config),
      handles: []
    };
    root.dataset.resizeLayout = config.id;
    resizableLayouts.set(config.id, runtime);

    for (const [paneId, paneConfig] of Object.entries(config.panes)) {
      const pane = root.querySelector(paneConfig.selector);
      pane?.classList.add("resizable-pane");
      applyResizablePane(runtime, paneId);
    }

    config.handles.forEach((handleConfig, index) => {
      const before = root.querySelector(handleConfig.before);
      if (!before) return;
      const handle = document.createElement("div");
      handle.className = "resize-handle";
      handle.dataset.resizeLayout = config.id;
      handle.dataset.handleIndex = String(index);
      handle.role = "separator";
      handle.tabIndex = 0;
      handle.title = `${config.panes[handleConfig.controls].label}: drag to resize, double-click to collapse or restore`;
      handle.addEventListener("pointerdown", (event) => startPanelResize(event, config.id, index));
      handle.addEventListener("dblclick", () => toggleResizablePane(config.id, handleConfig.controls));
      handle.addEventListener("keydown", (event) => handleResizeKey(event, config.id, index));
      before.after(handle);
      runtime.handles.push({ element: handle, config: handleConfig });
      updateResizeHandle(runtime, index);
    });
  }

  window.addEventListener("resize", updateAllResizeHandles);
}

function hydrateResizablePanes(config) {
  const saved = readResizeLayoutState(config.id);
  return Object.fromEntries(Object.entries(config.panes).map(([paneId, paneConfig]) => {
    const savedPane = saved[paneId] ?? {};
    const savedSize = Number(savedPane.size);
    const lastSize = Number(savedPane.lastSize);
    return [paneId, {
      collapsed: Boolean(savedPane.collapsed),
      size: Number.isFinite(savedSize) && savedSize > 0 ? savedSize : null,
      lastSize: Number.isFinite(lastSize) && lastSize > 0 ? lastSize : paneConfig.defaultSize
    }];
  }));
}

function readResizeLayoutState(layoutId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(resizeStorageKey(layoutId)) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveResizeLayoutState(runtime) {
  try {
    localStorage.setItem(resizeStorageKey(runtime.config.id), JSON.stringify(runtime.panes));
  } catch {
    // Layout persistence is best-effort; resizing still applies for the current session.
  }
}

function resizeStorageKey(layoutId) {
  return `${RESIZE_STORAGE_PREFIX}:${layoutId}`;
}

function startPanelResize(event, layoutId, handleIndex) {
  if (event.button !== 0) return;
  const runtime = resizableLayouts.get(layoutId);
  const handle = runtime?.handles[handleIndex];
  if (!runtime || !handle) return;
  event.preventDefault();
  event.stopPropagation();
  const axis = resizeAxis(handle.config);
  const paneId = handle.config.controls;
  state.resizeDrag = {
    layoutId,
    handleIndex,
    paneId,
    axis,
    direction: handle.config.direction,
    startPointer: resizePointer(event, axis),
    startSize: currentResizablePaneSize(runtime, paneId, axis)
  };
  handle.element.classList.add("dragging");
  document.body.classList.add(axis === "x" ? "resizing-x" : "resizing-y");
  try {
    handle.element.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture may fail if the pointer is already released.
  }
}

function movePanelResize(event) {
  if (!state.resizeDrag) return;
  event.preventDefault();
  const runtime = resizableLayouts.get(state.resizeDrag.layoutId);
  if (!runtime) return;
  const delta = resizePointer(event, state.resizeDrag.axis) - state.resizeDrag.startPointer;
  const nextSize = state.resizeDrag.startSize + delta * state.resizeDrag.direction;
  setResizablePaneSize(runtime, state.resizeDrag.paneId, nextSize);
}

function endPanelResize() {
  if (!state.resizeDrag) return;
  const runtime = resizableLayouts.get(state.resizeDrag.layoutId);
  const handle = runtime?.handles[state.resizeDrag.handleIndex]?.element;
  handle?.classList.remove("dragging");
  document.body.classList.remove("resizing-x", "resizing-y");
  state.resizeDrag = null;
}

function handleResizeKey(event, layoutId, handleIndex) {
  const runtime = resizableLayouts.get(layoutId);
  const handle = runtime?.handles[handleIndex];
  if (!runtime || !handle) return;
  const axis = resizeAxis(handle.config);
  const isDecrease = event.key === "ArrowLeft" || event.key === "ArrowUp";
  const isIncrease = event.key === "ArrowRight" || event.key === "ArrowDown";
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleResizablePane(layoutId, handle.config.controls);
    return;
  }
  if (!isDecrease && !isIncrease) return;
  event.preventDefault();
  const sign = isIncrease ? 1 : -1;
  const current = currentResizablePaneSize(runtime, handle.config.controls, axis);
  setResizablePaneSize(runtime, handle.config.controls, current + sign * RESIZE_STEP * handle.config.direction);
}

function setResizablePaneSize(runtime, paneId, rawSize, { forceOpen = false } = {}) {
  const paneConfig = runtime.config.panes[paneId];
  const paneState = runtime.panes[paneId];
  if (!paneConfig || !paneState) return;

  const shouldCollapse = !forceOpen && rawSize <= paneConfig.collapseAt;
  if (shouldCollapse) {
    if (!paneState.collapsed) paneState.lastSize = Math.max(paneState.size ?? rawSize, paneConfig.defaultSize);
    paneState.collapsed = true;
    paneState.size = null;
  } else {
    const nextSize = Math.max(rawSize, paneConfig.minSize);
    paneState.collapsed = false;
    paneState.size = nextSize;
    paneState.lastSize = nextSize;
  }

  applyResizablePane(runtime, paneId);
  saveResizeLayoutState(runtime);
}

function toggleResizablePane(layoutId, paneId) {
  const runtime = resizableLayouts.get(layoutId);
  const paneConfig = runtime?.config.panes[paneId];
  const paneState = runtime?.panes[paneId];
  if (!runtime || !paneConfig || !paneState) return;
  if (paneState.collapsed) {
    paneState.collapsed = false;
    paneState.size = Math.max(paneState.lastSize ?? paneConfig.defaultSize, paneConfig.minSize);
  } else {
    paneState.lastSize = currentResizablePaneSize(runtime, paneId, "x");
    paneState.collapsed = true;
    paneState.size = null;
  }
  applyResizablePane(runtime, paneId);
  saveResizeLayoutState(runtime);
}

function ensureResizablePaneOpen(layoutId, paneId) {
  const runtime = resizableLayouts.get(layoutId);
  const paneConfig = runtime?.config.panes[paneId];
  const paneState = runtime?.panes[paneId];
  if (!runtime || !paneConfig || !paneState?.collapsed) return;
  paneState.collapsed = false;
  paneState.size = Math.max(paneState.lastSize ?? paneConfig.defaultSize, paneConfig.minSize);
  applyResizablePane(runtime, paneId);
  saveResizeLayoutState(runtime);
}

function applyResizablePane(runtime, paneId) {
  const paneConfig = runtime.config.panes[paneId];
  const paneState = runtime.panes[paneId];
  const pane = runtime.root.querySelector(paneConfig.selector);
  if (!pane || !paneState) return;

  pane.classList.toggle("is-collapsed", paneState.collapsed);
  if (paneState.collapsed) {
    runtime.root.style.setProperty(paneConfig.variable, "0px");
  } else if (paneState.size == null) {
    runtime.root.style.removeProperty(paneConfig.variable);
  } else {
    runtime.root.style.setProperty(paneConfig.variable, `${Math.round(paneState.size)}px`);
  }
  updateAllResizeHandlesForLayout(runtime);
}

function updateAllResizeHandles() {
  resizableLayouts.forEach(updateAllResizeHandlesForLayout);
}

function updateAllResizeHandlesForLayout(runtime) {
  runtime.handles.forEach((_, index) => updateResizeHandle(runtime, index));
}

function updateResizeHandle(runtime, handleIndex) {
  const handle = runtime.handles[handleIndex];
  if (!handle) return;
  const axis = resizeAxis(handle.config);
  const paneState = runtime.panes[handle.config.controls];
  handle.element.dataset.axis = axis;
  handle.element.dataset.collapsed = String(Boolean(paneState?.collapsed));
  handle.element.setAttribute("aria-orientation", axis === "x" ? "vertical" : "horizontal");
}

function resizeAxis(handleConfig) {
  return typeof handleConfig.axis === "function" ? handleConfig.axis() : handleConfig.axis;
}

function resizePointer(event, axis) {
  return axis === "x" ? event.clientX : event.clientY;
}

function currentResizablePaneSize(runtime, paneId, axis) {
  const paneConfig = runtime.config.panes[paneId];
  const paneState = runtime.panes[paneId];
  if (paneState?.collapsed) return 0;
  if (paneState?.size != null) return paneState.size;
  const pane = runtime.root.querySelector(paneConfig.selector);
  const rect = pane?.getBoundingClientRect();
  if (!rect) return paneConfig.defaultSize;
  return axis === "x" ? rect.width : rect.height;
}

function renderGraph() {
  const workflow = currentWorkflowRecord();
  if (!workflow) {
    setGraphCanvasSize({ width: 780, height: 540 });
    elements.graphNodeLayer.innerHTML = `<div class="graph-empty">${escapeHtml(t("noWorkflowSelected"))}</div>`;
    elements.graphEdges.innerHTML = "";
    renderGraphNodeEditor();
    return;
  }

  const graph = buildGraphData(workflow.workflow);
  if (state.selectedGraphNodeId && !graph.nodes.some((node) => node.id === state.selectedGraphNodeId)) {
    state.selectedGraphNodeId = null;
  }
  const statusByStep = buildStepStatusMap(
    state.selectedRunDetail?.run?.workflowId === workflow.id ? state.selectedRunDetail.events : []
  );
  const positions = loadGraphPositions(workflow.id, graph.nodes);
  state.graphPositions = positions;
  const size = graphCanvasSize(graph.nodes, positions);

  setGraphCanvasSize(size);
  elements.graphNodeLayer.innerHTML = "";

  for (const node of graph.nodes) {
    const position = positions[node.id];
    const status = statusByStep[node.id] ?? "idle";
    const item = document.createElement("div");
    item.className = [
      "workflow-node",
      node.depth ? "child" : "root",
      statusClassForNode(status),
      node.id === state.selectedGraphNodeId ? "selected" : ""
    ].filter(Boolean).join(" ");
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
    item.addEventListener("click", (event) => {
      event.stopPropagation();
      selectGraphNode(node.id);
    });
    elements.graphNodeLayer.append(item);
  }

  renderGraphEdges(graph.edges, positions, size);
  centerGraphViewportIfNeeded(workflow.id, graph.nodes, positions);
  renderGraphNodeEditor();
}

function currentWorkflowRecord() {
  return state.workflows.find((item) => item.id === state.selectedWorkflowId) ?? null;
}

function readWorkflowDraft({ silent = false } = {}) {
  try {
    const workflow = parseJson(elements.workflowJson.value, "Workflow");
    elements.workflowJson.classList.remove("invalid");
    return workflow;
  } catch (error) {
    elements.workflowJson.classList.add("invalid");
    if (!silent) showToast(error.message);
    return null;
  }
}

function commitWorkflowDraft(workflow, { syncTextarea = true } = {}) {
  const current = currentWorkflowRecord();
  if (current) current.workflow = workflow;
  if (syncTextarea) elements.workflowJson.value = formatJson(workflow);
  elements.workflowJson.classList.remove("invalid");
}

function syncWorkflowJsonToGraph() {
  const workflow = readWorkflowDraft({ silent: true });
  if (!workflow || typeof workflow !== "object") return;
  commitWorkflowDraft(workflow, { syncTextarea: false });
  renderGraph();
}

function selectGraphNode(nodeId, { renderGraphView = true } = {}) {
  ensureResizablePaneOpen("graph", "nodeEditor");
  state.selectedGraphNodeId = nodeId;
  if (renderGraphView) {
    renderGraph();
    revealGraphNodeEditor();
    return;
  }
  updateGraphNodeSelection();
  renderGraphNodeEditor();
  revealGraphNodeEditor();
}

function updateGraphNodeSelection() {
  elements.graphNodeLayer.querySelectorAll(".workflow-node").forEach((node) => {
    node.classList.toggle("selected", node.dataset.nodeId === state.selectedGraphNodeId);
  });
}

function renderGraphNodeEditor() {
  const match = state.selectedGraphNodeId
    ? findWorkflowNode(currentWorkflowRecord()?.workflow, state.selectedGraphNodeId)
    : null;
  const hasSelection = Boolean(match);
  elements.nodeEditorEmpty.hidden = hasSelection;
  elements.nodeEditorForm.hidden = !hasSelection;

  if (!match) {
    elements.nodeEditorKind.textContent = t("nodeEditor");
    elements.nodeEditorKind.className = "pill muted";
    renderPickerPanel();
    return;
  }

  state.nodeEditorSyncing = true;
  try {
    elements.nodeEditorKind.textContent = nodeEditorKindLabel(match.kind);
    elements.nodeEditorKind.className = `pill ${match.kind === "api" ? "warning" : match.kind === "browser" ? "" : "muted"}`;
    for (const field of NODE_EDITOR_FIELDS) {
      const control = elements[field.element];
      const value = readNodeEditorField(match.step, field);
      if (control.tagName === "SELECT") ensureSelectOption(control, value);
      control.value = value;
      control.classList.remove("invalid");
    }
    elements.nodeEditorJson.value = formatJson(match.step);
    elements.nodeEditorJson.classList.remove("invalid");
    renderPickerPanel();
  } finally {
    state.nodeEditorSyncing = false;
  }
}

function renderPickerPanel() {
  if (!elements.pickerEventList) return;
  const hasSelection = Boolean(state.selectedGraphNodeId && findWorkflowNode(currentWorkflowRecord()?.workflow, state.selectedGraphNodeId));
  elements.applyLatestPickButton.disabled = !hasSelection || !state.pickerEvents.length;
  const latest = state.pickerEvents[0] ?? null;
  elements.latestPickerStatus.textContent = latest
    ? `${latest.confidence ?? 0}% · ${latest.recommendedSelector || "-"}`
    : t("noPicks");
  elements.pickerEventList.innerHTML = "";

  if (!state.pickerEvents.length) {
    elements.pickerEventList.innerHTML = `<div class="picker-empty">${escapeHtml(t("noPicks"))}</div>`;
    return;
  }

  for (const pickerEvent of state.pickerEvents.slice(0, 5)) {
    const row = document.createElement("div");
    const selected = pickerEvent.id === state.selectedPickerEventId;
    row.className = `picker-event-row ${selected ? "active" : ""}`;
    row.dataset.pickerId = pickerEvent.id;
    const bestCandidate = pickerEvent.selectorCandidates?.[0] ?? null;
    const matchInfo = bestCandidate
      ? `${bestCandidate.matchCount ?? "-"} / ${bestCandidate.visibleCount ?? "-"}`
      : "-";
    row.innerHTML = `
      <div class="picker-event-main">
        <strong>${escapeHtml(pickerEvent.recommendedSelector || "-")}</strong>
        <span>${escapeHtml(pickerEvent.pickedFrom?.title || pickerEvent.pickedFrom?.url || "-")}</span>
      </div>
      <div class="picker-event-meta">
        <span>${escapeHtml(t("confidence"))}: ${escapeHtml(String(pickerEvent.confidence ?? 0))}%</span>
        <span>${escapeHtml(pickerEvent.suggestedAction || "click")}</span>
        <span>${escapeHtml(matchInfo)}</span>
        <button class="compact-button" type="button" data-picker-apply="${escapeHtml(pickerEvent.id)}">${escapeHtml(t("apply"))}</button>
      </div>
    `;
    elements.pickerEventList.append(row);
  }
}

function applyPickerEventToSelectedNode(pickerEventId) {
  if (!pickerEventId || !state.selectedGraphNodeId) return;
  const pickerEvent = state.pickerEvents.find((item) => item.id === pickerEventId);
  if (!pickerEvent) return;
  const workflow = readWorkflowDraft();
  if (!workflow) return;
  const match = findWorkflowNode(workflow, state.selectedGraphNodeId);
  if (!match) return;

  const previousId = String(match.step.id ?? "");
  const selector = pickerEvent.recommendedSelector || pickerEvent.selectorCandidates?.[0]?.selector;
  if (selector) match.step.selector = selector;
  if (!["click", "fill", "press", "extract", "waitFor"].includes(match.step.action)) {
    match.step.action = pickerEvent.suggestedAction || "click";
  }
  if (match.step.action === "fill" && match.step.value == null) {
    match.step.value = "{{input.query}}";
  }
  if (match.step.action === "press" && !match.step.key) {
    match.step.key = "Enter";
  }
  match.step.targetIdentity = pickerEvent.targetIdentity;
  match.step.selectorCandidates = pickerEvent.selectorCandidates ?? [];
  match.step.pickedFrom = pickerEvent.pickedFrom;
  state.selectedPickerEventId = pickerEvent.id;
  commitGraphNodeEdit(workflow, previousId, String(match.step.id ?? previousId));
  showToast(t("selectedPickApplied"));
}

function addGraphNode() {
  const workflow = readWorkflowDraft();
  if (!workflow || !Array.isArray(workflow.steps)) return;

  const match = state.selectedGraphNodeId ? findWorkflowNode(workflow, state.selectedGraphNodeId) : null;
  const newStep = createGraphNodeStep(workflow, match);
  insertGraphNodeStep(workflow, match, newStep);

  state.selectedGraphNodeId = newStep.id;
  commitWorkflowDraft(workflow);
  if (state.selectedWorkflowId) saveGraphPositions(state.selectedWorkflowId, state.graphPositions);
  renderGraph();
  revealGraphNodeEditor();
  showToast(t("nodeAdded"));
}

function createGraphNodeStep(workflow, match) {
  const topLevel = match?.kind !== "browser";
  const base = topLevel ? "next-step" : `${workflow.steps?.[match.topIndex]?.id ?? "operation"}.next-step`;
  return {
    id: uniqueWorkflowStepId(workflow, base),
    action: "checkpoint",
    label: topLevel ? "Next step" : "Next browser step"
  };
}

function insertGraphNodeStep(workflow, match, newStep) {
  if (match?.kind === "browser") {
    const operation = workflow.steps[match.topIndex];
    if (!Array.isArray(operation.browserSteps)) operation.browserSteps = [];
    operation.browserSteps.splice(match.childIndex + 1, 0, newStep);
    return;
  }

  const insertAt = match ? match.topIndex + 1 : workflow.steps.length;
  workflow.steps.splice(insertAt, 0, newStep);
}

function uniqueWorkflowStepId(workflow, base) {
  const existing = collectWorkflowStepIds(workflow);
  const normalizedBase = slugify(base || "next-step") || "next-step";
  if (!existing.has(normalizedBase)) return normalizedBase;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${normalizedBase}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${normalizedBase}-${Date.now().toString(36)}`;
}

function collectWorkflowStepIds(workflow) {
  const ids = new Set();
  for (const step of workflow.steps ?? []) {
    collectWorkflowStepId(step, ids);
  }
  return ids;
}

function collectWorkflowStepId(step, ids) {
  if (!step || typeof step !== "object") return;
  if (step.id) ids.add(String(step.id));
  for (const child of step.browserSteps ?? []) {
    collectWorkflowStepId(child, ids);
  }
  if (step.api) collectWorkflowStepId(step.api, ids);
}

function revealGraphNodeEditor() {
  requestAnimationFrame(() => {
    const editor = elements.graphNodeEditor;
    const rect = editor.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= 0 && rect.bottom <= viewportHeight) return;
    editor.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

function nodeEditorKindLabel(kind) {
  if (kind === "api") return t("nodeEditorApi");
  if (kind === "browser") return t("nodeEditorBrowser");
  return t("nodeEditorMain");
}

function findWorkflowNode(workflow, nodeId) {
  const id = String(nodeId ?? "");
  if (!id || !Array.isArray(workflow?.steps)) return null;

  for (const [topIndex, step] of workflow.steps.entries()) {
    if (String(step.id ?? "") === id) return { step, kind: "main", topIndex, childIndex: null };
    if (step.action !== "operation") continue;

    for (const [childIndex, child] of (step.browserSteps ?? []).entries()) {
      if (String(child.id ?? "") === id) return { step: child, kind: "browser", topIndex, childIndex };
    }

    if (String(step.api?.id ?? "") === id) {
      return { step: step.api, kind: "api", topIndex, childIndex: (step.browserSteps ?? []).length };
    }
  }
  return null;
}

function updateSelectedGraphNodeFromFields() {
  if (state.nodeEditorSyncing || !state.selectedGraphNodeId) return;
  const workflow = readWorkflowDraft();
  if (!workflow) return;

  const match = findWorkflowNode(workflow, state.selectedGraphNodeId);
  if (!match) return;
  const previousId = String(match.step.id ?? "");

  for (const field of NODE_EDITOR_FIELDS) {
    writeNodeEditorField(match.step, field, elements[field.element].value);
  }

  commitGraphNodeEdit(workflow, previousId, String(match.step.id ?? previousId));
}

function updateSelectedGraphNodeFromJson() {
  if (state.nodeEditorSyncing || !state.selectedGraphNodeId) return;
  const workflow = readWorkflowDraft();
  if (!workflow) return;

  const match = findWorkflowNode(workflow, state.selectedGraphNodeId);
  if (!match) return;

  let nextStep;
  try {
    nextStep = JSON.parse(elements.nodeEditorJson.value || "{}");
    if (!nextStep || typeof nextStep !== "object" || Array.isArray(nextStep)) throw new Error("Node must be an object");
    elements.nodeEditorJson.classList.remove("invalid");
  } catch {
    elements.nodeEditorJson.classList.add("invalid");
    return;
  }

  const previousId = String(match.step.id ?? "");
  const previousAction = match.step.action;
  if (!nextStep.id) nextStep.id = previousId;
  if (!nextStep.action) nextStep.action = previousAction;
  replaceObjectContents(match.step, nextStep);
  commitGraphNodeEdit(workflow, previousId, String(match.step.id ?? previousId));
}

function commitGraphNodeEdit(workflow, previousId, nextId) {
  const normalizedNextId = nextId || previousId;
  if (previousId && normalizedNextId && previousId !== normalizedNextId) {
    transferGraphNodePosition(previousId, normalizedNextId);
    transferOperationModeKey(previousId, normalizedNextId);
  }

  state.selectedGraphNodeId = normalizedNextId;
  commitWorkflowDraft(workflow);
  if (state.selectedWorkflowId) saveGraphPositions(state.selectedWorkflowId, state.graphPositions);
  renderGraph();
}

function transferGraphNodePosition(previousId, nextId) {
  if (!state.graphPositions[previousId]) return;
  if (!state.graphPositions[nextId]) state.graphPositions[nextId] = state.graphPositions[previousId];
  delete state.graphPositions[previousId];
}

function transferOperationModeKey(previousId, nextId) {
  try {
    const modes = parseJson(elements.operationModesJson.value, "Operation Modes");
    if (!Object.hasOwn(modes, previousId) || Object.hasOwn(modes, nextId)) return;
    modes[nextId] = modes[previousId];
    delete modes[previousId];
    elements.operationModesJson.value = formatJson(modes);
    const context = parseJson(elements.runContextJson.value, "Context");
    context.operationModes = modes;
    elements.runContextJson.value = formatJson(context);
  } catch {
    // Operation mode migration is best-effort; workflow editing should not block on run config JSON.
  }
}

function readNodeEditorField(step, field) {
  if (field.read) return String(field.read(step) ?? "");
  return fieldValueToInput(step[field.field]);
}

function writeNodeEditorField(step, field, value) {
  if (field.write) {
    field.write(step, value);
    return;
  }
  const nextValue = inputToFieldValue(value, { parseJsonLike: field.parseJsonLike });
  if (nextValue === undefined) {
    delete step[field.field];
  } else {
    step[field.field] = nextValue;
  }
}

function writeAliasField(step, fields, value) {
  const nextValue = value.trim();
  if (!nextValue) {
    fields.forEach((field) => delete step[field]);
    return;
  }
  const existingField = fields.find((field) => Object.hasOwn(step, field)) ?? fields[0];
  step[existingField] = nextValue;
}

function fieldValueToInput(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return formatJson(value);
}

function inputToFieldValue(value, { parseJsonLike = false } = {}) {
  const text = value.trim();
  if (!text) return undefined;
  if (!parseJsonLike || !/^[{\[]/.test(text)) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function replaceObjectContents(target, source) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, structuredCloneSafe(source));
}

function ensureSelectOption(select, value) {
  if ([...select.options].some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  select.append(option);
}

function buildGraphData(workflow) {
  const nodes = [];
  const edges = [];
  let previousTopLevel = null;
  for (const [topIndex, step] of (workflow.steps ?? []).entries()) {
    nodes.push(createGraphNode(step, { depth: 0, topIndex, childIndex: 0, branch: "main", kind: "main" }));
    if (previousTopLevel) edges.push({ from: previousTopLevel, to: step.id, kind: "main" });
    previousTopLevel = step.id;

    if (step.action === "operation") {
      let previousBrowserStep = null;
      for (const [childIndex, child] of (step.browserSteps ?? []).entries()) {
        nodes.push(createGraphNode(child, { depth: 1, topIndex, childIndex, branch: "browser", kind: "browser" }));
        edges.push({ from: step.id, to: child.id, kind: "branch" });
        if (previousBrowserStep) edges.push({ from: previousBrowserStep, to: child.id, kind: "branch" });
        previousBrowserStep = child.id;
      }
      if (step.api) {
        nodes.push(createGraphNode(step.api, {
          depth: 1,
          topIndex,
          childIndex: (step.browserSteps ?? []).length,
          branch: "api",
          kind: "api"
        }));
        edges.push({ from: step.id, to: step.api.id, kind: "branch" });
      }
    }
  }
  return { nodes, edges };
}

function createGraphNode(step, { depth, topIndex, childIndex, branch, kind }) {
  return {
    id: step.id,
    action: step.action,
    step,
    depth,
    topIndex,
    childIndex,
    branch,
    kind,
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
  const workflow = state.workflows.find((item) => item.id === workflowId);
  const savedGraphPositions = workflow?.graph?.layouts?.[state.graphLayout]?.positions;
  if (hasGraphPositions(savedGraphPositions)) {
    const positions = mergeGraphPositions(nodes, defaults, savedGraphPositions);
    if (shouldRebaseGraphPositions(nodes, savedGraphPositions)) {
      syncGraphPositionsToWorkflow(workflowId, positions);
    }
    return positions;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(graphStorageKey(workflowId)) || "{}");
    const positions = mergeGraphPositions(nodes, defaults, saved);
    if (shouldRebaseGraphPositions(nodes, saved)) {
      saveGraphPositions(workflowId, positions);
    }
    return positions;
  } catch {
    return defaults;
  }
}

function mergeGraphPositions(nodes, defaults, saved) {
  const positions = rebaseGraphPositionsIfNeeded(nodes, normalizeGraphPositions(saved));
  return Object.fromEntries(nodes.map((node) => [node.id, positions[node.id] ?? defaults[node.id]]));
}

function rebaseGraphPositionsIfNeeded(nodes, positions) {
  if (!shouldRebaseGraphPositions(nodes, positions)) return positions;
  const bounds = graphContentBounds(nodes, positions);
  const offsetX = Math.max(0, bounds.minX - GRAPH_CANVAS_MARGIN);
  const offsetY = Math.max(0, bounds.minY - GRAPH_CANVAS_MARGIN);
  return Object.fromEntries(Object.entries(positions).map(([nodeId, point]) => [nodeId, {
    x: Math.round(point.x - offsetX),
    y: Math.round(point.y - offsetY)
  }]));
}

function shouldRebaseGraphPositions(nodes, positions) {
  const normalized = normalizeGraphPositions(positions);
  if (!hasGraphPositions(normalized)) return false;
  const bounds = graphContentBounds(nodes, normalized);
  const defaultBounds = graphContentBounds(nodes, defaultGraphPositions(nodes));
  const maxExpectedX = Math.max(GRAPH_CANVAS_MARGIN * 8, defaultBounds.width * 2);
  const maxExpectedY = Math.max(GRAPH_CANVAS_MARGIN * 8, defaultBounds.height * 2);
  return bounds.minX > maxExpectedX || bounds.minY > maxExpectedY;
}

function hasGraphPositions(positions) {
  return Object.keys(normalizeGraphPositions(positions)).length > 0;
}

function normalizeGraphPositions(positions = {}) {
  if (!positions || typeof positions !== "object") return {};
  return Object.fromEntries(
    Object.entries(positions)
      .map(([nodeId, point]) => [nodeId, { x: Number(point?.x), y: Number(point?.y) }])
      .filter(([nodeId, point]) => nodeId && Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}

function normalizeWorkflowGraphRecord(graph = {}) {
  const layouts = {};
  const rawLayouts = graph && typeof graph === "object" && graph.layouts && typeof graph.layouts === "object"
    ? graph.layouts
    : {};

  for (const [layout, layoutRecord] of Object.entries(rawLayouts)) {
    if (!layoutRecord || typeof layoutRecord !== "object") continue;
    layouts[layout] = {
      positions: normalizeGraphPositions(layoutRecord.positions),
      updatedAt: typeof layoutRecord.updatedAt === "string" ? layoutRecord.updatedAt : null
    };
  }

  return {
    version: Number(graph?.version) || 1,
    layout: typeof graph?.layout === "string" ? graph.layout : state.graphLayout,
    layouts
  };
}

function workflowGraphWithPositions(graph, layout, positions) {
  const normalized = normalizeWorkflowGraphRecord(graph);
  normalized.layout = layout;
  normalized.layouts[layout] = {
    positions: normalizeGraphPositions(positions),
    updatedAt: new Date().toISOString()
  };
  return normalized;
}

function syncGraphPositionsToWorkflow(workflowId, positions) {
  const workflow = state.workflows.find((item) => item.id === workflowId);
  if (!workflow) return null;
  workflow.graph = workflowGraphWithPositions(workflow.graph, state.graphLayout, positions);
  return workflow.graph;
}

function syncGraphLayoutToWorkflow(workflowId, layout) {
  const workflow = state.workflows.find((item) => item.id === workflowId);
  if (!workflow) return null;
  workflow.graph = {
    ...normalizeWorkflowGraphRecord(workflow.graph),
    layout
  };
  return workflow.graph;
}

function graphRecordForSave() {
  const workflow = currentWorkflowRecord();
  return {
    ...normalizeWorkflowGraphRecord(workflow?.graph ?? {}),
    layout: state.graphLayout
  };
}

function defaultGraphPositions(nodes) {
  const layoutConfig = graphLayoutConfig();
  const groups = graphLayoutGroups(nodes, layoutConfig);
  const contentWidth = Math.max(
    GRAPH_MIN_CONTENT_WIDTH,
    groups.reduce((sum, group) => sum + group.width, 0) + Math.max(0, groups.length - 1) * layoutConfig.groupGap
  );
  const startX = GRAPH_CANVAS_MARGIN;
  const startY = GRAPH_CANVAS_MARGIN;
  let cursorX = startX;
  const positions = {};

  for (const group of groups) {
    const mainX = Math.round(cursorX + (group.width - GRAPH_NODE_WIDTH) / 2);
    positions[group.main.id] = { x: mainX, y: startY };
    const gridWidth = group.childColumnCount > 0
      ? (group.childColumnCount - 1) * layoutConfig.childColumnStep + GRAPH_CHILD_NODE_WIDTH
      : GRAPH_NODE_WIDTH;
    const childStartX = Math.round(cursorX + (group.width - gridWidth) / 2);

    for (const child of group.children) {
      const column = child.childIndex % group.childColumnCount;
      const row = Math.floor(child.childIndex / group.childColumnCount);
      positions[child.id] = {
        x: childStartX + column * layoutConfig.childColumnStep,
        y: startY + layoutConfig.mainToBranchY + row * layoutConfig.childRowStep
      };
    }

    cursorX += group.width + layoutConfig.groupGap;
  }

  return positions;
}

function graphLayoutGroups(nodes, layoutConfig) {
  const topLevelNodes = nodes
    .filter((node) => node.depth === 0)
    .sort((left, right) => left.topIndex - right.topIndex);

  return topLevelNodes.map((main) => {
    const children = nodes
      .filter((node) => node.depth > 0 && node.topIndex === main.topIndex)
      .sort((left, right) => left.childIndex - right.childIndex);
    const childColumnCount = graphChildColumnCount(children.length, layoutConfig);
    const childRowCount = children.length ? Math.ceil(children.length / childColumnCount) : 0;
    const childGridWidth = children.length
      ? (childColumnCount - 1) * layoutConfig.childColumnStep + GRAPH_CHILD_NODE_WIDTH
      : GRAPH_NODE_WIDTH;
    const width = Math.max(layoutConfig.groupMinWidth, childGridWidth + layoutConfig.groupPadding);
    const height = children.length
      ? layoutConfig.mainToBranchY + (childRowCount - 1) * layoutConfig.childRowStep + GRAPH_NODE_HEIGHT
      : GRAPH_NODE_HEIGHT;

    return { main, children, childColumnCount, width, height };
  });
}

function graphLayoutConfig() {
  return GRAPH_LAYOUT_CONFIGS[state.graphLayout] ?? GRAPH_LAYOUT_CONFIGS.sequence;
}

function graphChildColumnCount(childCount, layoutConfig) {
  if (!childCount) return 1;
  if (layoutConfig.childColumns === "all") return childCount;
  return Math.min(childCount, Math.max(2, Math.ceil(Math.sqrt(childCount))));
}

function graphContentBounds(nodes, positions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const position = positions[node.id];
    if (!position) continue;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + GRAPH_NODE_WIDTH);
    maxY = Math.max(maxY, position.y + GRAPH_NODE_HEIGHT);
  }

  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      minY: 0,
      maxX: GRAPH_MIN_CONTENT_WIDTH,
      maxY: GRAPH_MIN_CONTENT_HEIGHT,
      width: GRAPH_MIN_CONTENT_WIDTH,
      height: GRAPH_MIN_CONTENT_HEIGHT,
      centerX: GRAPH_MIN_CONTENT_WIDTH / 2,
      centerY: GRAPH_MIN_CONTENT_HEIGHT / 2
    };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(GRAPH_MIN_CONTENT_WIDTH, maxX - minX),
    height: Math.max(GRAPH_MIN_CONTENT_HEIGHT, maxY - minY),
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2
  };
}

function graphCanvasAxisSize(contentSize) {
  return Math.round((contentSize + GRAPH_CANVAS_MARGIN * 2) * GRAPH_CANVAS_SCALE);
}

function graphCanvasSize(nodes, positions) {
  const bounds = graphContentBounds(nodes, positions);
  return {
    width: Math.max(graphCanvasAxisSize(bounds.width), bounds.centerX * 2, bounds.maxX + GRAPH_CANVAS_MARGIN),
    height: Math.max(graphCanvasAxisSize(bounds.height), bounds.centerY * 2, bounds.maxY + GRAPH_CANVAS_MARGIN)
  };
}

function setGraphCanvasSize(size) {
  state.graphSize = size;
  const scaledWidth = Math.round(size.width * state.graphZoom);
  const scaledHeight = Math.round(size.height * state.graphZoom);
  elements.graphCanvas.style.width = `${scaledWidth}px`;
  elements.graphCanvas.style.height = `${scaledHeight}px`;
  elements.graphCanvas.style.setProperty("--graph-grid-size", `${Math.max(8, 28 * state.graphZoom)}px`);
  for (const element of [elements.graphEdges, elements.graphNodeLayer]) {
    element.style.width = `${size.width}px`;
    element.style.height = `${size.height}px`;
    element.style.transform = `scale(${state.graphZoom})`;
  }
  updateGraphZoomLabel();
}

function centerGraphViewportIfNeeded(workflowId, nodes, positions) {
  if (state.graphViewportCenterKey !== workflowId) return;
  state.graphViewportCenterKey = null;
  const bounds = graphContentBounds(nodes, positions);
  requestAnimationFrame(() => {
    const maxLeft = Math.max(0, elements.workflowGraph.scrollWidth - elements.workflowGraph.clientWidth);
    const maxTop = Math.max(0, elements.workflowGraph.scrollHeight - elements.workflowGraph.clientHeight);
    elements.workflowGraph.scrollLeft = clamp(bounds.centerX * state.graphZoom - elements.workflowGraph.clientWidth / 2, 0, maxLeft);
    elements.workflowGraph.scrollTop = clamp(bounds.centerY * state.graphZoom - elements.workflowGraph.clientHeight / 2, 0, maxTop);
  });
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
  state.graphViewportCenterKey = workflow.id;
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
  selectGraphNode(nodeId, { renderGraphView: false });
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
  event.preventDefault();
  const { nodeId, startX, startY, originX, originY } = state.graphDrag;
  const next = {
    x: Math.max(16, originX + (event.clientX - startX) / state.graphZoom),
    y: Math.max(16, originY + (event.clientY - startY) / state.graphZoom)
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
    setGraphCanvasSize(size);
    renderGraphEdges(graph.edges, state.graphPositions, size);
  }
}

function startGraphPan(event) {
  if (event.button !== 0 || event.target.closest(".workflow-node")) return;
  if (!elements.graphCanvas.contains(event.target)) return;
  event.preventDefault();
  state.graphPan = {
    startX: event.clientX,
    startY: event.clientY,
    originLeft: elements.workflowGraph.scrollLeft,
    originTop: elements.workflowGraph.scrollTop
  };
  elements.workflowGraph.classList.add("panning");
}

function moveGraphPan(event) {
  if (!state.graphPan) return;
  event.preventDefault();
  const deltaX = event.clientX - state.graphPan.startX;
  const deltaY = event.clientY - state.graphPan.startY;
  elements.workflowGraph.scrollLeft = state.graphPan.originLeft - deltaX;
  elements.workflowGraph.scrollTop = state.graphPan.originTop - deltaY;
}

function endGraphInteraction() {
  endGraphDrag();
  endGraphPan();
  endGraphGesture();
}

function endGraphDrag() {
  if (!state.graphDrag) return;
  const workflowId = state.graphDrag.workflowId;
  const node = elements.graphNodeLayer.querySelector(`[data-node-id="${cssEscape(state.graphDrag.nodeId)}"]`);
  node?.classList.remove("dragging");
  state.graphDrag = null;
  saveGraphPositions(workflowId, state.graphPositions);
}

function endGraphPan() {
  if (!state.graphPan) return;
  state.graphPan = null;
  elements.workflowGraph.classList.remove("panning");
}

function handleGraphWheel(event) {
  if (!state.graphSize) return;
  event.preventDefault();
  const nextZoom = state.graphZoom * Math.exp(-event.deltaY * GRAPH_WHEEL_ZOOM_SENSITIVITY);
  zoomGraphAt(event.clientX, event.clientY, nextZoom);
}

function startGraphGesture(event) {
  if (!state.graphSize) return;
  event.preventDefault();
  const point = graphEventPoint(event);
  state.graphGesture = {
    startZoom: state.graphZoom,
    clientX: point.clientX,
    clientY: point.clientY
  };
}

function moveGraphGesture(event) {
  if (!state.graphGesture) return;
  event.preventDefault();
  const gestureScale = Number(event.scale) || 1;
  const point = graphEventPoint(event, state.graphGesture);
  zoomGraphAt(point.clientX, point.clientY, state.graphGesture.startZoom * gestureScale);
}

function endGraphGesture() {
  state.graphGesture = null;
}

function graphEventPoint(event, fallback = null) {
  if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    return { clientX: event.clientX, clientY: event.clientY };
  }
  if (fallback) return fallback;
  const rect = elements.workflowGraph.getBoundingClientRect();
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  };
}

function zoomGraphAt(clientX, clientY, nextZoom) {
  const previousZoom = state.graphZoom;
  const zoom = normalizeGraphZoom(nextZoom);
  if (Math.abs(zoom - previousZoom) < 0.001) return;
  const rect = elements.workflowGraph.getBoundingClientRect();
  const viewportX = clamp(clientX - rect.left, 0, rect.width);
  const viewportY = clamp(clientY - rect.top, 0, rect.height);
  const logicalX = (elements.workflowGraph.scrollLeft + viewportX) / previousZoom;
  const logicalY = (elements.workflowGraph.scrollTop + viewportY) / previousZoom;

  state.graphZoom = zoom;
  saveGraphZoom();
  setGraphCanvasSize(state.graphSize);

  requestAnimationFrame(() => {
    const maxLeft = Math.max(0, elements.workflowGraph.scrollWidth - elements.workflowGraph.clientWidth);
    const maxTop = Math.max(0, elements.workflowGraph.scrollHeight - elements.workflowGraph.clientHeight);
    elements.workflowGraph.scrollLeft = clamp(logicalX * zoom - viewportX, 0, maxLeft);
    elements.workflowGraph.scrollTop = clamp(logicalY * zoom - viewportY, 0, maxTop);
  });
}

function normalizeGraphZoom(value) {
  return clamp(Number(value) || 1, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM);
}

function saveGraphZoom() {
  try {
    localStorage.setItem("webops-forge-graph-zoom", String(state.graphZoom));
  } catch {
    // Zoom persistence is best-effort; the current view still updates.
  }
}

function updateGraphZoomLabel() {
  if (!elements.graphZoomLevel) return;
  elements.graphZoomLevel.textContent = `${Math.round(state.graphZoom * 100)}%`;
}

function setGraphLayout(layout) {
  const nextLayout = normalizeGraphLayout(layout);
  if (state.graphLayout === nextLayout) return;
  state.graphLayout = nextLayout;
  saveGraphLayout();
  updateGraphLayoutButtons();
  if (state.selectedWorkflowId) {
    state.graphViewportCenterKey = state.selectedWorkflowId;
    syncGraphLayoutToWorkflow(state.selectedWorkflowId, nextLayout);
  }
  renderGraph();
}

function normalizeGraphLayout(layout) {
  return Object.hasOwn(GRAPH_LAYOUT_CONFIGS, layout) ? layout : "sequence";
}

function saveGraphLayout() {
  try {
    localStorage.setItem("webops-forge-graph-layout", state.graphLayout);
  } catch {
    // Layout preference persistence is best-effort; the current view still updates.
  }
}

function updateGraphLayoutButtons() {
  elements.graphLayoutButtons.forEach((button) => {
    const active = button.dataset.graphLayout === state.graphLayout;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function saveGraphPositions(workflowId, positions) {
  syncGraphPositionsToWorkflow(workflowId, positions);
  try {
    localStorage.setItem(graphStorageKey(workflowId), JSON.stringify(positions));
  } catch {
    // Local storage is best-effort; graph dragging still works for the current session.
  }
}

function graphStorageKey(workflowId) {
  return `webops-forge-graph:${GRAPH_LAYOUT_VERSION}:${state.graphLayout}:${workflowId}`;
}

function selectWorkflow(id) {
  const workflow = state.workflows.find((item) => item.id === id);
  if (!workflow) return;
  state.selectedWorkflowId = id;
  state.graphViewportCenterKey = id;
  state.selectedGraphNodeId = null;
  state.graphLayout = normalizeGraphLayout(workflow.graph?.layout ?? state.graphLayout);
  saveGraphLayout();
  updateGraphLayoutButtons();
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
  const activity = summarizeRunActivity(run, events);
  elements.runActivity.className = `run-activity ${statusClass(run.status) || "muted"}`;
  elements.runActivity.innerHTML = `
    <strong>${escapeHtml(activity.title)}</strong>
    <span>${escapeHtml(activity.detail)}</span>
  `;
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
      <span class="event-meta">${escapeHtml(eventDetail(event, run))} ${artifactLink}</span>
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

function summarizeRunActivity(run, events = []) {
  const latestStepEvent = [...events].reverse().find((event) => event.stepId);
  const profile = run.profileName || run.profileId || t("noProfile");
  if (!latestStepEvent) {
    return {
      title: statusLabel(run.status),
      detail: run.status === "queued"
        ? t("runActivityQueued", { profile })
        : run.status === "running" || run.status === "cancel_requested"
          ? t("runActivityStarting", { profile })
          : t("runActivityIdle")
    };
  }

  const step = findWorkflowStep(run.workflowId, latestStepEvent.stepId);
  const stepText = describeStep(latestStepEvent, step);
  if (run.status === "failed" || latestStepEvent.type === "step.failed") {
    return {
      title: statusLabel("failed"),
      detail: t("runActivityFailed", {
        step: stepText,
        error: cleanErrorMessage(latestStepEvent.error?.message ?? run.error?.message ?? "")
      })
    };
  }
  if (run.status === "completed") {
    return {
      title: statusLabel("completed"),
      detail: t("runActivityCompleted", { step: stepText })
    };
  }
  return {
    title: statusLabel(run.status),
    detail: t("runActivityRunning", { step: stepText })
  };
}

function eventDetail(event, run = null) {
  const step = event.stepId ? findWorkflowStep(run?.workflowId, event.stepId) : null;
  const parts = [];
  if (event.action ?? step?.action) parts.push(event.action ?? step.action);
  const target = stepTarget(step);
  if (target) parts.push(target);
  if (event.error?.message) parts.push(cleanErrorMessage(event.error.message));
  if (event.result?.url) parts.push(event.result.url);
  if (event.workflow?.name) parts.push(event.workflow.name);
  return parts.join(" · ");
}

function describeStep(event, step) {
  const parts = [event.stepId ?? step?.id ?? event.action ?? "step"];
  if (event.action ?? step?.action) parts.push(event.action ?? step.action);
  const target = stepTarget(step);
  if (target) parts.push(target);
  return parts.join(" · ");
}

function stepTarget(step) {
  if (!step) return "";
  return step.url ?? step.selector ?? step.name ?? step.key ?? step.includes ?? "";
}

function cleanErrorMessage(message) {
  return String(message ?? "").replace(/\u001b\[[0-9;]*m/g, "").trim();
}

function findWorkflowStep(workflowId, stepId) {
  const workflow = state.workflows.find((item) => item.id === workflowId);
  const graph = workflow ? buildGraphData(workflow.workflow) : null;
  return graph?.nodes.find((node) => node.id === stepId)?.step ?? findRawStep(workflow?.workflow?.steps, stepId);
}

function findRawStep(steps = [], stepId) {
  for (const step of steps) {
    if (step.id === stepId) return step;
    const browserStep = findRawStep(step.browserSteps ?? [], stepId);
    if (browserStep) return browserStep;
    if (step.api?.id === stepId) return step.api;
  }
  return null;
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
    const workflowDefinition = parseJson(elements.workflowJson.value, "Workflow");
    commitWorkflowDraft(workflowDefinition, { syncTextarea: false });
    const body = {
      id,
      name: elements.workflowName.value.trim(),
      description: elements.workflowDescription.value.trim(),
      workflow: workflowDefinition,
      graph: graphRecordForSave(),
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
    const shouldPollPicker = Boolean(state.selectedGraphNodeId);
    if (!hasActive && !state.selectedRunId && !shouldPollPicker) return;
    await Promise.all([loadRuntime(), loadRegistry(), loadRuns(), loadProfiles(), loadAudit(), loadPickerEvents()]);
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
  updateGraphLayoutButtons();
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
