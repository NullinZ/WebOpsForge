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
