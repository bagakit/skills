export const FLOW_PROTOCOL_SCHEMAS = {
  item: "bagakit/flow-runner/item/v2",
  policy: "bagakit/flow-runner/policy/v2",
  recipe: "bagakit/flow-runner/recipe/v2",
  nextAction: "bagakit/flow-runner/next-action/v2",
  checkpoint: "bagakit/flow-runner/checkpoint/v2",
  progress: "bagakit/flow-runner/progress/v1",
  incident: "bagakit/flow-runner/incident/v1",
  resumeCandidates: "bagakit/flow-runner/resume-candidates/v1",
  mutationReceipt: "bagakit/flow-runner/mutation-receipt/v1",
} as const;

export const ITEM_STATUSES = ["todo", "in_progress", "blocked", "completed", "cancelled"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ARCHIVE_STATUSES = ["active", "archived"] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

export const RESOLUTION_KINDS = ["live", "closeout"] as const;
export type ResolutionKind = (typeof RESOLUTION_KINDS)[number];

export const STEP_STATUSES = ["pending", "active", "done", "blocked", "skipped"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const SESSION_STATUSES = ["progress", "blocked", "gate_passed", "terminal"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const CLEAN_STATES = ["yes", "no", "unknown"] as const;
export type CleanState = (typeof CLEAN_STATES)[number];

export const INCIDENT_RESUMES = ["stay_blocked", "resume_execution", "closeout"] as const;
export type IncidentResume = (typeof INCIDENT_RESUMES)[number];

export const EXECUTION_MODES = ["normal_execution", "blocked_clearance", "closeout"] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const RECOMMENDED_ACTIONS = ["run_session", "clear_blocker", "archive_closeout", "stop"] as const;
export type RecommendedAction = (typeof RECOMMENDED_ACTIONS)[number];

export const ACTION_REASONS = ["active_work", "blocked_item", "closeout_pending", "no_actionable_item"] as const;
export type ActionReason = (typeof ACTION_REASONS)[number];

export const INCIDENT_STATUSES = ["open", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const FLOW_MUTATION_KINDS = [
  "create_item",
  "checkpoint",
  "open_incident",
  "resolve_incident",
  "source_refresh",
  "snapshot_anchor",
  "archive_item",
  "state_normalization",
] as const;
export type FlowMutationKind = (typeof FLOW_MUTATION_KINDS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export type SafeAnchor = Readonly<{
  kind: string;
  ref: string;
  summary: string;
}> | null;

export type ItemPaths = Readonly<{
  handoff: string;
  checkpoints: string;
  progress_log: string;
  mutation_receipts: string;
  plan_revisions_dir: string;
  incidents_dir: string;
}>;

export type ItemRuntime = Readonly<{
  active_plan_revision_id: string;
  active_action_id: string;
  open_incident_ids: string[];
  session_count: number;
  latest_checkpoint_at: string;
  latest_snapshot_id: string;
  current_safe_anchor: SafeAnchor;
}>;

export type ItemStep = Readonly<{
  stage_key: string;
  goal: string;
  status: StepStatus;
  rollback_anchor: string;
  evidence_refs: string[];
}>;

export type ItemState = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.item;
  item_id: string;
  title: string;
  source_kind: string;
  source_ref: string;
  status: ItemStatus;
  archive_status: ArchiveStatus;
  resolution: ResolutionKind;
  current_stage: string;
  current_step_status: StepStatus;
  priority: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  paths: ItemPaths;
  runtime: ItemRuntime;
  steps: ItemStep[];
}>;

export type RunnerPolicy = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.policy;
  safety: {
    snapshot_before_session: boolean;
    checkpoint_before_stop: boolean;
    persist_state_before_stop: boolean;
  };
}>;

export type LoopStage = Readonly<{
  stage_key: string;
  goal: string;
}>;

export type LoopRecipe = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.recipe;
  recipe_id: string;
  recipe_version: string;
  stage_chain: LoopStage[];
}>;

export type SessionContract = Readonly<{
  launch_bounded_session: boolean;
  persist_state_before_stop: boolean;
  checkpoint_before_stop: boolean;
  snapshot_before_session: boolean;
  archive_only_closeout: boolean;
}>;

export type CheckpointRequest = Readonly<{
  stage: string;
  session_status: SessionStatus;
  command_example: string;
}>;

export type NextActionPayload = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.nextAction;
  command: "next";
  recommended_action: RecommendedAction;
  action_reason: ActionReason;
  item_id?: string;
  item_path?: string;
  item_status?: ItemStatus;
  resolution?: ResolutionKind;
  current_stage?: string;
  current_step_status?: StepStatus;
  execution_mode?: ExecutionMode;
  active_plan_revision_id?: string;
  active_action_id?: string;
  session_number?: number;
  progress_log_path?: string;
  current_safe_anchor?: SafeAnchor;
  session_contract: SessionContract;
  checkpoint_request?: CheckpointRequest;
}>;

export type CheckpointReceipt = Readonly<{
  // Optional upstream work-item binding (for example a Feature Tracker Task id).
  task_ref?: string;
  stage: string;
  session_status: SessionStatus;
  objective: string;
  attempted: string;
  result: string;
  next_action: string;
  clean_state: CleanState;
  recorded_at: string;
  session_number: number;
}>;

export type CheckpointPayload = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.checkpoint;
  command: "checkpoint";
  item_id: string;
  item_path: string;
  progress_log_path: string;
  resolution: ResolutionKind;
  item_status: ItemStatus;
  current_stage: string;
  current_step_status: StepStatus;
  checkpoint_receipt: CheckpointReceipt;
  current_safe_anchor: SafeAnchor;
}>;

export type ProgressEntry = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.progress;
  item_id: string;
  // Optional upstream work-item binding (for example a Feature Tracker Task id).
  task_ref?: string;
  session_number: number;
  stage: string;
  session_status: SessionStatus;
  objective: string;
  attempted: string;
  result: string;
  next_action: string;
  clean_state: CleanState;
  recorded_at: string;
}>;

export type IncidentRecord = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.incident;
  incident_id: string;
  family: string;
  summary: string;
  status: IncidentStatus;
  opened_at: string;
  closed_at: string;
  close_note: string;
  recommended_resume: IncidentResume;
}>;

export type ResumeCandidate = Readonly<{
  item_id: string;
  item_path: string;
  title: string;
  source_kind: string;
  source_ref: string;
  item_status: ItemStatus;
  resolution: ResolutionKind;
  current_stage: string;
  current_step_status: StepStatus;
  active_plan_revision_id: string;
  active_action_id: string;
  session_number: number;
  progress_log_path: string;
  current_safe_anchor: SafeAnchor;
  open_incident_ids: string[];
}>;

export type ResumeCandidatesPayload = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.resumeCandidates;
  command: "resume-candidates";
  live: ResumeCandidate[];
  closeout: ResumeCandidate[];
}>;

export type FlowMutationEvent = Readonly<{
  field_path: string;
  before?: JsonValue;
  after?: JsonValue;
}>;

export type FlowMutationReceipt = Readonly<{
  schema: typeof FLOW_PROTOCOL_SCHEMAS.mutationReceipt;
  receipt_id: string;
  mutation: FlowMutationKind;
  item_id: string;
  recorded_at: string;
  authority: "runner_local" | "source_mirror";
  changed: boolean;
  events: FlowMutationEvent[];
  notes: string[];
}>;

export type FlowMutationResult<TPayload = undefined> = Readonly<{
  state: ItemState;
  receipt: FlowMutationReceipt;
  payload: TPayload;
}>;
