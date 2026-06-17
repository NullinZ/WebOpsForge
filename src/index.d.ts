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
  mode: string;
  status: "queued" | "running" | "completed" | "blocked" | "failed";
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  driverConfig: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error: Record<string, unknown> | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  evidenceDir: string;
}

export class StudioStore {
  constructor(options?: { dir?: string; clock?: () => Date });
  dir: string;
  init(): Promise<void>;
  listWorkflows(): Promise<StudioWorkflowRecord[]>;
  getWorkflow(id: string): Promise<StudioWorkflowRecord | null>;
  saveWorkflow(record: Partial<StudioWorkflowRecord> & { workflow: Workflow | NormalizedWorkflow }): Promise<StudioWorkflowRecord>;
  deleteWorkflow(id: string): Promise<{ deleted: boolean }>;
  listRuns(options?: { limit?: number }): Promise<StudioRunRecord[]>;
  getRun(id: string): Promise<StudioRunRecord | null>;
  createRun(options: { workflowId: string; mode?: string; input?: Record<string, unknown>; context?: Record<string, unknown>; driverConfig?: Record<string, unknown> }): Promise<StudioRunRecord>;
  updateRun(id: string, patch: Partial<StudioRunRecord>): Promise<StudioRunRecord>;
  getRunDirFor(runId: string): string;
  readRunEvents(runId: string): Promise<Record<string, unknown>[]>;
  listRunArtifacts(runId: string): Promise<Array<{ name: string; size: number; url: string }>>;
  getArtifactPath(runId: string, artifactName: string): string;
  reset(): Promise<void>;
}

export function createRunQueue(options: { store: StudioStore; concurrency?: number; clock?: () => Date }): {
  enqueue(runId: string): void;
  status(): { pending: number; active: number; concurrency: number };
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
