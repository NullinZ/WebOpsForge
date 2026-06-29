export interface Workflow {
  name?: string;
  version?: string;
  description?: string;
  defaults?: WorkflowDefaults;
  metadata?: Record<string, unknown>;
  steps: WorkflowStep[];
}

export interface NormalizedWorkflow extends Required<Omit<Workflow, "defaults" | "steps">> {
  defaults: Required<WorkflowDefaults>;
  steps: NormalizedWorkflowStep[];
}

export interface WorkflowDefaults {
  timeoutMs?: number;
  screenshot?: "on-failure" | "never" | string;
}

export type WorkflowAction =
  | "goto"
  | "waitFor"
  | "click"
  | "fill"
  | "press"
  | "extract"
  | "extractList"
  | "extractDetail"
  | "extractMedia"
  | "paginate"
  | "checkSession"
  | "setOutput"
  | "apiCall"
  | "operation"
  | "screenshot"
  | "approval"
  | "assertText"
  | "assertOutput"
  | "checkpoint";

export interface WorkflowStep {
  id?: string;
  action: WorkflowAction;
  timeoutMs?: number | null;
  optional?: boolean;
  evidence?: string;
  [key: string]: unknown;
}

export interface NormalizedWorkflowStep extends WorkflowStep {
  id: string;
  timeoutMs: number | null;
  optional: boolean;
  evidence: string;
}

export interface RunnerState {
  runId: string;
  workflow: {
    name: string;
    version: string;
  };
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  outputs: Record<string, unknown>;
  abortSignal?: AbortSignal | null;
}

export interface RunnerResult {
  runId: string;
  workflow: {
    name: string;
    version: string;
  };
  status: "completed";
  outputs: Record<string, unknown>;
  completedAt: string;
}

export interface BrowserDriver {
  kind?: string;
  goto?(args: { url: string; timeoutMs?: number | null; state?: RunnerState }): Promise<unknown>;
  waitFor?(args: { selector: string; state?: string; timeoutMs?: number | null; targetIdentity?: TargetIdentity | null }): Promise<unknown>;
  click?(args: { selector: string; timeoutMs?: number | null; targetIdentity?: TargetIdentity | null }): Promise<unknown>;
  fill?(args: { selector: string; value: unknown; timeoutMs?: number | null; redact?: boolean; targetIdentity?: TargetIdentity | null }): Promise<unknown>;
  press?(args: { selector?: string | null; key: string; timeoutMs?: number | null; targetIdentity?: TargetIdentity | null }): Promise<unknown>;
  extract?(args: { selector: string; mode?: string; attribute?: string | null; timeoutMs?: number | null; targetIdentity?: TargetIdentity | null }): Promise<{ value: unknown }>;
  extractList?(args: { selector: string; fields: ExtractionFields; limit?: number | null; timeoutMs?: number | null; targetIdentity?: TargetIdentity | null }): Promise<{ value: Record<string, unknown>[]; count?: number }>;
  extractDetail?(args: { fields: ExtractionFields; timeoutMs?: number | null }): Promise<{ value: Record<string, unknown> }>;
  extractMedia?(args: { selector: string; sources?: string[] | null; limit?: number | null; timeoutMs?: number | null; targetIdentity?: TargetIdentity | null }): Promise<{ value: MediaExtractionRecord[]; count?: number }>;
  paginate?(args: { nextSelector: string; maxPages?: number | null; waitForSelector?: string | null; timeoutMs?: number | null }): Promise<{ value?: unknown; pagesVisited?: number; urls?: string[] }>;
  checkSession?(args: { accountSelector?: string | null; loggedOutSelector?: string | null; timeoutMs?: number | null }): Promise<{ value?: unknown; loginState?: string; accountLabel?: string }>;
  apiCall?(args: ApiRequest): Promise<ApiResult>;
  screenshot?(args: { fullPage?: boolean; name?: string }): Promise<{ contentType?: string; bytes?: Uint8Array; text?: string } | null | undefined>;
  currentUrl?(): Promise<string>;
  close?(): Promise<void>;
}

export interface EvidenceStore {
  append(record: Record<string, unknown>): Promise<Record<string, unknown>>;
  putArtifact(args: { name: string; contentType?: string; bytes?: Uint8Array; text?: string }): Promise<{ ref: string; contentType: string; name: string }>;
}

export interface MemoryEvidenceStore extends EvidenceStore {
  list(): Record<string, unknown>[];
  artifacts(): Map<string, { name: string; contentType: string; bytes?: Uint8Array; text?: string }>;
}

export interface RateLimiter {
  wait(args?: {
    step?: NormalizedWorkflowStep;
    state?: RunnerState;
    onDelay?: (delay: RateLimitDelay) => Promise<void> | void;
  }): Promise<RateLimitDelay | void>;
}

export interface RateLimitDelay {
  delayMs: number;
  randomDelayMs: number;
  windowDelayMs: number;
  maxPerMinute: number | null;
}

export interface ApiRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number | null;
}

export interface ApiResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  json: unknown;
  value?: unknown;
}

export interface ApiClient {
  kind?: string;
  call(request: ApiRequest): Promise<ApiResult>;
}

export type BlockedState =
  | "approval_required"
  | "browser_blocked"
  | "captcha_or_verification"
  | "empty_result"
  | "front_chrome_javascript_disabled"
  | "front_chrome_uncontrolled"
  | "login_required"
  | "navigation_timeout"
  | "permission_denied"
  | "profile_busy"
  | "rate_limited"
  | "run_canceled"
  | "selector_drift"
  | "unknown_failure";

export interface RunFailureClassification {
  state: BlockedState;
  reason: string;
  recoverable: boolean;
  runStatus: "blocked" | "failed" | "canceled";
  profileStatus: "blocked" | "ready";
  recoveryHint: string;
}

export type ExtractionFieldSpec = string | {
  selector?: string | null;
  mode?: "text" | "html" | "value" | "attribute" | string;
  attribute?: string | null;
  attr?: string | null;
  type?: "string" | "number" | "url" | string;
  required?: boolean;
  default?: unknown;
};

export type ExtractionFields = Record<string, ExtractionFieldSpec>;

export interface MediaExtractionRecord {
  index?: number | null;
  tagName?: string;
  url: string;
  attributes: Record<string, unknown>;
  sources?: Array<Record<string, unknown>>;
}

export interface RunnerPolicy {
  beforeStep?(args: { step: NormalizedWorkflowStep; state: RunnerState }): Promise<void> | void;
  afterStep?(args: { step: NormalizedWorkflowStep; state: RunnerState; result: unknown }): Promise<void> | void;
  requestApproval?(args: { step: NormalizedWorkflowStep; state: RunnerState; approvalName: string }): Promise<{ approved: boolean; approver?: string } | null | undefined> | { approved: boolean; approver?: string } | null | undefined;
}

export class WebOpsRunner {
  constructor(options: {
    driver?: BrowserDriver | null;
    apiClient?: ApiClient;
    evidenceStore?: EvidenceStore;
    rateLimiter?: RateLimiter | null;
    policy?: RunnerPolicy | null;
    clock?: () => Date;
  });
  run(workflow: Workflow | NormalizedWorkflow, options?: {
    input?: Record<string, unknown>;
    context?: Record<string, unknown>;
    runId?: string;
    abortSignal?: AbortSignal | null;
  }): Promise<RunnerResult>;
  close(): Promise<void>;
}

export function defineWorkflow(workflow: Workflow): NormalizedWorkflow;
export function normalizeWorkflow(workflow: Workflow): NormalizedWorkflow;
export function validateStep(step: WorkflowStep, index?: number): NormalizedWorkflowStep;
export function normalizePickerEvent(event: Record<string, unknown>, options?: { clock?: () => Date }): PickerEvent;
export function createTargetIdentityFromPickerEvent(event: Record<string, unknown>): TargetIdentity;

export function createMemoryEvidenceStore(): MemoryEvidenceStore;
export function createFileEvidenceStore(options: { dir: string }): EvidenceStore;

export function createRateLimiter(options?: {
  minDelayMs?: number;
  maxDelayMs?: number | null;
  maxPerMinute?: number | null;
  random?: () => number;
}): RateLimiter;
export function createFetchApiClient(options?: { fetchImpl?: typeof fetch }): ApiClient;
export function executeApiCall(options: { step: NormalizedWorkflowStep; driver?: BrowserDriver; apiClient: ApiClient; timeoutMs?: number | null }): Promise<ApiResult>;
export function classifyRunFailure(error: unknown): RunFailureClassification;
export function detectBlockedState(error: unknown): BlockedState;

export function createDryRunDriver(options?: {
  pages?: Record<string, { selectors?: Record<string, Record<string, unknown>> }>;
  apiResponses?: Record<string, unknown>;
  initialUrl?: string;
}): BrowserDriver & { kind: "dry-run"; log: Record<string, unknown>[] };

export function createPlaywrightDriver(options?: {
  browserType?: "chromium" | "firefox" | "webkit" | string;
  profileDir?: string | null;
  profileDirectory?: string | null;
  browserChannel?: string | null;
  headless?: boolean;
  launchOptions?: Record<string, unknown>;
  contextOptions?: Record<string, unknown>;
  viewport?: Record<string, number> | null;
  page?: unknown;
}): Promise<BrowserDriver>;

export function createChromeProfileHandoffDriver(options?: {
  browserChannel?: string | null;
  profileDirectory?: string | null;
  opener?: (command: string, args: string[], options?: Record<string, unknown>) => Promise<unknown>;
  executor?: { run(payload: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>> } | null;
  nativeExecutor?: { run(payload: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>> } | null;
}): BrowserDriver & { kind: "chrome-profile-handoff" };

export function createMacChromeAppleScriptExecutor(options?: {
  browserChannel?: string | null;
  osascript?: (script: string, options?: { timeoutMs?: number }) => Promise<string>;
}): { kind: "mac-chrome-applescript"; run(payload?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>> } | null;

export interface WebOpsAdapter {
  id: string;
  name: string;
  version: string;
  description: string;
  registry: StudioRegistry;
  workflows: StudioWorkflowRecord[];
  fixtures: Record<string, {
    pages?: Record<string, { selectors?: Record<string, Record<string, unknown>> }>;
    apiResponses?: Record<string, unknown>;
    initialUrl?: string;
    metadata?: Record<string, unknown>;
  }>;
  policies: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export function defineAdapter(adapter: Partial<WebOpsAdapter> & { id: string }): WebOpsAdapter;
export function createRegistryPack(pack?: Partial<StudioRegistry>): StudioRegistry;
export function createFixtureDriverConfig(adapter: Partial<WebOpsAdapter> & { id: string }, fixtureId?: string): {
  pages: Record<string, { selectors?: Record<string, Record<string, unknown>> }>;
  apiResponses: Record<string, unknown>;
  initialUrl: string;
};
export function installAdapterToStore(options: { adapter: Partial<WebOpsAdapter> & { id: string }; store: StudioStore }): Promise<{
  adapter: { id: string; name: string; version: string };
  imported: { sites: number; pages: number; actions: number; operations: number; workflows: number };
}>;

export interface StudioWorkflowRecord {
  id: string;
  name: string;
  description: string;
  workflow: NormalizedWorkflow;
  graph?: StudioWorkflowGraph;
  defaultRun?: {
    mode?: "dry-run" | "playwright" | string;
    profileId?: string | null;
    input?: Record<string, unknown>;
    context?: Record<string, unknown>;
    driverConfig?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StudioWorkflowGraph {
  version?: number;
  layout?: string;
  layouts?: Record<string, {
    positions?: Record<string, { x: number; y: number }>;
    updatedAt?: string | null;
  }>;
}

export interface StudioRunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  profileId: string | null;
  profileName: string | null;
  mode: string;
  status: "queued" | "running" | "completed" | "blocked" | "failed" | "cancel_requested" | "canceled";
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  driverConfig: Record<string, unknown>;
  workflowOverride?: Workflow | NormalizedWorkflow | null;
  debug?: { mode?: string; targetStepId?: string } | null;
  outputs: Record<string, unknown>;
  error: Record<string, unknown> | null;
  sourceRunId: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  evidenceDir: string;
}

export interface SelectorCandidate {
  selector: string;
  source: string;
  reason: string;
  score: number;
  matchCount: number | null;
  visibleCount: number | null;
  unique: boolean;
  stable: boolean;
}

export interface TargetIdentity {
  version: number;
  tagName: string;
  role?: string;
  inputType?: string;
  attributes: Record<string, string>;
  classList: string[];
  text: string;
  labelText: string;
  accessibleName: string;
  rect: { x: number; y: number; width: number; height: number } | null;
  pageUrl: string;
  frameUrl: string;
  selectorCandidates: SelectorCandidate[];
  recommendedSelector: string;
  confidence: number;
  matchPolicy: {
    minScore: number;
    ambiguityMargin: number;
    requireVisible: boolean;
    preferUnique: boolean;
  };
}

export interface PickerEvent {
  id: string;
  source: string;
  field: string;
  suggestedAction: "click" | "fill" | "press" | "extract" | "waitFor" | string;
  recommendedSelector: string;
  selectorCandidates: SelectorCandidate[];
  targetIdentity: TargetIdentity;
  pickedFrom: {
    url: string;
    frameUrl: string;
    title: string;
    platform: string;
    tabId: unknown;
    timestamp: number;
  };
  confidence: number;
  createdAt: string;
}

export interface PickerSession {
  id: string;
  status: "waiting" | "completed" | "cancelled" | string;
  workflowId: string | null;
  workflowName: string;
  nodeId: string | null;
  nodeLabel: string;
  targetUrl: string;
  allowedUrls: string[];
  startedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioProfileRecord {
  id: string;
  name: string;
  mode: "dry-run" | "playwright" | string;
  platform: string;
  accountLabel: string;
  loginState: "unchecked" | "authenticated" | "logged-out" | "unknown" | string;
  profileDir: string;
  profileDirectory?: string;
  browserType: string;
  browserChannel?: string;
  headless: boolean;
  network?: {
    proxyMode?: "system" | "direct" | "custom" | string;
    proxyServer?: string;
    proxyBypass?: string;
  };
  status: "ready" | "busy" | "blocked" | "disabled" | string;
  leasedRunId: string | null;
  rateLimit: {
    minDelayMs: number;
    maxDelayMs?: number | null;
    maxPerMinute: number | null;
  };
  sessionCheck: {
    platform?: string;
    url?: string;
    accountSelector?: string;
    loggedOutSelector?: string;
    timeoutMs?: number;
  };
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastCheckedAt: string | null;
}

export interface StudioRegistryBaseRecord {
  id: string;
  name: string;
  description: string;
  status: "draft" | "ready" | "deprecated" | string;
  tags: string[];
  definition: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StudioRegistrySiteRecord extends StudioRegistryBaseRecord {
  baseUrl: string;
  authMode: "profile" | "none" | string;
  profileStrategy: "one-profile-per-account" | string;
}

export interface StudioRegistryPageRecord extends StudioRegistryBaseRecord {
  siteId: string;
  urlPattern: string;
  stateSelector: string;
  accountSelector: string;
}

export interface StudioRegistryActionRecord extends StudioRegistryBaseRecord {
  siteId: string;
  pageId: string;
  actionType: WorkflowAction | string;
  selector: string;
  valueTemplate: string;
  outputName: string;
}

export interface StudioRegistryOperationRecord extends StudioRegistryBaseRecord {
  siteId: string;
  actionIds: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  workflowTemplate: Workflow | NormalizedWorkflow | null;
}

export interface StudioRegistry {
  version: string;
  sites: StudioRegistrySiteRecord[];
  pages: StudioRegistryPageRecord[];
  actions: StudioRegistryActionRecord[];
  operations: StudioRegistryOperationRecord[];
}

export type StudioRegistrySection = "sites" | "pages" | "actions" | "operations";
export type StudioRegistryRecord =
  | StudioRegistrySiteRecord
  | StudioRegistryPageRecord
  | StudioRegistryActionRecord
  | StudioRegistryOperationRecord;

export class StudioStore {
  constructor(options?: { dir?: string; clock?: () => Date });
  dir: string;
  init(): Promise<void>;
  getRegistry(): Promise<StudioRegistry>;
  saveRegistry(registry: Partial<StudioRegistry>): Promise<StudioRegistry>;
  saveRegistryItem(section: StudioRegistrySection, record: Partial<StudioRegistryRecord> & { id?: string }): Promise<{ registry: StudioRegistry; item: StudioRegistryRecord }>;
  deleteRegistryItem(section: StudioRegistrySection, id: string): Promise<{ registry: StudioRegistry; deleted: boolean }>;
  listWorkflows(): Promise<StudioWorkflowRecord[]>;
  getWorkflow(id: string): Promise<StudioWorkflowRecord | null>;
  saveWorkflow(record: Partial<StudioWorkflowRecord> & { workflow: Workflow | NormalizedWorkflow }): Promise<StudioWorkflowRecord>;
  deleteWorkflow(id: string): Promise<{ deleted: boolean }>;
  validateWorkflow(workflow: Workflow | NormalizedWorkflow): Promise<{ ok: true; workflow: NormalizedWorkflow; stepCount: number; actions: string[] }>;
  listProfiles(): Promise<StudioProfileRecord[]>;
  getProfile(id: string): Promise<StudioProfileRecord | null>;
  saveProfile(record: Partial<StudioProfileRecord> & { id?: string; name?: string }): Promise<StudioProfileRecord>;
  deleteProfile(id: string): Promise<{ deleted: boolean }>;
  leaseProfile(profileId: string | null, runId: string): Promise<StudioProfileRecord | null>;
  releaseProfile(profileId: string | null, runId: string, status?: string): Promise<StudioProfileRecord | null>;
  listRuns(options?: { limit?: number; offset?: number }): Promise<{ runs: StudioRunRecord[]; total: number; offset: number; limit: number; hasMore: boolean; nextOffset: number | null }>;
  clearDebugRuns(): Promise<{ cleared: number; retained: number }>;
  savePickerEvent(event: Record<string, unknown>): Promise<PickerEvent>;
  listPickerEvents(options?: { limit?: number }): Promise<PickerEvent[]>;
  getPickerSession(): Promise<PickerSession | null>;
  savePickerSession(session: Partial<PickerSession> & { allowedUrls?: string[]; targetUrl?: string }): Promise<PickerSession>;
  clearPickerSession(options?: { sessionId?: string | null; reason?: string }): Promise<{ cleared: boolean; session: PickerSession | null }>;
  getRun(id: string): Promise<StudioRunRecord | null>;
  createRun(options: { workflowId: string; mode?: string; input?: Record<string, unknown>; context?: Record<string, unknown>; driverConfig?: Record<string, unknown>; profileId?: string | null; sourceRunId?: string | null; workflowOverride?: Workflow | NormalizedWorkflow | null; debug?: { mode?: string; targetStepId?: string } | null }): Promise<StudioRunRecord>;
  updateRun(id: string, patch: Partial<StudioRunRecord>): Promise<StudioRunRecord>;
  cancelRun(id: string, reason?: string): Promise<{ run: StudioRunRecord; changed: boolean }>;
  retryRun(id: string): Promise<StudioRunRecord>;
  getRunDirFor(runId: string): string;
  readRunEvents(runId: string): Promise<Record<string, unknown>[]>;
  listRunArtifacts(runId: string): Promise<Array<{ name: string; size: number; url: string }>>;
  getArtifactPath(runId: string, artifactName: string): string;
  exportBundle(): Promise<{ exportedAt: string; version: string; registry: StudioRegistry; workflows: StudioWorkflowRecord[]; profiles: StudioProfileRecord[]; runs: StudioRunRecord[] }>;
  importBundle(bundle: { registry?: Partial<StudioRegistry>; workflows?: StudioWorkflowRecord[]; profiles?: StudioProfileRecord[] }): Promise<{ imported: { registry?: number; workflows: number; profiles: number } }>;
  appendAudit(record: Record<string, unknown>): Promise<Record<string, unknown>>;
  listAudit(options?: { limit?: number }): Promise<Record<string, unknown>[]>;
  reset(): Promise<void>;
}

export function createRunQueue(options: { store: StudioStore; concurrency?: number; clock?: () => Date; chromeHandoffOpener?: (command: string, args: string[], options?: Record<string, unknown>) => Promise<unknown>; chromeExtensionExecutor?: { run(payload: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>>; status?: () => Record<string, unknown> } | null; chromeNativeExecutor?: { run(payload: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>> } | null; profileBrowserSessions?: ProfileBrowserSessionPool | null }): {
  enqueue(runId: string): void;
  cancel(runId: string, reason?: string): Promise<{ run: StudioRunRecord; changed: boolean }>;
  status(): { pending: number; active: number; concurrency: number; activeRunIds: string[]; pendingRunIds: string[] };
};

export interface ProfileBrowserSessionPool {
  status(): { active: number; sessions: Record<string, unknown>[] };
  open(options: { profile: StudioProfileRecord; overrides?: Record<string, unknown> }): Promise<Record<string, unknown>>;
  getDriver(options: { profile: StudioProfileRecord; run?: StudioRunRecord; overrides?: Record<string, unknown> }): Promise<BrowserDriver | null>;
  close(profileOrId?: string | null): Promise<{ closed: number }>;
}

export function detectActiveProfileLock(profileDir: string, options?: { inspectProcess?: boolean }): Promise<Record<string, unknown> | null>;
export function releaseProfileLockOwner(profileDir: string, options?: { force?: boolean; signal?: string }): Promise<Record<string, unknown>>;
export function waitForProfileLockRelease(profileDir: string, options?: { timeoutMs?: number; intervalMs?: number }): Promise<boolean>;
export function normalizeProfileNetwork(record?: Record<string, unknown>, existing?: Record<string, unknown>): { proxyMode: string; proxyServer: string; proxyBypass: string };
export function applyProfileNetworkToLaunchOptions(launchOptions?: Record<string, unknown>, network?: Record<string, unknown>): Record<string, unknown>;
export function profileNetworkArgs(network?: Record<string, unknown>): string[];
export function createProfileBrowserSessionPool(options?: { clock?: () => Date }): ProfileBrowserSessionPool;

export function createExtensionExecutor(options?: { clock?: () => Date; maxCompletedMs?: number }): {
  status(): { pending: number; active: number; lastSeenAt: string | null; lastSeenBy: Record<string, string> | null };
  run(payload?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<Record<string, unknown>>;
  claimNext(meta?: Record<string, unknown>): Record<string, unknown> | null;
  complete(id: string, body?: { ok?: boolean; result?: Record<string, unknown>; error?: Record<string, unknown> }): { accepted: boolean; status?: string; reason?: string };
};

export function openProfileLoginWindow(options: {
  profile: StudioProfileRecord;
  overrides?: Record<string, unknown>;
  opener?: (command: string, args: string[]) => Promise<unknown>;
  profileBrowserSessions?: ProfileBrowserSessionPool | null;
  clock?: () => Date;
}): Promise<{
  opened: boolean;
  reused?: boolean;
  controlled?: boolean;
  mode: string;
  browserChannel: string;
  profileDir: string;
  profileDirectory: string;
  url: string;
  openedAt: string;
  lastUsedAt?: string;
}>;

export function probeProfileSession(options: {
  profile: StudioProfileRecord;
  overrides?: Record<string, unknown>;
  clock?: () => Date;
}): Promise<{
  platform: string;
  accountLabel: string;
  loginState: string;
  lastCheckedAt: string;
  sessionCheck: StudioProfileRecord["sessionCheck"];
  details: Record<string, unknown>;
}>;

export class WebOpsForgeError extends Error {
  code: string;
  stepId: string | null;
  details: Record<string, unknown>;
}

export class ActionValidationError extends WebOpsForgeError {}
export class BrowserActionError extends WebOpsForgeError {}
export class BrowserBlockedError extends WebOpsForgeError {
  reason: string;
  recoverable: boolean;
}
export class RunCancelledError extends WebOpsForgeError {}
