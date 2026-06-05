#!/usr/bin/env -S node --experimental-strip-types

import fs from "node:fs";

type JsonRecord = Record<string, unknown>;
type Severity = "error" | "warning";

interface Issue {
  severity: Severity;
  code: string;
  path: string;
  message: string;
}

interface ArtifactView {
  ref: string;
  identity: string;
  evidenceRefs: string[];
}

interface SourceIdentityView {
  before: string;
  after: string;
  evidenceRefs: string[];
}

interface FailureView {
  cause: string;
  scope: string;
  effectState: string;
  authorityState: string;
  domain: string;
  evidenceRefs: string[];
}

interface AttemptView {
  attemptId: string;
  workerId: string;
  role: string;
  writeRoot: string;
  status: string;
  failure: FailureView;
  artifacts: ArtifactView[];
  evidenceRefs: string[];
  authorityEvidenceRefs: string[];
  sourceIdentity: SourceIdentityView;
}

interface DriftView {
  status: string;
  kind: string;
  evidenceRefs: string[];
}

interface VerificationView {
  targetAttemptId: string;
  status: string;
  artifacts: ArtifactView[];
  evidenceRefs: string[];
}

interface ReviewView {
  reviewId: string;
  reviewerId: string;
  targetAttemptId: string;
  targetArtifacts: ArtifactView[];
  verdict: string;
  findingRefs: string[];
  evidenceRefs: string[];
  sourceIdentity: SourceIdentityView;
}

interface InterventionView {
  targetAttemptId: string;
  driftKind: string;
  observationRefs: string[];
  action: string;
  interventionRefs: string[];
  effectStatus: string;
  effectRefs: string[];
}

interface TaskView {
  taskId: string;
  objective: string;
  executionDomain: string;
  required: boolean;
  status: string;
  dependsOn: string[];
  mutationBoundary: string[];
  sourceScope: string[];
  methodBoundaryRefs: string[];
  requiredArtifacts: string[];
  requiresReview: boolean;
  currentAttemptId: string;
  attempts: AttemptView[];
  drift: DriftView;
  verification: VerificationView;
  reviews: ReviewView[];
  interventions: InterventionView[];
  acceptanceEvidence: string[];
  nextObservationCondition: string;
}

interface AcceptedArtifactView {
  ref: string;
  identity: string;
  attemptId: string;
}

interface ReceiptView {
  raw: JsonRecord;
  runId: string;
  objective: string;
  route: {
    topology: string;
    assurance: string;
    lifecycle: string;
  };
  runStatus: string;
  ownerSnapshot: {
    ref: string;
    revision: string;
    evidenceRefs: string[];
  };
  integrationWriter: string;
  reviewers: string[];
  allowParallelWriters: boolean;
  budgets: Record<string, number>;
  circuits: Array<{ domain: string; status: string; reason: string; evidenceRefs: string[] }>;
  tasks: TaskView[];
  checkpoint: {
    acceptedArtifacts: AcceptedArtifactView[];
    unresolvedFindings: string[];
    staleAttemptIds: string[];
    nextSafeAction: string;
    terminal: boolean;
  };
}

const ROUTE_TOPOLOGIES = new Set(["single_agent", "delegated"]);
const ROUTE_ASSURANCE = new Set(["standard", "audit", "blocking_review"]);
const ROUTE_LIFECYCLES = new Set(["normal", "recovery"]);
const RUN_STATUSES = new Set(["active", "blocked", "complete"]);
const TASK_STATUSES = new Set(["planned", "ready", "running", "needs_repair", "blocked", "complete", "cancelled"]);
const ATTEMPT_ROLES = new Set(["writer", "auditor"]);
const ATTEMPT_STATUSES = new Set(["running", "succeeded", "failed", "cancelled", "stale_premise"]);
const FAILURE_CAUSES = new Set([
  "none",
  "transient_transport",
  "logic_defect",
  "dependency",
  "provider_fault",
  "human_decision",
  "restart_exhausted",
]);
const FAILURE_SCOPES = new Set(["none", "lane", "dependency_cone", "shared_domain", "unknown"]);
const EFFECT_STATES = new Set(["not_applicable", "known_not_applied", "known_applied", "unknown"]);
const AUTHORITY_STATES = new Set(["current", "released", "fenced", "ambiguous"]);
const VERIFICATION_STATUSES = new Set(["not_run", "pass", "fail"]);
const REVIEW_VERDICTS = new Set(["pass", "advisory", "blocking"]);
const CIRCUIT_STATUSES = new Set(["open", "closed"]);
const DRIFT_STATUSES = new Set(["aligned", "suspected", "confirmed"]);
const DRIFT_KINDS = new Set(["none", "premise", "scope", "authority", "method", "evidence", "completion", "cost"]);
const INTERVENTION_EFFECTS = new Set(["pending", "resolved", "unresolved"]);
const INTERVENTION_ACTIONS = new Set([
  "reconcile_owner_state",
  "steer_to_boundary",
  "freeze_and_rebind",
  "steer_method_change",
  "require_evidence",
  "block_false_completion",
  "reduce_or_stop_supervision",
  "handoff_or_replace_writer",
  "restart_dependency_cone",
  "circuit_break_and_wait",
  "handback_human",
  "checkpoint_and_stop",
]);
const BUDGET_FIELDS = [
  "spawn_max",
  "spawn_used",
  "observation_max",
  "observation_used",
  "intervention_max",
  "intervention_used",
  "restart_max",
  "restart_used",
  "human_gate_max",
  "human_gate_used",
] as const;

const ACTION_PRIORITY = new Map<string, number>([
  ["inspect_side_effect", 0],
  ["freeze_and_rebind", 1],
  ["inspect_failure_scope", 2],
  ["circuit_break_and_wait", 3],
  ["hold_open_circuit", 4],
  ["block_false_completion", 5],
  ["handback_human", 6],
  ["checkpoint_and_stop", 7],
  ["reconcile_owner_state", 8],
  ["reconcile_after_cancellation", 9],
  ["inspect_drift", 10],
  ["steer_to_boundary", 11],
  ["steer_method_change", 12],
  ["require_evidence", 13],
  ["reduce_or_stop_supervision", 14],
  ["repair_then_reverify", 15],
  ["dispatch_reviewer", 16],
  ["verify_current_artifact", 17],
  ["verify_owner_acceptance", 18],
  ["collect_artifact_evidence", 19],
  ["restart_dependency_cone", 20],
  ["retry_attempt", 21],
  ["repair_with_method_change", 22],
  ["handoff_or_replace_writer", 23],
  ["observe_on_next_condition", 24],
  ["wait_dependency", 25],
  ["wait_owner_transition", 26],
  ["execute_direct", 27],
  ["dispatch_task", 28],
  ["report_task_ready", 29],
  ["report_run_ready", 30],
  ["no_action", 31],
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function addIssue(issues: Issue[], severity: Severity, code: string, path: string, message: string): void {
  issues.push({ severity, code, path, message });
}

function requireRecord(parent: JsonRecord, key: string, path: string, issues: Issue[]): JsonRecord {
  const value = parent[key];
  if (!isRecord(value)) {
    addIssue(issues, "error", "type.record", `${path}.${key}`, "must be an object");
    return {};
  }
  return value;
}

function requireArray(parent: JsonRecord, key: string, path: string, issues: Issue[]): unknown[] {
  const value = parent[key];
  if (!Array.isArray(value)) {
    addIssue(issues, "error", "type.array", `${path}.${key}`, "must be an array");
    return [];
  }
  return value;
}

function requireString(parent: JsonRecord, key: string, path: string, issues: Issue[], allowEmpty = false): string {
  const value = parent[key];
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    addIssue(issues, "error", "type.string", `${path}.${key}`, allowEmpty ? "must be a string" : "must be a non-empty string");
    return "";
  }
  return value;
}

function requireBoolean(parent: JsonRecord, key: string, path: string, issues: Issue[]): boolean {
  if (typeof parent[key] !== "boolean") {
    addIssue(issues, "error", "type.boolean", `${path}.${key}`, "must be a boolean");
    return false;
  }
  return parent[key] === true;
}

function requireStringArray(parent: JsonRecord, key: string, path: string, issues: Issue[]): string[] {
  const value = parent[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    addIssue(issues, "error", "type.string_array", `${path}.${key}`, "must be an array of non-empty strings");
    return asStringArray(value).filter((item) => item.trim() !== "");
  }
  return value as string[];
}

function requireEnum(parent: JsonRecord, key: string, path: string, allowed: Set<string>, issues: Issue[]): string {
  const value = requireString(parent, key, path, issues);
  if (value !== "" && !allowed.has(value)) addIssue(issues, "error", "value.enum", `${path}.${key}`, `unsupported value: ${value}`);
  return value;
}

function isMachineAbsolute(ref: string): boolean {
  return ref.startsWith("/")
    || ref.startsWith("\\\\")
    || /^~(?:[/\\]|$)/.test(ref)
    || /^[A-Za-z]:[/\\]/.test(ref)
    || /^(?:file|vscode|vscode-insiders):/i.test(ref);
}

function checkRefs(refs: string[], path: string, issues: Issue[]): void {
  refs.forEach((ref, index) => {
    if (isMachineAbsolute(ref)) addIssue(issues, "error", "ref.machine_absolute", `${path}[${index}]`, "must be repo-relative, remotely addressable, or host-opaque");
    if (!ref.includes("://") && ref.split(/[/\\]/).includes("..")) addIssue(issues, "error", "ref.parent_traversal", `${path}[${index}]`, "must not traverse outside the declared owner path");
  });
}

function parseArtifact(value: unknown, path: string, issues: Issue[]): ArtifactView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const artifact = {
    ref: requireString(raw, "ref", path, issues),
    identity: requireString(raw, "identity", path, issues),
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
  };
  checkRefs(artifact.ref === "" ? [] : [artifact.ref], `${path}.ref`, issues);
  checkRefs(artifact.evidenceRefs, `${path}.evidence_refs`, issues);
  if (artifact.ref !== "" && artifact.identity === artifact.ref) addIssue(issues, "error", "artifact.identity_path_only", `${path}.identity`, "artifact identity must be content- or owner-version-bound, not the artifact ref itself");
  return artifact;
}

function parseSourceIdentity(value: unknown, path: string, issues: Issue[]): SourceIdentityView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const identity = {
    before: requireString(raw, "before", path, issues, true),
    after: requireString(raw, "after", path, issues, true),
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
  };
  checkRefs(identity.evidenceRefs, `${path}.evidence_refs`, issues);
  return identity;
}

function parseFailure(value: unknown, path: string, issues: Issue[]): FailureView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const failure = {
    cause: requireEnum(raw, "cause", path, FAILURE_CAUSES, issues),
    scope: requireEnum(raw, "scope", path, FAILURE_SCOPES, issues),
    effectState: requireEnum(raw, "effect_state", path, EFFECT_STATES, issues),
    authorityState: requireEnum(raw, "authority_state", path, AUTHORITY_STATES, issues),
    domain: requireString(raw, "domain", path, issues, true),
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
  };
  checkRefs(failure.evidenceRefs, `${path}.evidence_refs`, issues);
  return failure;
}

function parseAttempt(value: unknown, path: string, issues: Issue[]): AttemptView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const artifacts = requireArray(raw, "artifacts", path, issues).map((item, index) => parseArtifact(item, `${path}.artifacts[${index}]`, issues));
  const attempt: AttemptView = {
    attemptId: requireString(raw, "attempt_id", path, issues),
    workerId: requireString(raw, "worker_id", path, issues),
    role: requireEnum(raw, "role", path, ATTEMPT_ROLES, issues),
    writeRoot: requireString(raw, "write_root", path, issues, true),
    status: requireEnum(raw, "status", path, ATTEMPT_STATUSES, issues),
    failure: parseFailure(raw.failure, `${path}.failure`, issues),
    artifacts,
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
    authorityEvidenceRefs: requireStringArray(raw, "authority_evidence_refs", path, issues),
    sourceIdentity: parseSourceIdentity(raw.source_identity, `${path}.source_identity`, issues),
  };
  checkRefs(attempt.writeRoot === "" ? [] : [attempt.writeRoot], `${path}.write_root`, issues);
  checkRefs(attempt.evidenceRefs, `${path}.evidence_refs`, issues);
  checkRefs(attempt.authorityEvidenceRefs, `${path}.authority_evidence_refs`, issues);
  const artifactRefs = new Set<string>();
  attempt.artifacts.forEach((artifact, index) => {
    if (artifactRefs.has(artifact.ref)) addIssue(issues, "error", "artifact.duplicate", `${path}.artifacts[${index}].ref`, "artifact ref must be unique within one attempt");
    artifactRefs.add(artifact.ref);
  });
  if (attempt.role === "auditor" && attempt.writeRoot !== "") addIssue(issues, "error", "authority.read_only_write_root", `${path}.write_root`, "auditor attempts must not declare a write root");
  if (attempt.status === "succeeded" && attempt.failure.cause !== "none") addIssue(issues, "error", "attempt.success_failure", path, "a succeeded attempt must use failure.cause=none");
  if (attempt.status === "failed" && attempt.failure.cause === "none") addIssue(issues, "error", "attempt.unclassified_failure", path, "a failed attempt needs a failure cause");
  if (attempt.status === "failed" && attempt.failure.scope === "none") addIssue(issues, "error", "failure.scope_missing", `${path}.failure.scope`, "a failed attempt needs a non-none failure scope before retry or restart");
  if (attempt.status !== "failed" && attempt.failure.cause !== "none") addIssue(issues, "error", "attempt.nonfailed_failure", path, "only a failed attempt may carry a non-none failure cause");
  if (attempt.failure.cause === "provider_fault" && attempt.failure.domain === "") addIssue(issues, "error", "failure.domain_missing", `${path}.failure.domain`, "provider fault requires a domain");
  if ((attempt.status === "failed" || attempt.failure.effectState === "unknown" || attempt.failure.authorityState === "ambiguous") && attempt.failure.evidenceRefs.length === 0) {
    addIssue(issues, "error", "failure.evidence_missing", `${path}.failure.evidence_refs`, "failure or safety uncertainty requires evidence refs");
  }
  if (attempt.status === "stale_premise" && attempt.artifacts.length > 0) addIssue(issues, "error", "stale_premise.mutated", `${path}.artifacts`, "stale premise attempts must not return mutation artifacts");
  return attempt;
}

function parseDrift(value: unknown, path: string, issues: Issue[]): DriftView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const drift = {
    status: requireEnum(raw, "status", path, DRIFT_STATUSES, issues),
    kind: requireEnum(raw, "kind", path, DRIFT_KINDS, issues),
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
  };
  checkRefs(drift.evidenceRefs, `${path}.evidence_refs`, issues);
  if (drift.status === "aligned" && drift.kind !== "none") addIssue(issues, "error", "drift.aligned_kind", `${path}.kind`, "aligned drift state must use kind=none");
  if (drift.status !== "aligned") {
    if (drift.kind === "none") addIssue(issues, "error", "drift.kind_missing", `${path}.kind`, "suspected or confirmed drift requires a named kind");
    if (drift.evidenceRefs.length === 0) addIssue(issues, "error", "drift.evidence_missing", `${path}.evidence_refs`, "suspected or confirmed drift requires evidence refs");
  }
  return drift;
}

function parseVerification(value: unknown, path: string, issues: Issue[]): VerificationView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const artifacts = requireArray(raw, "artifacts", path, issues).map((item, index) => parseArtifact(item, `${path}.artifacts[${index}]`, issues));
  const verification = {
    targetAttemptId: requireString(raw, "target_attempt_id", path, issues, true),
    status: requireEnum(raw, "status", path, VERIFICATION_STATUSES, issues),
    artifacts,
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
  };
  checkRefs(verification.evidenceRefs, `${path}.evidence_refs`, issues);
  return verification;
}

function parseReview(value: unknown, path: string, issues: Issue[]): ReviewView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const targetArtifacts = requireArray(raw, "target_artifacts", path, issues).map((item, index) => parseArtifact(item, `${path}.target_artifacts[${index}]`, issues));
  const review = {
    reviewId: requireString(raw, "review_id", path, issues),
    reviewerId: requireString(raw, "reviewer_id", path, issues),
    targetAttemptId: requireString(raw, "target_attempt_id", path, issues),
    targetArtifacts,
    verdict: requireEnum(raw, "verdict", path, REVIEW_VERDICTS, issues),
    findingRefs: requireStringArray(raw, "finding_refs", path, issues),
    evidenceRefs: requireStringArray(raw, "evidence_refs", path, issues),
    sourceIdentity: parseSourceIdentity(raw.source_identity, `${path}.source_identity`, issues),
  };
  checkRefs(review.findingRefs, `${path}.finding_refs`, issues);
  checkRefs(review.evidenceRefs, `${path}.evidence_refs`, issues);
  if (review.verdict === "blocking" && review.findingRefs.length === 0) addIssue(issues, "error", "review.blocking_without_finding", `${path}.finding_refs`, "blocking review requires at least one finding ref");
  if (review.evidenceRefs.length === 0) addIssue(issues, "error", "review.evidence_missing", `${path}.evidence_refs`, "review requires evidence refs");
  return review;
}

function parseIntervention(value: unknown, path: string, issues: Issue[]): InterventionView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const intervention = {
    targetAttemptId: requireString(raw, "target_attempt_id", path, issues),
    driftKind: requireEnum(raw, "drift_kind", path, DRIFT_KINDS, issues),
    observationRefs: requireStringArray(raw, "observation_refs", path, issues),
    action: requireEnum(raw, "action", path, INTERVENTION_ACTIONS, issues),
    interventionRefs: requireStringArray(raw, "intervention_refs", path, issues),
    effectStatus: requireEnum(raw, "effect_status", path, INTERVENTION_EFFECTS, issues),
    effectRefs: requireStringArray(raw, "effect_refs", path, issues),
  };
  checkRefs(intervention.observationRefs, `${path}.observation_refs`, issues);
  checkRefs(intervention.interventionRefs, `${path}.intervention_refs`, issues);
  checkRefs(intervention.effectRefs, `${path}.effect_refs`, issues);
  if (intervention.driftKind === "none") addIssue(issues, "error", "intervention.kind_missing", `${path}.drift_kind`, "intervention requires a named drift kind");
  if (intervention.observationRefs.length === 0 || intervention.interventionRefs.length === 0) addIssue(issues, "error", "intervention.evidence_missing", path, "intervention requires observation and delivery evidence refs");
  if (intervention.effectStatus !== "pending" && intervention.effectRefs.length === 0) addIssue(issues, "error", "intervention.effect_evidence_missing", `${path}.effect_refs`, "resolved or unresolved intervention requires effect evidence refs");
  return intervention;
}

function parseTask(value: unknown, index: number, issues: Issue[]): TaskView {
  const path = `$.tasks[${index}]`;
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const attempts = requireArray(raw, "attempts", path, issues).map((item, attemptIndex) => parseAttempt(item, `${path}.attempts[${attemptIndex}]`, issues));
  const reviews = requireArray(raw, "reviews", path, issues).map((item, reviewIndex) => parseReview(item, `${path}.reviews[${reviewIndex}]`, issues));
  const interventions = requireArray(raw, "interventions", path, issues).map((item, interventionIndex) => parseIntervention(item, `${path}.interventions[${interventionIndex}]`, issues));
  const task: TaskView = {
    taskId: requireString(raw, "task_id", path, issues),
    objective: requireString(raw, "objective", path, issues),
    executionDomain: requireString(raw, "execution_domain", path, issues),
    required: requireBoolean(raw, "required", path, issues),
    status: requireEnum(raw, "status", path, TASK_STATUSES, issues),
    dependsOn: requireStringArray(raw, "depends_on", path, issues),
    mutationBoundary: requireStringArray(raw, "mutation_boundary", path, issues),
    sourceScope: requireStringArray(raw, "source_scope", path, issues),
    methodBoundaryRefs: requireStringArray(raw, "method_boundary_refs", path, issues),
    requiredArtifacts: requireStringArray(raw, "required_artifacts", path, issues),
    requiresReview: requireBoolean(raw, "requires_review", path, issues),
    currentAttemptId: requireString(raw, "current_attempt_id", path, issues, true),
    attempts,
    drift: parseDrift(raw.drift, `${path}.drift`, issues),
    verification: parseVerification(raw.verification, `${path}.verification`, issues),
    reviews,
    interventions,
    acceptanceEvidence: requireStringArray(raw, "acceptance_evidence", path, issues),
    nextObservationCondition: requireString(raw, "next_observation_condition", path, issues, true),
  };
  checkRefs(task.dependsOn, `${path}.depends_on`, issues);
  checkRefs(task.mutationBoundary, `${path}.mutation_boundary`, issues);
  checkRefs(task.sourceScope, `${path}.source_scope`, issues);
  checkRefs(task.methodBoundaryRefs, `${path}.method_boundary_refs`, issues);
  checkRefs(task.requiredArtifacts, `${path}.required_artifacts`, issues);
  checkRefs(task.acceptanceEvidence, `${path}.acceptance_evidence`, issues);
  if (task.drift.kind === "method" && task.methodBoundaryRefs.length === 0) addIssue(issues, "error", "drift.method_boundary_missing", `${path}.method_boundary_refs`, "method drift requires an owner constraint or evidence that the current method cannot satisfy the outcome");
  return task;
}

function parseAcceptedArtifact(value: unknown, path: string, issues: Issue[]): AcceptedArtifactView {
  if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
  const raw = asRecord(value);
  const accepted = {
    ref: requireString(raw, "ref", path, issues),
    identity: requireString(raw, "identity", path, issues),
    attemptId: requireString(raw, "attempt_id", path, issues),
  };
  checkRefs(accepted.ref === "" ? [] : [accepted.ref], `${path}.ref`, issues);
  if (accepted.ref !== "" && accepted.identity === accepted.ref) addIssue(issues, "error", "artifact.identity_path_only", `${path}.identity`, "artifact identity must be content- or owner-version-bound, not the artifact ref itself");
  return accepted;
}

function parseReceipt(rawValue: unknown, final: boolean): { receipt: ReceiptView; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!isRecord(rawValue)) addIssue(issues, "error", "type.record", "$", "receipt root must be an object");
  const raw = asRecord(rawValue);
  const schema = requireString(raw, "schema", "$", issues);
  if (schema !== "" && schema !== "bagakit/supervision-receipt/v1") addIssue(issues, "error", "schema.unsupported", "$.schema", "expected bagakit/supervision-receipt/v1");
  const runId = requireString(raw, "run_id", "$", issues);
  const objective = requireString(raw, "objective", "$", issues);

  const routeRaw = requireRecord(raw, "route", "$", issues);
  const route = {
    topology: requireEnum(routeRaw, "topology", "$.route", ROUTE_TOPOLOGIES, issues),
    assurance: requireEnum(routeRaw, "assurance", "$.route", ROUTE_ASSURANCE, issues),
    lifecycle: requireEnum(routeRaw, "lifecycle", "$.route", ROUTE_LIFECYCLES, issues),
  };
  const runStatus = requireEnum(raw, "run_status", "$", RUN_STATUSES, issues);

  const ownerRaw = requireRecord(raw, "owner_snapshot", "$", issues);
  const ownerSnapshot = {
    ref: requireString(ownerRaw, "ref", "$.owner_snapshot", issues),
    revision: requireString(ownerRaw, "revision", "$.owner_snapshot", issues),
    evidenceRefs: requireStringArray(ownerRaw, "evidence_refs", "$.owner_snapshot", issues),
  };
  checkRefs(ownerSnapshot.ref === "" ? [] : [ownerSnapshot.ref], "$.owner_snapshot.ref", issues);
  checkRefs(ownerSnapshot.evidenceRefs, "$.owner_snapshot.evidence_refs", issues);
  if (ownerSnapshot.evidenceRefs.length === 0) addIssue(issues, "error", "owner.evidence_missing", "$.owner_snapshot.evidence_refs", "owner snapshot requires freshness evidence");

  const authorityRaw = requireRecord(raw, "authority", "$", issues);
  const integrationWriter = requireString(authorityRaw, "integration_writer", "$.authority", issues, true);
  const reviewers = requireStringArray(authorityRaw, "reviewers", "$.authority", issues);
  const allowParallelWriters = requireBoolean(authorityRaw, "allow_parallel_writers", "$.authority", issues);

  const budgetsRaw = requireRecord(raw, "budgets", "$", issues);
  const budgets: Record<string, number> = {};
  for (const field of BUDGET_FIELDS) {
    const number = asNumber(budgetsRaw[field]);
    budgets[field] = number;
    if (!Number.isInteger(number) || number < 0) addIssue(issues, "error", "budget.nonnegative_integer", `$.budgets.${field}`, "must be a non-negative integer");
  }
  for (const prefix of ["spawn", "observation", "intervention", "restart", "human_gate"]) {
    const max = budgets[`${prefix}_max`];
    const used = budgets[`${prefix}_used`];
    if (Number.isFinite(max) && Number.isFinite(used) && used > max) addIssue(issues, "error", "budget.exceeded", `$.budgets.${prefix}_used`, `exceeds ${prefix}_max`);
  }

  const circuits = requireArray(raw, "circuits", "$", issues).map((value, index) => {
    const path = `$.circuits[${index}]`;
    if (!isRecord(value)) addIssue(issues, "error", "type.record", path, "must be an object");
    const item = asRecord(value);
    const circuit = {
      domain: requireString(item, "domain", path, issues),
      status: requireEnum(item, "status", path, CIRCUIT_STATUSES, issues),
      reason: requireString(item, "reason", path, issues),
      evidenceRefs: requireStringArray(item, "evidence_refs", path, issues),
    };
    checkRefs(circuit.evidenceRefs, `${path}.evidence_refs`, issues);
    if (circuit.evidenceRefs.length === 0) addIssue(issues, "error", "circuit.evidence_missing", `${path}.evidence_refs`, "circuit state requires evidence refs");
    return circuit;
  });

  const tasksRaw = requireArray(raw, "tasks", "$", issues);
  if (tasksRaw.length === 0) addIssue(issues, "error", "tasks.empty", "$.tasks", "must be a non-empty array");
  const tasks = tasksRaw.map((value, index) => parseTask(value, index, issues));

  const checkpointRaw = requireRecord(raw, "checkpoint", "$", issues);
  const acceptedArtifacts = requireArray(checkpointRaw, "accepted_artifacts", "$.checkpoint", issues).map((value, index) => parseAcceptedArtifact(value, `$.checkpoint.accepted_artifacts[${index}]`, issues));
  const checkpoint = {
    acceptedArtifacts,
    unresolvedFindings: requireStringArray(checkpointRaw, "unresolved_findings", "$.checkpoint", issues),
    staleAttemptIds: requireStringArray(checkpointRaw, "stale_attempt_ids", "$.checkpoint", issues),
    nextSafeAction: requireString(checkpointRaw, "next_safe_action", "$.checkpoint", issues),
    terminal: requireBoolean(checkpointRaw, "terminal", "$.checkpoint", issues),
  };
  checkRefs(checkpoint.unresolvedFindings, "$.checkpoint.unresolved_findings", issues);

  const receipt: ReceiptView = {
    raw,
    runId,
    objective,
    route,
    runStatus,
    ownerSnapshot,
    integrationWriter,
    reviewers,
    allowParallelWriters,
    budgets,
    circuits,
    tasks,
    checkpoint,
  };
  validateRelations(receipt, final, issues);
  return { receipt, issues };
}

function artifactKey(artifact: { ref: string; identity: string }): string {
  return `${artifact.ref}\u0000${artifact.identity}`;
}

function artifactSet(artifacts: Array<{ ref: string; identity: string }>): Set<string> {
  return new Set(artifacts.map(artifactKey));
}

function artifactsCover(expected: Array<{ ref: string; identity: string }>, actual: Array<{ ref: string; identity: string }>): boolean {
  const actualSet = artifactSet(actual);
  return expected.every((artifact) => actualSet.has(artifactKey(artifact)));
}

function artifactSetsEqual(left: Array<{ ref: string; identity: string }>, right: Array<{ ref: string; identity: string }>): boolean {
  return artifactsCover(left, right) && artifactsCover(right, left);
}

function currentAttempt(task: TaskView): AttemptView | undefined {
  return task.attempts.find((attempt) => attempt.attemptId === task.currentAttemptId);
}

function latestReviewForCurrent(task: TaskView): ReviewView | undefined {
  for (let index = task.reviews.length - 1; index >= 0; index -= 1) {
    if (task.reviews[index].targetAttemptId === task.currentAttemptId) return task.reviews[index];
  }
  return undefined;
}

function latestIntervention(task: TaskView): InterventionView | undefined {
  return task.interventions.at(-1);
}

function currentLiveWriter(task: TaskView): AttemptView | undefined {
  const attempt = currentAttempt(task);
  return attempt?.role === "writer" && new Set(["running", "succeeded"]).has(attempt.status) && attempt.failure.authorityState === "current" ? attempt : undefined;
}

function unstableReadOnly(task: TaskView): "missing" | "changed" | "stable" | "not_applicable" {
  const attempt = currentAttempt(task);
  if (!attempt || attempt.role !== "auditor") return "not_applicable";
  const source = attempt.sourceIdentity;
  if (task.sourceScope.length === 0 || source.before === "" || source.evidenceRefs.length === 0 || (attempt.status === "succeeded" && source.after === "")) return "missing";
  if (source.after !== "" && source.before !== source.after) return "changed";
  return "stable";
}

function unfencedPriorWriter(task: TaskView, staleIds: string[]): AttemptView | undefined {
  return task.attempts.find((attempt) => attempt.role === "writer" && attempt.attemptId !== task.currentAttemptId && new Set(["running", "succeeded"]).has(attempt.status) && (!staleIds.includes(attempt.attemptId) || !new Set(["fenced", "released"]).has(attempt.failure.authorityState) || attempt.authorityEvidenceRefs.length === 0));
}

function reviewIsFresh(task: TaskView, review: ReviewView): boolean {
  const attempt = task.attempts.find((candidate) => candidate.attemptId === review.targetAttemptId);
  return Boolean(attempt && artifactSetsEqual(review.targetArtifacts, attempt.artifacts));
}

function blockingReviewProblem(task: TaskView): "unrepaired" | "identity_unchanged" | undefined {
  const latest = latestReviewForCurrent(task);
  const latestIndex = latest ? task.reviews.lastIndexOf(latest) : -1;
  for (let index = 0; index < task.reviews.length; index += 1) {
    const blocking = task.reviews[index];
    if (blocking.verdict !== "blocking") continue;
    if (!latest || latestIndex <= index || !new Set(["pass", "advisory"]).has(latest.verdict)) return "unrepaired";
    if (artifactSetsEqual(blocking.targetArtifacts, latest.targetArtifacts)) return "identity_unchanged";
    if (!reviewIsFresh(task, latest) || latest.sourceIdentity.before === "" || latest.sourceIdentity.after === "" || latest.sourceIdentity.before !== latest.sourceIdentity.after || latest.sourceIdentity.evidenceRefs.length === 0) return "unrepaired";
  }
  return undefined;
}

function retainedSafetyProblems(task: TaskView): string[] {
  const problems: string[] = [];
  if (task.attempts.some((attempt) => attempt.failure.effectState === "unknown")) problems.push("external_effect");
  if (task.attempts.some((attempt) => attempt.failure.effectState === "known_applied")) problems.push("effect_reconciliation");
  if (task.attempts.some((attempt) => attempt.failure.authorityState === "ambiguous")) problems.push("authority");
  if (task.attempts.some((attempt) => attempt.failure.scope === "unknown" || (attempt.status === "failed" && attempt.failure.scope === "none"))) problems.push("failure_scope");
  return problems;
}

function taskCloseProblems(task: TaskView, receipt: ReceiptView): string[] {
  const problems: string[] = [];
  const current = currentAttempt(task);
  if (task.drift.status !== "aligned") problems.push("drift");
  if (!current || current.status !== "succeeded") problems.push("current_attempt");
  problems.push(...retainedSafetyProblems(task));
  if (current) {
    const byRef = new Map(current.artifacts.map((artifact) => [artifact.ref, artifact]));
    if (task.requiredArtifacts.some((ref) => !byRef.has(ref))) problems.push("artifacts");
    if (task.verification.status !== "pass" || task.verification.targetAttemptId !== task.currentAttemptId || task.verification.evidenceRefs.length === 0 || !artifactSetsEqual(current.artifacts, task.verification.artifacts)) problems.push("verification");
  }
  if (blockingReviewProblem(task)) problems.push("blocking_review");
  if (task.requiresReview) {
    const review = latestReviewForCurrent(task);
    if (!review || !new Set(["pass", "advisory"]).has(review.verdict) || !reviewIsFresh(task, review) || review.sourceIdentity.before === "" || review.sourceIdentity.after === "" || review.sourceIdentity.before !== review.sourceIdentity.after || review.sourceIdentity.evidenceRefs.length === 0) problems.push("review");
  }
  if (task.acceptanceEvidence.length === 0) problems.push("acceptance");
  if (task.interventions.some((intervention) => intervention.effectStatus !== "resolved")) problems.push("intervention_effect");
  if (unfencedPriorWriter(task, receipt.checkpoint.staleAttemptIds)) problems.push("fence");
  if (unstableReadOnly(task) !== "not_applicable" && unstableReadOnly(task) !== "stable") problems.push("read_only_source");
  return [...new Set(problems)];
}

function validateRelations(receipt: ReceiptView, final: boolean, issues: Issue[]): void {
  const taskIds = new Set<string>();
  const attemptIds = new Set<string>();
  const reviewIds = new Set<string>();
  const attemptById = new Map<string, AttemptView>();
  const taskById = new Map<string, TaskView>();
  const runningWriters: Array<{ task: TaskView; attempt: AttemptView }> = [];
  const currentEligibleWriters: Array<{ task: TaskView; attempt: AttemptView }> = [];
  let restartCount = 0;
  let interventionCount = 0;

  const circuitDomains = new Set<string>();
  receipt.circuits.forEach((circuit, index) => {
    if (circuitDomains.has(circuit.domain)) addIssue(issues, "error", "circuit.duplicate_domain", `$.circuits[${index}].domain`, "one receipt may declare at most one circuit per domain");
    circuitDomains.add(circuit.domain);
  });

  receipt.tasks.forEach((task, taskIndex) => {
    const taskPath = `$.tasks[${taskIndex}]`;
    if (taskIds.has(task.taskId)) addIssue(issues, "error", "task.duplicate", `${taskPath}.task_id`, "task id must be unique");
    taskIds.add(task.taskId);
    taskById.set(task.taskId, task);
    restartCount += Math.max(0, task.attempts.length - 1);
    interventionCount += task.interventions.length;

    const roles = new Set(task.attempts.map((attempt) => attempt.role));
    if (roles.size > 1) addIssue(issues, "error", "attempt.mixed_roles", `${taskPath}.attempts`, "one task attempt lineage must keep one role; model review as task.reviews, not as a writer attempt");

    task.attempts.forEach((attempt, attemptIndex) => {
      const attemptPath = `${taskPath}.attempts[${attemptIndex}]`;
      if (attemptIds.has(attempt.attemptId)) addIssue(issues, "error", "attempt.duplicate", `${attemptPath}.attempt_id`, "attempt id must be unique across the run");
      attemptIds.add(attempt.attemptId);
      attemptById.set(attempt.attemptId, attempt);
      if (attempt.role === "writer") {
        if (task.mutationBoundary.length === 0) addIssue(issues, "error", "authority.mutation_boundary_missing", `${taskPath}.mutation_boundary`, "writer tasks require a mutation boundary");
        if (attempt.writeRoot === "") addIssue(issues, "error", "authority.write_root_missing", `${attemptPath}.write_root`, "writer attempts require a write root");
        else if (!task.mutationBoundary.some((boundary) => pathContains(boundary, attempt.writeRoot))) addIssue(issues, "error", "authority.write_root_outside_boundary", `${attemptPath}.write_root`, "writer root must stay inside the task mutation boundary");
        if (attempt.status === "running" && !new Set(["fenced", "released"]).has(attempt.failure.authorityState)) runningWriters.push({ task, attempt });
      }
      if (attempt.role === "auditor") {
        if (task.sourceScope.length === 0) addIssue(issues, "warning", "read_only.source_scope_missing", `${taskPath}.source_scope`, "auditor task needs an explicit source scope");
        if (attempt.sourceIdentity.before === "" || attempt.sourceIdentity.evidenceRefs.length === 0 || (attempt.status === "succeeded" && attempt.sourceIdentity.after === "")) addIssue(issues, "warning", "read_only.source_identity_incomplete", `${attemptPath}.source_identity`, "read-only attempt needs a before identity and, when succeeded, an after identity with evidence");
        if (attempt.sourceIdentity.after !== "" && attempt.sourceIdentity.before !== attempt.sourceIdentity.after) addIssue(issues, task.status === "complete" || final ? "error" : "warning", "read_only.source_identity_changed", `${attemptPath}.source_identity`, "reviewed source identity changed during the read-only attempt");
      }
      if (receipt.reviewers.includes(attempt.workerId) && attempt.role === "writer") addIssue(issues, "error", "authority.reviewer_is_writer", `${attemptPath}.worker_id`, "a declared reviewer cannot act as writer in the same receipt");
    });

    const current = currentAttempt(task);
    if (task.currentAttemptId !== "" && !current) addIssue(issues, "error", "attempt.current_missing", `${taskPath}.current_attempt_id`, "must name an attempt in the same logical task");
    if (task.currentAttemptId !== "" && receipt.checkpoint.staleAttemptIds.includes(task.currentAttemptId)) addIssue(issues, "error", "attempt.current_fenced", `${taskPath}.current_attempt_id`, "current attempt cannot also be fenced as stale");
    if (current && new Set(["running", "succeeded"]).has(current.status) && current.failure.authorityState !== "current") addIssue(issues, "error", "authority.current_attempt_not_current", `${taskPath}.current_attempt_id`, "current active or succeeded attempt requires authority_state=current");
    if (current?.role === "writer" && new Set(["running", "succeeded"]).has(current.status) && current.failure.authorityState === "current") currentEligibleWriters.push({ task, attempt: current });
    if (task.status === "cancelled" && currentLiveWriter(task)) addIssue(issues, "error", "authority.cancelled_writer_active", `${taskPath}.current_attempt_id`, "a cancelled task cannot retain a current running or succeeded writer");

    const prior = unfencedPriorWriter(task, receipt.checkpoint.staleAttemptIds);
    if (prior) addIssue(issues, final || task.status === "complete" ? "error" : "warning", "attempt.replacement_unfenced", taskPath, `non-current writer lacks a completed fence or release: ${prior.attemptId}`);

    const latestCurrentReview = latestReviewForCurrent(task);
    task.reviews.forEach((review, reviewIndex) => {
      const reviewPath = `${taskPath}.reviews[${reviewIndex}]`;
      if (reviewIds.has(review.reviewId)) addIssue(issues, "error", "review.duplicate", `${reviewPath}.review_id`, "review id must be unique across the run");
      reviewIds.add(review.reviewId);
      if (!receipt.reviewers.includes(review.reviewerId)) addIssue(issues, "error", "authority.reviewer_undeclared", `${reviewPath}.reviewer_id`, "reviewer must appear in authority.reviewers");
      const target = task.attempts.find((attempt) => attempt.attemptId === review.targetAttemptId);
      if (!target || target.role !== "writer") addIssue(issues, "error", "review.target_missing", `${reviewPath}.target_attempt_id`, "review must target a writer attempt in the same task");
      if (target && review === latestCurrentReview && !reviewIsFresh(task, review)) addIssue(issues, task.status === "complete" || final ? "error" : "warning", "review.artifact_identity_mismatch", `${reviewPath}.target_artifacts`, "the latest review for the current attempt must exactly match its current artifact identities");
      if (review.sourceIdentity.before === "" || review.sourceIdentity.after === "" || review.sourceIdentity.evidenceRefs.length === 0) addIssue(issues, "error", "review.read_only_evidence_missing", `${reviewPath}.source_identity`, "review requires before/after source identity and authority evidence");
      else if (review.sourceIdentity.before !== review.sourceIdentity.after) addIssue(issues, task.status === "complete" || final ? "error" : "warning", "review.source_identity_changed", `${reviewPath}.source_identity`, "review target changed while the reviewer was active; the verdict is stale");
    });
    const blockingProblem = blockingReviewProblem(task);
    if (blockingProblem) addIssue(issues, task.status === "complete" || final ? "error" : "warning", blockingProblem === "identity_unchanged" ? "review.repair_identity_unchanged" : "review.blocking_unrepaired", `${taskPath}.reviews`, blockingProblem === "identity_unchanged" ? "a later pass or advisory review must target a different repaired artifact identity" : "a blocking review requires a later pass or advisory review on the current repaired artifact identity");

    task.interventions.forEach((intervention, interventionIndex) => {
      const interventionPath = `${taskPath}.interventions[${interventionIndex}]`;
      if (!task.attempts.some((attempt) => attempt.attemptId === intervention.targetAttemptId)) addIssue(issues, "error", "intervention.target_missing", `${interventionPath}.target_attempt_id`, "must name an attempt in the same task");
      if (interventionIndex > 0 && task.interventions[interventionIndex - 1].effectStatus !== "resolved") addIssue(issues, "error", "intervention.effect_order", interventionPath, "do not append another intervention before the prior effect is resolved");
    });
    const latest = latestIntervention(task);
    if (latest && latest.effectStatus !== "resolved" && (task.drift.status === "aligned" || task.drift.kind !== latest.driftKind)) addIssue(issues, "error", "intervention.current_state_mismatch", `${taskPath}.drift`, "open intervention effect must remain joined to the same unresolved drift");
    if (latest?.effectStatus === "pending" && task.nextObservationCondition === "") addIssue(issues, "warning", "intervention.next_condition_missing", `${taskPath}.next_observation_condition`, "a pending intervention effect needs a material next-observation condition");

    if (task.verification.targetAttemptId !== "" && !task.attempts.some((attempt) => attempt.attemptId === task.verification.targetAttemptId)) addIssue(issues, "error", "verification.target_missing", `${taskPath}.verification.target_attempt_id`, "verification must target an attempt in the same task");
    if (task.verification.status === "pass" && task.verification.evidenceRefs.length === 0) addIssue(issues, "error", "verification.evidence_missing", `${taskPath}.verification.evidence_refs`, "passing verification requires evidence refs");
    if (task.verification.status === "pass") {
      const target = task.attempts.find((attempt) => attempt.attemptId === task.verification.targetAttemptId);
      if (task.verification.targetAttemptId !== task.currentAttemptId) addIssue(issues, "error", "verification.target_not_current", `${taskPath}.verification.target_attempt_id`, "passing verification must target the current attempt");
      if (!target || !artifactsCover(task.verification.artifacts, target.artifacts) || !artifactsCover(target.artifacts, task.verification.artifacts)) addIssue(issues, "error", "verification.artifact_identity_mismatch", `${taskPath}.verification.artifacts`, "verification identities must exactly match the target attempt artifacts");
    }

    if (task.status === "running" && current?.status === "running" && task.nextObservationCondition === "") addIssue(issues, "warning", "observation.next_condition_missing", `${taskPath}.next_observation_condition`, "running work needs a material next-observation condition");

    if (task.status === "complete") {
      const problems = taskCloseProblems(task, receipt);
      for (const problem of problems) addIssue(issues, "error", `close.${problem}_missing`, taskPath, `complete task lacks current ${problem} evidence`);
    }
    if ((final || receipt.runStatus === "complete") && task.status !== "complete") {
      for (const problem of retainedSafetyProblems(task)) addIssue(issues, "error", final ? `final.${problem}_unresolved` : `run.${problem}_unresolved`, taskPath, `terminal owner projection retains unresolved ${problem} safety state`);
    }

    if (current?.status === "failed" && current.failure.cause === "provider_fault" && current.failure.scope === "shared_domain") {
      if (current.failure.domain !== task.executionDomain) addIssue(issues, "error", "failure.domain_mismatch", taskPath, "shared provider failure domain must match the task execution domain");
      const open = receipt.circuits.some((circuit) => circuit.domain === current.failure.domain && circuit.status === "open");
      if (!open) addIssue(issues, "warning", "circuit.not_open", taskPath, "shared provider failure requires opening a matching circuit before new affected work");
    }
  });

  for (const task of receipt.tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskById.has(dependency)) addIssue(issues, "error", "dependency.missing", `$.tasks.${task.taskId}.depends_on`, `unknown dependency: ${dependency}`);
      if (dependency === task.taskId) addIssue(issues, "error", "dependency.self", `$.tasks.${task.taskId}.depends_on`, "task cannot depend on itself");
    }
  }
  detectCycles(receipt.tasks, issues);

  for (const staleId of receipt.checkpoint.staleAttemptIds) {
    if (!attemptById.has(staleId)) addIssue(issues, "error", "attempt.stale_unknown", "$.checkpoint.stale_attempt_ids", `unknown stale attempt: ${staleId}`);
  }

  for (const accepted of receipt.checkpoint.acceptedArtifacts) {
    const task = receipt.tasks.find((candidate) => candidate.currentAttemptId === accepted.attemptId);
    const attempt = task ? currentAttempt(task) : undefined;
    const match = attempt?.artifacts.some((artifact) => artifact.ref === accepted.ref && artifact.identity === accepted.identity);
    if (!attempt || attempt.status !== "succeeded" || !match || receipt.checkpoint.staleAttemptIds.includes(accepted.attemptId)) addIssue(issues, "error", "artifact.accepted_not_current", "$.checkpoint.accepted_artifacts", `accepted artifact is not attributable to a current succeeded attempt: ${accepted.ref}`);
  }

  if (receipt.budgets.restart_used < restartCount) addIssue(issues, "error", "budget.restart_underreported", "$.budgets.restart_used", `must cover at least ${restartCount} replacement attempts`);
  if (receipt.budgets.intervention_used !== interventionCount) addIssue(issues, "error", "budget.intervention_mismatch", "$.budgets.intervention_used", `must equal recorded intervention count: ${interventionCount}`);

  if (receipt.route.topology === "single_agent") {
    if (receipt.budgets.spawn_used !== 0) addIssue(issues, "error", "route.single_spawn", "$.budgets.spawn_used", "single-agent topology cannot use delegated spawns");
    if (receipt.tasks.some((task) => task.attempts.some((attempt) => attempt.role !== "writer")) || receipt.tasks.some((task) => task.reviews.length > 0)) addIssue(issues, "error", "route.single_worker", "$.tasks", "single-agent topology can contain only direct writer attempts and no independent review cycles");
  }
  if (receipt.route.assurance === "audit") {
    const auditors = receipt.tasks.filter((task) => task.attempts.some((attempt) => attempt.role === "auditor"));
    if (auditors.length === 0) addIssue(issues, "error", "route.audit_missing", "$.tasks", "audit assurance requires at least one auditor task");
  }
  if (receipt.route.assurance === "blocking_review" && !receipt.tasks.some((task) => task.requiresReview)) addIssue(issues, "error", "route.blocking_review_missing", "$.tasks", "blocking-review assurance requires at least one review-required task");

  if (runningWriters.length > 1 && !receipt.allowParallelWriters) addIssue(issues, "error", "authority.parallel_writers", "$.tasks", "multiple running writers require explicit parallel-writer authority");
  if (runningWriters.length > 1 && receipt.allowParallelWriters) {
    if (receipt.integrationWriter === "" || !runningWriters.some(({ attempt }) => attempt.workerId === receipt.integrationWriter)) addIssue(issues, "error", "authority.integration_writer_not_current", "$.authority.integration_writer", "authorized parallel writers require one current running integration writer");
  }
  if (receipt.integrationWriter !== "" && receipt.reviewers.includes(receipt.integrationWriter)) addIssue(issues, "error", "authority.writer_reviewer_overlap", "$.authority", "integration writer cannot also be a declared reviewer");
  if (runningWriters.length === 0 && currentEligibleWriters.length > 0 && (receipt.integrationWriter === "" || !currentEligibleWriters.some(({ attempt }) => attempt.workerId === receipt.integrationWriter))) addIssue(issues, "error", "authority.integration_writer_not_current", "$.authority.integration_writer", "must name a current succeeded writer identity when no writer is running");
  if (runningWriters.length === 1 && runningWriters[0].attempt.workerId !== receipt.integrationWriter) addIssue(issues, "error", "authority.writer_mismatch", "$.authority.integration_writer", "must match the current running writer");
  if (receipt.tasks.some((task) => task.requiresReview) && receipt.reviewers.length === 0) addIssue(issues, "error", "authority.reviewer_missing", "$.authority.reviewers", "a review-required task needs at least one declared reviewer");

  if (receipt.runStatus === "complete") {
    if (receipt.tasks.some((task) => task.required && task.status !== "complete")) addIssue(issues, "error", "run.false_completion", "$.run_status", "complete run still has an incomplete required task");
    if (receipt.tasks.some((task) => !task.required && !new Set(["complete", "cancelled"]).has(task.status))) addIssue(issues, "error", "run.false_completion", "$.run_status", "complete run still has a non-terminal optional task");
    if (receipt.circuits.some((circuit) => circuit.status === "open")) addIssue(issues, "error", "run.circuit_open", "$.circuits", "complete run cannot retain an open circuit");
    if (receipt.checkpoint.unresolvedFindings.length > 0) addIssue(issues, "error", "run.findings_open", "$.checkpoint.unresolved_findings", "complete run cannot retain unresolved blocking findings");
    if (!receipt.checkpoint.terminal) addIssue(issues, "error", "run.checkpoint_not_terminal", "$.checkpoint.terminal", "complete run requires a terminal checkpoint");
  }

  if (final) {
    if (receipt.runStatus !== "complete") addIssue(issues, "error", "final.run_not_complete", "$.run_status", "final validation requires run_status=complete");
    for (const task of receipt.tasks) {
      if (task.required && task.status !== "complete") addIssue(issues, "error", "final.required_task_open", `$.tasks.${task.taskId}.status`, "required task must be complete");
      if (!task.required && !new Set(["complete", "cancelled"]).has(task.status)) addIssue(issues, "error", "final.optional_task_open", `$.tasks.${task.taskId}.status`, "optional task must be complete or cancelled");
    }
    if (receipt.circuits.some((circuit) => circuit.status === "open")) addIssue(issues, "error", "final.circuit_open", "$.circuits", "final validation requires all circuits closed");
    if (receipt.checkpoint.unresolvedFindings.length > 0) addIssue(issues, "error", "final.findings_open", "$.checkpoint.unresolved_findings", "final validation requires no unresolved findings");
    if (!receipt.checkpoint.terminal) addIssue(issues, "error", "final.checkpoint_not_terminal", "$.checkpoint.terminal", "final validation requires a terminal checkpoint");
  }
}

function normalizeLogicalPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

function pathContains(boundary: string, child: string): boolean {
  const outer = normalizeLogicalPath(boundary);
  const inner = normalizeLogicalPath(child);
  if (outer === "") return true;
  return inner === outer || inner.startsWith(`${outer}/`);
}

function detectCycles(tasks: TaskView[], issues: Issue[]): void {
  const edges = new Map(tasks.map((task) => [task.taskId, task.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) if (edges.has(dependency) && visit(dependency)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of edges.keys()) {
    if (visit(id)) {
      addIssue(issues, "error", "dependency.cycle", "$.tasks", `dependency cycle includes task: ${id}`);
      return;
    }
  }
}

function retryCapacity(receipt: ReceiptView): boolean {
  return receipt.budgets.restart_used < receipt.budgets.restart_max && (receipt.route.topology === "single_agent" || receipt.budgets.spawn_used < receipt.budgets.spawn_max);
}

function actionForFailure(attempt: AttemptView, receipt: ReceiptView): string {
  if (attempt.failure.effectState === "unknown") return "inspect_side_effect";
  if (attempt.failure.authorityState === "ambiguous") return "freeze_and_rebind";
  if (attempt.failure.scope === "unknown" || attempt.failure.scope === "none") return "inspect_failure_scope";
  if (attempt.failure.cause === "provider_fault" && attempt.failure.scope === "shared_domain") return "circuit_break_and_wait";
  if (attempt.failure.effectState === "known_applied") return "reconcile_owner_state";
  if (attempt.failure.cause === "transient_transport") return retryCapacity(receipt) ? "retry_attempt" : "checkpoint_and_stop";
  if (attempt.failure.cause === "logic_defect") return retryCapacity(receipt) && receipt.budgets.intervention_used < receipt.budgets.intervention_max ? "repair_with_method_change" : "checkpoint_and_stop";
  if (attempt.failure.cause === "dependency") return retryCapacity(receipt) ? "restart_dependency_cone" : "checkpoint_and_stop";
  if (attempt.failure.cause === "human_decision") return receipt.budgets.human_gate_used < receipt.budgets.human_gate_max ? "handback_human" : "checkpoint_and_stop";
  return "checkpoint_and_stop";
}

function actionForDrift(drift: DriftView, receipt: ReceiptView): string {
  if (drift.status === "suspected") return "inspect_drift";
  if (drift.kind === "authority") return "freeze_and_rebind";
  if (drift.kind === "completion") return "block_false_completion";
  if (receipt.budgets.intervention_used >= receipt.budgets.intervention_max) return "checkpoint_and_stop";
  if (drift.kind === "premise") return "reconcile_owner_state";
  if (drift.kind === "scope") return "steer_to_boundary";
  if (drift.kind === "method") return "steer_method_change";
  if (drift.kind === "evidence") return "require_evidence";
  if (drift.kind === "cost") return "reduce_or_stop_supervision";
  return "inspect_drift";
}

function actionRank(action: string): number {
  return ACTION_PRIORITY.get(action) ?? 1000;
}

function decisionRank(item: JsonRecord, safetyTaskIds: Set<string>): number {
  if (item.action === "reconcile_owner_state" && safetyTaskIds.has(String(item.task_id))) return 4.5;
  return actionRank(String(item.action));
}

function sharedFailureDomains(receipt: ReceiptView): Set<string> {
  const domains = new Set<string>();
  for (const task of receipt.tasks) {
    const attempt = currentAttempt(task);
    if (attempt?.status !== "failed" || attempt.failure.cause !== "provider_fault" || attempt.failure.scope !== "shared_domain") continue;
    domains.add(task.executionDomain);
    if (attempt.failure.domain !== "") domains.add(attempt.failure.domain);
  }
  return domains;
}

function safetyActionForTask(task: TaskView, receipt: ReceiptView, newSharedDomains: Set<string>, openDomains: Set<string>, unknownScopeDomains: Set<string>): JsonRecord | undefined {
  const effectUnknown = task.attempts.find((attempt) => attempt.failure.effectState === "unknown");
  if (effectUnknown) return { task_id: task.taskId, action: "inspect_side_effect", reason: `attempt ${effectUnknown.attemptId} has an unknown external effect; read back authoritative state before any retry, close, or owner wait` };
  const authorityAmbiguous = task.attempts.find((attempt) => attempt.failure.authorityState === "ambiguous");
  if (authorityAmbiguous) return { task_id: task.taskId, action: "freeze_and_rebind", reason: `attempt ${authorityAmbiguous.attemptId} has ambiguous writer authority` };
  const cancelledWriter = task.status === "cancelled" ? currentLiveWriter(task) : undefined;
  if (cancelledWriter) return { task_id: task.taskId, action: "freeze_and_rebind", reason: `cancelled task still grants current writer authority to ${cancelledWriter.attemptId}` };
  const prior = unfencedPriorWriter(task, receipt.checkpoint.staleAttemptIds);
  if (prior) return { task_id: task.taskId, action: "freeze_and_rebind", reason: `prior writer is not fenced before replacement: ${prior.attemptId}` };
  const scopeUnknown = task.attempts.find((attempt) => attempt.failure.scope === "unknown" || (attempt.status === "failed" && attempt.failure.scope === "none"));
  if (scopeUnknown) return { task_id: task.taskId, action: "inspect_failure_scope", reason: `attempt ${scopeUnknown.attemptId} lacks a safe failure scope; do not guess a restart cone` };
  if (task.status !== "complete" && task.status !== "cancelled" && task.dependsOn.length === 0 && unknownScopeDomains.has(task.executionDomain)) return { task_id: task.taskId, action: "inspect_failure_scope", reason: `a same-domain attempt has unresolved failure scope; affected sibling starts remain inadmissible` };
  if (task.status !== "complete" && task.status !== "cancelled") {
    if (openDomains.has(task.executionDomain)) return { task_id: task.taskId, action: "hold_open_circuit", reason: `execution-domain circuit is open: ${task.executionDomain}` };
    if (newSharedDomains.has(task.executionDomain)) {
      const attempt = currentAttempt(task);
      const ownsFault = attempt?.status === "failed" && attempt.failure.cause === "provider_fault" && attempt.failure.scope === "shared_domain";
      return { task_id: task.taskId, action: ownsFault ? "circuit_break_and_wait" : "hold_open_circuit", reason: ownsFault ? `a new shared provider failure requires a scoped circuit: ${task.executionDomain}` : `a sibling shared-domain failure forbids affected starts or retries until the circuit is recorded: ${task.executionDomain}` };
    }
  }
  const effectApplied = task.attempts.find((attempt) => attempt.failure.effectState === "known_applied");
  if (effectApplied) return { task_id: task.taskId, action: "reconcile_owner_state", reason: `attempt ${effectApplied.attemptId} has an already-applied external effect; receipt v1 cannot authorize replay or close without owner reconciliation` };
  return undefined;
}

function taskTerminalReady(task: TaskView, receipt: ReceiptView): boolean {
  if (task.status === "complete") return taskCloseProblems(task, receipt).length === 0;
  if (task.required || task.status !== "cancelled") return false;
  return !currentLiveWriter(task) && !unfencedPriorWriter(task, receipt.checkpoint.staleAttemptIds) && retainedSafetyProblems(task).length === 0;
}

function decide(receipt: ReceiptView, issues: Issue[]): JsonRecord {
  const errors = issues.filter((issue) => issue.severity === "error");
  const isCloseError = (issue: Issue): boolean => issue.code.startsWith("close.") || issue.code.startsWith("run.") || issue.code.startsWith("final.") || issue.code === "artifact.accepted_not_current";
  const closeErrors = errors.some(isCloseError);
  const globalAuthoritySafetyCodes = new Set(["authority.parallel_writers", "authority.integration_writer_not_current", "authority.writer_mismatch"]);
  const recoverableAuthorityCodes = new Set([...globalAuthoritySafetyCodes, "attempt.replacement_unfenced", "authority.cancelled_writer_active"]);
  const recoverableAuthorityError = (issue: Issue): boolean => {
    if (recoverableAuthorityCodes.has(issue.code)) return true;
    if (issue.code !== "authority.current_attempt_not_current") return false;
    const match = issue.path.match(/^\$\.tasks\[(\d+)\]\.current_attempt_id$/);
    const task = match ? receipt.tasks[Number(match[1])] : undefined;
    return Boolean(task && currentAttempt(task)?.failure.authorityState === "ambiguous");
  };
  const taskActions: JsonRecord[] = [];
  const globalAuthorityFreeze = errors.some((issue) => globalAuthoritySafetyCodes.has(issue.code));
  if (globalAuthorityFreeze) {
    taskActions.push({ task_id: "", action: "freeze_and_rebind", reason: "writer authority is unauthorized or lacks a current integration owner" });
  }
  const newSharedDomains = sharedFailureDomains(receipt);
  const openDomains = new Set(receipt.circuits.filter((circuit) => circuit.status === "open").map((circuit) => circuit.domain));
  const unknownScopeDomains = new Set(receipt.tasks
    .filter((task) => task.attempts.some((attempt) => attempt.failure.scope === "unknown" || (attempt.status === "failed" && attempt.failure.scope === "none")))
    .map((task) => task.executionDomain));
  const exclusiveAuthorityUnresolved = !receipt.allowParallelWriters && receipt.tasks.some((task) => task.attempts.some((attempt) => attempt.failure.authorityState === "ambiguous"));
  const exclusiveWriterOccupied = !receipt.allowParallelWriters && receipt.tasks.some((task) => {
    const attempt = currentAttempt(task);
    return Boolean(attempt?.role === "writer" && attempt.status === "running" && !new Set(["fenced", "released"]).has(attempt.failure.authorityState));
  });
  const safetyTaskIds = new Set<string>();
  for (const task of [...receipt.tasks].sort((left, right) => left.taskId.localeCompare(right.taskId))) {
    const action = safetyActionForTask(task, receipt, newSharedDomains, openDomains, unknownScopeDomains);
    if (!action) continue;
    taskActions.push(action);
    safetyTaskIds.add(task.taskId);
  }
  const ownerFalseCompletion = receipt.runStatus === "complete" && (errors.length > 0 || !receipt.tasks.every((task) => taskTerminalReady(task, receipt)) || receipt.circuits.some((circuit) => circuit.status === "open") || receipt.checkpoint.unresolvedFindings.length > 0 || !receipt.checkpoint.terminal);
  if (ownerFalseCompletion) taskActions.push({ task_id: "", action: "block_false_completion", reason: "owner reports completion but retained task, safety, circuit, finding, or checkpoint evidence is not terminal" });

  const recoverableReviewErrors = new Set(["review.blocking_unrepaired", "review.repair_identity_unchanged", "review.artifact_identity_mismatch"]);
  const blockingInputErrors = errors.filter((issue) => !isCloseError(issue) && !recoverableAuthorityError(issue) && !recoverableReviewErrors.has(issue.code));
  if (blockingInputErrors.length > 0) {
    taskActions.sort((left, right) => {
      const rank = decisionRank(left, safetyTaskIds) - decisionRank(right, safetyTaskIds);
      return rank !== 0 ? rank : String(left.task_id).localeCompare(String(right.task_id));
    });
    const safetyLocks = taskActions.filter((item) => actionRank(String(item.action)) <= actionRank("checkpoint_and_stop") || (item.action === "reconcile_owner_state" && safetyTaskIds.has(String(item.task_id))));
    return { schema: "bagakit/supervision-decision/v1", run_id: receipt.runId, run_status: "invalid", recommended_action: String(taskActions[0]?.action ?? "repair_receipt"), run_ready: false, safety_locks: safetyLocks, task_actions: taskActions, issues };
  }

  const completed = new Set(receipt.tasks.filter((task) => task.status === "complete" && taskCloseProblems(task, receipt).length === 0).map((task) => task.taskId));

  for (const task of [...receipt.tasks].sort((left, right) => left.taskId.localeCompare(right.taskId))) {
    if (globalAuthorityFreeze || ownerFalseCompletion || safetyTaskIds.has(task.taskId)) continue;
    const attempt = currentAttempt(task);
    const problems = taskCloseProblems(task, receipt);
    if (task.status === "complete") {
      if (problems.length > 0) taskActions.push({ task_id: task.taskId, action: "block_false_completion", reason: `close evidence is incomplete: ${problems.join(", ")}` });
      continue;
    }
    if (task.status === "cancelled") {
      if (task.required) taskActions.push({ task_id: task.taskId, action: "reconcile_after_cancellation", reason: "required logical task was cancelled" });
      continue;
    }
    if (receipt.runStatus === "blocked") {
      taskActions.push({ task_id: task.taskId, action: "checkpoint_and_stop", reason: "owner reports the run blocked; Supervisor must not schedule around owner truth" });
      continue;
    }
    const dependencies = task.dependsOn.filter((id) => !completed.has(id));
    if (dependencies.length > 0) {
      taskActions.push({ task_id: task.taskId, action: "wait_dependency", reason: `owner-projected dependencies remain incomplete: ${dependencies.join(", ")}` });
      continue;
    }
    if (task.status === "planned") {
      taskActions.push({ task_id: task.taskId, action: "wait_owner_transition", reason: "planned work is not owner-ready for execution" });
      continue;
    }
    const blockedByExclusiveAuthority = exclusiveAuthorityUnresolved && task.mutationBoundary.length > 0 && (!attempt || (attempt.role === "writer" && attempt.status === "failed"));
    if (blockedByExclusiveAuthority) {
      taskActions.push({ task_id: task.taskId, action: "wait_owner_transition", reason: "exclusive writer authority is ambiguous elsewhere; do not start or retry another writer" });
      continue;
    }
    if (task.status === "blocked") {
      taskActions.push({ task_id: task.taskId, action: "checkpoint_and_stop", reason: "logical task remains blocked after safety reconciliation" });
      continue;
    }

    const intervention = latestIntervention(task);
    if (intervention?.effectStatus === "pending") {
      const exhausted = receipt.budgets.observation_used >= receipt.budgets.observation_max;
      const missingPredicate = task.nextObservationCondition === "";
      taskActions.push({ task_id: task.taskId, action: exhausted ? "checkpoint_and_stop" : missingPredicate ? "require_evidence" : "observe_on_next_condition", reason: exhausted ? "observation budget exhausted with intervention effect pending" : missingPredicate ? "pending intervention effect lacks a material next-observation condition" : task.nextObservationCondition });
      continue;
    }
    if (intervention?.effectStatus === "unresolved") {
      taskActions.push({ task_id: task.taskId, action: "inspect_drift", reason: "prior intervention did not resolve the named drift; do not repeat it blindly" });
      continue;
    }
    if (task.drift.status !== "aligned") {
      taskActions.push({ task_id: task.taskId, action: actionForDrift(task.drift, receipt), reason: `${task.drift.status} ${task.drift.kind} drift` });
      continue;
    }

    const readOnly = unstableReadOnly(task);
    if (readOnly === "changed") {
      taskActions.push({ task_id: task.taskId, action: "reconcile_owner_state", reason: "read-only source identity changed; discard the stale audit result" });
      continue;
    }
    if (readOnly === "missing") {
      taskActions.push({ task_id: task.taskId, action: "require_evidence", reason: "read-only authority or source identity is not yet proven" });
      continue;
    }

    if (!attempt) {
      if (task.status === "blocked") taskActions.push({ task_id: task.taskId, action: "checkpoint_and_stop", reason: "logical task is blocked without a current disposition" });
      else {
        const spawnExhausted = receipt.route.topology === "delegated" && receipt.budgets.spawn_used >= receipt.budgets.spawn_max;
        const writerSlotOccupied = task.mutationBoundary.length > 0 && exclusiveWriterOccupied;
        taskActions.push({
          task_id: task.taskId,
          action: spawnExhausted ? "checkpoint_and_stop" : writerSlotOccupied ? "wait_owner_transition" : receipt.route.topology === "single_agent" ? "execute_direct" : "dispatch_task",
          reason: spawnExhausted ? "spawn budget exhausted" : writerSlotOccupied ? "exclusive integration-writer authority remains occupied" : "owner reports task ready with no current attempt",
        });
      }
      continue;
    }
    if (attempt.status === "stale_premise") {
      taskActions.push({ task_id: task.taskId, action: "reconcile_owner_state", reason: "attempt premise is stale; do not mutate" });
      continue;
    }
    if (attempt.status === "failed") {
      taskActions.push({ task_id: task.taskId, action: actionForFailure(attempt, receipt), reason: `failure cause=${attempt.failure.cause}, scope=${attempt.failure.scope}, effect=${attempt.failure.effectState}, authority=${attempt.failure.authorityState}` });
      continue;
    }
    if (attempt.status === "cancelled") {
      taskActions.push({ task_id: task.taskId, action: "reconcile_after_cancellation", reason: "current attempt was cancelled" });
      continue;
    }
    if (attempt.status === "running") {
      if (task.nextObservationCondition === "") taskActions.push({ task_id: task.taskId, action: "require_evidence", reason: "running attempt lacks a material next-observation condition" });
      else {
        const exhausted = receipt.budgets.observation_used >= receipt.budgets.observation_max;
        taskActions.push({ task_id: task.taskId, action: exhausted ? "checkpoint_and_stop" : "observe_on_next_condition", reason: exhausted ? "observation budget exhausted" : task.nextObservationCondition });
      }
      continue;
    }

    const artifacts = new Map(attempt.artifacts.map((artifact) => [artifact.ref, artifact]));
    const missingArtifacts = task.requiredArtifacts.filter((ref) => !artifacts.has(ref));
    if (missingArtifacts.length > 0) {
      taskActions.push({ task_id: task.taskId, action: "collect_artifact_evidence", reason: `missing current artifact identities: ${missingArtifacts.join(", ")}` });
      continue;
    }
    if (task.verification.status !== "pass" || task.verification.targetAttemptId !== task.currentAttemptId || task.verification.evidenceRefs.length === 0 || !artifactSetsEqual(attempt.artifacts, task.verification.artifacts)) {
      taskActions.push({ task_id: task.taskId, action: "verify_current_artifact", reason: "verification is missing, failed, stale, or bound to a different artifact identity" });
      continue;
    }
    const blockingProblem = blockingReviewProblem(task);
    if (blockingProblem) {
      const repairBudgetAvailable = receipt.budgets.intervention_used < receipt.budgets.intervention_max;
      taskActions.push({ task_id: task.taskId, action: repairBudgetAvailable ? "repair_then_reverify" : "checkpoint_and_stop", reason: repairBudgetAvailable ? blockingProblem === "identity_unchanged" ? "the post-repair review reused the blocked artifact identity" : "blocking review history lacks a later current pass or advisory on a repaired identity" : "blocking review requires correction but the intervention budget is exhausted" });
      continue;
    }
    if (task.requiresReview) {
      const review = latestReviewForCurrent(task);
      if (!review) {
        const reviewerCapacity = receipt.budgets.spawn_used < receipt.budgets.spawn_max;
        taskActions.push({ task_id: task.taskId, action: reviewerCapacity ? "dispatch_reviewer" : "checkpoint_and_stop", reason: reviewerCapacity ? "current artifact identity lacks an independent review" : "independent review is required but the spawn budget is exhausted" });
        continue;
      }
      if (review.sourceIdentity.before !== review.sourceIdentity.after) {
        taskActions.push({ task_id: task.taskId, action: "reconcile_owner_state", reason: "review target changed while review was active" });
        continue;
      }
      if (review.verdict === "blocking") {
        const repairBudgetAvailable = receipt.budgets.intervention_used < receipt.budgets.intervention_max;
        taskActions.push({ task_id: task.taskId, action: repairBudgetAvailable ? "repair_then_reverify" : "checkpoint_and_stop", reason: repairBudgetAvailable ? "current artifact has blocking findings" : "blocking findings remain but the intervention budget is exhausted" });
        continue;
      }
      if (!reviewIsFresh(task, review)) {
        const reviewerCapacity = receipt.budgets.spawn_used < receipt.budgets.spawn_max;
        taskActions.push({ task_id: task.taskId, action: reviewerCapacity ? "dispatch_reviewer" : "checkpoint_and_stop", reason: reviewerCapacity ? "latest review is bound to a different artifact identity" : "a new independent review is required but the spawn budget is exhausted" });
        continue;
      }
    }
    if (task.acceptanceEvidence.length === 0) {
      taskActions.push({ task_id: task.taskId, action: "verify_owner_acceptance", reason: "owner acceptance evidence is missing" });
      continue;
    }
    taskActions.push({ task_id: task.taskId, action: "report_task_ready", reason: "current attempt, artifact identity, verification, review, and acceptance are coherent; the owner may close" });
  }

  if (closeErrors && taskActions.length === 0) taskActions.push({ task_id: "", action: "block_false_completion", reason: "run-level close evidence is incomplete" });
  if (receipt.checkpoint.unresolvedFindings.length > 0 && !taskActions.some((item) => item.action === "block_false_completion")) taskActions.push({ task_id: "", action: "block_false_completion", reason: "unresolved blocking findings remain" });

  taskActions.sort((left, right) => {
    const rank = decisionRank(left, safetyTaskIds) - decisionRank(right, safetyTaskIds);
    return rank !== 0 ? rank : String(left.task_id).localeCompare(String(right.task_id));
  });
  const safetyLocks = taskActions.filter((item) => actionRank(String(item.action)) <= actionRank("checkpoint_and_stop") || (item.action === "reconcile_owner_state" && safetyTaskIds.has(String(item.task_id))));
  const allTasksTerminal = receipt.tasks.every((task) => taskTerminalReady(task, receipt));
  const runReady = errors.length === 0 && receipt.runStatus !== "blocked" && allTasksTerminal && receipt.circuits.every((circuit) => circuit.status === "closed") && receipt.checkpoint.unresolvedFindings.length === 0 && receipt.checkpoint.terminal;
  let recommendedAction = String(taskActions[0]?.action ?? (receipt.runStatus === "complete" ? "no_action" : runReady ? "report_run_ready" : "wait_owner_transition"));
  if (receipt.runStatus === "blocked" && new Set(["dispatch_task", "execute_direct", "observe_on_next_condition", "report_task_ready", "report_run_ready"]).has(recommendedAction)) recommendedAction = "checkpoint_and_stop";

  return {
    schema: "bagakit/supervision-decision/v1",
    run_id: receipt.runId,
    run_status: receipt.runStatus,
    owner_revision: receipt.ownerSnapshot.revision,
    recommended_action: recommendedAction,
    run_ready: runReady,
    safety_locks: safetyLocks,
    open_circuits: receipt.circuits.filter((circuit) => circuit.status === "open").map((circuit) => circuit.domain),
    task_actions: taskActions,
    issues,
  };
}

function inspect(receipt: ReceiptView, issues: Issue[]): JsonRecord {
  const attempts = receipt.tasks.flatMap((task) => task.attempts);
  return {
    schema: "bagakit/supervision-inspection/v1",
    run_id: receipt.runId,
    objective: receipt.objective,
    route: receipt.route,
    run_status: receipt.runStatus,
    owner_snapshot: receipt.ownerSnapshot,
    authority: {
      integration_writer: receipt.integrationWriter,
      reviewers: receipt.reviewers,
      allow_parallel_writers: receipt.allowParallelWriters,
    },
    circuits: receipt.circuits.map((circuit) => ({
      domain: circuit.domain,
      status: circuit.status,
      reason: circuit.reason,
      evidence_refs: circuit.evidenceRefs,
    })),
    checkpoint: {
      accepted_artifacts: receipt.checkpoint.acceptedArtifacts.map((artifact) => ({ ref: artifact.ref, identity: artifact.identity, attempt_id: artifact.attemptId })),
      unresolved_findings: receipt.checkpoint.unresolvedFindings,
      stale_attempt_ids: receipt.checkpoint.staleAttemptIds,
      next_safe_action: receipt.checkpoint.nextSafeAction,
      terminal: receipt.checkpoint.terminal,
    },
    tasks: receipt.tasks.map((task) => ({
      task_id: task.taskId,
      status: task.status,
      execution_domain: task.executionDomain,
      current_attempt_id: task.currentAttemptId,
      attempts: task.attempts.map((attempt) => ({
        attempt_id: attempt.attemptId,
        worker_id: attempt.workerId,
        role: attempt.role,
        status: attempt.status,
        write_root: attempt.writeRoot,
        failure: {
          cause: attempt.failure.cause,
          scope: attempt.failure.scope,
          effect_state: attempt.failure.effectState,
          authority_state: attempt.failure.authorityState,
          domain: attempt.failure.domain,
          evidence_refs: attempt.failure.evidenceRefs,
        },
        artifacts: attempt.artifacts.map((artifact) => ({ ref: artifact.ref, identity: artifact.identity, evidence_refs: artifact.evidenceRefs })),
        evidence_refs: attempt.evidenceRefs,
        authority_evidence_refs: attempt.authorityEvidenceRefs,
        source_identity: { before: attempt.sourceIdentity.before, after: attempt.sourceIdentity.after, evidence_refs: attempt.sourceIdentity.evidenceRefs },
      })),
      verification: {
        target_attempt_id: task.verification.targetAttemptId,
        status: task.verification.status,
        artifacts: task.verification.artifacts.map((artifact) => ({ ref: artifact.ref, identity: artifact.identity, evidence_refs: artifact.evidenceRefs })),
        evidence_refs: task.verification.evidenceRefs,
      },
      reviews: task.reviews.map((review) => ({
        review_id: review.reviewId,
        reviewer_id: review.reviewerId,
        target_attempt_id: review.targetAttemptId,
        target_artifacts: review.targetArtifacts.map((artifact) => ({ ref: artifact.ref, identity: artifact.identity, evidence_refs: artifact.evidenceRefs })),
        verdict: review.verdict,
        finding_refs: review.findingRefs,
        evidence_refs: review.evidenceRefs,
        source_identity: { before: review.sourceIdentity.before, after: review.sourceIdentity.after, evidence_refs: review.sourceIdentity.evidenceRefs },
      })),
      interventions: task.interventions.map((intervention) => ({
        target_attempt_id: intervention.targetAttemptId,
        drift_kind: intervention.driftKind,
        action: intervention.action,
        effect_status: intervention.effectStatus,
        observation_refs: intervention.observationRefs,
        intervention_refs: intervention.interventionRefs,
        effect_refs: intervention.effectRefs,
      })),
      acceptance_evidence: task.acceptanceEvidence,
      next_observation_condition: task.nextObservationCondition,
      close_problems: taskCloseProblems(task, receipt),
    })),
    counts: {
      tasks: receipt.tasks.length,
      complete_tasks: receipt.tasks.filter((task) => task.status === "complete").length,
      attempts: attempts.length,
      running_attempts: attempts.filter((attempt) => attempt.status === "running").length,
      blocking_reviews: receipt.tasks.flatMap((task) => task.reviews).filter((review) => review.verdict === "blocking").length,
      interventions: receipt.tasks.flatMap((task) => task.interventions).length,
      open_circuits: receipt.circuits.filter((circuit) => circuit.status === "open").length,
      unresolved_findings: receipt.checkpoint.unresolvedFindings.length,
    },
    budgets: receipt.budgets,
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}

function parseCli(argv: string[]): { command: string; input: string; final: boolean; json: boolean } {
  const command = argv[0] ?? "";
  let input = "";
  let final = false;
  let json = false;
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      input = argv[index + 1] ?? "";
      index += 1;
    } else if (token === "--final") final = true;
    else if (token === "--json") json = true;
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!new Set(["inspect", "decide", "validate"]).has(command)) throw new Error("usage: supervision_check.ts <inspect|decide|validate> --input <receipt.json> [--final] [--json]");
  if (input === "") throw new Error("--input is required");
  if (final && command !== "validate") throw new Error("--final is only valid with validate");
  return { command, input, final, json };
}

function renderText(payload: JsonRecord): string {
  const lines = [`schema: ${String(payload.schema ?? "unknown")}`];
  if (payload.run_id) lines.push(`run: ${String(payload.run_id)}`);
  if (payload.recommended_action) lines.push(`recommended_action: ${String(payload.recommended_action)}`);
  if (typeof payload.valid === "boolean") lines.push(`valid: ${String(payload.valid)}`);
  const issues = Array.isArray(payload.issues) ? payload.issues as Issue[] : [];
  for (const issue of issues) lines.push(`${issue.severity}: ${issue.code} ${issue.path} ${issue.message}`);
  return `${lines.join("\n")}\n`;
}

function helpText(): string {
  return `bagakit supervision checker

Usage:
  supervision_check.ts <command> --input <receipt.json> [options]

Commands:
  inspect   Show owner revision, task, attempt, review, intervention, circuit, and budget state.
  decide    Recommend safety guards and admissible next actions from the supplied owner snapshot.
  validate  Validate receipt invariants; add --final to require owner-reported final closure.

Options:
  --input <path>  Explicit owner-chosen supervision receipt.
  --final         Require final owner-reported closure; valid only with validate.
  --json          Emit structured JSON.
  --help          Show this help.
`;
}

function main(): number {
  try {
    if (process.argv.slice(2).some((token) => token === "--help" || token === "-h")) {
      process.stdout.write(helpText());
      return 0;
    }
    const args = parseCli(process.argv.slice(2));
    const raw = JSON.parse(fs.readFileSync(args.input, "utf8")) as unknown;
    const { receipt, issues } = parseReceipt(raw, args.final);
    const payload = args.command === "inspect" ? inspect(receipt, issues) : args.command === "decide" ? decide(receipt, issues) : {
      schema: "bagakit/supervision-validation/v1",
      run_id: receipt.runId,
      final: args.final,
      valid: !issues.some((issue) => issue.severity === "error"),
      issues,
    };
    process.stdout.write(args.json ? `${JSON.stringify(payload, null, 2)}\n` : renderText(payload));
    return issues.some((issue) => issue.severity === "error") ? 1 : 0;
  } catch (error) {
    process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

process.exitCode = main();
