import {
  ACTION_REASONS,
  ARCHIVE_STATUSES,
  CLEAN_STATES,
  EXECUTION_MODES,
  FLOW_MUTATION_KINDS,
  FLOW_PROTOCOL_SCHEMAS,
  INCIDENT_RESUMES,
  INCIDENT_STATUSES,
  ITEM_STATUSES,
  RECOMMENDED_ACTIONS,
  RESOLUTION_KINDS,
  SESSION_STATUSES,
  STEP_STATUSES,
  type ArchiveStatus,
  type CheckpointRequest,
  type CheckpointReceipt,
  type CleanState,
  type FlowMutationKind,
  type FlowMutationReceipt,
  type IncidentRecord,
  type IncidentResume,
  type IncidentStatus,
  type ItemState,
  type ItemStatus,
  type JsonValue,
  type LoopRecipe,
  type NextActionPayload,
  type ResolutionKind,
  type ResumeCandidate,
  type ResumeCandidatesPayload,
  type RunnerPolicy,
  type SafeAnchor,
  type SessionStatus,
  type StepStatus,
} from "./model.ts";

export function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

export function assertOptionalString(value: unknown, label: string): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

export function assertNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

export function assertStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return [...value];
}

export function assertEnum<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  }
  return value as T[number];
}

export function assertJsonSafe(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must not contain a non-finite number`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => assertJsonSafe(item, `${label}[${index}]`));
  }
  if (value && typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        throw new Error(`${label}.${key} must not be undefined`);
      }
      out[key] = assertJsonSafe(item, `${label}.${key}`);
    }
    return out;
  }
  throw new Error(`${label} contains a value that cannot be represented as JSON`);
}

export function validateSafeAnchor(value: unknown, label: string): SafeAnchor {
  if (value === null) {
    return null;
  }
  const record = assertRecord(value, label);
  return {
    kind: assertString(record.kind, `${label}.kind`),
    ref: assertString(record.ref, `${label}.ref`),
    summary: assertString(record.summary, `${label}.summary`),
  };
}

export function validatePolicy(value: unknown, label = "policy"): RunnerPolicy {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.policy) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.policy}`);
  }
  const safety = assertRecord(record.safety, `${label}.safety`);
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.policy,
    safety: {
      snapshot_before_session: assertBoolean(safety.snapshot_before_session, `${label}.safety.snapshot_before_session`),
      checkpoint_before_stop: assertBoolean(safety.checkpoint_before_stop, `${label}.safety.checkpoint_before_stop`),
      persist_state_before_stop: assertBoolean(safety.persist_state_before_stop, `${label}.safety.persist_state_before_stop`),
    },
  };
}

export function validateRecipe(value: unknown, label = "recipe"): LoopRecipe {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.recipe) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.recipe}`);
  }
  if (!Array.isArray(record.stage_chain) || record.stage_chain.length === 0) {
    throw new Error(`${label}.stage_chain must be a non-empty array`);
  }
  const stage_chain = record.stage_chain.map((entry, index) => {
    const stage = assertRecord(entry, `${label}.stage_chain[${index}]`);
    return {
      stage_key: assertString(stage.stage_key, `${label}.stage_chain[${index}].stage_key`),
      goal: assertString(stage.goal, `${label}.stage_chain[${index}].goal`),
    };
  });
  const duplicates = duplicateValues(stage_chain.map((stage) => stage.stage_key));
  if (duplicates.length > 0) {
    throw new Error(`${label}.stage_chain has duplicate stage keys: ${duplicates.join(", ")}`);
  }
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.recipe,
    recipe_id: assertString(record.recipe_id, `${label}.recipe_id`),
    recipe_version: assertString(record.recipe_version, `${label}.recipe_version`),
    stage_chain,
  };
}

export function validateItemState(value: unknown, label = "item"): ItemState {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.item) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.item}`);
  }
  const paths = assertRecord(record.paths, `${label}.paths`);
  const runtime = assertRecord(record.runtime, `${label}.runtime`);
  if (!Array.isArray(record.steps) || record.steps.length === 0) {
    throw new Error(`${label}.steps must be a non-empty array`);
  }
  const steps = record.steps.map((entry, index) => {
    const step = assertRecord(entry, `${label}.steps[${index}]`);
    return {
      stage_key: assertString(step.stage_key, `${label}.steps[${index}].stage_key`),
      goal: assertString(step.goal, `${label}.steps[${index}].goal`),
      status: assertEnum(step.status, STEP_STATUSES, `${label}.steps[${index}].status`) as StepStatus,
      rollback_anchor: typeof step.rollback_anchor === "string" ? step.rollback_anchor : "",
      evidence_refs: step.evidence_refs === undefined ? [] : assertStringArray(step.evidence_refs, `${label}.steps[${index}].evidence_refs`),
    };
  });
  const state: ItemState = {
    schema: FLOW_PROTOCOL_SCHEMAS.item,
    item_id: assertString(record.item_id, `${label}.item_id`),
    title: assertString(record.title, `${label}.title`),
    source_kind: assertString(record.source_kind, `${label}.source_kind`),
    source_ref: assertString(record.source_ref, `${label}.source_ref`),
    status: assertEnum(record.status, ITEM_STATUSES, `${label}.status`) as ItemStatus,
    archive_status: assertEnum(record.archive_status, ARCHIVE_STATUSES, `${label}.archive_status`) as ArchiveStatus,
    resolution: assertEnum(record.resolution, RESOLUTION_KINDS, `${label}.resolution`) as ResolutionKind,
    current_stage: assertString(record.current_stage, `${label}.current_stage`),
    current_step_status: assertEnum(record.current_step_status, STEP_STATUSES, `${label}.current_step_status`) as StepStatus,
    priority: assertNumber(record.priority, `${label}.priority`),
    confidence: assertNumber(record.confidence, `${label}.confidence`),
    created_at: assertString(record.created_at, `${label}.created_at`),
    updated_at: assertString(record.updated_at, `${label}.updated_at`),
    paths: {
      handoff: assertString(paths.handoff, `${label}.paths.handoff`),
      checkpoints: assertString(paths.checkpoints, `${label}.paths.checkpoints`),
      progress_log: assertString(paths.progress_log, `${label}.paths.progress_log`),
      mutation_receipts: assertString(paths.mutation_receipts, `${label}.paths.mutation_receipts`),
      plan_revisions_dir: assertString(paths.plan_revisions_dir, `${label}.paths.plan_revisions_dir`),
      incidents_dir: assertString(paths.incidents_dir, `${label}.paths.incidents_dir`),
    },
    runtime: {
      active_plan_revision_id: assertString(runtime.active_plan_revision_id, `${label}.runtime.active_plan_revision_id`),
      active_action_id: assertString(runtime.active_action_id, `${label}.runtime.active_action_id`),
      open_incident_ids: runtime.open_incident_ids === undefined ? [] : assertStringArray(runtime.open_incident_ids, `${label}.runtime.open_incident_ids`),
      session_count: assertNumber(runtime.session_count, `${label}.runtime.session_count`),
      latest_checkpoint_at: assertOptionalString(runtime.latest_checkpoint_at, `${label}.runtime.latest_checkpoint_at`),
      latest_snapshot_id: assertOptionalString(runtime.latest_snapshot_id, `${label}.runtime.latest_snapshot_id`),
      current_safe_anchor: validateSafeAnchor(runtime.current_safe_anchor ?? null, `${label}.runtime.current_safe_anchor`),
    },
    steps,
  };
  const issues = collectItemIssues(state, label);
  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }
  return state;
}

export function collectItemIssues(state: ItemState, label = "item"): string[] {
  const issues: string[] = [];
  const stageKeys = state.steps.map((step) => step.stage_key);
  for (const duplicate of duplicateValues(stageKeys)) {
    issues.push(`${label}.steps has duplicate stage key: ${duplicate}`);
  }
  if (!stageKeys.includes(state.current_stage)) {
    issues.push(`${label}.current_stage must match one declared step`);
  }
  const currentStep = state.steps.find((step) => step.stage_key === state.current_stage);
  if (currentStep && currentStep.status !== state.current_step_status) {
    issues.push(`${label}.current_step_status must match the current step record`);
  }
  for (const duplicate of duplicateValues(state.runtime.open_incident_ids)) {
    issues.push(`${label}.runtime.open_incident_ids has duplicate id: ${duplicate}`);
  }
  if (state.status === "completed" || state.status === "cancelled") {
    if (state.resolution !== "closeout") {
      issues.push(`${label}.resolution must be closeout for terminal item status`);
    }
  } else if (state.resolution !== "live") {
    issues.push(`${label}.resolution must be live for non-terminal item status`);
  }
  if (state.archive_status === "archived" && state.runtime.open_incident_ids.length > 0) {
    issues.push(`${label} must not be archived with open incidents`);
  }
  return issues;
}

export function validateIncidentRecord(value: unknown, label = "incident"): IncidentRecord {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.incident) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.incident}`);
  }
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.incident,
    incident_id: assertString(record.incident_id, `${label}.incident_id`),
    family: assertString(record.family, `${label}.family`),
    summary: assertString(record.summary, `${label}.summary`),
    status: assertEnum(record.status, INCIDENT_STATUSES, `${label}.status`) as IncidentStatus,
    opened_at: assertString(record.opened_at, `${label}.opened_at`),
    closed_at: assertOptionalString(record.closed_at, `${label}.closed_at`),
    close_note: assertOptionalString(record.close_note, `${label}.close_note`),
    recommended_resume: assertEnum(record.recommended_resume, INCIDENT_RESUMES, `${label}.recommended_resume`) as IncidentResume,
  };
}

export function validateCheckpointReceipt(value: unknown, label = "checkpoint_receipt"): CheckpointReceipt {
  const record = assertRecord(value, label);
  return {
    ...(record.task_ref === undefined ? {} : { task_ref: assertOptionalString(record.task_ref, `${label}.task_ref`) }),
    stage: assertString(record.stage, `${label}.stage`),
    session_status: assertEnum(record.session_status, SESSION_STATUSES, `${label}.session_status`) as SessionStatus,
    objective: assertString(record.objective, `${label}.objective`),
    attempted: assertString(record.attempted, `${label}.attempted`),
    result: assertString(record.result, `${label}.result`),
    next_action: assertString(record.next_action, `${label}.next_action`),
    clean_state: assertEnum(record.clean_state, CLEAN_STATES, `${label}.clean_state`) as CleanState,
    recorded_at: assertString(record.recorded_at, `${label}.recorded_at`),
    session_number: assertNumber(record.session_number, `${label}.session_number`),
  };
}

export function validateCheckpointRequest(value: unknown, label = "checkpoint_request"): CheckpointRequest {
  const record = assertRecord(value, label);
  return {
    stage: assertString(record.stage, `${label}.stage`),
    session_status: assertEnum(record.session_status, SESSION_STATUSES, `${label}.session_status`) as SessionStatus,
    command_example: assertString(record.command_example, `${label}.command_example`),
  };
}

export function validateNextActionPayload(value: unknown, label = "next_action"): NextActionPayload {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.nextAction) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.nextAction}`);
  }
  const sessionContract = assertRecord(record.session_contract, `${label}.session_contract`);
  const payload: NextActionPayload = {
    schema: FLOW_PROTOCOL_SCHEMAS.nextAction,
    command: assertEnum(record.command, ["next"] as const, `${label}.command`),
    recommended_action: assertEnum(record.recommended_action, RECOMMENDED_ACTIONS, `${label}.recommended_action`),
    action_reason: assertEnum(record.action_reason, ACTION_REASONS, `${label}.action_reason`),
    session_contract: {
      launch_bounded_session: assertBoolean(sessionContract.launch_bounded_session, `${label}.session_contract.launch_bounded_session`),
      persist_state_before_stop: assertBoolean(sessionContract.persist_state_before_stop, `${label}.session_contract.persist_state_before_stop`),
      checkpoint_before_stop: assertBoolean(sessionContract.checkpoint_before_stop, `${label}.session_contract.checkpoint_before_stop`),
      snapshot_before_session: assertBoolean(sessionContract.snapshot_before_session, `${label}.session_contract.snapshot_before_session`),
      archive_only_closeout: assertBoolean(sessionContract.archive_only_closeout, `${label}.session_contract.archive_only_closeout`),
    },
  };
  if (record.item_id !== undefined) {
    return {
      ...payload,
      item_id: assertString(record.item_id, `${label}.item_id`),
      item_path: assertOptionalString(record.item_path, `${label}.item_path`),
      item_status: assertEnum(record.item_status, ITEM_STATUSES, `${label}.item_status`) as ItemStatus,
      resolution: assertEnum(record.resolution, RESOLUTION_KINDS, `${label}.resolution`) as ResolutionKind,
      current_stage: assertString(record.current_stage, `${label}.current_stage`),
      current_step_status: assertEnum(record.current_step_status, STEP_STATUSES, `${label}.current_step_status`) as StepStatus,
      execution_mode: assertEnum(record.execution_mode, EXECUTION_MODES, `${label}.execution_mode`),
      active_plan_revision_id: assertString(record.active_plan_revision_id, `${label}.active_plan_revision_id`),
      active_action_id: assertString(record.active_action_id, `${label}.active_action_id`),
      session_number: assertNumber(record.session_number, `${label}.session_number`),
      progress_log_path: assertString(record.progress_log_path, `${label}.progress_log_path`),
      current_safe_anchor: validateSafeAnchor(record.current_safe_anchor ?? null, `${label}.current_safe_anchor`),
      checkpoint_request: validateCheckpointRequest(record.checkpoint_request, `${label}.checkpoint_request`),
    };
  }
  if (record.checkpoint_request !== undefined) {
    throw new Error(`${label}.checkpoint_request requires ${label}.item_id`);
  }
  return payload;
}

export function validateResumeCandidate(value: unknown, label = "resume_candidate"): ResumeCandidate {
  const record = assertRecord(value, label);
  return {
    item_id: assertString(record.item_id, `${label}.item_id`),
    item_path: assertOptionalString(record.item_path, `${label}.item_path`),
    title: assertString(record.title, `${label}.title`),
    source_kind: assertString(record.source_kind, `${label}.source_kind`),
    source_ref: assertString(record.source_ref, `${label}.source_ref`),
    item_status: assertEnum(record.item_status, ITEM_STATUSES, `${label}.item_status`) as ItemStatus,
    resolution: assertEnum(record.resolution, RESOLUTION_KINDS, `${label}.resolution`) as ResolutionKind,
    current_stage: assertString(record.current_stage, `${label}.current_stage`),
    current_step_status: assertEnum(record.current_step_status, STEP_STATUSES, `${label}.current_step_status`) as StepStatus,
    active_plan_revision_id: assertString(record.active_plan_revision_id, `${label}.active_plan_revision_id`),
    active_action_id: assertString(record.active_action_id, `${label}.active_action_id`),
    session_number: assertNumber(record.session_number, `${label}.session_number`),
    progress_log_path: assertString(record.progress_log_path, `${label}.progress_log_path`),
    current_safe_anchor: validateSafeAnchor(record.current_safe_anchor ?? null, `${label}.current_safe_anchor`),
    open_incident_ids: record.open_incident_ids === undefined ? [] : assertStringArray(record.open_incident_ids, `${label}.open_incident_ids`),
  };
}

export function validateResumeCandidatesPayload(value: unknown, label = "resume_candidates"): ResumeCandidatesPayload {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.resumeCandidates) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.resumeCandidates}`);
  }
  if (record.command !== "resume-candidates") {
    throw new Error(`${label}.command must be resume-candidates`);
  }
  if (!Array.isArray(record.live) || !Array.isArray(record.closeout)) {
    throw new Error(`${label}.live and ${label}.closeout must be arrays`);
  }
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.resumeCandidates,
    command: "resume-candidates",
    live: record.live.map((candidate, index) => validateResumeCandidate(candidate, `${label}.live[${index}]`)),
    closeout: record.closeout.map((candidate, index) => validateResumeCandidate(candidate, `${label}.closeout[${index}]`)),
  };
}

export function validateMutationReceipt(value: unknown, label = "mutation_receipt"): FlowMutationReceipt {
  const record = assertRecord(value, label);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.mutationReceipt) {
    throw new Error(`${label}.schema must be ${FLOW_PROTOCOL_SCHEMAS.mutationReceipt}`);
  }
  const eventsRaw = record.events;
  if (!Array.isArray(eventsRaw)) {
    throw new Error(`${label}.events must be an array`);
  }
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.mutationReceipt,
    receipt_id: assertString(record.receipt_id, `${label}.receipt_id`),
    mutation: assertEnum(record.mutation, FLOW_MUTATION_KINDS, `${label}.mutation`) as FlowMutationKind,
    item_id: assertString(record.item_id, `${label}.item_id`),
    recorded_at: assertString(record.recorded_at, `${label}.recorded_at`),
    authority: assertEnum(record.authority, ["runner_local", "source_mirror"] as const, `${label}.authority`),
    changed: assertBoolean(record.changed, `${label}.changed`),
    events: eventsRaw.map((event, index) => {
      const eventRecord = assertRecord(event, `${label}.events[${index}]`);
      const out: { field_path: string; before?: JsonValue; after?: JsonValue } = {
        field_path: assertString(eventRecord.field_path, `${label}.events[${index}].field_path`),
      };
      if (eventRecord.before !== undefined) {
        out.before = assertJsonSafe(eventRecord.before, `${label}.events[${index}].before`);
      }
      if (eventRecord.after !== undefined) {
        out.after = assertJsonSafe(eventRecord.after, `${label}.events[${index}].after`);
      }
      return out;
    }),
    notes: record.notes === undefined ? [] : assertStringArray(record.notes, `${label}.notes`),
  };
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}
