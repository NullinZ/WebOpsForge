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
  | "screenshot"
  | "approval"
  | "assertText"
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
  waitFor?(args: { selector: string; state?: string; timeoutMs?: number | null }): Promise<unknown>;
  click?(args: { selector: string; timeoutMs?: number | null }): Promise<unknown>;
  fill?(args: { selector: string; value: unknown; timeoutMs?: number | null; redact?: boolean }): Promise<unknown>;
  press?(args: { selector?: string | null; key: string; timeoutMs?: number | null }): Promise<unknown>;
  extract?(args: { selector: string; mode?: string; attribute?: string | null; timeoutMs?: number | null }): Promise<{ value: unknown }>;
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
  wait(args?: { step?: NormalizedWorkflowStep; state?: RunnerState }): Promise<void>;
}

export interface RunnerPolicy {
  beforeStep?(args: { step: NormalizedWorkflowStep; state: RunnerState }): Promise<void> | void;
  afterStep?(args: { step: NormalizedWorkflowStep; state: RunnerState; result: unknown }): Promise<void> | void;
  requestApproval?(args: { step: NormalizedWorkflowStep; state: RunnerState; approvalName: string }): Promise<{ approved: boolean; approver?: string } | null | undefined> | { approved: boolean; approver?: string } | null | undefined;
}

export class WebOpsRunner {
  constructor(options: {
    driver: BrowserDriver;
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

export function createMemoryEvidenceStore(): MemoryEvidenceStore;
export function createFileEvidenceStore(options: { dir: string }): EvidenceStore;

export function createRateLimiter(options?: { minDelayMs?: number; maxPerMinute?: number | null }): RateLimiter;

export function createDryRunDriver(options?: {
  pages?: Record<string, { selectors?: Record<string, Record<string, unknown>> }>;
  initialUrl?: string;
}): BrowserDriver & { kind: "dry-run"; log: Record<string, unknown>[] };

export function createPlaywrightDriver(options?: {
  browserType?: "chromium" | "firefox" | "webkit" | string;
  profileDir?: string | null;
  headless?: boolean;
  launchOptions?: Record<string, unknown>;
  contextOptions?: Record<string, unknown>;
  viewport?: Record<string, number> | null;
  page?: unknown;
}): Promise<BrowserDriver>;

export interface StudioWorkflowRecord {
  id: string;
  name: string;
  description: string;
  workflow: NormalizedWorkflow;
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
  outputs: Record<string, unknown>;
  error: Record<string, unknown> | null;
  sourceRunId: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  evidenceDir: string;
}

export interface StudioProfileRecord {
  id: string;
  name: string;
  mode: "dry-run" | "playwright" | string;
  profileDir: string;
  browserType: string;
  headless: boolean;
  status: "ready" | "busy" | "blocked" | "disabled" | string;
  leasedRunId: string | null;
  rateLimit: {
    minDelayMs: number;
    maxPerMinute: number | null;
  };
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
}

export class StudioStore {
  constructor(options?: { dir?: string; clock?: () => Date });
  dir: string;
  init(): Promise<void>;
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
  listRuns(options?: { limit?: number }): Promise<StudioRunRecord[]>;
  getRun(id: string): Promise<StudioRunRecord | null>;
  createRun(options: { workflowId: string; mode?: string; input?: Record<string, unknown>; context?: Record<string, unknown>; driverConfig?: Record<string, unknown>; profileId?: string | null; sourceRunId?: string | null }): Promise<StudioRunRecord>;
  updateRun(id: string, patch: Partial<StudioRunRecord>): Promise<StudioRunRecord>;
  cancelRun(id: string, reason?: string): Promise<{ run: StudioRunRecord; changed: boolean }>;
  retryRun(id: string): Promise<StudioRunRecord>;
  getRunDirFor(runId: string): string;
  readRunEvents(runId: string): Promise<Record<string, unknown>[]>;
  listRunArtifacts(runId: string): Promise<Array<{ name: string; size: number; url: string }>>;
  getArtifactPath(runId: string, artifactName: string): string;
  exportBundle(): Promise<{ exportedAt: string; version: string; workflows: StudioWorkflowRecord[]; profiles: StudioProfileRecord[]; runs: StudioRunRecord[] }>;
  importBundle(bundle: { workflows?: StudioWorkflowRecord[]; profiles?: StudioProfileRecord[] }): Promise<{ imported: { workflows: number; profiles: number } }>;
  appendAudit(record: Record<string, unknown>): Promise<Record<string, unknown>>;
  listAudit(options?: { limit?: number }): Promise<Record<string, unknown>[]>;
  reset(): Promise<void>;
}

export function createRunQueue(options: { store: StudioStore; concurrency?: number; clock?: () => Date }): {
  enqueue(runId: string): void;
  cancel(runId: string, reason?: string): Promise<{ run: StudioRunRecord; changed: boolean }>;
  status(): { pending: number; active: number; concurrency: number; activeRunIds: string[]; pendingRunIds: string[] };
};

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
