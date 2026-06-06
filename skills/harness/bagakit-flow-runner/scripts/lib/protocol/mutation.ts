import {
  FLOW_PROTOCOL_SCHEMAS,
  type ArchiveStatus,
  type CheckpointPayload,
  type CheckpointReceipt,
  type CleanState,
  type FlowMutationEvent,
  type FlowMutationKind,
  type FlowMutationReceipt,
  type FlowMutationResult,
  type IncidentRecord,
  type IncidentResume,
  type ItemPaths,
  type ItemState,
  type ItemStatus,
  type ItemStep,
  type JsonValue,
  type LoopRecipe,
  type ProgressEntry,
  type SafeAnchor,
  type SessionStatus,
  type StepStatus,
} from "./model.ts";
import { assertJsonSafe, collectItemIssues, validateIncidentRecord, validateItemState, validateRecipe } from "./validation.ts";
import { randomUUID } from "node:crypto";

export type SourceAuthorityOptions = Readonly<{
  source_owned_kinds?: readonly string[];
}>;

export type CreateItemInput = Readonly<{
  item_id: string;
  title: string;
  source_kind: string;
  source_ref: string;
  priority: number;
  confidence: number;
  recipe: LoopRecipe;
  paths: ItemPaths;
  now: string;
  status?: ItemStatus;
  active_plan_revision_id?: string;
  active_action_id?: string;
}>;

export type CheckpointInput = Readonly<{
  task_ref?: string;
  stage: string;
  session_status: SessionStatus;
  objective: string;
  attempted: string;
  result: string;
  next_action: string;
  clean_state: CleanState;
  now: string;
  item_path: string;
  item_status_override?: ItemStatus;
  source_status?: ItemStatus;
  terminal_item_status?: Extract<ItemStatus, "completed" | "cancelled">;
}> & SourceAuthorityOptions;

export type OpenIncidentInput = Readonly<{
  incident_id: string;
  family: string;
  summary: string;
  recommended_resume: IncidentResume;
  now: string;
}>;

export type ResolveIncidentInput = Readonly<{
  close_note: string;
  now: string;
  source_status?: ItemStatus;
}> & SourceAuthorityOptions;

export type SourceRefreshInput = Readonly<{
  now: string;
  source_status: ItemStatus;
  title?: string;
  source_ref?: string;
  close_open_incidents?: boolean;
}> & SourceAuthorityOptions;

export type SnapshotAnchorInput = Readonly<{
  now: string;
  snapshot_id: string;
  anchor: Exclude<SafeAnchor, null>;
}>;

export type ArchiveItemInput = Readonly<{
  now: string;
  archived_paths: ItemPaths;
}> & SourceAuthorityOptions;

export type StateNormalizationInput = Readonly<{
  now: string;
  archive_status?: ArchiveStatus;
  paths?: ItemPaths;
  authority?: "runner_local" | "source_mirror";
  notes?: string[];
}> & SourceAuthorityOptions;

export type CheckpointMutationPayload = Readonly<{
  checkpoint: CheckpointPayload;
  progress: ProgressEntry;
}>;

export type IncidentMutationPayload = Readonly<{
  incident: IncidentRecord;
}>;

export function createFlowItem(input: CreateItemInput): FlowMutationResult<undefined> {
  const recipe = validateRecipe(input.recipe);
  const firstStage = recipe.stage_chain[0];
  if (!firstStage) {
    throw new Error("recipe.stage_chain must contain at least one stage");
  }
  const status = input.status ?? "todo";
  const stepStatus = stepStatusForItemStatus(status, "pending");
  const state: ItemState = validateItemState({
    schema: FLOW_PROTOCOL_SCHEMAS.item,
    item_id: input.item_id,
    title: input.title,
    source_kind: input.source_kind,
    source_ref: input.source_ref,
    status,
    archive_status: "active",
    resolution: resolutionForStatus(status),
    current_stage: firstStage.stage_key,
    current_step_status: stepStatus,
    priority: input.priority,
    confidence: input.confidence,
    created_at: input.now,
    updated_at: input.now,
    paths: input.paths,
    runtime: {
      active_plan_revision_id: input.active_plan_revision_id ?? "pr-001",
      active_action_id: input.active_action_id ?? "act-000",
      open_incident_ids: [],
      session_count: 0,
      latest_checkpoint_at: "",
      latest_snapshot_id: "",
      current_safe_anchor: null,
    },
    steps: recipe.stage_chain.map((stage) => ({
      stage_key: stage.stage_key,
      goal: stage.goal,
      status: stage.stage_key === firstStage.stage_key ? stepStatus : "pending",
      rollback_anchor: "",
      evidence_refs: [],
    } satisfies ItemStep)),
  });
  return {
    state,
    receipt: receipt("create_item", state.item_id, input.now, "runner_local", [
      event("item", undefined, state as unknown as JsonValue),
    ]),
    payload: undefined,
  };
}

export function recordCheckpoint(stateInput: ItemState, input: CheckpointInput): FlowMutationResult<CheckpointMutationPayload> {
  const state = validateItemState(stateInput);
  assertKnownStage(state, input.stage);
  if (isSourceOwned(state, input) && input.item_status_override !== undefined) {
    throw new Error("source-owned items do not accept runner-local item status overrides");
  }
  const nextStatus = nextStatusForCheckpoint(state, input);
  const nextStepStatus: StepStatus =
    input.session_status === "progress" ? "active" : input.session_status === "blocked" ? "blocked" : "done";
  const sessionNumber = state.runtime.session_count + 1;
  const checkpointReceipt: CheckpointReceipt = {
    ...(input.task_ref?.trim() ? { task_ref: input.task_ref.trim() } : {}),
    stage: input.stage,
    session_status: input.session_status,
    objective: input.objective,
    attempted: input.attempted,
    result: input.result,
    next_action: input.next_action,
    clean_state: input.clean_state,
    recorded_at: input.now,
    session_number: sessionNumber,
  };
  const nextState = syncCurrentStep({
    ...state,
    status: nextStatus,
    resolution: resolutionForStatus(nextStatus),
    updated_at: input.now,
    runtime: {
      ...state.runtime,
      active_action_id: `act-${String(sessionNumber).padStart(3, "0")}`,
      session_count: sessionNumber,
      latest_checkpoint_at: input.now,
    },
  }, input.stage, nextStepStatus);
  assertValidMutationState(nextState);
  const checkpoint: CheckpointPayload = {
    schema: FLOW_PROTOCOL_SCHEMAS.checkpoint,
    command: "checkpoint",
    item_id: state.item_id,
    item_path: input.item_path,
    progress_log_path: nextState.paths.progress_log,
    resolution: nextState.resolution,
    item_status: nextState.status,
    current_stage: nextState.current_stage,
    current_step_status: nextState.current_step_status,
    checkpoint_receipt: checkpointReceipt,
    current_safe_anchor: nextState.runtime.current_safe_anchor,
  };
  const progress: ProgressEntry = {
    schema: FLOW_PROTOCOL_SCHEMAS.progress,
    item_id: state.item_id,
    ...(input.task_ref?.trim() ? { task_ref: input.task_ref.trim() } : {}),
    session_number: sessionNumber,
    stage: input.stage,
    session_status: input.session_status,
    objective: input.objective,
    attempted: input.attempted,
    result: input.result,
    next_action: input.next_action,
    clean_state: input.clean_state,
    recorded_at: input.now,
  };
  return {
    state: nextState,
    receipt: receipt("checkpoint", state.item_id, input.now, "runner_local", diffEvents(state, nextState)),
    payload: { checkpoint, progress },
  };
}

export function openIncident(stateInput: ItemState, input: OpenIncidentInput): FlowMutationResult<IncidentMutationPayload> {
  const state = validateItemState(stateInput);
  if (state.runtime.open_incident_ids.includes(input.incident_id)) {
    throw new Error(`incident is already open on item: ${input.incident_id}`);
  }
  const incident: IncidentRecord = validateIncidentRecord({
    schema: FLOW_PROTOCOL_SCHEMAS.incident,
    incident_id: input.incident_id,
    family: input.family,
    summary: input.summary,
    status: "open",
    opened_at: input.now,
    closed_at: "",
    close_note: "",
    recommended_resume: input.recommended_resume,
  });
  const nextState = syncCurrentStep({
    ...state,
    status: "blocked",
    resolution: "live",
    updated_at: input.now,
    runtime: {
      ...state.runtime,
      open_incident_ids: [...state.runtime.open_incident_ids, input.incident_id],
    },
  }, state.current_stage, "blocked");
  assertValidMutationState(nextState);
  return {
    state: nextState,
    receipt: receipt("open_incident", state.item_id, input.now, "runner_local", diffEvents(state, nextState)),
    payload: { incident },
  };
}

export function resolveIncident(
  stateInput: ItemState,
  incidentInput: IncidentRecord,
  input: ResolveIncidentInput,
): FlowMutationResult<IncidentMutationPayload> {
  const state = validateItemState(stateInput);
  const incident = validateIncidentRecord(incidentInput);
  if (incident.status !== "open") {
    throw new Error(`incident is not open: ${incident.incident_id}`);
  }
  const openIds = state.runtime.open_incident_ids.filter((id) => id !== incident.incident_id);
  if (incident.recommended_resume === "stay_blocked" && openIds.length === 0 && input.source_status !== "blocked") {
    throw new Error("cannot resolve the last open incident with recommended_resume=stay_blocked unless a blocking source remains");
  }
  const resolved: IncidentRecord = {
    ...incident,
    status: "closed",
    closed_at: input.now,
    close_note: input.close_note,
  };
  const nextStatus = statusAfterIncidentResolution(state, resolved, openIds, input);
  const nextState = syncCurrentStep({
    ...state,
    status: nextStatus,
    resolution: resolutionForStatus(nextStatus),
    updated_at: input.now,
    runtime: {
      ...state.runtime,
      open_incident_ids: openIds,
    },
  }, state.current_stage, stepStatusForItemStatus(nextStatus, state.current_step_status));
  assertValidMutationState(nextState);
  return {
    state: nextState,
    receipt: receipt("resolve_incident", state.item_id, input.now, "runner_local", diffEvents(state, nextState)),
    payload: { incident: resolved },
  };
}

export function applySourceRefresh(stateInput: ItemState, input: SourceRefreshInput): FlowMutationResult<undefined> {
  const state = validateItemState(stateInput);
  assertSourceOwned(state, input, "source refresh");
  const shouldClearIncidents = input.close_open_incidents === true || isTerminalStatus(input.source_status);
  const openIncidentIds = shouldClearIncidents ? [] : state.runtime.open_incident_ids;
  const effectiveStatus = isTerminalStatus(input.source_status)
    ? input.source_status
    : openIncidentIds.length > 0
      ? "blocked"
      : input.source_status;
  const nextState: ItemState = {
    ...state,
    title: input.title ?? state.title,
    source_ref: input.source_ref ?? state.source_ref,
    status: effectiveStatus,
    resolution: resolutionForStatus(effectiveStatus),
    updated_at: input.now,
    runtime: {
      ...state.runtime,
      open_incident_ids: openIncidentIds,
    },
  };
  assertValidMutationState(nextState);
  return {
    state: nextState,
    receipt: receipt("source_refresh", state.item_id, input.now, "source_mirror", diffEvents(state, nextState)),
    payload: undefined,
  };
}

export function applySnapshotAnchor(stateInput: ItemState, input: SnapshotAnchorInput): FlowMutationResult<undefined> {
  const state = validateItemState(stateInput);
  const nextState: ItemState = {
    ...state,
    updated_at: input.now,
    runtime: {
      ...state.runtime,
      latest_snapshot_id: input.snapshot_id,
      current_safe_anchor: input.anchor,
    },
  };
  assertValidMutationState(nextState);
  return {
    state: nextState,
    receipt: receipt("snapshot_anchor", state.item_id, input.now, "runner_local", diffEvents(state, nextState)),
    payload: undefined,
  };
}

export function archiveFlowItem(stateInput: ItemState, input: ArchiveItemInput): FlowMutationResult<undefined> {
  const state = validateItemState(stateInput);
  if (isSourceOwned(state, input)) {
    throw new Error("source-owned items must be closed by their source, not archived by the runner");
  }
  if (!isTerminalStatus(state.status)) {
    throw new Error("only completed or cancelled items may be archived");
  }
  if (state.current_step_status !== "done") {
    throw new Error("only items with a completed current step may be archived");
  }
  if (state.runtime.open_incident_ids.length > 0) {
    throw new Error("items with open incidents may not be archived");
  }
  const nextState: ItemState = {
    ...state,
    archive_status: "archived",
    paths: input.archived_paths,
    updated_at: input.now,
  };
  assertValidMutationState(nextState);
  return {
    state: nextState,
    receipt: receipt("archive_item", state.item_id, input.now, "runner_local", diffEvents(state, nextState)),
    payload: undefined,
  };
}

export function normalizeFlowState(stateInput: ItemState, input: StateNormalizationInput): FlowMutationResult<undefined> {
  const state = validateItemState(stateInput);
  const authority = input.authority ?? "runner_local";
  const changesArchiveLocation = input.archive_status !== undefined || input.paths !== undefined;
  if (authority === "source_mirror") {
    assertSourceOwned(state, input, "source normalization");
  }
  if (changesArchiveLocation) {
    if (authority !== "source_mirror") {
      throw new Error("runner-local archive movement must use archiveFlowItem");
    }
    if (!isTerminalStatus(state.status)) {
      throw new Error("source archive normalization requires a terminal source-owned item");
    }
    if (state.runtime.open_incident_ids.length > 0) {
      throw new Error("source archive normalization requires closed incidents");
    }
    if ((input.archive_status ?? state.archive_status) !== "archived") {
      throw new Error("source archive normalization must move to archived state");
    }
  }
  const nextState: ItemState = {
    ...state,
    archive_status: input.archive_status ?? state.archive_status,
    paths: input.paths ?? state.paths,
    updated_at: input.now,
  };
  assertValidMutationState(nextState);
  return {
    state: nextState,
    receipt: receipt(
      "state_normalization",
      state.item_id,
      input.now,
      authority,
      diffEvents(state, nextState),
      input.notes ?? [],
    ),
    payload: undefined,
  };
}

export function resolutionForStatus(status: ItemStatus): "live" | "closeout" {
  return isTerminalStatus(status) ? "closeout" : "live";
}

export function isTerminalStatus(status: ItemStatus): boolean {
  return status === "completed" || status === "cancelled";
}

export function stepStatusForItemStatus(status: ItemStatus, priorStatus: StepStatus): StepStatus {
  if (status === "blocked") {
    return "blocked";
  }
  if (isTerminalStatus(status)) {
    return "done";
  }
  if (status === "in_progress") {
    return priorStatus === "done" || priorStatus === "blocked" || priorStatus === "pending" ? "active" : priorStatus;
  }
  return "pending";
}

function nextStatusForCheckpoint(state: ItemState, input: CheckpointInput): ItemStatus {
  if (input.item_status_override) {
    assertCheckpointOverride(input.session_status, input.item_status_override);
    return input.item_status_override;
  }
  if (isSourceOwned(state, input)) {
    if (!input.source_status) {
      throw new Error("source-owned checkpoint requires source_status");
    }
    if (input.session_status === "blocked") {
      if (input.source_status !== "blocked" && state.runtime.open_incident_ids.length === 0) {
        throw new Error("source-owned blocked checkpoint requires a blocked source status or an open incident");
      }
      return "blocked";
    }
    if (input.session_status === "progress" && input.source_status === "blocked") {
      throw new Error("cannot record progress for a source-owned item whose source status is blocked");
    }
    return input.source_status;
  }
  if (input.session_status === "progress") {
    return "in_progress";
  }
  if (input.session_status === "blocked") {
    return "blocked";
  }
  return input.terminal_item_status ?? "completed";
}

function assertCheckpointOverride(sessionStatus: SessionStatus, itemStatus: ItemStatus): void {
  const allowed: Record<SessionStatus, readonly ItemStatus[]> = {
    progress: ["in_progress"],
    blocked: ["blocked"],
    gate_passed: ["completed", "cancelled"],
    terminal: ["completed", "cancelled"],
  };
  if (!allowed[sessionStatus].includes(itemStatus)) {
    throw new Error(`item status ${itemStatus} is not allowed for checkpoint session status ${sessionStatus}`);
  }
}

function statusAfterIncidentResolution(
  state: ItemState,
  incident: IncidentRecord,
  openIds: string[],
  input: ResolveIncidentInput,
): ItemStatus {
  if (openIds.length > 0 || state.status !== "blocked") {
    return state.status;
  }
  if (incident.recommended_resume === "stay_blocked") {
    return "blocked";
  }
  if (isSourceOwned(state, input)) {
    return input.source_status ?? "todo";
  }
  return incident.recommended_resume === "closeout" ? "completed" : "todo";
}

function syncCurrentStep(state: ItemState, stage: string, status: StepStatus): ItemState {
  return {
    ...state,
    current_stage: stage,
    current_step_status: status,
    steps: state.steps.map((step) => step.stage_key === stage ? { ...step, status } : step),
  };
}

function assertKnownStage(state: ItemState, stage: string): void {
  if (!state.steps.some((step) => step.stage_key === stage)) {
    throw new Error(`invalid stage ${JSON.stringify(stage)}; expected one declared item step`);
  }
}

function assertValidMutationState(state: ItemState): void {
  const issues = collectItemIssues(state);
  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }
}

function isSourceOwned(state: ItemState, options: SourceAuthorityOptions): boolean {
  return (options.source_owned_kinds ?? ["feature-tracker"]).includes(state.source_kind);
}

function assertSourceOwned(state: ItemState, options: SourceAuthorityOptions, action: string): void {
  if (!isSourceOwned(state, options)) {
    throw new Error(`${action} requires a source-owned item`);
  }
}

function receipt(
  mutation: FlowMutationKind,
  itemId: string,
  recordedAt: string,
  authority: "runner_local" | "source_mirror",
  events: FlowMutationEvent[],
  notes: string[] = [],
): FlowMutationReceipt {
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.mutationReceipt,
    receipt_id: `${mutation}:${itemId}:${recordedAt}:${randomUUID().slice(0, 8)}`,
    mutation,
    item_id: itemId,
    recorded_at: recordedAt,
    authority,
    changed: events.length > 0,
    events,
    notes,
  };
}

function diffEvents(before: ItemState, after: ItemState): FlowMutationEvent[] {
  const events: FlowMutationEvent[] = [];
  compare("title", before.title, after.title, events);
  compare("source_ref", before.source_ref, after.source_ref, events);
  compare("status", before.status, after.status, events);
  compare("archive_status", before.archive_status, after.archive_status, events);
  compare("resolution", before.resolution, after.resolution, events);
  compare("current_stage", before.current_stage, after.current_stage, events);
  compare("current_step_status", before.current_step_status, after.current_step_status, events);
  compare("updated_at", before.updated_at, after.updated_at, events);
  compare("paths", before.paths, after.paths, events);
  compare("runtime.active_action_id", before.runtime.active_action_id, after.runtime.active_action_id, events);
  compare("runtime.open_incident_ids", before.runtime.open_incident_ids, after.runtime.open_incident_ids, events);
  compare("runtime.session_count", before.runtime.session_count, after.runtime.session_count, events);
  compare("runtime.latest_checkpoint_at", before.runtime.latest_checkpoint_at, after.runtime.latest_checkpoint_at, events);
  compare("runtime.latest_snapshot_id", before.runtime.latest_snapshot_id, after.runtime.latest_snapshot_id, events);
  compare("runtime.current_safe_anchor", before.runtime.current_safe_anchor, after.runtime.current_safe_anchor, events);
  compare("steps", before.steps, after.steps, events);
  return events;
}

function compare(fieldPath: string, before: unknown, after: unknown, events: FlowMutationEvent[]): void {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  events.push(event(fieldPath, before, after));
}

function event(fieldPath: string, before: unknown, after: unknown): FlowMutationEvent {
  const out: { field_path: string; before?: JsonValue; after?: JsonValue } = { field_path: fieldPath };
  if (before !== undefined) {
    out.before = assertJsonSafe(before, `${fieldPath}.before`);
  }
  if (after !== undefined) {
    out.after = assertJsonSafe(after, `${fieldPath}.after`);
  }
  return out;
}
