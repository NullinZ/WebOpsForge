const LANGUAGE_STORAGE_KEY = "webops-forge-language";
const LANGUAGE_CHOICE_STORAGE_KEY = "webops-forge-language-choice";

const state = {
  workflows: [],
  profiles: [],
  localBrowserProfiles: [],
  localBrowserProfilesLoaded: false,
  selectedLocalProfileId: "",
  runProfileDraftId: "",
  runs: [],
  runsHasMore: false,
  runsNextOffset: null,
  runsLoadingMore: false,
  audit: [],
  pickerEvents: [],
  pickerSession: null,
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
  language: getInitialLanguage(),
  graphPositions: {},
  graphDrag: null,
  graphPan: null,
  graphGesture: null,
  graphSize: null,
  graphZoom: Number(localStorage.getItem("webops-forge-graph-zoom") || "1") || 1,
  graphLayout: localStorage.getItem("webops-forge-graph-layout") || "sequence",
  graphViewportCenterKey: null,
  selectedGraphNodeId: null,
  pendingPickerNodeId: null,
  pendingPickerStartedAt: null,
  pickerPanelExpanded: false,
  nodeEditorSyncing: false,
  resizeDrag: null,
  polling: null
};

const APP_BASE_PATH = normalizeAppBasePath(window.__WEBOPS_BASE_PATH__);
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
const RUNS_PAGE_SIZE = 4;
const RUN_INPUT_TEMPLATE_PATTERN = /\{\{\s*input\.([a-zA-Z0-9_.-]+)\s*\}\}/g;

let pendingRunInputPrompt = null;
const BUILDER_DEFAULT_TARGET_URL = "https://example.local/catalog";
const BUILDER_DEFAULT_ITEM_SELECTOR = ".product-card";
const BUILDER_DEFAULT_MEDIA_SELECTOR = "img, video, source";
const BUILDER_DEFAULT_LIST_FIELDS = {
  title: { selector: ".title" },
  detailUrl: { selector: "a", mode: "attribute", attribute: "href", type: "url" },
  imageUrl: { selector: "img", mode: "attribute", attribute: "src", type: "url" }
};
const BUILDER_DEFAULT_DETAIL_FIELDS = {
  title: { selector: "h1" },
  description: { selector: ".description" }
};
const BUILDER_SAMPLE_IMAGE_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='640' viewBox='0 0 960 640'%3E%3Crect width='960' height='640' fill='%23eef2f6'/%3E%3Crect x='120' y='120' width='720' height='400' rx='24' fill='%23d7dee7'/%3E%3Ctext x='480' y='340' text-anchor='middle' font-family='Arial' font-size='42' fill='%23667789'%3EWebOps%20media%3C/text%3E%3C/svg%3E";
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
        defaultSize: 240,
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
    builder: "Builder",
    browserChannel: "Browser Channel",
    proxyMode: "Network",
    proxyModeSystem: "System",
    proxyModeDirect: "Direct",
    proxyModeCustom: "Custom proxy",
    proxyServer: "Proxy Server",
    proxyBypass: "Proxy Bypass",
    buildWorkflow: "Build Workflow",
    browserStartup: "Browser startup",
    cancel: "Cancel",
    checkSession: "Check Session",
    clearDebugRuns: "Clear Debug",
    clearDebugRunsConfirm: "Clear debug run logs only? Formal run logs will be kept.",
    createReadWorkflow: "Create Read Workflow",
    apply: "Apply",
    applyLatestPick: "Apply Latest",
    applyLocalProfile: "Import Profile",
    browserPicker: "Browser Picker",
    confidence: "Confidence",
    context: "Context",
    dataDir: "data: {path}",
    defaultRun: "Default Run",
    delete: "Delete",
    deleteNode: "Delete Node",
    deleteNodeConfirm: "Delete selected node? If it is an operation node, its child branches will be deleted too.",
    debugRunKind: "debug",
    debugRunsCleared: "Cleared {count} debug logs",
    definition: "Workflow JSON Source",
    definitionJson: "Definition JSON",
    description: "Description",
    detailFieldsJson: "Detail Fields JSON",
    driver: "Driver",
    editProfile: "Edit Profile",
    evidence: "Evidence",
    export: "Export",
    exportReady: "Export ready",
    extract: "Extract",
    graph: "Visual Builder",
    id: "ID",
    import: "Import",
    importedBundle: "Imported {workflows} workflows, {profiles} profiles, and {registry} registry set",
    includes: "Includes",
    input: "Input",
    itemSelector: "Item Selector",
    key: "Key",
    language: "Language",
    layoutCompact: "Compact",
    layoutGrouped: "Grouped",
    layoutSequence: "Sequence",
    legendCompleted: "completed",
    legendFailed: "failed",
    legendIdle: "idle",
    legendRunning: "running",
    listFieldsJson: "List Fields JSON",
    actionIds: "Action IDs",
    actionRegistry: "Action Registry",
    actionType: "Action Type",
    actions: "Actions",
    addNode: "Add Node",
    loginState: "Login State",
    maxPerMinute: "Max Per Minute",
    mediaSelector: "Media Selector",
    method: "Method",
    mode: "Mode",
    name: "Name",
    localBrowserProfile: "Local Browser Profile",
    localBrowserProfiles: "Local Browser Profiles (select to import)",
    localProfileImported: "Local browser profile imported",
    loginWindowOpened: "Login window opened",
    noLocalProfiles: "Click Refresh Local to discover browser profiles",
    moreRuns: "Scroll to load more",
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
    noOutputs: "No outputs",
    noPicks: "No browser picks",
    noRegistryRecords: "No resources registered",
    noStepLogs: "No step logs yet",
    formalRunKind: "formal",
    noWorkflowSelected: "No workflow selected",
    nodeAdded: "Node added. Edit it to define the next step.",
    nodeDeleted: "Node deleted.",
    noProfile: "no profile",
    none: "none",
    openLoginWindow: "Open Login Window",
    releaseProfileBrowser: "Release Browser",
    releaseProfileBrowserConfirm: "Close the browser process currently using this profile? WebOps Forge will only signal a PID whose command line points to this profile directory.",
    profileBrowserReleaseNoLock: "No browser process is currently locking this profile.",
    profileBrowserReleaseRequested: "Requested browser release.",
    profileBrowserReleaseUnverified: "The locking process could not be verified as this profile, so it was not closed.",
    operationModes: "Operation Modes",
    operationBuilder: "Operation Builder",
    operationBuilderNote: "Create a readable page operation with list, detail, and media outputs.",
    operationRegistry: "Operation Registry",
    operations: "Operations",
    outputName: "Output Name",
    outputs: "Outputs",
    page: "Page",
    pageRegistry: "Page Registry",
    pages: "Pages",
    pickNode: "Add Pick Node",
    pickerNoTargetUrl: "Picker node added, but no target URL was found. Add or select a goto step first.",
    pickerTargetActive: "Target: {url}",
    pickerWaiting: "Picker node added. Open the Chrome picker when you are on the page to pick.",
    pickerAutoApplied: "Picked element applied to the new node.",
    showPickerPanel: "Show picker panel",
    hidePickerPanel: "Hide picker panel",
    platform: "Platform",
    profile: "Profile",
    profileDetails: "Profile Details",
    profileDir: "User Data Dir",
    profileDirectory: "Chrome Profile",
    profileIdRequired: "Profile ID is required",
    profileReference: "Profile Reference",
    profileSaved: "Profile saved",
    profiles: "Profiles",
    refresh: "Refresh",
    refreshLocalProfiles: "Refresh Local",
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
    runToNode: "Run to node",
    debugRunQueued: "Debug run queued to {step}",
    runActivityCompleted: "Completed {step}",
    runActivityBlocked: "Blocked at {step}: {state}. {hint}",
    runActivityFailed: "Failed {step}: {error}",
    runActivityQueued: "Queued on {profile}",
    runActivityRunning: "Running {step}",
    runActivityStarting: "Starting {profile}; waiting for the first step event.",
    runActivityIdle: "Select a run to inspect live activity.",
    runConfig: "Run Config",
    runInputMustBeObject: "Input JSON must be an object to fill workflow variables.",
    runQueued: "Run queued",
    runVariablesDescription: "Fill only the values this workflow references, then start the run.",
    runVariablesTitle: "Run Variables",
    runWorkflow: "Run Workflow",
    runs: "Runs",
    save: "Save",
    saveWorkflowConfig: "Save Workflow",
    saveProfile: "Save Profile",
    savedProfiles: "Saved Profiles",
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
    stepLogs: "Call Log",
    tags: "Tags",
    targetUrl: "Target URL",
    urlPattern: "URL Pattern",
    validate: "Validate",
    valueTemplate: "Value Template",
    workflow: "Workflow JSON",
    workflowBuilt: "Workflow built from operation",
    workflowGraph: "Visual Builder",
    workflowGraphHelpTitle: "Visual Workflow Builder",
    workflowGraphNote: "Edit nodes on the execution map; changes sync with Workflow JSON. Layout is saved as graph metadata.",
    readWorkflowCreated: "Read workflow created",
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
    builder: "Builder",
    browserChannel: "浏览器通道",
    proxyMode: "网络/代理",
    proxyModeSystem: "沿用系统",
    proxyModeDirect: "强制直连",
    proxyModeCustom: "指定代理",
    proxyServer: "代理地址",
    proxyBypass: "绕过列表",
    buildWorkflow: "生成工作流",
    browserStartup: "浏览器启动",
    cancel: "取消",
    checkSession: "检查会话",
    clearDebugRuns: "清空调试",
    clearDebugRunsConfirm: "只清空调试运行日志？正式运行日志会保留。",
    createReadWorkflow: "创建读取工作流",
    apply: "应用",
    applyLatestPick: "应用最新",
    applyLocalProfile: "导入 Profile",
    browserPicker: "浏览器拾取",
    confidence: "置信度",
    context: "上下文",
    dataDir: "数据目录：{path}",
    defaultRun: "默认运行",
    delete: "删除",
    deleteNode: "删除节点",
    deleteNodeConfirm: "确认删除选中的节点吗？如果它是业务操作节点，会一并删除子分支。",
    debugRunKind: "调试",
    debugRunsCleared: "已清空 {count} 条调试日志",
    definition: "工作流 JSON 源码",
    definitionJson: "定义 JSON",
    description: "描述",
    detailFieldsJson: "详情字段 JSON",
    driver: "驱动配置",
    editProfile: "编辑 Profile",
    evidence: "证据",
    export: "导出",
    exportReady: "导出已准备好",
    extract: "提取路径",
    graph: "可视编排",
    id: "ID",
    import: "导入",
    importedBundle: "已导入 {workflows} 个工作流、{profiles} 个 Profile 和 {registry} 套注册表",
    includes: "包含文本",
    input: "输入",
    itemSelector: "列表项选择器",
    key: "按键",
    language: "语言",
    layoutCompact: "紧凑",
    layoutGrouped: "分组",
    layoutSequence: "顺序",
    legendCompleted: "已完成",
    legendFailed: "失败",
    legendIdle: "空闲",
    legendRunning: "运行中",
    listFieldsJson: "列表字段 JSON",
    actionIds: "动作 ID",
    actionRegistry: "页面动作注册",
    actionType: "动作类型",
    actions: "动作",
    addNode: "新增节点",
    loginState: "登录态",
    maxPerMinute: "每分钟上限",
    mediaSelector: "媒体选择器",
    method: "请求方法",
    mode: "模式",
    name: "名称",
    localBrowserProfile: "本机浏览器 Profile",
    localBrowserProfiles: "本机浏览器 Profile（选择即导入）",
    localProfileImported: "已导入本机浏览器 Profile",
    loginWindowOpened: "登录窗口已打开",
    noLocalProfiles: "点击“刷新本机”获取浏览器 Profile",
    moreRuns: "滚动加载更多",
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
    noOutputs: "暂无输出",
    noPicks: "暂无浏览器拾取",
    noRegistryRecords: "暂无注册资源",
    noStepLogs: "暂无调用日志",
    formalRunKind: "正式",
    noWorkflowSelected: "未选择工作流",
    nodeAdded: "节点已新增，请编辑它来定义下一步。",
    nodeDeleted: "节点已删除。",
    noProfile: "不使用 Profile",
    none: "无",
    openLoginWindow: "打开登录窗口",
    releaseProfileBrowser: "释放浏览器",
    releaseProfileBrowserConfirm: "确认关闭当前占用这个 Profile 的浏览器进程？WebOps Forge 只会关闭命令行指向当前 profileDir 的 PID。",
    profileBrowserReleaseNoLock: "当前没有浏览器进程占用这个 Profile。",
    profileBrowserReleaseRequested: "已请求释放浏览器。",
    profileBrowserReleaseUnverified: "无法确认占用进程属于这个 Profile，已取消关闭。",
    operationModes: "动作执行方式",
    operationBuilder: "操作生成器",
    operationBuilderNote: "创建可读取列表、详情和图片视频输出的页面操作。",
    operationRegistry: "业务操作注册",
    operations: "业务操作",
    outputName: "输出名",
    outputs: "输出",
    page: "页面",
    pageRegistry: "页面注册",
    pages: "页面",
    pickNode: "新增拾取节点",
    pickerNoTargetUrl: "已新增拾取节点，但没有找到目标网址。请先添加或选中 goto 节点。",
    pickerTargetActive: "目标页：{url}",
    pickerWaiting: "已新增拾取节点，切到要拾取的网页后手动打开 Chrome 拾取器。",
    pickerAutoApplied: "已把拾取元素应用到新节点。",
    showPickerPanel: "展开拾取面板",
    hidePickerPanel: "收起拾取面板",
    platform: "平台",
    profile: "Profile",
    profileDetails: "Profile 详情",
    profileDir: "用户数据目录",
    profileDirectory: "Chrome 子 Profile",
    profileIdRequired: "必须填写 Profile ID",
    profileReference: "Profile 引用",
    profileSaved: "Profile 已保存",
    profiles: "Profiles",
    refresh: "刷新",
    refreshLocalProfiles: "刷新本机",
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
    runToNode: "执行到此节点",
    debugRunQueued: "已创建调试运行，到节点：{step}",
    runActivityCompleted: "已完成 {step}",
    runActivityBlocked: "{step} 已阻塞：{state}。{hint}",
    runActivityFailed: "{step} 失败：{error}",
    runActivityQueued: "已排队，Profile：{profile}",
    runActivityRunning: "正在执行 {step}",
    runActivityStarting: "正在启动 {profile}，等待第一个步骤事件。",
    runActivityIdle: "选择一条运行记录查看实时活动。",
    runConfig: "运行配置",
    runInputMustBeObject: "输入 JSON 必须是对象，才能自动填写工作流变量。",
    runQueued: "运行已入队",
    runVariablesDescription: "只填写当前工作流引用的变量，然后开始运行。",
    runVariablesTitle: "运行变量",
    runWorkflow: "运行工作流",
    runs: "运行记录",
    save: "保存",
    saveWorkflowConfig: "保存工作流",
    saveProfile: "保存 Profile",
    savedProfiles: "已保存 Profile",
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
    stepLogs: "调用日志",
    tags: "标签",
    targetUrl: "目标 URL",
    urlPattern: "URL 模式",
    validate: "校验",
    valueTemplate: "值模板",
    workflow: "JSON 源码",
    workflowBuilt: "已从业务操作生成工作流",
    workflowGraph: "可视编排",
    workflowGraphHelpTitle: "可视化工作流编排",
    workflowGraphNote: "在图谱上编辑节点步骤；节点内容与 JSON 源码同步，拖拽布局另存为 graph 元数据。",
    readWorkflowCreated: "读取工作流已创建",
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

const BLOCKED_STATE_LABELS = {
  en: {
    approval_required: "approval required",
    browser_blocked: "browser blocked",
    captcha_or_verification: "captcha or verification",
    empty_result: "empty result",
    front_chrome_javascript_disabled: "Chrome Apple Events JavaScript disabled",
    front_chrome_uncontrolled: "front Chrome not controllable",
    login_required: "login required",
    navigation_timeout: "navigation timeout",
    permission_denied: "permission denied",
    profile_busy: "profile busy",
    rate_limited: "rate limited",
    selector_drift: "selector drift",
    unknown_failure: "unknown failure"
  },
  zh: {
    approval_required: "需要审批",
    browser_blocked: "浏览器阻塞",
    captcha_or_verification: "验证码或验证",
    empty_result: "结果为空",
    front_chrome_javascript_disabled: "Chrome Apple 事件 JS 未开启",
    front_chrome_uncontrolled: "前台 Chrome 不可控",
    login_required: "需要登录",
    navigation_timeout: "导航超时",
    permission_denied: "权限不足",
    profile_busy: "Profile 占用",
    rate_limited: "限流",
    selector_drift: "选择器漂移",
    unknown_failure: "未知失败"
  }
};

const RECOVERY_HINT_LABELS = {
  en: {
    front_chrome_javascript_disabled: "In Chrome, enable View > Developer > Allow JavaScript from Apple Events, then rerun.",
    front_chrome_uncontrolled: "Reload or enable the WebOps Forge Picker extension, enable Chrome Apple Events JavaScript, or switch to an isolated Playwright profile.",
    profile_busy: "This profile is already open. If it is an old WebOps-controlled login window, release it from Profile Details; otherwise quit the external Chrome window or reconnect through CDP/extension control."
  },
  zh: {
    front_chrome_javascript_disabled: "在 Chrome 菜单打开「查看 > 开发者 > 允许 Apple 事件中的 JavaScript」，然后重新运行。",
    front_chrome_uncontrolled: "请刷新/启用 WebOps Forge Picker 扩展，或打开 Chrome 的「允许 Apple 事件中的 JavaScript」，也可以切换到 Local Chromium / 独立 Playwright Profile。",
    profile_busy: "这个 Profile 已被浏览器窗口占用。如果是旧的 WebOps 登录窗口，在 Profile 详情点“释放浏览器”；如果是你自己开的普通 Chrome，则先退出那扇 Chrome 或接入 CDP/扩展控制。"
  }
};

const ACTION_LABELS = {
  en: {
    apiCall: "API call",
    approval: "Approval",
    assertOutput: "Assert output",
    assertText: "Assert text",
    checkSession: "Check session",
    checkpoint: "Checkpoint",
    click: "Click",
    extract: "Extract",
    extractDetail: "Extract detail",
    extractList: "Extract list",
    extractMedia: "Extract media",
    fill: "Fill",
    goto: "Open URL",
    operation: "Operation",
    paginate: "Paginate",
    press: "Press key",
    screenshot: "Screenshot",
    setOutput: "Set output",
    waitFor: "Wait for element"
  },
  zh: {
    apiCall: "API 调用",
    approval: "审批",
    assertOutput: "校验输出",
    assertText: "校验文本",
    checkSession: "检查登录态",
    checkpoint: "检查点",
    click: "点击",
    extract: "提取",
    extractDetail: "提取详情",
    extractList: "提取列表",
    extractMedia: "提取媒体",
    fill: "输入",
    goto: "打开网址",
    operation: "业务操作",
    paginate: "翻页",
    press: "按键",
    screenshot: "截图",
    setOutput: "设置输出",
    waitFor: "等待元素"
  }
};

const ACTION_PICKER_VALUES = {
  nodeEditorAction: [
    "goto",
    "waitFor",
    "click",
    "fill",
    "press",
    "extract",
    "extractList",
    "extractDetail",
    "extractMedia",
    "paginate",
    "checkSession",
    "setOutput",
    "apiCall",
    "operation",
    "screenshot",
    "approval",
    "assertText",
    "assertOutput",
    "checkpoint"
  ],
  registryItemActionType: [
    "goto",
    "waitFor",
    "click",
    "fill",
    "press",
    "extract",
    "extractList",
    "extractDetail",
    "extractMedia",
    "paginate",
    "checkSession",
    "setOutput",
    "screenshot",
    "apiCall",
    "approval"
  ]
};

const FIELD_HELP = {
  workflowName: {
    zh: { title: "工作流名称", body: "给人看的名称，出现在左侧列表、运行记录和导出包里。来源于你当前编辑的 workflow record，不影响执行 id。" },
    en: { title: "Workflow name", body: "Human-readable name shown in lists, runs, and exports. It comes from the Studio workflow record and does not change execution ids." }
  },
  workflowId: {
    zh: { title: "工作流 ID", body: "稳定保存键，用于 /api/workflows、运行记录和本地 JSON 存储。保存后尽量不要频繁改名。" },
    en: { title: "Workflow ID", body: "Stable storage key used by /api/workflows, runs, and local JSON files. Avoid renaming after saved runs exist." }
  },
  workflowDescription: {
    zh: { title: "说明", body: "描述这个工作流解决什么业务任务，方便团队和后续维护识别用途。" },
    en: { title: "Description", body: "Explains the business task this workflow handles, making it easier to maintain and share." }
  },
  nodeEditorId: {
    zh: { title: "节点 ID", body: "执行和连线使用的稳定 step id。浏览器子步骤会保留 parent.child 命名空间，避免和同名节点冲突。" },
    en: { title: "Node ID", body: "Stable step id used by execution and graph links. Browser child steps keep the parent.child namespace to avoid collisions." }
  },
  nodeEditorAction: {
    zh: { title: "动作类型", body: "决定节点执行行为。菜单显示中英文，实际保存仍是稳定 code，例如 click、fill、goto。" },
    en: { title: "Action type", body: "Controls what the step does. The menu is bilingual, while the saved value remains a stable code such as click, fill, or goto." }
  },
  nodeEditorName: {
    zh: { title: "名称", body: "可选的人类可读别名。提取、截图、审批等节点会用它作为输出名或展示名。" },
    en: { title: "Name", body: "Optional human-readable alias. Extract, screenshot, and approval steps use it as an output or display name." }
  },
  nodeEditorSelector: {
    zh: { title: "选择器", body: "页面目标元素定位方式。可手填，也可由浏览器拾取器写入；运行时会结合 targetIdentity 防止点错元素。" },
    en: { title: "Selector", body: "Locates the target page element. Fill manually or from the picker; runtime uses targetIdentity to avoid wrong matches." }
  },
  nodeEditorUrl: {
    zh: { title: "URL 模式", body: "goto 节点打开的页面，或用于推导拾取器目标网址。支持完整 http/https 地址。" },
    en: { title: "URL pattern", body: "The page opened by a goto step, and the source used to scope the picker target URL. Use full http/https URLs." }
  },
  nodeEditorValue: {
    zh: { title: "值模板", body: "fill、apiCall 等动作使用的输入值。可引用模板变量，例如 {{input.query}}。" },
    en: { title: "Value template", body: "Input value for actions such as fill or apiCall. Template variables like {{input.query}} are supported." }
  },
  nodeEditorKey: {
    zh: { title: "按键", body: "press 动作发送的键名，例如 Enter、Escape、Tab。使用 Playwright 兼容的键名。" },
    en: { title: "Key", body: "Keyboard key sent by a press action, such as Enter, Escape, or Tab. Use Playwright-compatible key names." }
  },
  nodeEditorIncludes: {
    zh: { title: "包含文本", body: "assertText 或 assertOutput 的校验条件，用于阻止错误结果继续执行。" },
    en: { title: "Includes", body: "Expected text for assertText or assertOutput, used to block unsafe or incorrect results." }
  },
  nodeEditorMethod: {
    zh: { title: "请求方法", body: "apiCall 使用的 HTTP 方法，例如 GET、POST、PUT。浏览器动作通常不需要填写。" },
    en: { title: "Method", body: "HTTP method for apiCall steps, such as GET, POST, or PUT. Browser actions usually leave this empty." }
  },
  nodeEditorExtract: {
    zh: { title: "提取路径", body: "apiCall 响应提取路径，例如 json.title。浏览器 extract 节点通常使用 selector 和 name。" },
    en: { title: "Extract path", body: "Response extraction path for apiCall, such as json.title. Browser extract steps usually use selector and name." }
  },
  nodeEditorJson: {
    zh: { title: "节点 JSON", body: "当前节点的完整配置。适合高级编辑；字段编辑区会和这里同步。" },
    en: { title: "Node JSON", body: "Complete configuration for the selected node. Use for advanced edits; the form fields sync with it." }
  },
  workflowJson: {
    zh: { title: "工作流 JSON 源码", body: "完整 workflow 定义。可视编排里的节点和这里同步；拖拽布局另存为 graph 元数据，运行配置另存在 defaultRun。" },
    en: { title: "Workflow JSON source", body: "Full workflow definition. Visual Builder nodes sync with this source; dragged layout is saved as graph metadata, and run config is saved under defaultRun." }
  },
  registryItemId: {
    zh: { title: "资源 ID", body: "注册中心资源的稳定 key。站点、页面、动作和业务操作都会用它互相关联。" },
    en: { title: "Resource ID", body: "Stable key for registry resources. Sites, pages, actions, and operations reference each other by this id." }
  },
  registryItemName: {
    zh: { title: "资源名称", body: "给操作者看的名称，出现在注册中心列表和生成工作流时的标题中。" },
    en: { title: "Resource name", body: "Human-readable name shown in registry lists and generated workflow titles." }
  },
  registryItemStatus: {
    zh: { title: "状态", body: "标记资源是否草稿、就绪或弃用。不会自动阻止保存，但会影响团队判断可用性。" },
    en: { title: "Status", body: "Marks whether a resource is draft, ready, or deprecated. It does not block saving, but signals readiness." }
  },
  registryItemSite: {
    zh: { title: "站点", body: "当前页面、动作或业务操作所属的平台/域名资源。来源于注册中心 Sites。" },
    en: { title: "Site", body: "Platform or domain resource that owns this page, action, or operation. Sourced from Registry Sites." }
  },
  registryItemPage: {
    zh: { title: "页面", body: "动作所属页面。用于把 selector、URL 模式和业务动作归到同一个页面上下文。" },
    en: { title: "Page", body: "Page context for an action. It groups selectors, URL patterns, and actions under one page." }
  },
  registryItemActionType: {
    zh: { title: "动作类型", body: "注册动作生成节点时使用的行为类型。菜单双语显示，保存值仍是稳定 action code。" },
    en: { title: "Action type", body: "Behavior used when this registry action becomes a workflow step. The menu is bilingual; saved value is a stable action code." }
  },
  registryItemBaseUrl: {
    zh: { title: "基础地址", body: "站点的默认入口 URL。页面和动作没有更具体 URL 时会用它作为回退。" },
    en: { title: "Base URL", body: "Default entry URL for a site. Pages and actions fall back to it when no specific URL is set." }
  },
  registryItemUrlPattern: {
    zh: { title: "URL 模式", body: "页面匹配或打开地址。动作生成 goto 节点、拾取器目标页推导都会参考它。" },
    en: { title: "URL pattern", body: "Page URL or matching pattern. Used for generated goto steps and picker target inference." }
  },
  registryItemSelector: {
    zh: { title: "选择器", body: "页面动作的目标元素。可来自手写、DevTools 或浏览器拾取器生成的稳定 selector。" },
    en: { title: "Selector", body: "Target element for a page action. It may come from manual entry, DevTools, or the stable picker selector." }
  },
  registryItemValueTemplate: {
    zh: { title: "值模板", body: "动作输入或 API URL 模板。常用 {{input.xxx}} 引用运行输入。" },
    en: { title: "Value template", body: "Action input or API URL template. Commonly references run input with {{input.xxx}}." }
  },
  registryItemOutputName: {
    zh: { title: "输出名", body: "提取、截图或审批节点写入 outputs/artifacts 时使用的名称。" },
    en: { title: "Output name", body: "Name used when extract, screenshot, or approval steps write outputs or artifacts." }
  },
  registryItemTags: {
    zh: { title: "标签", body: "用于分类和检索注册资源。多个标签可用逗号分隔。" },
    en: { title: "Tags", body: "Used to group and search registry resources. Separate multiple tags with commas." }
  },
  registryItemDescription: {
    zh: { title: "资源说明", body: "说明这个资源的业务语义、适用页面或使用限制。" },
    en: { title: "Resource description", body: "Explains the resource purpose, applicable page, or usage constraints." }
  },
  registryItemActionIds: {
    zh: { title: "动作 ID 列表", body: "业务操作包含的注册动作，一行一个或逗号分隔。来源于 Registry Actions。" },
    en: { title: "Action IDs", body: "Registry actions included in an operation. Use one per line or comma-separated values." }
  },
  registryItemDefinitionJson: {
    zh: { title: "定义 JSON", body: "资源的高级扩展配置，例如显式 step、API 分支或平台备注。" },
    en: { title: "Definition JSON", body: "Advanced extension config, such as explicit steps, API branches, or platform notes." }
  },
  registryItemSchemaJson: {
    zh: { title: "结构 JSON", body: "业务操作的输入/输出 schema 和 workflowTemplate。用于生成工作流和样例输入。" },
    en: { title: "Schema JSON", body: "Operation input/output schema and workflowTemplate, used to generate workflows and sample inputs." }
  },
  runMode: {
    zh: { title: "运行模式", body: "dry-run 使用模拟数据验证逻辑；playwright 会启动真实浏览器执行。" },
    en: { title: "Run mode", body: "dry-run validates logic with fixtures; playwright runs in a real browser." }
  },
  profileSelect: {
    zh: { title: "Profile", body: "选择运行使用的浏览器身份、登录态或 dry-run profile。来源于左侧 Profiles。" },
    en: { title: "Profile", body: "Browser identity, login state, or dry-run profile used for execution. Sourced from Profiles." }
  },
  localProfileSelect: {
    zh: { title: "本机浏览器 Profile", body: "从这台电脑已有的 Chrome/Chromium Profile 里导入一个运行身份。" },
    en: { title: "Local browser profile", body: "Imports a run identity from an existing Chrome or Chromium profile on this computer." }
  },
  approvalToggle: {
    zh: { title: "审批闸口", body: "运行前如何处理 approval 节点。可使用上下文、全部通过或阻断示例审批。" },
    en: { title: "Approval gates", body: "How approval steps are handled before a run: use context, approve all, or block sample gates." }
  },
  operationModesJson: {
    zh: { title: "动作执行方式", body: "控制 operation 使用 browser 分支还是 api 分支。key 是 operation step id。" },
    en: { title: "Operation modes", body: "Controls whether each operation uses the browser or API branch. Keys are operation step ids." }
  },
  runInputJson: {
    zh: { title: "输入 JSON", body: "运行输入数据。工作流里可通过 {{input.xxx}} 引用这些值。" },
    en: { title: "Input JSON", body: "Run input data. Workflow templates can reference values with {{input.xxx}}." }
  },
  runContextJson: {
    zh: { title: "上下文 JSON", body: "运行上下文，例如 approvals、operationModes、账号信息等控制项。" },
    en: { title: "Context JSON", body: "Run context such as approvals, operationModes, account hints, and control flags." }
  },
  driverConfigJson: {
    zh: { title: "Driver 配置", body: "dry-run fixture、浏览器配置和执行器参数。真实 Playwright 运行可在这里传 driverConfig。" },
    en: { title: "Driver config", body: "Dry-run fixtures, browser config, and driver options. Real Playwright runs can receive driverConfig here." }
  },
  profileId: {
    zh: { title: "Profile ID", body: "Profile 的稳定 key，用于工作流默认运行配置和运行记录关联。" },
    en: { title: "Profile ID", body: "Stable profile key referenced by workflow defaults and run records." }
  },
  profileName: {
    zh: { title: "Profile 名称", body: "给操作者看的身份名称，出现在 Profile 列表和运行记录中。" },
    en: { title: "Profile name", body: "Human-readable identity name shown in profile lists and run records." }
  },
  profileMode: {
    zh: { title: "Profile 模式", body: "这个 profile 用于 dry-run 还是真实 Playwright 浏览器。" },
    en: { title: "Profile mode", body: "Whether this profile is used for dry-run fixtures or real Playwright browser runs." }
  },
  profilePlatform: {
    zh: { title: "平台", body: "账号或站点归属，例如 douyin、1688、example.local。用于识别登录态和运行上下文。" },
    en: { title: "Platform", body: "Account or site platform such as douyin, 1688, or example.local. Used for session and run context." }
  },
  profileAccountLabel: {
    zh: { title: "账号标签", body: "可读账号标识，不保存密码。用于区分多个登录身份。" },
    en: { title: "Account label", body: "Readable account identifier, not a password. Used to distinguish logged-in identities." }
  },
  profileLoginState: {
    zh: { title: "登录状态", body: "记录最近一次会话检查结果：未检查、已登录、未登录或未知。" },
    en: { title: "Login state", body: "Last session check result: unchecked, authenticated, logged out, or unknown." }
  },
  profileStatus: {
    zh: { title: "Profile 状态", body: "控制 profile 是否可用于排队运行。busy 表示当前被运行占用。" },
    en: { title: "Profile status", body: "Controls whether the profile can be used for queued runs. busy means it is currently leased." }
  },
  profileDir: {
    zh: { title: "用户数据目录", body: "浏览器 user-data 根目录。系统 Chrome Profile 通常共用这个根目录。" },
    en: { title: "User data directory", body: "Browser user-data root. System Chrome profiles usually share this root directory." }
  },
  profileDirectory: {
    zh: { title: "Chrome 子 Profile", body: "Chrome 根目录下的子 Profile，例如 Default、Profile 1 或 Profile 2。" },
    en: { title: "Chrome profile directory", body: "Profile subdirectory inside the Chrome root, such as Default, Profile 1, or Profile 2." }
  },
  profileBrowserChannel: {
    zh: { title: "浏览器通道", body: "运行时使用的浏览器通道，例如 chrome、msedge。留空则使用 Playwright 默认 Chromium。" },
    en: { title: "Browser channel", body: "Browser channel used at runtime, such as chrome or msedge. Empty uses Playwright's default Chromium." }
  },
  profileProxyMode: {
    zh: { title: "网络/代理", body: "沿用系统会使用当前系统网络；强制直连会禁用浏览器代理；指定代理会按下面代理地址启动此独立 Chrome。" },
    en: { title: "Network/proxy", body: "System uses the current OS network, direct disables browser proxy, and custom starts this Chrome with the proxy server below." }
  },
  profileProxyServer: {
    zh: { title: "代理地址", body: "用于指定代理模式，例如 socks5://127.0.0.1:29758 或 http://127.0.0.1:29757。" },
    en: { title: "Proxy server", body: "Used in custom proxy mode, such as socks5://127.0.0.1:29758 or http://127.0.0.1:29757." }
  },
  profileProxyBypass: {
    zh: { title: "绕过列表", body: "这些地址不走代理，默认绕过本机地址。" },
    en: { title: "Proxy bypass", body: "Addresses that bypass the proxy; localhost is bypassed by default." }
  },
  profileCheckUrl: {
    zh: { title: "会话检查 URL", body: "检查登录态时打开的页面。通常是平台首页或后台页。" },
    en: { title: "Session check URL", body: "Page opened to check login state. Usually a platform home or workspace page." }
  },
  profileAccountSelector: {
    zh: { title: "账号选择器", body: "会话检查时读取账号名的 selector。命中后可更新 accountLabel。" },
    en: { title: "Account selector", body: "Selector used during session checks to read the account label when logged in." }
  },
  profileRate: {
    zh: { title: "频率限制", body: "每分钟最大动作数。留空或 0 表示不限制，由工作流自身节奏控制。" },
    en: { title: "Rate limit", body: "Maximum actions per minute. Empty or 0 means no explicit limit beyond workflow timing." }
  }
};

const BRANCH_LABELS = {
  en: { api: "API", browser: "Browser" },
  zh: { api: "API", browser: "浏览器" }
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
  editorPane: document.querySelector(".editor-pane"),
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
  builderWorkflowName: document.querySelector("#builderWorkflowName"),
  builderTargetUrl: document.querySelector("#builderTargetUrl"),
  builderItemSelector: document.querySelector("#builderItemSelector"),
  builderMediaSelector: document.querySelector("#builderMediaSelector"),
  builderListFieldsJson: document.querySelector("#builderListFieldsJson"),
  builderDetailFieldsJson: document.querySelector("#builderDetailFieldsJson"),
  workflowList: document.querySelector("#workflowList"),
  profileList: document.querySelector("#profileList"),
  runList: document.querySelector("#runList"),
  clearDebugRunsButton: document.querySelector("#clearDebugRunsButton"),
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
  deleteGraphNodeButton: document.querySelector("#deleteGraphNodeButton"),
  nodeEditorEmpty: document.querySelector("#nodeEditorEmpty"),
  nodeEditorForm: document.querySelector("#nodeEditorForm"),
  nodeEditorId: document.querySelector("#nodeEditorId"),
  nodeEditorAction: document.querySelector("#nodeEditorAction"),
  nodeEditorName: document.querySelector("#nodeEditorName"),
  nodeEditorSelector: document.querySelector("#nodeEditorSelector"),
  refreshPickerButton: document.querySelector("#refreshPickerButton"),
  applyLatestPickButton: document.querySelector("#applyLatestPickButton"),
  nodePickerPanel: document.querySelector("#nodePickerPanel"),
  togglePickerPanelButton: document.querySelector("#togglePickerPanelButton"),
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
  runProfileSummary: document.querySelector("#runProfileSummary"),
  editRunProfileButton: document.querySelector("#editRunProfileButton"),
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
  profileDirectory: document.querySelector("#profileDirectory"),
  profileBrowserChannel: document.querySelector("#profileBrowserChannel"),
  profileProxyMode: document.querySelector("#profileProxyMode"),
  profileProxyServer: document.querySelector("#profileProxyServer"),
  profileProxyBypass: document.querySelector("#profileProxyBypass"),
  openProfileButton: document.querySelector("#openProfileButton"),
  releaseProfileBrowserButton: document.querySelector("#releaseProfileBrowserButton"),
  localProfileSelect: document.querySelector("#localProfileSelect"),
  profileCheckUrl: document.querySelector("#profileCheckUrl"),
  profileAccountSelector: document.querySelector("#profileAccountSelector"),
  profileRate: document.querySelector("#profileRate"),
  selectedRunStatus: document.querySelector("#selectedRunStatus"),
  runActivity: document.querySelector("#runActivity"),
  runStepLog: document.querySelector("#runStepLog"),
  runOutputPreview: document.querySelector("#runOutputPreview"),
  runSummary: document.querySelector("#runSummary"),
  eventTimeline: document.querySelector("#eventTimeline"),
  artifactList: document.querySelector("#artifactList"),
  auditList: document.querySelector("#auditList"),
  importFile: document.querySelector("#importFile"),
  runInputModal: document.querySelector("#runInputModal"),
  runInputFields: document.querySelector("#runInputFields"),
  cancelRunInputButton: document.querySelector("#cancelRunInputButton"),
  confirmRunInputButton: document.querySelector("#confirmRunInputButton"),
  toast: document.querySelector("#toast")
};

setupResizableLayouts();
setupActionPickers();
setupFieldHelps();
seedBuilderDefaults();

elements.languageToggle.addEventListener("click", () => setLanguage(state.language === "zh" ? "en" : "zh"));
document.querySelector("#buildReadWorkflowButton").addEventListener("click", () => createReadWorkflowFromBuilder());
document.querySelector("#autoLayoutButton").addEventListener("click", () => autoLayoutSelectedWorkflow());
document.querySelector("#saveGraphWorkflowButton").addEventListener("click", () => saveSelectedWorkflow());
document.querySelector("#refreshButton").addEventListener("click", () => refreshAll());
document.querySelector("#exportButton").addEventListener("click", () => exportBundle());
document.querySelector("#importButton").addEventListener("click", () => elements.importFile.click());
document.querySelector("#importFile").addEventListener("change", (event) => importBundle(event.target.files[0]));
document.querySelector("#runButton").addEventListener("click", () => runSelectedWorkflow());
elements.clearDebugRunsButton.addEventListener("click", () => clearDebugRuns());
elements.runList.addEventListener("scroll", () => handleRunListScroll());
elements.cancelRunInputButton.addEventListener("click", () => resolveRunInputPrompt(null));
elements.confirmRunInputButton.addEventListener("click", () => confirmRunInputPrompt());
elements.runInputModal.addEventListener("click", (event) => {
  if (event.target === elements.runInputModal) resolveRunInputPrompt(null);
});
elements.runInputModal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") resolveRunInputPrompt(null);
});
document.querySelector("#saveWorkflowButton").addEventListener("click", () => saveSelectedWorkflow());
document.querySelector("#validateWorkflowButton").addEventListener("click", () => validateSelectedWorkflow());
document.querySelector("#newWorkflowButton").addEventListener("click", () => createBlankWorkflow());
document.querySelector("#addGraphNodeButton").addEventListener("click", () => addGraphNode());
elements.deleteGraphNodeButton.addEventListener("click", () => deleteSelectedGraphNode());
document.querySelector("#addPickerNodeButton").addEventListener("click", (event) => {
  event.stopPropagation();
  setPickerPanelExpanded(true);
  addPickerGraphNode().catch((error) => showToast(error.message));
});
elements.refreshPickerButton.addEventListener("click", async () => {
  setPickerPanelExpanded(true);
  await Promise.all([loadPickerEvents(), loadPickerSession()]);
  applyPendingPickerEventIfReady();
  renderPickerPanel();
});
elements.applyLatestPickButton.addEventListener("click", () => {
  applyPickerEventToSelectedNode(state.pickerEvents[0]?.id);
  setPickerPanelExpanded(false);
});
elements.togglePickerPanelButton.addEventListener("click", (event) => {
  event.stopPropagation();
  setPickerPanelExpanded(!state.pickerPanelExpanded);
});
elements.pickerEventList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-picker-apply]");
  if (button) {
    applyPickerEventToSelectedNode(button.dataset.pickerApply);
    setPickerPanelExpanded(false);
    return;
  }
  const row = event.target.closest("[data-picker-id]");
  if (!row) return;
  state.selectedPickerEventId = row.dataset.pickerId;
  renderPickerPanel();
});
document.addEventListener("click", (event) => {
  if (!state.pickerPanelExpanded) return;
  if (event.target.closest("#nodePickerPanel, #addPickerNodeButton, #refreshPickerButton, #applyLatestPickButton")) return;
  setPickerPanelExpanded(false);
});
document.querySelector("#newProfileButton").addEventListener("click", () => createBlankProfile());
document.querySelector("#saveProfileButton").addEventListener("click", () => saveSelectedProfile());
elements.openProfileButton.addEventListener("click", () => openSelectedProfileLoginWindow());
elements.releaseProfileBrowserButton.addEventListener("click", () => releaseSelectedProfileBrowser());
document.querySelector("#checkProfileButton").addEventListener("click", () => checkSelectedProfile());
document.querySelector("#saveRunConfigButton").addEventListener("click", () => saveSelectedWorkflow());
elements.editRunProfileButton.addEventListener("click", () => editRunProfileFromRunConfig());
elements.profileSelect.addEventListener("change", () => handleProfileSelectChange());
elements.localProfileSelect.addEventListener("change", () => {
  state.selectedLocalProfileId = elements.localProfileSelect.value;
});
document.querySelector("#refreshLocalProfilesButton").addEventListener("click", () => refreshLocalBrowserProfiles());
document.querySelector("#applyLocalProfileButton").addEventListener("click", () => applySelectedLocalProfile());
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
document.addEventListener("click", (event) => {
  closeActionPickers(event.target);
  closeFieldHelps(event.target);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeActionPickers();
  closeFieldHelps();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Delete" && event.key !== "Backspace") return;
  if (isTextEditingTarget(event.target)) return;
  if (!state.selectedGraphNodeId) return;
  event.preventDefault();
  deleteSelectedGraphNode();
});
updateGraphLayoutButtons();
updateGraphZoomLabel();

applyStaticTranslations();
await refreshAll();
startPolling();

async function refreshAll() {
  await Promise.all([
    loadRuntime(),
    loadRegistry(),
    loadWorkflows(),
    loadProfiles(),
    loadLocalBrowserProfiles(),
    loadRuns(),
    loadAudit(),
    loadPickerEvents(),
    loadPickerSession()
  ]);
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

async function loadLocalBrowserProfiles() {
  const data = await api("/api/profiles/discovered");
  state.localBrowserProfiles = data.profiles;
  state.localBrowserProfilesLoaded = true;
}

async function loadRuns({ reset = true } = {}) {
  const loadedCount = state.runs.length || RUNS_PAGE_SIZE;
  const limit = reset ? Math.max(RUNS_PAGE_SIZE, loadedCount) : RUNS_PAGE_SIZE;
  const offset = reset ? 0 : (state.runsNextOffset ?? state.runs.length);
  const data = await api(`/api/runs?limit=${limit}&offset=${offset}`);
  state.runs = reset ? data.runs : mergeRuns(state.runs, data.runs);
  state.runsHasMore = Boolean(data.hasMore);
  state.runsNextOffset = data.nextOffset;
}

async function loadMoreRuns() {
  if (state.runsLoadingMore || !state.runsHasMore) return;
  state.runsLoadingMore = true;
  try {
    await loadRuns({ reset: false });
    renderRuns();
  } finally {
    state.runsLoadingMore = false;
  }
}

function mergeRuns(existing, incoming) {
  const byId = new Map(existing.map((run) => [run.id, run]));
  for (const run of incoming) byId.set(run.id, run);
  return [...byId.values()].sort((a, b) => String(b.queuedAt).localeCompare(String(a.queuedAt)));
}

function handleRunListScroll() {
  const remaining = elements.runList.scrollHeight - elements.runList.scrollTop - elements.runList.clientHeight;
  if (remaining < 24) void loadMoreRuns();
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

async function loadPickerSession() {
  const data = await api("/api/picker/session");
  state.pickerSession = data.session ?? null;
}

function render() {
  renderRuntime();
  renderRegistry();
  renderWorkflows();
  renderProfiles();
  renderLocalBrowserProfiles();
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
  elements.profileSelect.innerHTML = "";
  const noProfileOption = document.createElement("option");
  noProfileOption.value = "";
  noProfileOption.textContent = t("noProfile");
  elements.profileSelect.append(noProfileOption);

  const savedGroup = document.createElement("optgroup");
  savedGroup.label = t("savedProfiles");
  for (const profile of state.profiles) {
    const displayProfile = displayProfileForSavedProfile(profile);
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = `${displayProfile.name}${displayProfile.accountLabel ? ` / ${displayProfile.accountLabel}` : ""} (${profileKindLabel(displayProfile)})`;
    savedGroup.append(option);

    const row = document.createElement("div");
    row.className = `profile-row ${profile.id === state.selectedProfileId ? "active" : ""}`;
    const identity = displayProfile.accountLabel || profile.platform || profile.mode;
    row.innerHTML = `
      <div class="profile-row-main">
        <span class="row-title">${escapeHtml(displayProfile.name)}</span>
        <span class="row-meta">${escapeHtml(profileKindLabel(displayProfile))} · ${escapeHtml(statusLabel(profile.status))} · ${escapeHtml(statusLabel(profile.loginState ?? "unchecked"))} · ${escapeHtml(identity)}${profile.leasedRunId ? ` · ${escapeHtml(profile.leasedRunId)}` : ""}</span>
      </div>
      <button class="secondary compact-button profile-edit-button" type="button" data-profile-edit="${escapeHtml(profile.id)}">${escapeHtml(t("editProfile"))}</button>
    `;
    row.addEventListener("click", () => selectProfile(profile.id));
    row.querySelector("[data-profile-edit]").addEventListener("click", (event) => {
      event.stopPropagation();
      selectProfile(profile.id, { focusPanel: true });
    });
    elements.profileList.append(row);
  }
  elements.profileSelect.append(savedGroup);

  const localOptions = state.localBrowserProfiles.filter((profile) => !profile.existingProfileId);
  if (localOptions.length) {
    const localGroup = document.createElement("optgroup");
    localGroup.label = t("localBrowserProfiles");
    for (const profile of localOptions) {
      const option = document.createElement("option");
      option.value = localProfileOptionValue(profile.id);
      option.textContent = `${profile.accountLabel || profile.profileDirectory} · ${profile.browserName} · ${profile.profileDirectory}`;
      localGroup.append(option);
    }
    elements.profileSelect.append(localGroup);
  }

  const workflow = state.workflows.find((item) => item.id === state.selectedWorkflowId);
  const candidateProfile = state.runProfileDraftId ?? workflow?.defaultRun?.profileId ?? "";
  const selectedProfile = [...elements.profileSelect.options].some((option) => option.value === candidateProfile)
    ? candidateProfile
    : "";
  if ([...elements.profileSelect.options].some((option) => option.value === selectedProfile)) {
    elements.profileSelect.value = selectedProfile;
  } else {
    elements.profileSelect.value = "";
  }
  renderRunProfileReference();
}

function renderRunProfileReference() {
  const value = elements.profileSelect.value;
  const localProfileId = localProfileIdFromOptionValue(value);
  const profile = localProfileId
    ? state.localBrowserProfiles.find((item) => item.id === localProfileId)
    : displayProfileForSavedProfile(state.profiles.find((item) => item.id === value));
  if (!value || !profile) {
    elements.runProfileSummary.textContent = t("noProfile");
    elements.runProfileSummary.classList.add("muted");
    elements.editRunProfileButton.disabled = true;
    return;
  }
  const title = profile.name || profile.accountLabel || profile.profileDirectory || profile.id;
  const accountLabel = profile.accountLabel && !String(title).includes(profile.accountLabel)
    ? profile.accountLabel
    : "";
  const meta = [
    accountLabel,
    profileKindLabel(profile),
    statusLabel(profile.loginState ?? "unchecked")
  ].filter(Boolean);
  elements.runProfileSummary.textContent = meta.length ? `${title} · ${meta.join(" · ")}` : title;
  elements.runProfileSummary.classList.remove("muted");
  elements.editRunProfileButton.disabled = false;
}

function renderLocalBrowserProfiles() {
  const selectedId = state.selectedLocalProfileId || elements.localProfileSelect.value;
  elements.localProfileSelect.innerHTML = "";
  if (!state.localBrowserProfiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("noLocalProfiles");
    elements.localProfileSelect.append(option);
    return;
  }
  for (const profile of state.localBrowserProfiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    const imported = profile.existingProfileId ? ` · ${profile.existingProfileId}` : "";
    option.textContent = `${profile.accountLabel || profile.profileDirectory} · ${profile.browserName} · ${profile.profileDirectory}${imported}`;
    elements.localProfileSelect.append(option);
  }
  if ([...elements.localProfileSelect.options].some((option) => option.value === selectedId)) {
    elements.localProfileSelect.value = selectedId;
    state.selectedLocalProfileId = selectedId;
  } else {
    state.selectedLocalProfileId = elements.localProfileSelect.value;
  }
}

function renderRuns() {
  elements.runList.innerHTML = "";
  for (const run of state.runs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `run-row ${run.id === state.selectedRunId ? "active" : ""}`;
    const profile = run.profileName || run.profileId || t("noProfile");
    const kind = run.debug ? t("debugRunKind") : t("formalRunKind");
    button.innerHTML = `
      <span class="row-title">${escapeHtml(run.workflowName)}</span>
      <span class="row-meta">${escapeHtml(kind)} · ${escapeHtml(statusLabel(run.status))} · ${escapeHtml(run.mode)} · ${escapeHtml(profile)} · ${formatTime(run.queuedAt)}</span>
    `;
    button.addEventListener("click", () => selectRun(run.id, { focusLog: true }));
    elements.runList.append(button);
  }
  if (state.runsHasMore) {
    const more = document.createElement("div");
    more.className = "run-list-more";
    more.textContent = state.runsLoadingMore ? "..." : t("moreRuns");
    elements.runList.append(more);
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
        <span class="node-action">${actionLabelHtml(node.action)}</span>
        <span class="node-controls">
          <span class="node-status">${escapeHtml(statusLabel(status))}</span>
          <button class="node-run-button" type="button" data-run-node-id="${escapeAttribute(node.id)}" title="${escapeAttribute(t("runToNode"))}" aria-label="${escapeAttribute(t("runToNode"))}">▶</button>
        </span>
      </div>
      <strong>${escapeHtml(node.label)}</strong>
      <span class="node-meta">${escapeHtml(node.meta)}</span>
    `;
    const runButton = item.querySelector("[data-run-node-id]");
    runButton.addEventListener("pointerdown", (event) => event.stopPropagation());
    runButton.addEventListener("click", (event) => {
      event.stopPropagation();
      runWorkflowToNode(node.id);
    });
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
  elements.deleteGraphNodeButton.disabled = !hasSelection;

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
      if (isActionPickerInput(control)) syncActionPicker(control);
      control.classList.remove("invalid");
    }
    elements.nodeEditorJson.value = formatJson(match.step);
    elements.nodeEditorJson.classList.remove("invalid");
    renderPickerPanel();
  } finally {
    state.nodeEditorSyncing = false;
  }
}

function setPickerPanelExpanded(expanded) {
  state.pickerPanelExpanded = Boolean(expanded);
  renderPickerPanel();
}

function renderPickerPanel() {
  if (!elements.pickerEventList) return;
  const hasSelection = Boolean(state.selectedGraphNodeId && findWorkflowNode(currentWorkflowRecord()?.workflow, state.selectedGraphNodeId));
  if (!hasSelection) state.pickerPanelExpanded = false;
  elements.nodePickerPanel.classList.toggle("expanded", state.pickerPanelExpanded);
  elements.pickerEventList.hidden = !state.pickerPanelExpanded;
  elements.togglePickerPanelButton.setAttribute("aria-expanded", String(state.pickerPanelExpanded));
  elements.togglePickerPanelButton.setAttribute("aria-label", t(state.pickerPanelExpanded ? "hidePickerPanel" : "showPickerPanel"));
  elements.applyLatestPickButton.disabled = !hasSelection || !state.pickerEvents.length;
  const latest = state.pickerEvents[0] ?? null;
  const activeTargetUrl = state.pickerSession?.targetUrl || state.pickerSession?.allowedUrls?.[0] || "";
  elements.latestPickerStatus.textContent = activeTargetUrl
    ? t("pickerTargetActive", { url: shorten(activeTargetUrl, 56) })
    : latest
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
        <span>${escapeHtml(actionLabel(pickerEvent.suggestedAction || "click"))}</span>
        <span>${escapeHtml(matchInfo)}</span>
        <button class="compact-button" type="button" data-picker-apply="${escapeHtml(pickerEvent.id)}">${escapeHtml(t("apply"))}</button>
      </div>
    `;
    elements.pickerEventList.append(row);
  }
}

function applyPickerEventToSelectedNode(pickerEventId, { toastKey = "selectedPickApplied" } = {}) {
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
  if (isPickerPlaceholderId(previousId)) {
    const nextIdBase = pickerEventStepIdBase(previousId, pickerEvent, match.step.action);
    if (nextIdBase) {
      match.step.id = uniqueWorkflowStepId(workflow, nextIdBase, { excludeId: previousId });
    }
  }
  match.step.targetIdentity = pickerEvent.targetIdentity;
  match.step.selectorCandidates = pickerEvent.selectorCandidates ?? [];
  match.step.pickedFrom = pickerEvent.pickedFrom;
  state.selectedPickerEventId = pickerEvent.id;
  commitGraphNodeEdit(workflow, previousId, String(match.step.id ?? previousId));
  showToast(t(toastKey));
}

async function publishPickerSession(step, allowedUrls, startedAt) {
  try {
    const workflowRecord = currentWorkflowRecord();
    const data = await api("/api/picker/session", {
      method: "POST",
      body: {
        workflowId: state.selectedWorkflowId,
        workflowName: workflowRecord?.name ?? "",
        nodeId: step.id,
        nodeLabel: step.name || step.label || step.id,
        targetUrl: allowedUrls[0] ?? "",
        allowedUrls,
        startedAt
      }
    });
    state.pickerSession = data.session ?? null;
  } catch (error) {
    showToast(error.message);
  }
}

async function clearPickerSession(reason = "cleared") {
  try {
    const data = await api("/api/picker/session", {
      method: "DELETE",
      body: {
        sessionId: state.pickerSession?.id ?? null,
        reason
      }
    });
    state.pickerSession = data.session ?? null;
  } catch (_) {
    state.pickerSession = null;
  }
}

function resolvePickerTargetUrls(workflow, match) {
  const urls = [];
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  const addUrl = (url) => {
    const value = typeof url === "string" ? url.trim() : "";
    if (!/^https?:\/\//i.test(value) || urls.includes(value)) return;
    urls.push(value);
  };

  if (match?.kind === "browser") {
    const branch = steps[match.topIndex]?.browserSteps ?? [];
    for (let index = match.childIndex; index >= 0; index -= 1) {
      if (branch[index]?.action === "goto") {
        addUrl(branch[index].url);
        break;
      }
    }
    for (const child of branch) {
      if (child?.action === "goto") addUrl(child.url);
    }
  } else if (match?.kind === "main") {
    if (match.step?.action === "goto") addUrl(match.step.url);
    for (let index = match.topIndex; index >= 0; index -= 1) {
      collectStepGotoUrls(steps[index], addUrl, { reverseChildren: true });
    }
  } else if (match?.kind === "api") {
    collectStepGotoUrls(steps[match.topIndex], addUrl, { reverseChildren: true });
  }

  if (!urls.length) {
    for (const step of steps) {
      collectStepGotoUrls(step, addUrl);
      if (urls.length) break;
    }
  }

  return urls.slice(0, 5);
}

function collectStepGotoUrls(step, addUrl, { reverseChildren = false } = {}) {
  if (!step || typeof step !== "object") return;
  if (step.action === "goto") addUrl(step.url);
  const children = Array.isArray(step.browserSteps) ? step.browserSteps : [];
  const iterable = reverseChildren ? [...children].reverse() : children;
  for (const child of iterable) {
    collectStepGotoUrls(child, addUrl, { reverseChildren });
  }
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

function deleteSelectedGraphNode() {
  if (!state.selectedGraphNodeId) return;
  const workflow = readWorkflowDraft();
  if (!workflow || !Array.isArray(workflow.steps)) return;
  const match = findWorkflowNode(workflow, state.selectedGraphNodeId);
  if (!match) return;
  if (!window.confirm(t("deleteNodeConfirm"))) return;

  const deletedIds = collectDeletedGraphNodeIds(match.step);
  const nextSelectedId = removeGraphNodeStep(workflow, match);
  cleanupDeletedGraphNodeState(deletedIds);
  state.selectedGraphNodeId = nextSelectedId;
  commitWorkflowDraft(workflow);
  if (state.selectedWorkflowId) saveGraphPositions(state.selectedWorkflowId, state.graphPositions);
  renderGraph();
  showToast(t("nodeDeleted"));
}

async function addPickerGraphNode() {
  const workflow = readWorkflowDraft();
  if (!workflow || !Array.isArray(workflow.steps)) return;

  const match = state.selectedGraphNodeId ? findWorkflowNode(workflow, state.selectedGraphNodeId) : null;
  const startedAt = new Date().toISOString();
  const allowedUrls = resolvePickerTargetUrls(workflow, match);
  const newStep = createGraphNodeStep(workflow, match, {
    base: "pick-target",
    action: "click",
    label: "Pick target",
    selector: "",
    pickerRequest: {
      status: "waiting",
      startedAt,
      targetUrl: allowedUrls[0] ?? "",
      allowedUrls
    }
  });
  insertGraphNodeStep(workflow, match, newStep);

  state.selectedGraphNodeId = newStep.id;
  state.pendingPickerNodeId = newStep.id;
  state.pendingPickerStartedAt = startedAt;
  commitWorkflowDraft(workflow);
  if (state.selectedWorkflowId) saveGraphPositions(state.selectedWorkflowId, state.graphPositions);
  renderGraph();
  revealGraphNodeEditor();
  if (allowedUrls.length) {
    await publishPickerSession(newStep, allowedUrls, startedAt);
    showToast(t("pickerWaiting", { url: shorten(allowedUrls[0], 60) }));
  } else {
    await clearPickerSession("missing_target_url");
    showToast(t("pickerNoTargetUrl"));
  }
}

function createGraphNodeStep(workflow, match, overrides = {}) {
  const topLevel = match?.kind !== "browser";
  const requestedBase = overrides.base || "next-step";
  const base = topLevel
    ? sanitizeWorkflowStepIdSegment(requestedBase) || "next-step"
    : scopedBrowserStepIdBase(workflow, match, requestedBase);
  return {
    id: uniqueWorkflowStepId(workflow, base),
    action: overrides.action || "checkpoint",
    label: overrides.label || (topLevel ? "Next step" : "Next browser step"),
    ...(overrides.selector != null ? { selector: overrides.selector } : {}),
    ...(overrides.pickerRequest ? { pickerRequest: overrides.pickerRequest } : {})
  };
}

function applyPendingPickerEventIfReady() {
  if (!state.pendingPickerNodeId || !state.pendingPickerStartedAt) return false;
  const pendingTime = Date.parse(state.pendingPickerStartedAt);
  const pickerEvent = state.pickerEvents.find((event) => Date.parse(event.createdAt || "") >= pendingTime);
  if (!pickerEvent) return false;
  state.selectedGraphNodeId = state.pendingPickerNodeId;
  state.pendingPickerNodeId = null;
  state.pendingPickerStartedAt = null;
  applyPickerEventToSelectedNode(pickerEvent.id, { toastKey: "pickerAutoApplied" });
  clearPickerSession("applied").then(() => renderPickerPanel());
  return true;
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

function removeGraphNodeStep(workflow, match) {
  if (match.kind === "browser") {
    const operation = workflow.steps[match.topIndex];
    const branch = Array.isArray(operation?.browserSteps) ? operation.browserSteps : [];
    branch.splice(match.childIndex, 1);
    return branch[match.childIndex]?.id ?? branch[match.childIndex - 1]?.id ?? operation?.id ?? null;
  }

  if (match.kind === "api") {
    const operation = workflow.steps[match.topIndex];
    if (operation?.api) delete operation.api;
    return operation?.id ?? null;
  }

  workflow.steps.splice(match.topIndex, 1);
  return workflow.steps[match.topIndex]?.id ?? workflow.steps[match.topIndex - 1]?.id ?? null;
}

function collectDeletedGraphNodeIds(step) {
  const ids = [];
  collectWorkflowStepId(step, {
    add(id) {
      ids.push(id);
    }
  });
  return ids;
}

function cleanupDeletedGraphNodeState(stepIds) {
  for (const stepId of stepIds) {
    delete state.graphPositions[stepId];
  }
  if (stepIds.includes(state.pendingPickerNodeId)) {
    state.pendingPickerNodeId = null;
    state.pendingPickerStartedAt = null;
    void clearPickerSession("node_deleted");
  }
  removeOperationModeEntries(stepIds);
}

function removeOperationModeEntries(stepIds) {
  if (!stepIds.length) return;
  let modes;
  try {
    modes = JSON.parse(elements.operationModesJson.value || "{}");
  } catch {
    return;
  }
  if (!modes || typeof modes !== "object" || Array.isArray(modes)) return;

  let changed = false;
  for (const stepId of stepIds) {
    if (!Object.hasOwn(modes, stepId)) continue;
    delete modes[stepId];
    changed = true;
  }
  if (!changed) return;

  elements.operationModesJson.value = formatJson(modes);
  try {
    const context = parseJson(elements.runContextJson.value, "Context");
    context.operationModes = modes;
    elements.runContextJson.value = formatJson(context);
  } catch {
    // Run context JSON can be repaired separately; node deletion should still proceed.
  }
}

function uniqueWorkflowStepId(workflow, base, { excludeId = null } = {}) {
  const existing = collectWorkflowStepIds(workflow);
  if (excludeId) existing.delete(String(excludeId));
  const normalizedBase = normalizeWorkflowStepId(base || "next-step") || "next-step";
  if (!existing.has(normalizedBase)) return normalizedBase;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = appendWorkflowStepIdSuffix(normalizedBase, index);
    if (!existing.has(candidate)) return candidate;
  }
  return appendWorkflowStepIdSuffix(normalizedBase, Date.now().toString(36));
}

function scopedBrowserStepIdBase(workflow, match, requestedBase) {
  const parentId = String(workflow.steps?.[match.topIndex]?.id ?? "operation").trim() || "operation";
  const localId = sanitizeWorkflowStepIdSegment(requestedBase) || "next-step";
  return `${parentId}.${localId}`;
}

function pickerEventStepIdBase(currentId, pickerEvent, action) {
  const parentPrefix = String(currentId ?? "").includes(".")
    ? String(currentId).split(".").slice(0, -1).join(".")
    : "";
  const identity = pickerEvent?.targetIdentity ?? {};
  const attrs = identity.attributes && typeof identity.attributes === "object" ? identity.attributes : {};
  const targetName = firstIdPart(
    attrs["data-e2e"],
    attrs["data-testid"],
    attrs["data-test"],
    attrs["data-cy"],
    attrs.name,
    attrs.id,
    identity.inputType,
    identity.tagName,
    "target"
  );
  const localId = sanitizeWorkflowStepIdSegment(`${action || pickerEvent?.suggestedAction || "click"}-${targetName}`) || "pick-target";
  return parentPrefix ? `${parentPrefix}.${localId}` : localId;
}

function isPickerPlaceholderId(stepId) {
  const localId = String(stepId ?? "").split(".").at(-1) ?? "";
  return /^pick-target(?:-\d+)?$/.test(localId);
}

function normalizeWorkflowStepId(value) {
  return String(value ?? "")
    .split(".")
    .map((segment) => sanitizeWorkflowStepIdSegment(segment))
    .filter(Boolean)
    .join(".");
}

function sanitizeWorkflowStepIdSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function appendWorkflowStepIdSuffix(stepId, suffix) {
  const parts = String(stepId || "next-step").split(".");
  const last = parts.pop() || "next-step";
  parts.push(`${last}-${suffix}`);
  return parts.join(".");
}

function firstIdPart(...values) {
  for (const value of values) {
    const part = sanitizeWorkflowStepIdSegment(value);
    if (part) return part;
  }
  return "target";
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

function setupActionPickers() {
  document.querySelectorAll("[data-action-picker]").forEach((picker) => {
    const input = elements[picker.dataset.actionPicker];
    const trigger = picker.querySelector(".action-picker-trigger");
    if (!input || !trigger) return;
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleActionPicker(input);
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openActionPicker(input);
    });
    syncActionPicker(input);
  });
}

function toggleActionPicker(input) {
  const picker = actionPickerForInput(input);
  const menu = picker?.querySelector(".action-picker-menu");
  if (!picker || !menu || input.disabled) return;
  if (menu.hidden) openActionPicker(input);
  else closeActionPickers();
}

function openActionPicker(input) {
  const picker = actionPickerForInput(input);
  if (!picker || input.disabled) return;
  closeActionPickers(picker);
  renderActionPicker(input);
  const trigger = picker.querySelector(".action-picker-trigger");
  const menu = picker.querySelector(".action-picker-menu");
  if (!trigger || !menu) return;
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
}

function closeActionPickers(target = null) {
  document.querySelectorAll("[data-action-picker]").forEach((picker) => {
    if (target && picker.contains(target)) return;
    const trigger = picker.querySelector(".action-picker-trigger");
    const menu = picker.querySelector(".action-picker-menu");
    if (!trigger || !menu) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  });
}

function renderActionPickers() {
  syncActionPicker(elements.nodeEditorAction);
  syncActionPicker(elements.registryItemActionType);
}

function renderActionPicker(input) {
  const picker = actionPickerForInput(input);
  const menu = picker?.querySelector(".action-picker-menu");
  if (!menu) return;
  menu.innerHTML = "";
  for (const value of actionPickerValues(input)) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `action-picker-option ${value === input.value ? "active" : ""}`;
    option.dataset.actionValue = value;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(value === input.value));
    option.innerHTML = `
      ${actionLabelHtml(value)}
      <span class="action-picker-code">${escapeHtml(value)}</span>
    `;
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      setActionPickerValue(input, value, { emit: true });
      closeActionPickers();
    });
    menu.append(option);
  }
}

function syncActionPicker(input) {
  if (!isActionPickerInput(input)) return;
  const picker = actionPickerForInput(input);
  const trigger = picker?.querySelector(".action-picker-trigger");
  const label = picker?.querySelector("[data-action-picker-label]");
  if (!picker || !trigger || !label) return;
  label.innerHTML = actionLabelHtml(input.value);
  trigger.disabled = Boolean(input.disabled);
  trigger.classList.toggle("invalid", input.classList.contains("invalid"));
  renderActionPicker(input);
}

function setActionPickerValue(input, value, { emit = false } = {}) {
  input.value = value;
  syncActionPicker(input);
  if (!emit) return;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function actionPickerValues(input) {
  const values = ACTION_PICKER_VALUES[input?.id] ?? [];
  if (!input?.value || values.includes(input.value)) return values;
  return [...values, input.value];
}

function actionPickerForInput(input) {
  if (!input?.id) return null;
  return document.querySelector(`[data-action-picker="${CSS.escape(input.id)}"]`);
}

function isActionPickerInput(input) {
  return Boolean(input?.id && ACTION_PICKER_VALUES[input.id]);
}

function setupFieldHelps() {
  document.querySelectorAll("label").forEach((label) => {
    const fieldId = fieldIdForLabel(label);
    if (!fieldId || !FIELD_HELP[fieldId] || label.dataset.helpReady === "true") return;
    label.dataset.helpReady = "true";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "field-help-button";
    button.dataset.fieldHelp = fieldId;
    button.innerHTML = `
      <span class="field-help-icon" aria-hidden="true">i</span>
      <span class="field-help-popover" role="tooltip">
        <strong data-field-help-title></strong>
        <span data-field-help-body></span>
      </span>
    `;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleFieldHelp(button);
    });
    button.addEventListener("mouseenter", () => positionFieldHelp(button));
    button.addEventListener("focus", () => positionFieldHelp(button));

    const existingRow = label.parentElement?.classList.contains("field-label-row") ? label.parentElement : null;
    if (existingRow) {
      const main = document.createElement("span");
      main.className = "field-label-main";
      existingRow.insertBefore(main, label);
      main.append(label, button);
    } else {
      const row = document.createElement("div");
      row.className = "field-label-line";
      label.parentNode.insertBefore(row, label);
      row.append(label, button);
    }
  });
  renderFieldHelps();
}

function renderFieldHelps() {
  document.querySelectorAll("[data-field-help]").forEach((button) => {
    const help = fieldHelpFor(button.dataset.fieldHelp);
    if (!help) return;
    button.setAttribute("aria-label", help.title);
    button.title = help.title;
    button.querySelector("[data-field-help-title]").textContent = help.title;
    button.querySelector("[data-field-help-body]").textContent = help.body;
  });
}

function toggleFieldHelp(button) {
  const active = button.classList.contains("active");
  closeFieldHelps();
  positionFieldHelp(button);
  button.classList.toggle("active", !active);
}

function closeFieldHelps(target = null) {
  document.querySelectorAll(".field-help-button.active").forEach((button) => {
    if (target && button.contains(target)) return;
    button.classList.remove("active");
  });
}

function positionFieldHelp(button) {
  const popover = button.querySelector(".field-help-popover");
  if (!popover) return;
  const rect = button.getBoundingClientRect();
  const width = Math.min(280, Math.max(180, window.innerWidth - 32));
  const estimatedHeight = 110;
  let left = rect.left + rect.width / 2 - width + 32;
  left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
  let top = rect.bottom + 8;
  if (top + estimatedHeight > window.innerHeight - 16) top = Math.max(16, rect.top - estimatedHeight - 8);
  const caretLeft = Math.max(12, Math.min(width - 20, rect.left + rect.width / 2 - left - 4));
  popover.style.setProperty("--field-help-left", `${left}px`);
  popover.style.setProperty("--field-help-top", `${top}px`);
  popover.style.setProperty("--field-help-caret-left", `${caretLeft}px`);
}

function fieldHelpFor(fieldId) {
  return FIELD_HELP[fieldId]?.[state.language] ?? FIELD_HELP[fieldId]?.en ?? null;
}

function fieldIdForLabel(label) {
  if (label.htmlFor) return label.htmlFor;
  if (label.id?.endsWith("Label")) return label.id.slice(0, -"Label".length);
  return "";
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
  option.textContent = selectOptionLabel(select, value);
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
  if (step.id) {
    const parts = String(step.id).split(".");
    return parts.at(-1) || actionLabel(step.action);
  }
  return actionLabel(step.action);
}

function stepMeta(step, branch) {
  const details = [];
  if (branch && branch !== "main") details.push(branchLabel(branch));
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

function seedBuilderDefaults() {
  if (!elements.builderWorkflowName) return;
  if (!elements.builderWorkflowName.value) elements.builderWorkflowName.value = "Read catalog page";
  if (!elements.builderTargetUrl.value) elements.builderTargetUrl.value = BUILDER_DEFAULT_TARGET_URL;
  if (!elements.builderItemSelector.value) elements.builderItemSelector.value = BUILDER_DEFAULT_ITEM_SELECTOR;
  if (!elements.builderMediaSelector.value) elements.builderMediaSelector.value = BUILDER_DEFAULT_MEDIA_SELECTOR;
  if (!elements.builderListFieldsJson.value) elements.builderListFieldsJson.value = formatJson(BUILDER_DEFAULT_LIST_FIELDS);
  if (!elements.builderDetailFieldsJson.value) elements.builderDetailFieldsJson.value = formatJson(BUILDER_DEFAULT_DETAIL_FIELDS);
}

async function createReadWorkflowFromBuilder() {
  try {
    const targetUrl = elements.builderTargetUrl.value.trim() || BUILDER_DEFAULT_TARGET_URL;
    const url = new URL(targetUrl);
    const workflowName = elements.builderWorkflowName.value.trim() || `Read ${url.hostname}`;
    const itemSelector = elements.builderItemSelector.value.trim();
    const mediaSelector = elements.builderMediaSelector.value.trim();
    const listFields = parseJson(elements.builderListFieldsJson.value, t("listFieldsJson"));
    const detailFields = parseJson(elements.builderDetailFieldsJson.value, t("detailFieldsJson"));
    const workflowRecord = createReadWorkflowRecord({
      workflowName,
      targetUrl: url.toString(),
      itemSelector,
      mediaSelector,
      listFields,
      detailFields
    });
    const data = await api("/api/workflows", { method: "POST", body: workflowRecord });
    await loadWorkflows();
    selectWorkflow(data.workflow.id);
    selectTab("run");
    render();
    showToast(t("readWorkflowCreated"));
  } catch (error) {
    showToast(error.message);
  }
}

function createReadWorkflowRecord({ workflowName, targetUrl, itemSelector, mediaSelector, listFields, detailFields }) {
  const id = `read-${slugify(workflowName)}-${Date.now().toString(36)}`;
  const steps = [
    { id: "open", action: "goto", url: targetUrl }
  ];

  if (itemSelector) {
    steps.push({ id: "wait-list", action: "waitFor", selector: itemSelector });
    steps.push({
      id: "read-list",
      action: "extractList",
      selector: itemSelector,
      fields: listFields,
      limit: 20,
      name: "list"
    });
  }

  if (Object.keys(detailFields).length > 0) {
    steps.push({
      id: "read-detail",
      action: "extractDetail",
      fields: detailFields,
      name: "detail"
    });
  }

  if (mediaSelector) {
    steps.push({
      id: "read-media",
      action: "extractMedia",
      selector: mediaSelector,
      limit: 20,
      name: "media"
    });
  }

  steps.push({ id: "capture", action: "screenshot", name: "read-page", fullPage: true });

  return {
    id,
    name: workflowName,
    description: `Read list, detail, and media from ${targetUrl}`,
    workflow: {
      name: slugify(workflowName),
      version: "0.1.0",
      defaults: { timeoutMs: 10000, screenshot: "on-failure" },
      steps
    },
    defaultRun: {
      mode: "dry-run",
      profileId: "dry-run-demo",
      input: {},
      context: {},
      driverConfig: createBuilderDriverConfig({ targetUrl, itemSelector, mediaSelector, listFields, detailFields })
    },
    graph: { layout: "sequence", positions: {} }
  };
}

function createBuilderDriverConfig({ targetUrl, itemSelector, mediaSelector, listFields, detailFields }) {
  const selectors = {};
  if (itemSelector) {
    selectors[itemSelector] = {
      items: [0, 1, 2].map((_, index) => createFixtureRecordNode(listFields, {
        currentUrl: targetUrl,
        index,
        prefix: "List item"
      }))
    };
  }
  if (mediaSelector) {
    selectors[mediaSelector] = {
      items: [
        {
          tagName: "img",
          attributes: {
            src: BUILDER_SAMPLE_IMAGE_URL,
            alt: "Sample image",
            width: "960",
            height: "640"
          }
        },
        {
          tagName: "video",
          attributes: {
            src: "/media/sample-video.mp4",
            poster: BUILDER_SAMPLE_IMAGE_URL,
            title: "Sample video"
          }
        }
      ]
    };
  }

  const detailNode = createFixtureRecordNode(detailFields, {
    currentUrl: targetUrl,
    index: 0,
    prefix: "Detail"
  });
  Object.assign(selectors, detailNode.selectors);

  return {
    pages: {
      [targetUrl]: { selectors }
    }
  };
}

function createFixtureRecordNode(fields, { currentUrl, index, prefix }) {
  const node = { text: `${prefix} ${index + 1}`, selectors: {} };
  for (const [name, rawSpec] of Object.entries(fields ?? {})) {
    const field = normalizeBuilderFieldSpec(rawSpec);
    if (!field.selector) {
      node.text = fixtureValueForField(name, field, { currentUrl, index, prefix });
      continue;
    }
    node.selectors[field.selector] = mergeFixtureFieldNode(
      node.selectors[field.selector],
      fixtureValueForField(name, field, { currentUrl, index, prefix }),
      field
    );
  }
  return node;
}

function mergeFixtureFieldNode(existing, value, field) {
  const node = existing ?? { text: "", value: "", attributes: {} };
  if (field.mode === "attribute" && field.attribute) {
    node.attributes[field.attribute] = value;
    return node;
  }
  if (field.mode === "value") {
    node.value = value;
    return node;
  }
  if (field.mode === "html") {
    node.html = `<span>${escapeHtml(value)}</span>`;
    node.text = value;
    return node;
  }
  node.text = value;
  return node;
}

function fixtureValueForField(name, field, { currentUrl, index, prefix }) {
  const label = toReadableLabel(name);
  if (field.attribute === "src" || field.attribute === "poster" || String(name).toLowerCase().includes("image")) {
    return BUILDER_SAMPLE_IMAGE_URL;
  }
  if (field.type === "number") return String((index + 1) * 10);
  if (field.type === "url" || field.attribute === "href") return new URL(`/detail/${index + 1}`, currentUrl).toString();
  return `${prefix} ${index + 1} ${label}`;
}

function normalizeBuilderFieldSpec(spec) {
  if (typeof spec === "string") return { selector: spec, mode: "text", attribute: null, type: "string" };
  return {
    selector: spec?.selector ?? null,
    mode: spec?.mode ?? (spec?.attribute ? "attribute" : "text"),
    attribute: spec?.attribute ?? spec?.attr ?? null,
    type: spec?.type ?? "string"
  };
}

function toReadableLabel(value) {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
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
  state.runProfileDraftId = workflow.defaultRun?.profileId ?? "";
  elements.profileSelect.value = state.runProfileDraftId;
  elements.approvalToggle.value = "keep";
  elements.operationModesJson.value = formatJson(workflow.defaultRun?.context?.operationModes ?? detectOperationModes(workflow.workflow));
  elements.runInputJson.value = formatJson(workflow.defaultRun?.input ?? {});
  elements.runContextJson.value = formatJson(workflow.defaultRun?.context ?? {});
  elements.driverConfigJson.value = formatJson(workflow.defaultRun?.driverConfig ?? {});
  renderWorkflows();
  renderRunProfileReference();
  renderGraph();
}

function selectProfile(id, { focusPanel = false } = {}) {
  const profile = state.profiles.find((item) => item.id === id);
  if (!profile) return;
  state.selectedProfileId = id;
  const displayProfile = displayProfileForSavedProfile(profile);
  const localProfile = localBrowserProfileForSavedProfile(profile);
  if (localProfile) state.selectedLocalProfileId = localProfile.id;
  elements.profileId.value = profile.id;
  elements.profileName.value = displayProfile.name;
  elements.profileMode.value = profile.mode;
  elements.profilePlatform.value = profile.platform ?? profile.sessionCheck?.platform ?? "";
  elements.profileAccountLabel.value = displayProfile.accountLabel ?? "";
  elements.profileLoginState.value = profile.loginState ?? "unchecked";
  elements.profileStatus.value = profile.status;
  elements.profileDir.value = profile.profileDir ?? "";
  elements.profileDirectory.value = profile.profileDirectory ?? "";
  elements.profileBrowserChannel.value = profile.browserChannel ?? "";
  elements.profileProxyMode.value = profile.network?.proxyMode ?? "system";
  elements.profileProxyServer.value = profile.network?.proxyServer ?? "";
  elements.profileProxyBypass.value = profile.network?.proxyBypass ?? "127.0.0.1,::1,localhost";
  elements.profileCheckUrl.value = profile.sessionCheck?.url ?? "";
  elements.profileAccountSelector.value = profile.sessionCheck?.accountSelector ?? "";
  elements.profileRate.value = profile.rateLimit?.maxPerMinute ?? "";
  renderProfiles();
  if (focusPanel) selectTab("profile");
}

async function selectRun(id, { focusLog = false } = {}) {
  state.selectedRunId = id;
  const data = await api(`/api/runs/${encodeURIComponent(id)}`);
  state.selectedRunDetail = data;
  renderRunDetail(data);
  renderRuns();
  renderGraph();
  if (focusLog) focusRunStepLog();
}

function focusRunStepLog() {
  const panel = elements.runStepLog.closest(".call-log-section");
  panel?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  panel?.classList.add("focus-pulse");
  setTimeout(() => panel?.classList.remove("focus-pulse"), 900);
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
  renderRunStepLog(run, events);
  renderOutputPreview(run.outputs ?? {});
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

function renderEmptyRunDetail() {
  elements.selectedRunStatus.textContent = t("none");
  elements.selectedRunStatus.className = "pill muted";
  elements.runActivity.className = "run-activity muted";
  elements.runActivity.innerHTML = `
    <strong>${escapeHtml(statusLabel("idle"))}</strong>
    <span>${escapeHtml(t("runActivityIdle"))}</span>
  `;
  elements.runStepLog.innerHTML = `<div class="event-meta">${escapeHtml(t("noStepLogs"))}</div>`;
  renderOutputPreview({});
  elements.runSummary.textContent = "";
  elements.eventTimeline.innerHTML = "";
  elements.artifactList.innerHTML = `<div class="event-meta">${escapeHtml(t("noArtifacts"))}</div>`;
}

function renderRunStepLog(run, events = []) {
  const logEvents = runStepLogEvents(run, events);
  if (!logEvents.length) {
    elements.runStepLog.innerHTML = `<div class="event-meta">${escapeHtml(t("noStepLogs"))}</div>`;
    return;
  }

  elements.runStepLog.innerHTML = logEvents.slice(-10).map((event) => `
    <div class="step-log-row ${stepLogStatusClass(event)}">
      <div class="step-log-head">
        <strong>${escapeHtml(stepLogTitle(event))}</strong>
        <span>${escapeHtml(formatTime(event.createdAt ?? event.completedAt ?? event.failedAt ?? event.startedAt))}</span>
      </div>
      <div class="step-log-meta">${escapeHtml(eventDetail(event, run))}</div>
    </div>
  `).join("");
  elements.runStepLog.scrollTop = elements.runStepLog.scrollHeight;
}

function runStepLogEvents(run, events = []) {
  const items = events.filter((event) => event.stepId);
  if (run.error?.stepId && !items.some((event) => event.type === "step.failed" && event.stepId === run.error.stepId)) {
    items.push({
      type: "step.failed",
      runId: run.id,
      stepId: run.error.stepId,
      action: findWorkflowStep(run.workflowId, run.error.stepId)?.action ?? null,
      error: run.error,
      createdAt: run.completedAt ?? run.updatedAt ?? run.startedAt
    });
  }
  return items.sort((a, b) => String(a.createdAt ?? a.startedAt ?? "").localeCompare(String(b.createdAt ?? b.startedAt ?? "")));
}

function stepLogTitle(event) {
  const stateLabel = event.type === "step.completed"
    ? statusLabel("completed")
    : event.type === "step.failed"
      ? statusLabel("failed")
      : event.type === "step.skipped_after_error"
        ? "skipped"
        : event.type === "step.delay"
          ? "delay"
          : statusLabel("running");
  const action = event.action ? ` · ${actionLabel(event.action)}` : "";
  return `${stateLabel} · ${event.stepId}${action}`;
}

function stepLogStatusClass(event) {
  if (event.type === "step.completed") return "success";
  if (event.type === "step.failed") return "danger";
  if (event.type === "step.skipped_after_error") return "warning";
  return "muted";
}

function renderOutputPreview(outputs = {}) {
  const entries = Object.entries(outputs ?? {});
  if (entries.length === 0) {
    elements.runOutputPreview.innerHTML = `<div class="event-meta">${escapeHtml(t("noOutputs"))}</div>`;
    return;
  }

  elements.runOutputPreview.innerHTML = `
    <div class="output-preview-head">
      <strong>${escapeHtml(t("outputs"))}</strong>
      <span>${escapeHtml(String(entries.length))}</span>
    </div>
    ${entries.map(([name, value]) => renderOutputEntry(name, value)).join("")}
  `;
}

function renderOutputEntry(name, value) {
  return `
    <section class="output-entry">
      <div class="output-entry-title">${escapeHtml(name)}</div>
      ${renderOutputValue(value)}
    </section>
  `;
}

function renderOutputValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return `<div class="event-meta">${escapeHtml(t("noOutputs"))}</div>`;
    if (isMediaOutput(value)) return renderMediaOutput(value);
    if (value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return renderOutputTable(value);
    }
    return `<pre class="mini-json">${escapeHtml(formatJson(value.slice(0, 12)))}</pre>`;
  }
  if (value && typeof value === "object") return renderOutputTable([value]);
  return `<div class="output-scalar">${escapeHtml(String(value ?? ""))}</div>`;
}

function renderOutputTable(rows) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row ?? {})))).slice(0, 6);
  if (columns.length === 0) return `<div class="event-meta">${escapeHtml(t("noOutputs"))}</div>`;
  return `
    <div class="output-table-wrap">
      <table class="output-table">
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.slice(0, 12).map((row) => `
            <tr>
              ${columns.map((column) => `<td>${escapeHtml(formatOutputCell(row?.[column]))}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMediaOutput(items) {
  return `
    <div class="media-grid">
      ${items.slice(0, 12).map((item) => {
        const url = item?.url ?? item?.src ?? item?.href ?? "";
        const title = item?.attributes?.alt ?? item?.attributes?.title ?? item?.tagName ?? url;
        return `
          <a class="media-card" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer">
            ${isImageUrl(url) ? `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(title)}" loading="lazy" />` : `<span class="media-file">${escapeHtml(item?.tagName || "media")}</span>`}
            <span>${escapeHtml(title || url)}</span>
          </a>
        `;
      }).join("")}
    </div>
  `;
}

function isMediaOutput(items) {
  return items.some((item) => item && typeof item === "object" && (item.url || item.src || item.href || item.tagName || item.attributes?.src));
}

function isImageUrl(value) {
  const url = String(value ?? "");
  return /^data:image\//i.test(url) || /\.(apng|avif|gif|jpe?g|png|svg|webp)(\?|#|$)/i.test(url);
}

function formatOutputCell(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function summarizeRunActivity(run, events = []) {
  const latestStepEvent = [...events].reverse().find((event) => event.stepId);
  const profile = run.profileName || run.profileId || t("noProfile");
  if (!latestStepEvent) {
    const blockedState = run.error?.details?.blockedState;
    if (run.status === "blocked" || blockedState) {
      return {
        title: statusLabel("blocked"),
        detail: t("runActivityBlocked", {
          step: t("browserStartup"),
          state: blockedStateLabel(blockedState),
          hint: recoveryHintLabel(blockedState, run.error?.details?.recoveryHint ?? "")
        })
      };
    }
    if (run.status === "failed") {
      return {
        title: statusLabel("failed"),
        detail: t("runActivityFailed", {
          step: t("browserStartup"),
          error: cleanErrorMessage(run.error?.message ?? "")
        })
      };
    }
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
  const failure = latestStepEvent.error ?? run.error ?? {};
  const blockedState = failure.details?.blockedState ?? run.error?.details?.blockedState;
  if (run.status === "blocked" || blockedState) {
    return {
      title: statusLabel(run.status === "blocked" ? "blocked" : "failed"),
      detail: t("runActivityBlocked", {
        step: stepText,
        state: blockedStateLabel(blockedState),
        hint: recoveryHintLabel(blockedState, failure.details?.recoveryHint ?? run.error?.details?.recoveryHint ?? "")
      })
    };
  }
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
  if (event.action ?? step?.action) parts.push(actionLabel(event.action ?? step.action));
  const target = stepTarget(step);
  if (target) parts.push(target);
  if (event.details?.value != null) parts.push(`${eventLabel("value")}: ${formatEventValue(event.details.value)}`);
  if (Array.isArray(event.details?.templateValues)) {
    for (const item of event.details.templateValues) {
      parts.push(`${item.path} -> ${formatEventValue(item.value)}`);
    }
  }
  if (event.error?.message) parts.push(cleanErrorMessage(event.error.message));
  if (event.error?.details?.selector) parts.push(`${eventLabel("selector")}: ${event.error.details.selector}`);
  if (Array.isArray(event.error?.details?.attempts)) {
    const lastAttempt = event.error.details.attempts.at(-1);
    if (lastAttempt) {
      parts.push(`${lastAttempt.selector}: ${lastAttempt.status}${lastAttempt.visibleCount == null ? "" : ` · ${eventLabel("matched")} ${lastAttempt.visibleCount}`}`);
    }
  }
  if (event.error?.details?.blockedState) parts.push(blockedStateLabel(event.error.details.blockedState));
  if (event.error?.details?.recoveryHint) {
    parts.push(recoveryHintLabel(event.error.details.blockedState, event.error.details.recoveryHint));
  }
  if (event.result?.target) parts.push(formatTargetMatch(event.result.target));
  if (event.result?.value != null) parts.push(`${eventLabel("setValue")}: ${formatEventValue(event.result.value)}`);
  if (event.result?.actualValue != null) parts.push(`${eventLabel("actualValue")}: ${formatEventValue(event.result.actualValue)}`);
  if (event.result?.url) parts.push(event.result.url);
  if (event.workflow?.name) parts.push(event.workflow.name);
  return parts.join(" · ");
}

function formatTargetMatch(target) {
  const selector = target.selector || target.requestedSelector || "";
  const count = target.visibleCount ?? target.resolvedVisibleCount ?? target.count ?? target.resolvedCount;
  const score = target.score == null ? "" : ` · score ${target.score}`;
  const countText = count == null ? "" : ` · ${eventLabel("matched")} ${count}`;
  return `${eventLabel("selector")}: ${selector}${countText}${score}`;
}

function eventLabel(key) {
  const labels = {
    en: {
      actualValue: "page value",
      matched: "matched",
      selector: "selector",
      setValue: "set",
      value: "value"
    },
    zh: {
      actualValue: "页面值",
      matched: "命中",
      selector: "选择器",
      setValue: "设置",
      value: "值"
    }
  };
  return labels[state.language]?.[key] ?? labels.en[key] ?? key;
}

function formatEventValue(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function describeStep(event, step) {
  const parts = [event.stepId ?? step?.id ?? (event.action ? actionLabel(event.action) : "step")];
  if (event.action ?? step?.action) parts.push(actionLabel(event.action ?? step.action));
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
  renderRegistryItemList();

  const item = currentRegistryItem() ?? createBlankRegistryRecord(state.selectedRegistrySection);
  syncRegistryForm(item);
  const canBuildWorkflow = state.selectedRegistrySection === "operations" && Boolean(item.id);
  document.querySelector("#buildWorkflowFromOperationButton").disabled = !canBuildWorkflow;
}

function renderRegistryMetrics() {
  elements.registryMetrics.innerHTML = REGISTRY_SECTIONS.map((section) => {
    const count = state.registry?.[section.id]?.length ?? 0;
    const active = state.selectedRegistrySection === section.id;
    return `
      <button class="registry-metric ${active ? "active" : ""}" type="button" data-section="${section.id}" aria-pressed="${active ? "true" : "false"}">
        <span class="registry-metric-label">${escapeHtml(t(section.labelKey))}</span>
        <span class="registry-metric-count">${count}</span>
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
  syncActionPicker(elements.registryItemActionType);
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
  syncActionPicker(elements.registryItemActionType);
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
  if (action.actionType === "checkSession") return { id, action: "checkSession", accountSelector: action.selector, loggedOutSelector: action.valueTemplate || "", name: action.outputName || "session" };
  if (action.actionType === "setOutput") return { id, action: "setOutput", name: action.outputName || id, value: action.valueTemplate };
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
    const profileId = await resolveSelectedProfileId();
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
        profileId,
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
      profileDirectory: elements.profileDirectory.value.trim(),
      browserChannel: elements.profileBrowserChannel.value.trim(),
      network: profileNetworkFromForm(),
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

async function refreshLocalBrowserProfiles() {
  try {
    await loadLocalBrowserProfiles();
    const selectedProfile = state.profiles.find((profile) => profile.id === state.selectedProfileId);
    const localProfile = localBrowserProfileForSavedProfile(selectedProfile);
    if (localProfile) state.selectedLocalProfileId = localProfile.id;
    renderProfiles();
    renderLocalBrowserProfiles();
  } catch (error) {
    showToast(error.message);
  }
}

async function handleProfileSelectChange() {
  const value = elements.profileSelect.value;
  const localProfileId = localProfileIdFromOptionValue(value);
  if (localProfileId) {
    const localProfile = state.localBrowserProfiles.find((profile) => profile.id === localProfileId);
    if (localProfile) await importAndSelectLocalProfile(localProfile, { assignRunProfile: true });
    return;
  }
  state.runProfileDraftId = value || "";
  renderRunProfileReference();
}

async function applySelectedLocalProfile() {
  try {
    const localProfile = state.localBrowserProfiles.find((profile) => profile.id === elements.localProfileSelect.value);
    if (!localProfile) return;
    await importAndSelectLocalProfile(localProfile, { focusPanel: true });
  } catch (error) {
    showToast(error.message);
  }
}

async function importAndSelectLocalProfile(localProfile, { assignRunProfile = false, focusPanel = false } = {}) {
  state.selectedLocalProfileId = localProfile.id;
  if (localProfile.existingProfileId) {
    const existingProfile = state.profiles.find((profile) => profile.id === localProfile.existingProfileId);
    const data = await api("/api/profiles", {
      method: "POST",
      body: localProfileSaveBody(localProfile, {
        id: localProfile.existingProfileId,
        includeRuntimeDefaults: false,
        existingProfile
      })
    });
    await Promise.all([loadProfiles(), loadLocalBrowserProfiles(), loadAudit()]);
    state.selectedLocalProfileId = localProfile.id;
    selectProfile(data.profile.id, { focusPanel });
    if (assignRunProfile) {
      state.runProfileDraftId = data.profile.id;
      elements.profileSelect.value = data.profile.id;
    }
    render();
    renderRunProfileReference();
    showToast(t("localProfileImported"));
    return data.profile.id;
  }
  const body = localProfileSaveBody(localProfile, {
    id: uniqueProfileId(localProfile.id),
    includeRuntimeDefaults: true
  });
  const data = await api("/api/profiles", {
    method: "POST",
    body
  });
  await Promise.all([loadProfiles(), loadLocalBrowserProfiles(), loadAudit()]);
  state.selectedLocalProfileId = localProfile.id;
  selectProfile(data.profile.id, { focusPanel });
  if (assignRunProfile) {
    state.runProfileDraftId = data.profile.id;
    elements.profileSelect.value = data.profile.id;
  }
  render();
  renderRunProfileReference();
  showToast(t("localProfileImported"));
  return data.profile.id;
}

async function resolveSelectedProfileId() {
  const value = elements.profileSelect.value;
  const localProfileId = localProfileIdFromOptionValue(value);
  if (!localProfileId) return value || null;
  const localProfile = state.localBrowserProfiles.find((profile) => profile.id === localProfileId);
  return localProfile ? await importAndSelectLocalProfile(localProfile, { assignRunProfile: true }) : null;
}

async function editRunProfileFromRunConfig() {
  try {
    const profileId = await resolveSelectedProfileId();
    if (!profileId) return;
    selectProfile(profileId, { focusPanel: true });
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
        profileDir: elements.profileDir.value.trim(),
        profileDirectory: elements.profileDirectory.value.trim(),
        browserChannel: elements.profileBrowserChannel.value.trim(),
        network: profileNetworkFromForm(),
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

async function openSelectedProfileLoginWindow() {
  try {
    const id = elements.profileId.value.trim();
    if (!id) throw new Error(t("profileIdRequired"));
    const sessionCheck = profileSessionCheckFromForm();
    await api(`/api/profiles/${encodeURIComponent(id)}/open-login`, {
      method: "POST",
      body: {
        platform: elements.profilePlatform.value.trim(),
        accountLabel: elements.profileAccountLabel.value.trim(),
        profileDir: elements.profileDir.value.trim(),
        profileDirectory: elements.profileDirectory.value.trim(),
        browserChannel: elements.profileBrowserChannel.value.trim(),
        network: profileNetworkFromForm(),
        ...sessionCheck
      }
    });
    await loadAudit();
    render();
    showToast(t("loginWindowOpened"));
  } catch (error) {
    showToast(error.message);
  }
}

async function releaseSelectedProfileBrowser() {
  try {
    const id = elements.profileId.value.trim();
    if (!id) throw new Error(t("profileIdRequired"));
    if (!window.confirm(t("releaseProfileBrowserConfirm"))) return;
    const data = await api(`/api/profiles/${encodeURIComponent(id)}/release-browser`, {
      method: "POST",
      body: { force: true }
    });
    await Promise.all([loadProfiles(), loadAudit()]);
    selectProfile(data.profile.id);
    render();
    const release = data.result?.release ?? {};
    if (release.reason === "no_active_lock" || release.reason === "missing_profile_dir") {
      showToast(t("profileBrowserReleaseNoLock"));
    } else if (release.reason === "owner_not_verified") {
      showToast(t("profileBrowserReleaseUnverified"));
    } else {
      showToast(t("profileBrowserReleaseRequested"));
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function prepareRunInput(workflowDefinition) {
  const input = parseJson(elements.runInputJson.value, "Input");
  if (!isPlainObject(input)) throw new Error(t("runInputMustBeObject"));
  const missingPaths = collectMissingInputTemplatePaths(workflowDefinition, input);
  if (!missingPaths.length) return input;

  const nextInput = await promptForRunInputVariables(missingPaths, input);
  if (!nextInput) return null;
  elements.runInputJson.value = formatJson(nextInput);
  return nextInput;
}

function collectMissingInputTemplatePaths(workflowDefinition, input) {
  const paths = new Set();
  JSON.stringify(workflowDefinition ?? {}).replace(RUN_INPUT_TEMPLATE_PATTERN, (_match, path) => {
    paths.add(path);
    return "";
  });
  return [...paths].filter((path) => getObjectPath(input, path) == null).sort();
}

function promptForRunInputVariables(paths, input) {
  if (pendingRunInputPrompt) resolveRunInputPrompt(null);
  const draft = structuredCloneSafe(input ?? {});
  return new Promise((resolve) => {
    pendingRunInputPrompt = {
      resolve,
      paths,
      input: draft,
      previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null
    };
    renderRunInputPrompt(paths, draft);
    elements.runInputModal.hidden = false;
    elements.runInputModal.querySelector("input")?.focus();
  });
}

function renderRunInputPrompt(paths, input) {
  elements.runInputFields.innerHTML = paths.map((path) => {
    const id = `run-input-${slugify(path)}`;
    const existing = getObjectPath(input, path);
    const value = existing == null ? "" : typeof existing === "string" ? existing : JSON.stringify(existing);
    return `
      <div class="run-input-field">
        <label for="${escapeAttribute(id)}">
          <span>${escapeHtml(t("input"))}</span>
          <code>{{input.${escapeHtml(path)}}}</code>
        </label>
        <input id="${escapeAttribute(id)}" data-run-input-path="${escapeAttribute(path)}" value="${escapeAttribute(value)}" autocomplete="off" />
      </div>
    `;
  }).join("");
}

function confirmRunInputPrompt() {
  if (!pendingRunInputPrompt) return;
  const nextInput = structuredCloneSafe(pendingRunInputPrompt.input ?? {});
  elements.runInputFields.querySelectorAll("[data-run-input-path]").forEach((input) => {
    setObjectPath(nextInput, input.dataset.runInputPath, input.value);
  });
  resolveRunInputPrompt(nextInput);
}

function resolveRunInputPrompt(value) {
  if (!pendingRunInputPrompt) return;
  const prompt = pendingRunInputPrompt;
  pendingRunInputPrompt = null;
  elements.runInputModal.hidden = true;
  elements.runInputFields.innerHTML = "";
  prompt.previousFocus?.focus?.();
  prompt.resolve(value);
}

async function runSelectedWorkflow() {
  if (!state.selectedWorkflowId) return;
  try {
    const workflowDefinition = parseJson(elements.workflowJson.value, "Workflow");
    commitWorkflowDraft(workflowDefinition, { syncTextarea: false });
    const context = parseJson(elements.runContextJson.value, "Context");
    applyOperationModes(context);
    applyApprovalToggle(context);
    const profileId = await resolveSelectedProfileId();
    const input = await prepareRunInput(workflowDefinition);
    if (!input) return;
    const data = await api(`/api/workflows/${encodeURIComponent(state.selectedWorkflowId)}/runs`, {
      method: "POST",
      body: {
        mode: elements.runMode.value,
        profileId,
        input,
        context,
        driverConfig: parseJson(elements.driverConfigJson.value, "Driver"),
        workflow: workflowDefinition
      }
    });
    await trackQueuedRun(data.run.id, t("runQueued"));
  } catch (error) {
    showToast(error.message);
  }
}

async function runWorkflowToNode(nodeId) {
  if (!state.selectedWorkflowId || !nodeId) return;
  try {
    const workflowDefinition = parseJson(elements.workflowJson.value, "Workflow");
    commitWorkflowDraft(workflowDefinition, { syncTextarea: false });
    const context = parseJson(elements.runContextJson.value, "Context");
    applyOperationModes(context);
    applyApprovalToggle(context);
    const profileId = await resolveSelectedProfileId();
    const input = await prepareRunInput(workflowDefinition);
    if (!input) return;
    const data = await api(`/api/workflows/${encodeURIComponent(state.selectedWorkflowId)}/runs`, {
      method: "POST",
      body: {
        mode: elements.runMode.value,
        profileId,
        input,
        context,
        driverConfig: parseJson(elements.driverConfigJson.value, "Driver"),
        workflow: workflowDefinition,
        debug: {
          mode: "run-to-node",
          targetStepId: nodeId
        }
      }
    });
    await trackQueuedRun(data.run.id, t("debugRunQueued", { step: nodeId }));
  } catch (error) {
    showToast(error.message);
  }
}

async function trackQueuedRun(runId, queuedMessage) {
  state.selectedRunId = runId;
  await loadRuns();
  renderRuns();
  await selectRun(runId);
  showToast(queuedMessage);

  const settled = await waitForRunTerminal(runId, 3200);
  if (!settled) return;
  await loadRuns();
  renderRuns();
  await selectRun(runId);
  const activity = summarizeRunActivity(settled.run, settled.events ?? []);
  showToast(activity.detail || activity.title);
}

async function waitForRunTerminal(runId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await api(`/api/runs/${encodeURIComponent(runId)}`);
    if (isTerminalRunStatus(data.run?.status)) return data;
    await sleep(250);
  }
  return null;
}

function isTerminalRunStatus(status) {
  return ["completed", "failed", "blocked", "canceled"].includes(status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function clearDebugRuns() {
  if (!window.confirm(t("clearDebugRunsConfirm"))) return;
  try {
    const data = await api("/api/runs/debug", { method: "DELETE" });
    if (state.selectedRunDetail?.run?.debug) {
      state.selectedRunId = null;
      state.selectedRunDetail = null;
      renderEmptyRunDetail();
    }
    await Promise.all([loadRuns({ reset: true }), loadAudit()]);
    render();
    if (!state.selectedRunId && state.runs[0]) await selectRun(state.runs[0].id);
    showToast(t("debugRunsCleared", { count: data.cleared ?? 0 }));
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
    profileDirectory: "",
    browserChannel: "",
    network: { proxyMode: "system", proxyServer: "", proxyBypass: "127.0.0.1,::1,localhost" },
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
  selectProfile(id, { focusPanel: true });
}

function selectTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${name}Panel`).classList.add("active");
  elements.editorPane.classList.toggle("profile-context-active", name === "profile");
}

function startPolling() {
  state.polling = setInterval(async () => {
    const hasActive = state.runs.some((run) => ["queued", "running"].includes(run.status));
    const shouldPollPicker = Boolean(state.selectedGraphNodeId || state.pickerSession);
    if (!hasActive && !state.selectedRunId && !shouldPollPicker) return;
    await Promise.all([loadRuntime(), loadRegistry(), loadRuns(), loadProfiles(), loadAudit(), loadPickerEvents(), loadPickerSession()]);
    applyPendingPickerEventIfReady();
    render();
    if (state.selectedRunId) await selectRun(state.selectedRunId);
  }, 1500);
}

async function api(url, options = {}) {
  const response = await fetch(appUrl(url), {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? `Request failed: ${response.status}`);
  return data;
}

function normalizeAppBasePath(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "/") return "";
  const normalized = `/${text.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return /^\/[A-Za-z0-9._~/-]+$/.test(normalized) ? normalized : "";
}

function appUrl(path) {
  const text = String(path ?? "");
  if (/^(https?:)?\/\//i.test(text) || text.startsWith("data:")) return text;
  return `${APP_BASE_PATH}${text.startsWith("/") ? text : `/${text}`}`;
}

function setLanguage(language) {
  state.language = language === "zh" ? "zh" : "en";
  localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
  localStorage.setItem(LANGUAGE_CHOICE_STORAGE_KEY, "manual");
  applyStaticTranslations();
  render();
  if (state.selectedRunId) {
    void selectRun(state.selectedRunId);
  }
}

function getInitialLanguage() {
  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const hasManualChoice = localStorage.getItem(LANGUAGE_CHOICE_STORAGE_KEY) === "manual";
  if (hasManualChoice && (storedLanguage === "en" || storedLanguage === "zh")) return storedLanguage;
  return "zh";
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelector("#newWorkflowButton")?.setAttribute("aria-label", t("newWorkflow"));
  document.querySelector("#newProfileButton")?.setAttribute("aria-label", t("newProfile"));
  document.querySelector("#graphHelpButton")?.setAttribute("aria-label", t("workflowGraphHelpTitle"));
  document.querySelector("#graphHelpButton")?.setAttribute("title", t("workflowGraphHelpTitle"));
  elements.languageToggle.setAttribute("aria-label", t("language"));
  elements.languageToggle.setAttribute("aria-pressed", String(state.language === "zh"));
  elements.languageToggle.querySelectorAll("[data-lang-code]").forEach((node) => {
    node.classList.toggle("active", node.dataset.langCode === state.language);
  });
  translateStatusOptions(elements.profileLoginState);
  translateStatusOptions(elements.profileStatus);
  translateStatusOptions(elements.registryItemStatus);
  renderActionPickers();
  renderFieldHelps();
  updateGraphLayoutButtons();
}

function translateStatusOptions(select) {
  for (const option of select.options) {
    option.textContent = statusLabel(option.value);
  }
}

function selectOptionLabel(select, value) {
  if (select === elements.profileLoginState || select === elements.profileStatus || select === elements.registryItemStatus) return statusLabel(value);
  return String(value ?? "");
}

function isTextEditingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function t(key, params = {}) {
  const message = I18N[state.language]?.[key] ?? I18N.en[key] ?? key;
  return message.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => String(params[name] ?? ""));
}

function statusLabel(value) {
  return STATUS_LABELS[state.language]?.[value] ?? STATUS_LABELS.en[value] ?? String(value ?? "");
}

function blockedStateLabel(value) {
  const code = String(value ?? "unknown_failure");
  return BLOCKED_STATE_LABELS[state.language]?.[code]
    ?? BLOCKED_STATE_LABELS.en[code]
    ?? code.replace(/_/g, " ");
}

function recoveryHintLabel(blockedState, fallback = "") {
  const code = String(blockedState ?? "");
  return RECOVERY_HINT_LABELS[state.language]?.[code]
    ?? RECOVERY_HINT_LABELS.en[code]
    ?? fallback;
}

function actionLabel(value) {
  const { primary, secondary } = actionLabelParts(value);
  return [primary, secondary].filter(Boolean).join(" ");
}

function actionLabelHtml(value) {
  const { primary, secondary } = actionLabelParts(value);
  return `
    <span class="action-label">
      <span class="action-label-main">${escapeHtml(primary)}</span>
      ${secondary ? `<span class="action-label-sub">${escapeHtml(secondary)}</span>` : ""}
    </span>
  `;
}

function actionLabelParts(value) {
  const code = String(value ?? "");
  const zh = ACTION_LABELS.zh?.[code];
  const en = ACTION_LABELS.en?.[code];
  if (zh && en) {
    return state.language === "zh"
      ? { primary: zh, secondary: en }
      : { primary: en, secondary: zh };
  }
  return { primary: en ?? zh ?? code, secondary: "" };
}

function branchLabel(value) {
  return BRANCH_LABELS[state.language]?.[value] ?? BRANCH_LABELS.en[value] ?? String(value ?? "");
}

function profileKindLabel(profile) {
  if (profile.mode === "dry-run") {
    return state.language === "zh" ? "模拟数据自测" : "dry-run fixture";
  }
  if (profile.profileDirectory) {
    const name = profile.browserChannel === "chrome"
      ? "Chrome"
      : profile.browserChannel || profile.browserType || "browser";
    return `${name} ${profile.profileDirectory}`;
  }
  if (profile.profileDir) {
    return state.language === "zh" ? "真实浏览器目录" : "browser directory";
  }
  return state.language === "zh" ? "真实浏览器模板（未绑定目录）" : "browser template (no directory)";
}

function localProfileOptionValue(id) {
  return `local:${id}`;
}

function localProfileIdFromOptionValue(value) {
  const text = String(value ?? "");
  return text.startsWith("local:") ? text.slice("local:".length) : "";
}

function displayProfileForSavedProfile(profile) {
  if (!profile) return null;
  const localProfile = localBrowserProfileForSavedProfile(profile);
  if (!localProfile) return profile;
  return {
    ...profile,
    name: savedProfileDisplayValue(profile.name, localProfile.name, localProfile),
    accountLabel: savedProfileDisplayValue(profile.accountLabel, localProfile.accountLabel, localProfile)
  };
}

function localBrowserProfileForSavedProfile(profile) {
  if (!profile) return null;
  return state.localBrowserProfiles.find((localProfile) => {
    if (localProfile.existingProfileId === profile.id) return true;
    return normalizeLocalPath(localProfile.profileDir) === normalizeLocalPath(profile.profileDir)
      && String(localProfile.profileDirectory ?? "") === String(profile.profileDirectory ?? "")
      && String(localProfile.browserChannel ?? "") === String(profile.browserChannel ?? "");
  }) ?? null;
}

function localProfileSaveBody(localProfile, { id, includeRuntimeDefaults, existingProfile = null }) {
  const name = existingProfile
    ? savedProfileDisplayValue(existingProfile.name, localProfile.name, localProfile)
    : localProfile.name;
  const accountLabel = existingProfile
    ? savedProfileDisplayValue(existingProfile.accountLabel, localProfile.accountLabel, localProfile)
    : localProfile.accountLabel;
  const body = {
    id,
    name,
    mode: "playwright",
    platform: localProfile.platform ?? "",
    accountLabel,
    profileDir: localProfile.profileDir ?? "",
    profileDirectory: localProfile.profileDirectory ?? "",
    browserType: localProfile.browserType ?? "chromium",
    browserChannel: localProfile.browserChannel ?? "",
    headless: false,
    network: existingProfile?.network ?? { proxyMode: "system", proxyServer: "", proxyBypass: "127.0.0.1,::1,localhost" }
  };
  if (includeRuntimeDefaults) {
    body.status = "ready";
    body.loginState = "unchecked";
    body.rateLimit = localProfile.rateLimit;
    body.sessionCheck = localProfile.sessionCheck;
    body.tags = localProfile.tags;
    body.notes = localProfile.notes;
  }
  return body;
}

function savedProfileDisplayValue(savedValue, discoveredValue, localProfile) {
  const saved = String(savedValue ?? "").trim();
  const discovered = String(discoveredValue ?? "").trim();
  if (!discovered) return saved;
  if (!saved || isGenericLocalProfileLabel(saved, localProfile)) return discovered;
  return saved;
}

function isGenericLocalProfileLabel(value, localProfile) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  const browserPrefix = String(localProfile?.browserName ?? "").trim();
  const withoutBrowserPrefix = browserPrefix && text.toLowerCase().startsWith(`${browserPrefix.toLowerCase()} - `)
    ? text.slice(browserPrefix.length + 3).trim()
    : text;
  return [text, withoutBrowserPrefix].some((candidate) => isGenericChromeProfileName(candidate, localProfile?.profileDirectory));
}

function isGenericChromeProfileName(value, profileDirectory) {
  const compact = String(value ?? "").trim().replace(/\s+/g, "").toLowerCase();
  const normalizedDirectory = String(profileDirectory ?? "").trim().replace(/\s+/g, "").toLowerCase();
  if (!compact || compact === normalizedDirectory) return true;
  return [
    /^user\d+$/i,
    /^person\d+$/i,
    /^profile\d+$/i,
    /^用户\d+$/i,
    /^使用者\d+$/i,
    /^个人资料\d+$/i,
    /^您的chrome$/i,
    /^你的chrome$/i,
    /^yourchrome$/i,
    /^chromeprofile$/i,
    /^defaultprofile$/i
  ].some((pattern) => pattern.test(compact));
}

function normalizeLocalPath(value) {
  return String(value ?? "").replace(/\/+$/g, "");
}

function parseJson(value, label) {
  try {
    return JSON.parse(value || "{}");
  } catch (error) {
    throw new Error(`${label} JSON is invalid: ${error.message}`);
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getObjectPath(source, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cursor = source;
  for (const part of parts) {
    if (!isPlainObject(cursor) || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function setObjectPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!isPlainObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
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

function profileNetworkFromForm() {
  return {
    proxyMode: elements.profileProxyMode.value || "system",
    proxyServer: elements.profileProxyServer.value.trim(),
    proxyBypass: elements.profileProxyBypass.value.trim() || "127.0.0.1,::1,localhost"
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

function uniqueProfileId(baseId) {
  const base = slugify(baseId || "profile");
  const ids = new Set(state.profiles.map((profile) => profile.id));
  if (!ids.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
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

function escapeAttribute(value) {
  return escapeHtml(value);
}
