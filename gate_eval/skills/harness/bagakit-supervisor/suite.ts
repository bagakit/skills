import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "../../../../dev/eval/src/lib/command.ts";
import type { EvalSuiteDefinition } from "../../../../dev/eval/src/lib/model.ts";
import { cleanupTempDir, createTempDir, registerTempRepo, writeTextFile } from "../../../../dev/eval/src/lib/temp.ts";

type JsonRecord = Record<string, unknown>;

interface ActionView {
  task_id: string;
  action: string;
}

interface CaseDefinition {
  id: string;
  title: string;
  fixture: string;
  guard: string;
  command?: "decide" | "validate_final";
  expected_action?: string;
  expected_task_actions?: string[];
  expected_task_action_views?: ActionView[];
  expected_safety_lock_views?: ActionView[];
  forbidden_actions?: string[];
  expected_issue?: string;
  expected_issues?: string[];
  expected_run_ready?: boolean;
  expected_exit: number;
  proves: string;
  does_not_prove: string;
}

interface CaseBank {
  schema: string;
  comparison_baselines: string[];
  cases: CaseDefinition[];
}

interface SemanticCaseDefinition {
  id: string;
  contrast_pair: string;
  prompt: string;
  expected_disposition: string;
  must: string[];
  must_not: string[];
  critical_failure: string;
}

interface SemanticCaseBank {
  schema: string;
  quality_vectors: string[];
  cases: SemanticCaseDefinition[];
}

function artifact(ref = "artifacts/result.md", identity = "sha256:result-v1"): JsonRecord {
  return { ref, identity, evidence_refs: [`host://artifact/${identity.slice(7)}`] };
}

function failure(overrides: JsonRecord = {}): JsonRecord {
  return { cause: "none", scope: "none", effect_state: "not_applicable", authority_state: "current", domain: "", evidence_refs: [], ...overrides };
}

function attempt(overrides: JsonRecord = {}): JsonRecord {
  return {
    attempt_id: "attempt-1",
    worker_id: "worker-1",
    role: "writer",
    write_root: "artifacts/",
    status: "running",
    failure: failure(),
    artifacts: [],
    evidence_refs: [],
    authority_evidence_refs: ["host://capability/attempt-1"],
    source_identity: { before: "", after: "", evidence_refs: [] },
    ...overrides,
  };
}

function task(overrides: JsonRecord = {}): JsonRecord {
  return {
    task_id: "task-1",
    objective: "Produce the required artifact.",
    execution_domain: "provider-a",
    required: true,
    status: "running",
    depends_on: [],
    mutation_boundary: ["artifacts/"],
    source_scope: [],
    method_boundary_refs: [],
    required_artifacts: ["artifacts/result.md"],
    requires_review: false,
    current_attempt_id: "attempt-1",
    attempts: [attempt()],
    drift: { status: "aligned", kind: "none", evidence_refs: [] },
    verification: { target_attempt_id: "", status: "not_run", artifacts: [], evidence_refs: [] },
    reviews: [],
    interventions: [],
    acceptance_evidence: [],
    next_observation_condition: "host event or bounded deadline",
    ...overrides,
  };
}

function receipt(overrides: JsonRecord = {}): JsonRecord {
  return {
    schema: "bagakit/supervision-receipt/v1",
    run_id: "eval-run",
    objective: "Produce an accepted result.",
    route: { topology: "delegated", assurance: "standard", lifecycle: "normal" },
    run_status: "active",
    owner_snapshot: { ref: "host-task://eval-run", revision: "rev-1", evidence_refs: ["host://owner/rev-1"] },
    authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
    circuits: [],
    tasks: [task()],
    checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Continue from current truth.", terminal: false },
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function completeTask(overrides: JsonRecord = {}): JsonRecord {
  const resultArtifact = artifact();
  return task({
    status: "complete",
    current_attempt_id: "attempt-1",
    attempts: [attempt({ status: "succeeded", artifacts: [resultArtifact], evidence_refs: ["host://attempt/attempt-1/succeeded"] })],
    verification: { target_attempt_id: "attempt-1", status: "pass", artifacts: [clone(resultArtifact)], evidence_refs: ["host://verification/result-v1"] },
    acceptance_evidence: ["owner://task-1/accepted"],
    next_observation_condition: "",
    ...overrides,
  });
}

function reviewRecord(reviewId: string, verdict: "pass" | "advisory" | "blocking", targetArtifact: JsonRecord): JsonRecord {
  return {
    review_id: reviewId,
    reviewer_id: "reviewer-1",
    target_attempt_id: "attempt-1",
    target_artifacts: [clone(targetArtifact)],
    verdict,
    finding_refs: verdict === "blocking" ? [`reviews/${reviewId}.md`] : [],
    evidence_refs: [`host://review/${reviewId}`],
    source_identity: { before: `sha256:${reviewId}-scope`, after: `sha256:${reviewId}-scope`, evidence_refs: [`host://snapshot/${reviewId}`] },
  };
}

function fixture(name: string): JsonRecord {
  if (name === "direct") {
    return receipt({
      route: { topology: "single_agent", assurance: "standard", lifecycle: "normal" },
      authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 0, spawn_used: 0, observation_max: 1, observation_used: 0, intervention_max: 0, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })],
    });
  }
  if (name === "direct_running") {
    return receipt({
      route: { topology: "single_agent", assurance: "standard", lifecycle: "normal" },
      authority: { integration_writer: "host-agent-7", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 0, spawn_used: 0, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [task({ attempts: [attempt({ worker_id: "host-agent-7" })] })],
    });
  }
  if (name === "direct_succeeded") {
    const selected = completeTask({
      attempts: [attempt({ worker_id: "host-agent-7", status: "succeeded", artifacts: [artifact()], evidence_refs: ["host://attempt/attempt-1/succeeded"] })],
    });
    return receipt({
      run_status: "complete",
      route: { topology: "single_agent", assurance: "standard", lifecycle: "normal" },
      authority: { integration_writer: "host-agent-7", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 0, spawn_used: 0, observation_max: 2, observation_used: 1, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [selected],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Owner may return the accepted result.", terminal: true },
    });
  }
  if (name === "audit") {
    const auditor = (id: string, worker: string): JsonRecord => attempt({ attempt_id: id, worker_id: worker, role: "auditor", write_root: "", source_identity: { before: `sha256:${id}-source`, after: "", evidence_refs: [`host://snapshot/${id}`] } });
    return receipt({
      route: { topology: "delegated", assurance: "audit", lifecycle: "normal" },
      authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 2, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [
        task({ task_id: "audit-1", objective: "Audit behavior evidence.", mutation_boundary: [], source_scope: ["modules/behavior/"], required_artifacts: [], current_attempt_id: "audit-attempt-1", attempts: [auditor("audit-attempt-1", "auditor-1")] }),
        task({ task_id: "audit-2", objective: "Audit recovery evidence.", mutation_boundary: [], source_scope: ["modules/recovery/"], required_artifacts: [], current_attempt_id: "audit-attempt-2", attempts: [auditor("audit-attempt-2", "auditor-2")] }),
      ],
    });
  }
  if (name === "audit_changed") {
    const value = fixture("audit");
    const selected = (value.tasks as JsonRecord[])[0];
    const selectedAttempt = (selected.attempts as JsonRecord[])[0];
    selectedAttempt.status = "succeeded";
    (selectedAttempt.source_identity as JsonRecord).after = "sha256:changed-source";
    return value;
  }
  if (name === "stale_premise") {
    const value = receipt();
    (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "stale_premise";
    return value;
  }
  if (name === "recovery") {
    const completed = completeTask();
    const missing = task({ task_id: "task-2", objective: "Produce the dependent summary.", status: "ready", depends_on: ["task-1"], mutation_boundary: ["summary/"], required_artifacts: ["summary/result.md"], current_attempt_id: "", attempts: [], next_observation_condition: "" });
    return receipt({
      route: { topology: "delegated", assurance: "standard", lifecycle: "recovery" },
      authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 3, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [completed, missing],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Dispatch only task-2.", terminal: false },
    });
  }
  if (name === "provider_global") {
    const value = receipt({ circuits: [{ domain: "provider-a", status: "open", reason: "shared authentication failure", evidence_refs: ["host://provider-a/incident"] }] });
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "known_not_applied", domain: "provider-a", evidence_refs: ["host://provider-a/failure"] });
    return value;
  }
  if (name === "provider_unbound") {
    const value = receipt();
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "known_not_applied", domain: "provider-a", evidence_refs: ["host://provider-a/failure"] });
    return value;
  }
  if (name === "provider_effect_unknown") {
    const value = receipt();
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "unknown", domain: "provider-a", evidence_refs: ["external://provider-a/timeout"] });
    return value;
  }
  if (name === "side_effect_unknown") {
    const value = receipt();
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", domain: "payments", evidence_refs: ["external://refund/timeout"] });
    return value;
  }
  if (name === "false_completion") {
    const value = receipt({ run_status: "complete", checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Return result.", terminal: true } });
    const selected = (value.tasks as JsonRecord[])[0];
    selected.status = "complete";
    selected.next_observation_condition = "";
    ((selected.attempts as JsonRecord[])[0]).status = "succeeded";
    selected.acceptance_evidence = ["owner://task-1/accepted"];
    return value;
  }
  if (name === "old_attempt") {
    const value = receipt({
      run_status: "complete",
      budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-2" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Return result.", terminal: true },
    });
    const selected = completeTask({ current_attempt_id: "attempt-2" });
    const old = attempt({ status: "succeeded", artifacts: [artifact("artifacts/result-old.md", "sha256:old")], evidence_refs: ["host://attempt/attempt-1/succeeded"] });
    const current = attempt({ attempt_id: "attempt-2", worker_id: "worker-2", status: "succeeded", artifacts: [artifact()], evidence_refs: ["host://attempt/attempt-2/succeeded"], authority_evidence_refs: ["host://capability/attempt-2"] });
    selected.attempts = [old, current];
    selected.verification = { target_attempt_id: "attempt-2", status: "pass", artifacts: [artifact()], evidence_refs: ["host://verification/result-v1"] };
    value.tasks = [selected];
    return value;
  }
  if (name === "blocking_review" || name === "ghost_review") {
    const value = receipt({ route: { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" }, authority: { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false } });
    const selected = (value.tasks as JsonRecord[])[0];
    const writer = (selected.attempts as JsonRecord[])[0];
    selected.status = name === "blocking_review" ? "needs_repair" : "complete";
    selected.requires_review = true;
    selected.next_observation_condition = "";
    writer.status = "succeeded";
    writer.artifacts = [artifact()];
    selected.verification = { target_attempt_id: "attempt-1", status: "pass", artifacts: [artifact()], evidence_refs: ["host://verification/result-v1"] };
    selected.acceptance_evidence = name === "ghost_review" ? ["owner://task-1/accepted"] : [];
    if (name === "blocking_review") selected.reviews = [{ review_id: "review-1", reviewer_id: "reviewer-1", target_attempt_id: "attempt-1", target_artifacts: [artifact()], verdict: "blocking", finding_refs: ["reviews/p1.md"], evidence_refs: ["host://review/review-1"], source_identity: { before: "sha256:scope-v1", after: "sha256:scope-v1", evidence_refs: ["host://snapshot/review-1"] } }];
    return value;
  }
  if (name === "observation_exhausted") {
    return receipt({ budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 4, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 } });
  }
  if (name === "scope_drift") return receipt({ tasks: [task({ drift: { status: "confirmed", kind: "scope", evidence_refs: ["host://drift/scope"] } })] });
  if (name === "cost_drift") return receipt({ tasks: [task({ drift: { status: "confirmed", kind: "cost", evidence_refs: ["host://drift/cost"] } })] });
  if (name === "intervention_pending" || name === "intervention_unresolved") {
    const effectStatus = name === "intervention_pending" ? "pending" : "unresolved";
    return receipt({
      budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 1, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [task({
        drift: { status: "confirmed", kind: "scope", evidence_refs: ["host://drift/scope"] },
        interventions: [{ target_attempt_id: "attempt-1", drift_kind: "scope", observation_refs: ["host://drift/scope"], action: "steer_to_boundary", intervention_refs: ["host://steer/1"], effect_status: effectStatus, effect_refs: effectStatus === "pending" ? [] : ["host://observation/still-drifting"] }],
      })],
    });
  }
  if (name === "intervention_resolved_ready" || name === "intervention_resolved_without_effect") {
    const missingEffect = name === "intervention_resolved_without_effect";
    const selected = completeTask({
      status: "needs_repair",
      interventions: [{
        target_attempt_id: "attempt-1",
        drift_kind: "scope",
        observation_refs: ["host://drift/scope"],
        action: "steer_to_boundary",
        intervention_refs: ["host://steer/1"],
        effect_status: "resolved",
        effect_refs: missingEffect ? [] : ["host://artifact/result-v1", "host://verification/result-v1"],
      }],
    });
    return receipt({
      budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 1, intervention_max: 2, intervention_used: 1, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [selected],
    });
  }
  if (name === "second_intervention_before_effect") {
    return receipt({
      budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 1, intervention_max: 2, intervention_used: 2, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [task({
        drift: { status: "confirmed", kind: "scope", evidence_refs: ["host://drift/scope"] },
        interventions: [
          { target_attempt_id: "attempt-1", drift_kind: "scope", observation_refs: ["host://drift/scope"], action: "steer_to_boundary", intervention_refs: ["host://steer/1"], effect_status: "pending", effect_refs: [] },
          { target_attempt_id: "attempt-1", drift_kind: "scope", observation_refs: ["host://drift/scope-still-open"], action: "steer_to_boundary", intervention_refs: ["host://steer/2"], effect_status: "pending", effect_refs: [] },
        ],
      })],
    });
  }
  if (name === "review_artifact_mismatch") {
    const currentArtifact = artifact("artifacts/result.md", "sha256:current-v2");
    const staleArtifact = artifact("artifacts/result.md", "sha256:stale-v1");
    const selected = completeTask({
      status: "needs_repair",
      attempts: [attempt({ status: "succeeded", artifacts: [clone(currentArtifact)], evidence_refs: ["host://attempt/attempt-1/succeeded"] })],
      verification: { target_attempt_id: "attempt-1", status: "pass", artifacts: [clone(currentArtifact)], evidence_refs: ["host://verification/current-v2"] },
      requires_review: true,
      reviews: [reviewRecord("review-stale", "pass", staleArtifact)],
      acceptance_evidence: ["owner://task-1/accepted-current-v2"],
    });
    return receipt({
      route: { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" },
      authority: { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false },
      budgets: { spawn_max: 2, spawn_used: 1, observation_max: 4, observation_used: 1, intervention_max: 2, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [selected],
    });
  }
  if (name === "scoped_circuit") {
    const affected = task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" });
    const independent = task({ task_id: "task-2", objective: "Run outside the failed provider.", execution_domain: "provider-b", status: "ready", current_attempt_id: "", attempts: [], required_artifacts: ["artifacts/independent.md"], next_observation_condition: "" });
    return receipt({
      authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 2, spawn_used: 0, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      circuits: [{ domain: "provider-a", status: "open", reason: "shared authentication failure", evidence_refs: ["host://provider-a/incident"] }],
      tasks: [affected, independent],
    });
  }
  if (name === "parallel_writers") {
    const first = task();
    const second = task({
      task_id: "task-2",
      objective: "Produce a second artifact.",
      mutation_boundary: ["second/"],
      required_artifacts: ["second/result.md"],
      current_attempt_id: "attempt-2",
      attempts: [attempt({ attempt_id: "attempt-2", worker_id: "worker-2", write_root: "second/", authority_evidence_refs: ["host://capability/attempt-2"] })],
    });
    return receipt({
      budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [first, second],
    });
  }
  if (name === "parallel_alias_writers") {
    const first = task();
    const second = task({ task_id: "task-2", mutation_boundary: ["./artifacts/"], required_artifacts: ["./artifacts/result.md"], current_attempt_id: "attempt-2", attempts: [attempt({ attempt_id: "attempt-2", worker_id: "worker-2", write_root: "./artifacts/", authority_evidence_refs: ["host://capability/attempt-2"] })] });
    return receipt({
      authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: true },
      budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [first, second],
    });
  }
  if (name === "parallel_missing_integration") {
    const value = fixture("parallel_alias_writers");
    value.authority = { integration_writer: "worker-ghost", reviewers: [], allow_parallel_writers: true };
    return value;
  }
  if (name === "ambiguous_authority_sibling") {
    const first = task({ attempts: [attempt({ failure: failure({ authority_state: "ambiguous", evidence_refs: ["host://authority/ambiguous"] }) })] });
    const second = task({ task_id: "task-2", status: "ready", mutation_boundary: ["second/"], required_artifacts: ["second/result.md"], current_attempt_id: "", attempts: [], next_observation_condition: "" });
    return receipt({ tasks: [first, second] });
  }
  if (name === "unknown_scope_sibling") {
    const first = task({ attempts: [attempt({ status: "failed", failure: failure({ cause: "logic_defect", scope: "unknown", effect_state: "known_not_applied", evidence_refs: ["host://failure/scope-unknown"] }) })] });
    const second = task({ task_id: "task-2", status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" });
    return receipt({ tasks: [first, second] });
  }
  if (name === "optional_open") {
    const completed = completeTask();
    const optional = task({ task_id: "task-optional", objective: "Produce an optional diagnostic.", required: false, status: "planned", current_attempt_id: "", attempts: [], required_artifacts: [], next_observation_condition: "" });
    return receipt({
      authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: false },
      tasks: [completed, optional],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Resolve the optional task before run readiness.", terminal: false },
    });
  }
  if (name === "retained_effect_dependency" || name === "retained_effect_final" || name === "retained_applied_dependency" || name === "retained_applied_final") {
    const completed = completeTask();
    const applied = name.startsWith("retained_applied");
    const historical = attempt({
      attempt_id: "attempt-old",
      worker_id: "worker-old",
      status: "failed",
      failure: failure({ cause: "logic_defect", scope: "lane", effect_state: applied ? "known_applied" : "unknown", authority_state: "fenced", domain: "payments", evidence_refs: [applied ? "external://payment/applied" : "external://payment/readback-pending"] }),
      authority_evidence_refs: ["host://authority/attempt-old"],
    });
    completed.attempts = [historical, ...(completed.attempts as JsonRecord[])];
    const final = name.endsWith("_final");
    const dependent = task({ task_id: "task-2", status: "ready", depends_on: ["task-1"], mutation_boundary: ["dependent/"], required_artifacts: ["dependent/result.md"], current_attempt_id: "", attempts: [], next_observation_condition: "" });
    return receipt({
      run_status: final ? "complete" : "active",
      authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
      tasks: final ? [completed] : [completed, dependent],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: applied ? "Reconcile the retained applied effect." : "Resolve the retained external effect.", terminal: final },
    });
  }
  if (name === "circuit_new_siblings") {
    const failed = task({
      task_id: "task-fault",
      current_attempt_id: "attempt-fault",
      attempts: [attempt({ attempt_id: "attempt-fault", worker_id: "worker-fault", status: "failed", failure: failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "known_not_applied", domain: "provider-a", evidence_refs: ["host://provider-a/fault"] }) })],
    });
    const sibling = task({ task_id: "task-sibling", status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" });
    const independent = task({ task_id: "task-independent", execution_domain: "provider-b", status: "ready", mutation_boundary: ["independent/"], required_artifacts: ["independent/result.md"], current_attempt_id: "", attempts: [], next_observation_condition: "" });
    return receipt({
      authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
      tasks: [failed, sibling, independent],
    });
  }
  if (name === "known_applied") {
    const value = receipt();
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "transient_transport", scope: "lane", effect_state: "known_applied", domain: "payments", evidence_refs: ["external://payment/committed"] });
    return value;
  }
  if (name === "retained_applied_retry") {
    return receipt({
      authority: { integration_writer: "worker-2", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
      tasks: [task({
        status: "needs_repair",
        current_attempt_id: "attempt-2",
        attempts: [
          attempt({ attempt_id: "attempt-old", worker_id: "worker-old", status: "failed", failure: failure({ cause: "logic_defect", scope: "lane", effect_state: "known_applied", authority_state: "fenced", domain: "payments", evidence_refs: ["external://payment/applied"] }), authority_evidence_refs: ["host://fence/attempt-old"] }),
          attempt({ attempt_id: "attempt-2", worker_id: "worker-2", status: "failed", failure: failure({ cause: "transient_transport", scope: "lane", effect_state: "known_not_applied", authority_state: "current", domain: "payments", evidence_refs: ["external://payment/not-applied"] }), authority_evidence_refs: ["host://capability/attempt-2"] }),
        ],
      })],
      checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: ["attempt-old"], next_safe_action: "Reconcile the applied effect before another attempt.", terminal: false },
    });
  }
  if (name === "blocking_same_identity" || name === "blocking_changed_identity") {
    const changed = name === "blocking_changed_identity";
    const blockedArtifact = artifact("artifacts/result.md", "sha256:blocked-v1");
    const currentArtifact = changed ? artifact("artifacts/result.md", "sha256:repaired-v2") : clone(blockedArtifact);
    const selected = completeTask({
      status: changed ? "complete" : "needs_repair",
      attempts: [attempt({ status: "succeeded", artifacts: [clone(currentArtifact)], evidence_refs: ["host://attempt/attempt-1/succeeded"] })],
      verification: { target_attempt_id: "attempt-1", status: "pass", artifacts: [clone(currentArtifact)], evidence_refs: ["host://verification/current"] },
      requires_review: true,
      reviews: [reviewRecord("review-blocking", "blocking", blockedArtifact), reviewRecord("review-pass", "pass", currentArtifact)],
      acceptance_evidence: changed ? ["owner://task-1/accepted"] : [],
    });
    return receipt({
      run_status: changed ? "complete" : "active",
      route: { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" },
      authority: { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false },
      tasks: [selected],
      checkpoint: { accepted_artifacts: changed ? [{ ref: "artifacts/result.md", identity: "sha256:repaired-v2", attempt_id: "attempt-1" }] : [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: changed ? "Owner may return the repaired result." : "Repair the blocked identity.", terminal: changed },
    });
  }
  if (name === "stale_verification_final") {
    const oldArtifact = artifact("artifacts/result.md", "sha256:old-v1");
    const currentArtifact = artifact("artifacts/result.md", "sha256:current-v2");
    const selected = completeTask({
      current_attempt_id: "attempt-current",
      attempts: [
        attempt({ attempt_id: "attempt-old", worker_id: "worker-old", status: "succeeded", failure: failure({ authority_state: "fenced" }), artifacts: [clone(oldArtifact)], evidence_refs: ["host://attempt/attempt-old/succeeded"], authority_evidence_refs: ["host://fence/attempt-old"] }),
        attempt({ attempt_id: "attempt-current", worker_id: "worker-current", status: "succeeded", artifacts: [clone(currentArtifact)], evidence_refs: ["host://attempt/attempt-current/succeeded"], authority_evidence_refs: ["host://capability/attempt-current"] }),
      ],
      verification: { target_attempt_id: "attempt-old", status: "pass", artifacts: [clone(oldArtifact)], evidence_refs: ["host://verification/old-v1"] },
      acceptance_evidence: ["owner://task-1/accepted-current"],
    });
    return receipt({
      run_status: "complete",
      authority: { integration_writer: "worker-current", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
      tasks: [selected],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:current-v2", attempt_id: "attempt-current" }], unresolved_findings: [], stale_attempt_ids: ["attempt-old"], next_safe_action: "Reject stale verification.", terminal: true },
    });
  }
  if (name === "cancelled_live_optional") {
    return receipt({
      run_status: "complete",
      authority: { integration_writer: "worker-optional", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 2, spawn_used: 1, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [task({ task_id: "task-optional", required: false, status: "cancelled", current_attempt_id: "attempt-optional", attempts: [attempt({ attempt_id: "attempt-optional", worker_id: "worker-optional" })] })],
      checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Fence the cancelled writer.", terminal: true },
    });
  }
  if (name === "unknown_effect_unrelated_error") {
    const value = receipt({ owner_snapshot: { ref: "host-task://eval-run", revision: "rev-1", evidence_refs: [] } });
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", domain: "payments", evidence_refs: ["external://refund/readback-pending"] });
    return value;
  }
  if (name === "audit_overlap") {
    return receipt({
      route: { topology: "delegated", assurance: "audit", lifecycle: "normal" },
      authority: { integration_writer: "worker-synthesis", reviewers: [], allow_parallel_writers: false },
      budgets: { spawn_max: 3, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [
        task({ task_id: "task-audit", mutation_boundary: [], source_scope: ["modules/"], required_artifacts: [], current_attempt_id: "attempt-audit", attempts: [attempt({ attempt_id: "attempt-audit", worker_id: "auditor-1", role: "auditor", write_root: "", source_identity: { before: "sha256:modules-v1", after: "", evidence_refs: ["host://snapshot/modules-v1"] } })] }),
        task({ task_id: "task-synthesis", execution_domain: "provider-b", mutation_boundary: ["modules/report/"], required_artifacts: ["modules/report/result.md"], current_attempt_id: "attempt-synthesis", attempts: [attempt({ attempt_id: "attempt-synthesis", worker_id: "worker-synthesis", write_root: "modules/report/", authority_evidence_refs: ["host://capability/attempt-synthesis"] })] }),
      ],
    });
  }
  if (name === "missing_observation") return receipt({ tasks: [task({ next_observation_condition: "" })] });
  if (name === "restart_budget") {
    const value = receipt({ budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 1, restart_used: 1, human_gate_max: 1, human_gate_used: 0 } });
    const selected = (((value.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
    selected.status = "failed";
    selected.failure = failure({ cause: "transient_transport", scope: "lane", effect_state: "known_not_applied", evidence_refs: ["host://transport/failure"] });
    return value;
  }
  if (name === "spawn_budget") return receipt({ authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false }, budgets: { spawn_max: 1, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 1, human_gate_used: 0 }, tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })] });
  if (name === "exclusive_writer_occupied") {
    const value = receipt();
    value.tasks = [...(value.tasks as JsonRecord[]), task({ task_id: "task-2", execution_domain: "provider-b", status: "ready", mutation_boundary: ["second/"], required_artifacts: ["second/result.md"], current_attempt_id: "", attempts: [], next_observation_condition: "" })];
    return value;
  }
  if (name === "blocking_repair_budget") {
    const value = fixture("blocking_same_identity");
    value.budgets = { spawn_max: 1, spawn_used: 1, observation_max: 1, observation_used: 0, intervention_max: 0, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 };
    return value;
  }
  if (name === "reviewer_spawn_budget") {
    const selected = completeTask({ status: "needs_repair", requires_review: true, reviews: [], acceptance_evidence: [] });
    return receipt({
      route: { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" },
      authority: { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false },
      budgets: { spawn_max: 1, spawn_used: 1, observation_max: 1, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
      tasks: [selected],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Stop because reviewer capacity is exhausted.", terminal: false },
    });
  }
  if (name === "machine_local_ref") {
    const selected = completeTask();
    return receipt({
      run_status: "complete",
      owner_snapshot: { ref: "file:///synthetic-machine/private/owner.json", revision: "rev-1", evidence_refs: ["host://owner/rev-1"] },
      tasks: [selected],
      checkpoint: { accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Reject the machine-local reference.", terminal: true },
    });
  }
  if (name === "blocked_owner") return receipt({ run_status: "blocked", authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false }, tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })] });
  throw new Error(`unknown fixture: ${name}`);
}

const suiteDir = path.dirname(fileURLToPath(import.meta.url));
const casesPath = path.join(suiteDir, "cases", "supervision-cases.json");
const caseBank = JSON.parse(fs.readFileSync(casesPath, "utf8")) as CaseBank;
assert.equal(caseBank.schema, "bagakit/supervisor-eval-cases/v2");
assert.deepEqual(caseBank.comparison_baselines, ["direct_execution", "dispatch_only"]);
const canonicalIds = caseBank.cases.map((definition) => definition.id);
assert.equal(new Set(canonicalIds).size, canonicalIds.length, "supervision eval case ids must be unique");
for (const definition of caseBank.cases) assert.ok(new Set(["decide", "validate_final"]).has(definition.command ?? "decide"), `${definition.id}: unsupported command`);
assert.ok(caseBank.cases.some((definition) => definition.command === "validate_final"), "case bank must exercise validate --final");

const semanticCasesPath = path.join(suiteDir, "cases", "outcome-ownership-cases.json");
const semanticCaseBank = JSON.parse(fs.readFileSync(semanticCasesPath, "utf8")) as SemanticCaseBank;
assert.equal(semanticCaseBank.schema, "bagakit/supervisor-outcome-ownership-cases/v1");
assert.ok(semanticCaseBank.quality_vectors.length > 0, "semantic case bank must name quality vectors");
const semanticIds = semanticCaseBank.cases.map((definition) => definition.id);
assert.equal(new Set(semanticIds).size, semanticIds.length, "semantic case ids must be unique");
for (const definition of semanticCaseBank.cases) {
  assert.ok(definition.contrast_pair.trim(), `${definition.id}: missing contrast pair`);
  assert.ok(definition.prompt.trim(), `${definition.id}: missing prompt`);
  assert.ok(definition.expected_disposition.trim(), `${definition.id}: missing expected disposition`);
  assert.ok(definition.must.length > 0, `${definition.id}: missing must rules`);
  assert.ok(definition.must_not.length > 0, `${definition.id}: missing must_not rules`);
  assert.ok(definition.critical_failure.trim(), `${definition.id}: missing critical failure`);
}

export const SUITE: EvalSuiteDefinition = {
  id: "bagakit-supervisor-failure-matrix",
  owner: "gate_eval/skills/harness/bagakit-supervisor",
  title: "Supervisor Failure Matrix",
  summary: "Measure deterministic owner binding, alignment, intervention, authority, fencing, failure safety, review, and close-readiness decisions.",
  defaultOutputDir: "gate_eval/skills/harness/bagakit-supervisor/results/runs",
  cases: caseBank.cases.map((definition) => ({
    id: definition.id,
    title: definition.title,
    summary: definition.proves,
    focus: [definition.guard, definition.fixture],
    run: (context) => {
      const tempDir = createTempDir(`bagakit-supervisor-${definition.id}-`);
      const replacements = registerTempRepo(context, tempDir);
      try {
        const input = path.join(tempDir, "receipt.json");
        writeTextFile(input, `${JSON.stringify(fixture(definition.fixture), null, 2)}\n`);
        const cli = path.join(context.repoRoot, "skills", "harness", "bagakit-supervisor", "scripts", "supervision_check.ts");
        const command = definition.command ?? "decide";
        const cliArgs = command === "validate_final"
          ? ["--experimental-strip-types", cli, "validate", "--input", input, "--json", "--final"]
          : ["--experimental-strip-types", cli, "decide", "--input", input, "--json"];
        const result = runCommand(process.execPath, cliArgs, { cwd: context.repoRoot, replacements });
        assert.equal(result.status, definition.expected_exit, `unexpected exit\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
        const payload = JSON.parse(result.stdout) as JsonRecord;
        if (command === "decide") {
          assert.ok(definition.expected_action, `${definition.id}: decide case requires expected_action`);
          assert.equal(payload.recommended_action, definition.expected_action);
        }
        if (definition.expected_run_ready !== undefined) assert.equal(payload.run_ready, definition.expected_run_ready);
        const taskActions = Array.isArray(payload.task_actions) ? payload.task_actions as JsonRecord[] : [];
        if (definition.expected_task_actions) assert.deepEqual(taskActions.map((entry) => String(entry.action)), definition.expected_task_actions);
        const taskActionViews = taskActions.map((entry) => ({ task_id: String(entry.task_id), action: String(entry.action) }));
        if (definition.expected_task_action_views) assert.deepEqual(taskActionViews, definition.expected_task_action_views);
        const safetyLocks = Array.isArray(payload.safety_locks) ? payload.safety_locks as JsonRecord[] : [];
        const safetyLockViews = safetyLocks.map((entry) => ({ task_id: String(entry.task_id), action: String(entry.action) }));
        if (definition.expected_safety_lock_views) assert.deepEqual(safetyLockViews, definition.expected_safety_lock_views);
        const issues = Array.isArray(payload.issues) ? payload.issues as JsonRecord[] : [];
        if (definition.expected_issue) assert.ok(issues.some((issue) => issue.code === definition.expected_issue), `missing issue ${definition.expected_issue}`);
        const issueCodes = issues.map((issue) => String(issue.code));
        if (definition.expected_issues) assert.deepEqual([...issueCodes].sort(), [...definition.expected_issues].sort());
        const emittedActions = new Set([String(payload.recommended_action ?? ""), ...taskActionViews.map((entry) => entry.action), ...safetyLockViews.map((entry) => entry.action)]);
        for (const forbidden of definition.forbidden_actions ?? []) assert.ok(!emittedActions.has(forbidden), `${definition.id}: emitted forbidden action ${forbidden}`);
        return {
          assertions: [definition.proves],
          commands: [`node --experimental-strip-types skills/harness/bagakit-supervisor/scripts/supervision_check.ts ${command === "validate_final" ? "validate --final" : "decide"} --input <temp-receipt.json> --json`],
          artifacts: [{ label: "supervision-receipt", path: input }],
          outputs: {
            guard: definition.guard,
            command,
            expected_action: definition.expected_action,
            actual_action: payload.recommended_action,
            expected_exit: definition.expected_exit,
            issue_codes: issueCodes,
            task_action_views: taskActionViews,
            safety_lock_views: safetyLockViews,
            forbidden_actions: definition.forbidden_actions ?? [],
            comparison_baselines: caseBank.comparison_baselines,
            does_not_prove: definition.does_not_prove,
          },
          replacements,
        };
      } finally {
        cleanupTempDir(tempDir, context.keepTemp);
      }
    },
  })),
};
