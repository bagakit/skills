import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

type JsonRecord = Record<string, unknown>;

const rootIndex = process.argv.indexOf("--root");
const repoRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1] ?? ".") : process.cwd();
const cli = path.join(repoRoot, "skills", "harness", "bagakit-supervisor", "scripts", "supervision_check.ts");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bagakit-supervisor-check-"));

function artifact(ref = "artifacts/result.md", identity = "sha256:result-v1"): JsonRecord {
  return { ref, identity, evidence_refs: [`host://artifact/${identity.slice(7)}`] };
}

function failure(overrides: JsonRecord = {}): JsonRecord {
  return {
    cause: "none",
    scope: "none",
    effect_state: "not_applicable",
    authority_state: "current",
    domain: "",
    evidence_refs: [],
    ...overrides,
  };
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
    run_id: "gate-case",
    objective: "Produce an accepted artifact.",
    route: { topology: "delegated", assurance: "standard", lifecycle: "normal" },
    run_status: "active",
    owner_snapshot: { ref: "host-task://gate-case", revision: "rev-1", evidence_refs: ["host://owner/rev-1"] },
    authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: false },
    budgets: {
      spawn_max: 4,
      spawn_used: 1,
      observation_max: 4,
      observation_used: 0,
      intervention_max: 2,
      intervention_used: 0,
      restart_max: 2,
      restart_used: 0,
      human_gate_max: 1,
      human_gate_used: 0,
    },
    circuits: [],
    tasks: [task()],
    checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Continue from current owner state.", terminal: false },
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function run(value: JsonRecord, command: "inspect" | "decide" | "validate", final = false): { status: number; payload: JsonRecord } {
  const input = path.join(tempRoot, `${command}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(input, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", cli, command, "--input", input, "--json", ...(final ? ["--final"] : [])], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.signal, null, result.stderr);
  assert.notEqual(result.stdout.trim(), "", result.stderr);
  return { status: result.status ?? 2, payload: JSON.parse(result.stdout) as JsonRecord };
}

function issues(payload: JsonRecord): string[] {
  return Array.isArray(payload.issues) ? payload.issues.map((issue) => String((issue as JsonRecord).code)) : [];
}

function action(payload: JsonRecord): string {
  return String(payload.recommended_action);
}

interface ActionView {
  task_id: string;
  action: string;
}

interface DecisionCase {
  id: string;
  value: JsonRecord;
  expectedStatus: number;
  expectedAction: string;
  expectedTaskActions: ActionView[];
  expectedSafetyLocks: ActionView[];
  forbiddenActions: string[];
  expectedIssues?: string[];
}

interface FinalValidationCase {
  id: string;
  value: JsonRecord;
  expectedStatus: number;
  expectedIssues: string[];
}

function actionViews(payload: JsonRecord, field: "task_actions" | "safety_locks"): ActionView[] {
  const entries = Array.isArray(payload[field]) ? payload[field] as JsonRecord[] : [];
  return entries.map((entry) => ({ task_id: String(entry.task_id), action: String(entry.action) }));
}

function sortedIssues(payload: JsonRecord): string[] {
  return [...issues(payload)].sort();
}

function assertDecisionCase(definition: DecisionCase): void {
  const result = run(definition.value, "decide");
  assert.equal(result.status, definition.expectedStatus, `${definition.id}: unexpected exit status\n${JSON.stringify(result.payload, null, 2)}`);
  assert.equal(action(result.payload), definition.expectedAction, `${definition.id}: unexpected recommended action`);
  assert.deepEqual(actionViews(result.payload, "task_actions"), definition.expectedTaskActions, `${definition.id}: task action projection changed`);
  assert.deepEqual(actionViews(result.payload, "safety_locks"), definition.expectedSafetyLocks, `${definition.id}: safety-lock order changed`);
  if (definition.expectedIssues) assert.deepEqual(sortedIssues(result.payload), [...definition.expectedIssues].sort(), `${definition.id}: issue set changed`);
  const emitted = new Set([
    action(result.payload),
    ...actionViews(result.payload, "task_actions").map((entry) => entry.action),
    ...actionViews(result.payload, "safety_locks").map((entry) => entry.action),
  ]);
  for (const forbidden of definition.forbiddenActions) assert.ok(!emitted.has(forbidden), `${definition.id}: emitted forbidden action ${forbidden}`);
}

function assertFinalValidationCase(definition: FinalValidationCase): void {
  const result = run(definition.value, "validate", true);
  assert.equal(result.status, definition.expectedStatus, `${definition.id}: unexpected final-validation exit\n${JSON.stringify(result.payload, null, 2)}`);
  assert.deepEqual(sortedIssues(result.payload), [...definition.expectedIssues].sort(), `${definition.id}: final-validation issue set changed`);
}

function makeFinal(): JsonRecord {
  const value = receipt({ run_status: "complete" });
  const selected = (value.tasks as JsonRecord[])[0];
  const current = (selected.attempts as JsonRecord[])[0];
  const resultArtifact = artifact();
  selected.status = "complete";
  selected.next_observation_condition = "";
  current.status = "succeeded";
  current.artifacts = [resultArtifact];
  current.evidence_refs = ["host://attempt/attempt-1/succeeded"];
  selected.verification = { target_attempt_id: "attempt-1", status: "pass", artifacts: [clone(resultArtifact)], evidence_refs: ["host://verification/result-v1"] };
  selected.acceptance_evidence = ["owner://acceptance/task-1/result-v1"];
  value.checkpoint = {
    accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-1" }],
    unresolved_findings: [],
    stale_attempt_ids: [],
    next_safe_action: "Owner may return the accepted result.",
    terminal: true,
  };
  return value;
}

function review(
  reviewId: string,
  verdict: "pass" | "advisory" | "blocking",
  targetArtifact: JsonRecord,
  overrides: JsonRecord = {},
): JsonRecord {
  return {
    review_id: reviewId,
    reviewer_id: "reviewer-1",
    target_attempt_id: "attempt-1",
    target_artifacts: [clone(targetArtifact)],
    verdict,
    finding_refs: verdict === "blocking" ? [`reviews/${reviewId}.md`] : [],
    evidence_refs: [`host://review/${reviewId}`],
    source_identity: { before: `sha256:${reviewId}-scope`, after: `sha256:${reviewId}-scope`, evidence_refs: [`host://snapshot/${reviewId}`] },
    ...overrides,
  };
}

function retainedSafetyReceipt(kind: "effect" | "applied" | "authority" | "scope", final: boolean): JsonRecord {
  const value = makeFinal();
  const selected = (value.tasks as JsonRecord[])[0];
  const retainedFailure = kind === "effect"
    ? failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", authority_state: "fenced", domain: "payments", evidence_refs: ["external://payment/readback-pending"] })
    : kind === "applied"
      ? failure({ cause: "logic_defect", scope: "lane", effect_state: "known_applied", authority_state: "fenced", domain: "payments", evidence_refs: ["external://payment/applied"] })
      : kind === "authority"
      ? failure({ cause: "logic_defect", scope: "lane", effect_state: "known_not_applied", authority_state: "ambiguous", domain: "payments", evidence_refs: ["host://authority/ambiguous"] })
      : failure({ cause: "logic_defect", scope: "unknown", effect_state: "known_not_applied", authority_state: "fenced", domain: "payments", evidence_refs: ["host://failure/scope-unknown"] });
  const historical = attempt({
    attempt_id: "attempt-old",
    worker_id: "worker-old",
    status: "failed",
    failure: retainedFailure,
    authority_evidence_refs: ["host://authority/attempt-old"],
  });
  selected.attempts = [historical, ...(selected.attempts as JsonRecord[])];
  (value.budgets as JsonRecord).spawn_used = 2;
  (value.budgets as JsonRecord).restart_used = 1;
  if (!final) {
    value.run_status = "active";
    (value.checkpoint as JsonRecord).terminal = false;
    (value.checkpoint as JsonRecord).next_safe_action = "Resolve retained safety state before dependent work.";
    const dependent = task({
      task_id: "task-2",
      objective: "Consume the accepted result only after safety resolution.",
      status: "ready",
      depends_on: ["task-1"],
      mutation_boundary: ["dependent/"],
      required_artifacts: ["dependent/result.md"],
      current_attempt_id: "",
      attempts: [],
      next_observation_condition: "",
    });
    value.tasks = [selected, dependent];
  }
  return value;
}

function circuitReceipt(open: boolean): JsonRecord {
  const failed = task({
    task_id: "task-fault",
    status: "running",
    current_attempt_id: "attempt-fault",
    attempts: [attempt({
      attempt_id: "attempt-fault",
      worker_id: "worker-fault",
      status: "failed",
      failure: failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "known_not_applied", domain: "provider-a", evidence_refs: ["host://provider-a/fault"] }),
    })],
  });
  const sibling = task({ task_id: "task-sibling", status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" });
  const independent = task({
    task_id: "task-independent",
    execution_domain: "provider-b",
    status: "ready",
    mutation_boundary: ["independent/"],
    required_artifacts: ["independent/result.md"],
    current_attempt_id: "",
    attempts: [],
    next_observation_condition: "",
  });
  return receipt({
    authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
    circuits: open ? [{ domain: "provider-a", status: "open", reason: "shared provider incident", evidence_refs: ["host://provider-a/circuit"] }] : [],
    tasks: [failed, sibling, independent],
  });
}

function blockingIdentityReceipt(changed: boolean): JsonRecord {
  const value = makeFinal();
  value.route = { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" };
  value.authority = { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false };
  const selected = (value.tasks as JsonRecord[])[0];
  selected.requires_review = true;
  const current = (selected.attempts as JsonRecord[])[0];
  const blockedArtifact = artifact("artifacts/result.md", "sha256:blocked-v1");
  const repairedArtifact = changed ? artifact("artifacts/result.md", "sha256:repaired-v2") : clone(blockedArtifact);
  current.artifacts = [clone(repairedArtifact)];
  selected.verification = { target_attempt_id: "attempt-1", status: "pass", artifacts: [clone(repairedArtifact)], evidence_refs: ["host://verification/repaired"] };
  selected.reviews = [
    review("review-blocking", "blocking", blockedArtifact),
    review("review-pass", "pass", repairedArtifact),
  ];
  (value.checkpoint as JsonRecord).accepted_artifacts = [{ ref: "artifacts/result.md", identity: String(repairedArtifact.identity), attempt_id: "attempt-1" }];
  if (!changed) {
    value.run_status = "active";
    selected.status = "needs_repair";
    selected.acceptance_evidence = [];
    (value.checkpoint as JsonRecord).accepted_artifacts = [];
    (value.checkpoint as JsonRecord).terminal = false;
  }
  return value;
}

function staleVerificationReceipt(final: boolean): JsonRecord {
  const value = makeFinal();
  const selected = (value.tasks as JsonRecord[])[0];
  const oldArtifact = artifact("artifacts/result.md", "sha256:old-v1");
  const currentArtifact = artifact("artifacts/result.md", "sha256:current-v2");
  const oldAttempt = attempt({
    attempt_id: "attempt-old",
    worker_id: "worker-old",
    status: "succeeded",
    failure: failure({ authority_state: "fenced" }),
    artifacts: [clone(oldArtifact)],
    evidence_refs: ["host://attempt/attempt-old/succeeded"],
    authority_evidence_refs: ["host://fence/attempt-old"],
  });
  const currentAttempt = attempt({
    attempt_id: "attempt-current",
    worker_id: "worker-current",
    status: "succeeded",
    artifacts: [clone(currentArtifact)],
    evidence_refs: ["host://attempt/attempt-current/succeeded"],
    authority_evidence_refs: ["host://capability/attempt-current"],
  });
  selected.current_attempt_id = "attempt-current";
  selected.attempts = [oldAttempt, currentAttempt];
  selected.verification = { target_attempt_id: "attempt-old", status: "pass", artifacts: [clone(oldArtifact)], evidence_refs: ["host://verification/old-v1"] };
  selected.acceptance_evidence = ["owner://acceptance/current-v2"];
  value.authority = { integration_writer: "worker-current", reviewers: [], allow_parallel_writers: false };
  value.budgets = { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 };
  value.checkpoint = {
    accepted_artifacts: [{ ref: "artifacts/result.md", identity: "sha256:current-v2", attempt_id: "attempt-current" }],
    unresolved_findings: [],
    stale_attempt_ids: ["attempt-old"],
    next_safe_action: final ? "Reject stale verification before close." : "Verify the current identity.",
    terminal: final,
  };
  value.run_status = final ? "complete" : "active";
  selected.status = final ? "complete" : "needs_repair";
  return value;
}

try {
  const template = path.join(repoRoot, "skills", "harness", "bagakit-supervisor", "assets", "supervision-receipt.template.json");
  const templateResult = spawnSync(process.execPath, ["--experimental-strip-types", cli, "validate", "--input", template, "--json"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(templateResult.status, 0, templateResult.stderr || templateResult.stdout);

  const direct = receipt({
    route: { topology: "single_agent", assurance: "standard", lifecycle: "normal" },
    authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 0, spawn_used: 0, observation_max: 1, observation_used: 0, intervention_max: 0, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
    tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })],
  });
  assert.equal(action(run(direct, "decide").payload), "execute_direct");

  const directRunning = receipt({
    route: { topology: "single_agent", assurance: "standard", lifecycle: "normal" },
    authority: { integration_writer: "host-agent-7", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 0, spawn_used: 0, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
    tasks: [task({ attempts: [attempt({ worker_id: "host-agent-7" })] })],
  });
  const directRunningResult = run(directRunning, "decide");
  assert.equal(directRunningResult.status, 0);
  assert.equal(action(directRunningResult.payload), "observe_on_next_condition");
  assert.ok(!issues(directRunningResult.payload).includes("route.single_worker"));

  const directFinal = makeFinal();
  directFinal.route = { topology: "single_agent", assurance: "standard", lifecycle: "normal" };
  directFinal.authority = { integration_writer: "host-agent-7", reviewers: [], allow_parallel_writers: false };
  directFinal.budgets = { spawn_max: 0, spawn_used: 0, observation_max: 2, observation_used: 1, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 };
  (((directFinal.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).worker_id = "host-agent-7";
  const directFinalResult = run(directFinal, "validate", true);
  assert.equal(directFinalResult.status, 0);
  assert.ok(!issues(directFinalResult.payload).includes("route.single_worker"));

  const validFinal = makeFinal();
  assert.equal(run(validFinal, "validate", true).status, 0);

  const falseCompleteRun = receipt({
    run_status: "complete",
    authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 2, spawn_used: 0, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
    tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })],
    checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Reject the false completion claim.", terminal: true },
  });

  const cancelledLiveOptional = receipt({
    run_status: "complete",
    authority: { integration_writer: "worker-optional", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 2, spawn_used: 1, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
    tasks: [task({
      task_id: "task-optional",
      required: false,
      status: "cancelled",
      current_attempt_id: "attempt-optional",
      attempts: [attempt({ attempt_id: "attempt-optional", worker_id: "worker-optional" })],
    })],
    checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: [], next_safe_action: "Fence the cancelled writer.", terminal: true },
  });

  const knownApplied = receipt();
  (((knownApplied.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "failed";
  (((knownApplied.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).failure = failure({ cause: "transient_transport", scope: "lane", effect_state: "known_applied", domain: "payments", evidence_refs: ["external://payment/committed"] });

  const retainedAppliedRetry = receipt({
    authority: { integration_writer: "worker-2", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
    checkpoint: { accepted_artifacts: [], unresolved_findings: [], stale_attempt_ids: ["attempt-old"], next_safe_action: "Reconcile the applied effect before another attempt.", terminal: false },
  });
  (retainedAppliedRetry.tasks as JsonRecord[])[0] = task({
    status: "needs_repair",
    current_attempt_id: "attempt-2",
    attempts: [
      attempt({ attempt_id: "attempt-old", worker_id: "worker-old", status: "failed", failure: failure({ cause: "logic_defect", scope: "lane", effect_state: "known_applied", authority_state: "fenced", domain: "payments", evidence_refs: ["external://payment/applied"] }), authority_evidence_refs: ["host://fence/attempt-old"] }),
      attempt({ attempt_id: "attempt-2", worker_id: "worker-2", status: "failed", failure: failure({ cause: "transient_transport", scope: "lane", effect_state: "known_not_applied", authority_state: "current", domain: "payments", evidence_refs: ["external://payment/not-applied"] }), authority_evidence_refs: ["host://capability/attempt-2"] }),
    ],
  });

  const scopeNone = receipt();
  (((scopeNone.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "failed";
  (((scopeNone.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).failure = failure({ cause: "logic_defect", scope: "none", effect_state: "known_not_applied", evidence_refs: ["host://failure/unscoped"] });

  const singleWriterMismatch = receipt({ authority: { integration_writer: "worker-ghost", reviewers: [], allow_parallel_writers: false } });

  const parallelWriterMismatch = receipt({
    authority: { integration_writer: "worker-ghost", reviewers: [], allow_parallel_writers: true },
    budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
  });
  const parallelSecond = task({
    task_id: "task-2",
    objective: "Produce the isolated second artifact.",
    execution_domain: "provider-b",
    mutation_boundary: ["second/"],
    required_artifacts: ["second/result.md"],
    current_attempt_id: "attempt-2",
    attempts: [attempt({ attempt_id: "attempt-2", worker_id: "worker-2", write_root: "second/", authority_evidence_refs: ["host://capability/attempt-2"] })],
  });
  parallelWriterMismatch.tasks = [...(parallelWriterMismatch.tasks as JsonRecord[]), parallelSecond];

  const parallelAliasWriters = receipt({
    authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: true },
    budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
  });
  const aliasSecond = task({
    task_id: "task-2",
    mutation_boundary: ["./artifacts/"],
    required_artifacts: ["./artifacts/result.md"],
    current_attempt_id: "attempt-2",
    attempts: [attempt({ attempt_id: "attempt-2", worker_id: "worker-2", write_root: "./artifacts/", authority_evidence_refs: ["host://capability/attempt-2"] })],
  });
  parallelAliasWriters.tasks = [...(parallelAliasWriters.tasks as JsonRecord[]), aliasSecond];

  const ambiguousAuthoritySibling = receipt();
  (((ambiguousAuthoritySibling.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).failure = failure({ authority_state: "ambiguous", evidence_refs: ["host://authority/ambiguous"] });
  ambiguousAuthoritySibling.tasks = [...(ambiguousAuthoritySibling.tasks as JsonRecord[]), task({ task_id: "task-2", status: "ready", mutation_boundary: ["second/"], required_artifacts: ["second/result.md"], current_attempt_id: "", attempts: [], next_observation_condition: "" })];

  const unknownScopeSibling = receipt();
  (((unknownScopeSibling.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "failed";
  (((unknownScopeSibling.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).failure = failure({ cause: "logic_defect", scope: "unknown", effect_state: "known_not_applied", evidence_refs: ["host://failure/scope-unknown"] });
  unknownScopeSibling.tasks = [...(unknownScopeSibling.tasks as JsonRecord[]), task({ task_id: "task-2", status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })];

  const succeededWriterMismatch = receipt({ authority: { integration_writer: "worker-ghost", reviewers: [], allow_parallel_writers: false } });
  (((succeededWriterMismatch.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "succeeded";

  const missingObservationPredicate = receipt();
  (missingObservationPredicate.tasks as JsonRecord[])[0].next_observation_condition = "";

  const interventionBudget = receipt({
    budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 0, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
    tasks: [task({ drift: { status: "confirmed", kind: "scope", evidence_refs: ["host://drift/scope"] } })],
  });

  const authorityDriftAtBudget = receipt({
    budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 0, intervention_used: 0, restart_max: 2, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
    tasks: [task({ drift: { status: "confirmed", kind: "authority", evidence_refs: ["host://drift/authority"] } })],
  });

  const restartBudget = receipt({
    budgets: { spawn_max: 4, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 1, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
  });
  (((restartBudget.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "failed";
  (((restartBudget.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).failure = failure({ cause: "transient_transport", scope: "lane", effect_state: "known_not_applied", evidence_refs: ["host://transport/failure"] });

  const spawnBudget = receipt({
    authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 1, spawn_used: 1, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 1, human_gate_used: 0 },
    tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })],
  });

  const exclusiveWriterOccupied = receipt();
  exclusiveWriterOccupied.tasks = [...(exclusiveWriterOccupied.tasks as JsonRecord[]), task({
    task_id: "task-2",
    objective: "Produce a second artifact after exclusive writer authority is released.",
    execution_domain: "provider-b",
    status: "ready",
    mutation_boundary: ["second/"],
    required_artifacts: ["second/result.md"],
    current_attempt_id: "",
    attempts: [],
    next_observation_condition: "",
  })];

  const blockingRepairBudget = blockingIdentityReceipt(false);
  blockingRepairBudget.budgets = { spawn_max: 1, spawn_used: 1, observation_max: 1, observation_used: 0, intervention_max: 0, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 };

  const reviewerSpawnBudget = makeFinal();
  reviewerSpawnBudget.run_status = "active";
  reviewerSpawnBudget.route = { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" };
  reviewerSpawnBudget.authority = { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false };
  reviewerSpawnBudget.budgets = { spawn_max: 1, spawn_used: 1, observation_max: 1, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 };
  (reviewerSpawnBudget.checkpoint as JsonRecord).terminal = false;
  const reviewerTask = (reviewerSpawnBudget.tasks as JsonRecord[])[0];
  reviewerTask.status = "needs_repair";
  reviewerTask.requires_review = true;
  reviewerTask.reviews = [];
  reviewerTask.acceptance_evidence = [];

  const unknownEffectWithUnrelatedError = receipt({ owner_snapshot: { ref: "host-task://gate-case", revision: "rev-1", evidence_refs: [] } });
  (((unknownEffectWithUnrelatedError.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "failed";
  (((unknownEffectWithUnrelatedError.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", domain: "payments", evidence_refs: ["external://refund/readback-pending"] });

  const auditSynthesisOverlap = receipt({
    route: { topology: "delegated", assurance: "audit", lifecycle: "normal" },
    authority: { integration_writer: "worker-synthesis", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 3, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 1, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
    tasks: [
      task({
        task_id: "task-audit",
        objective: "Audit the protected modules.",
        mutation_boundary: [],
        source_scope: ["modules/"],
        required_artifacts: [],
        current_attempt_id: "attempt-audit",
        attempts: [attempt({ attempt_id: "attempt-audit", worker_id: "auditor-1", role: "auditor", write_root: "", source_identity: { before: "sha256:modules-v1", after: "", evidence_refs: ["host://snapshot/modules-v1"] } })],
      }),
      task({
        task_id: "task-synthesis",
        objective: "Synthesize the audit without touching protected source.",
        execution_domain: "provider-b",
        mutation_boundary: ["modules/report/"],
        required_artifacts: ["modules/report/result.md"],
        current_attempt_id: "attempt-synthesis",
        attempts: [attempt({ attempt_id: "attempt-synthesis", worker_id: "worker-synthesis", write_root: "modules/report/", authority_evidence_refs: ["host://capability/attempt-synthesis"] })],
      }),
    ],
  });

  const decisionCases: DecisionCase[] = [
    {
      id: "retained-unknown-effect-blocks-dependent",
      value: retainedSafetyReceipt("effect", false),
      expectedStatus: 1,
      expectedAction: "inspect_side_effect",
      expectedTaskActions: [{ task_id: "task-1", action: "inspect_side_effect" }, { task_id: "task-2", action: "wait_dependency" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "inspect_side_effect" }],
      forbiddenActions: ["dispatch_task", "retry_attempt", "report_task_ready"],
      expectedIssues: ["close.external_effect_missing"],
    },
    {
      id: "retained-ambiguous-authority-blocks-dependent",
      value: retainedSafetyReceipt("authority", false),
      expectedStatus: 1,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "task-1", action: "freeze_and_rebind" }, { task_id: "task-2", action: "wait_dependency" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "freeze_and_rebind" }],
      forbiddenActions: ["dispatch_task", "retry_attempt", "report_task_ready"],
      expectedIssues: ["close.authority_missing"],
    },
    {
      id: "retained-known-applied-blocks-replay-and-dependent",
      value: retainedSafetyReceipt("applied", false),
      expectedStatus: 1,
      expectedAction: "reconcile_owner_state",
      expectedTaskActions: [{ task_id: "task-1", action: "reconcile_owner_state" }, { task_id: "task-2", action: "wait_dependency" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "reconcile_owner_state" }],
      forbiddenActions: ["dispatch_task", "retry_attempt", "restart_dependency_cone", "report_task_ready"],
      expectedIssues: ["close.effect_reconciliation_missing"],
    },
    {
      id: "retained-unknown-scope-blocks-dependent",
      value: retainedSafetyReceipt("scope", false),
      expectedStatus: 1,
      expectedAction: "inspect_failure_scope",
      expectedTaskActions: [{ task_id: "task-1", action: "inspect_failure_scope" }, { task_id: "task-2", action: "wait_dependency" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "inspect_failure_scope" }],
      forbiddenActions: ["dispatch_task", "restart_dependency_cone", "report_task_ready"],
      expectedIssues: ["close.failure_scope_missing"],
    },
    {
      id: "new-circuit-blocks-sibling-before-independent-dispatch",
      value: circuitReceipt(false),
      expectedStatus: 0,
      expectedAction: "circuit_break_and_wait",
      expectedTaskActions: [{ task_id: "task-fault", action: "circuit_break_and_wait" }, { task_id: "task-sibling", action: "hold_open_circuit" }, { task_id: "task-independent", action: "dispatch_task" }],
      expectedSafetyLocks: [{ task_id: "task-fault", action: "circuit_break_and_wait" }, { task_id: "task-sibling", action: "hold_open_circuit" }],
      forbiddenActions: ["retry_attempt"],
      expectedIssues: ["circuit.not_open"],
    },
    {
      id: "open-circuit-holds-all-domain-siblings",
      value: circuitReceipt(true),
      expectedStatus: 0,
      expectedAction: "hold_open_circuit",
      expectedTaskActions: [{ task_id: "task-fault", action: "hold_open_circuit" }, { task_id: "task-sibling", action: "hold_open_circuit" }, { task_id: "task-independent", action: "dispatch_task" }],
      expectedSafetyLocks: [{ task_id: "task-fault", action: "hold_open_circuit" }, { task_id: "task-sibling", action: "hold_open_circuit" }],
      forbiddenActions: ["retry_attempt", "circuit_break_and_wait"],
      expectedIssues: [],
    },
    {
      id: "owner-false-completion-preempts-dispatch",
      value: falseCompleteRun,
      expectedStatus: 1,
      expectedAction: "block_false_completion",
      expectedTaskActions: [{ task_id: "", action: "block_false_completion" }],
      expectedSafetyLocks: [{ task_id: "", action: "block_false_completion" }],
      forbiddenActions: ["dispatch_task", "execute_direct", "report_run_ready"],
      expectedIssues: ["run.false_completion"],
    },
    {
      id: "cancelled-live-optional-freezes-and-blocks-close",
      value: cancelledLiveOptional,
      expectedStatus: 1,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "task-optional", action: "freeze_and_rebind" }, { task_id: "", action: "block_false_completion" }],
      expectedSafetyLocks: [{ task_id: "task-optional", action: "freeze_and_rebind" }, { task_id: "", action: "block_false_completion" }],
      forbiddenActions: ["no_action", "report_run_ready"],
      expectedIssues: ["authority.cancelled_writer_active"],
    },
    {
      id: "known-applied-effect-reconciles-without-retry",
      value: knownApplied,
      expectedStatus: 0,
      expectedAction: "reconcile_owner_state",
      expectedTaskActions: [{ task_id: "task-1", action: "reconcile_owner_state" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "reconcile_owner_state" }],
      forbiddenActions: ["retry_attempt", "repair_with_method_change", "restart_dependency_cone"],
      expectedIssues: [],
    },
    {
      id: "retained-known-applied-preempts-new-transient-retry",
      value: retainedAppliedRetry,
      expectedStatus: 0,
      expectedAction: "reconcile_owner_state",
      expectedTaskActions: [{ task_id: "task-1", action: "reconcile_owner_state" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "reconcile_owner_state" }],
      forbiddenActions: ["retry_attempt", "repair_with_method_change", "restart_dependency_cone"],
      expectedIssues: [],
    },
    {
      id: "failed-scope-none-forces-scope-inspection",
      value: scopeNone,
      expectedStatus: 1,
      expectedAction: "inspect_failure_scope",
      expectedTaskActions: [{ task_id: "task-1", action: "inspect_failure_scope" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "inspect_failure_scope" }],
      forbiddenActions: ["repair_with_method_change", "retry_attempt", "restart_dependency_cone"],
      expectedIssues: ["failure.scope_missing"],
    },
    {
      id: "blocking-pass-on-same-identity-still-repairs",
      value: blockingIdentityReceipt(false),
      expectedStatus: 0,
      expectedAction: "repair_then_reverify",
      expectedTaskActions: [{ task_id: "task-1", action: "repair_then_reverify" }],
      expectedSafetyLocks: [],
      forbiddenActions: ["report_task_ready", "no_action"],
      expectedIssues: ["review.repair_identity_unchanged"],
    },
    {
      id: "blocking-pass-on-changed-identity-can-close",
      value: blockingIdentityReceipt(true),
      expectedStatus: 0,
      expectedAction: "no_action",
      expectedTaskActions: [],
      expectedSafetyLocks: [],
      forbiddenActions: ["repair_then_reverify", "block_false_completion"],
      expectedIssues: [],
    },
    {
      id: "stale-verification-cannot-be-treated-as-current",
      value: staleVerificationReceipt(false),
      expectedStatus: 1,
      expectedAction: "repair_receipt",
      expectedTaskActions: [],
      expectedSafetyLocks: [],
      forbiddenActions: ["report_task_ready", "report_run_ready"],
      expectedIssues: ["verification.target_not_current"],
    },
    {
      id: "single-running-writer-mismatch-freezes",
      value: singleWriterMismatch,
      expectedStatus: 1,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "", action: "freeze_and_rebind" }],
      expectedSafetyLocks: [{ task_id: "", action: "freeze_and_rebind" }],
      forbiddenActions: ["observe_on_next_condition"],
      expectedIssues: ["authority.writer_mismatch"],
    },
    {
      id: "parallel-writer-integration-mismatch-freezes",
      value: parallelWriterMismatch,
      expectedStatus: 1,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "", action: "freeze_and_rebind" }],
      expectedSafetyLocks: [{ task_id: "", action: "freeze_and_rebind" }],
      forbiddenActions: ["observe_on_next_condition"],
      expectedIssues: ["authority.integration_writer_not_current"],
    },
    {
      id: "authorized-parallel-writer-overlap-continues",
      value: parallelAliasWriters,
      expectedStatus: 0,
      expectedAction: "observe_on_next_condition",
      expectedTaskActions: [{ task_id: "task-1", action: "observe_on_next_condition" }, { task_id: "task-2", action: "observe_on_next_condition" }],
      expectedSafetyLocks: [],
      forbiddenActions: ["freeze_and_rebind"],
      expectedIssues: [],
    },
    {
      id: "ambiguous-authority-blocks-secondary-writer-dispatch",
      value: ambiguousAuthoritySibling,
      expectedStatus: 1,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "task-1", action: "freeze_and_rebind" }, { task_id: "task-2", action: "wait_owner_transition" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "freeze_and_rebind" }],
      forbiddenActions: ["dispatch_task", "retry_attempt"],
      expectedIssues: ["authority.current_attempt_not_current"],
    },
    {
      id: "unknown-scope-blocks-same-domain-sibling-dispatch",
      value: unknownScopeSibling,
      expectedStatus: 0,
      expectedAction: "inspect_failure_scope",
      expectedTaskActions: [{ task_id: "task-1", action: "inspect_failure_scope" }, { task_id: "task-2", action: "inspect_failure_scope" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "inspect_failure_scope" }, { task_id: "task-2", action: "inspect_failure_scope" }],
      forbiddenActions: ["dispatch_task", "repair_with_method_change"],
      expectedIssues: [],
    },
    {
      id: "succeeded-writer-integration-mismatch-freezes",
      value: succeededWriterMismatch,
      expectedStatus: 1,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "", action: "freeze_and_rebind" }],
      expectedSafetyLocks: [{ task_id: "", action: "freeze_and_rebind" }],
      forbiddenActions: ["report_task_ready"],
      expectedIssues: ["authority.integration_writer_not_current"],
    },
    {
      id: "missing-observation-predicate-requires-evidence",
      value: missingObservationPredicate,
      expectedStatus: 0,
      expectedAction: "require_evidence",
      expectedTaskActions: [{ task_id: "task-1", action: "require_evidence" }],
      expectedSafetyLocks: [],
      forbiddenActions: ["observe_on_next_condition"],
      expectedIssues: ["observation.next_condition_missing"],
    },
    {
      id: "intervention-budget-stops-new-steer",
      value: interventionBudget,
      expectedStatus: 0,
      expectedAction: "checkpoint_and_stop",
      expectedTaskActions: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      forbiddenActions: ["steer_to_boundary"],
      expectedIssues: [],
    },
    {
      id: "authority-drift-preempts-intervention-budget",
      value: authorityDriftAtBudget,
      expectedStatus: 0,
      expectedAction: "freeze_and_rebind",
      expectedTaskActions: [{ task_id: "task-1", action: "freeze_and_rebind" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "freeze_and_rebind" }],
      forbiddenActions: ["checkpoint_and_stop", "steer_to_boundary"],
      expectedIssues: [],
    },
    {
      id: "restart-budget-stops-transient-retry",
      value: restartBudget,
      expectedStatus: 0,
      expectedAction: "checkpoint_and_stop",
      expectedTaskActions: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      forbiddenActions: ["retry_attempt"],
      expectedIssues: [],
    },
    {
      id: "spawn-budget-stops-ready-dispatch",
      value: spawnBudget,
      expectedStatus: 0,
      expectedAction: "checkpoint_and_stop",
      expectedTaskActions: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      forbiddenActions: ["dispatch_task"],
      expectedIssues: [],
    },
    {
      id: "exclusive-writer-occupancy-blocks-second-dispatch",
      value: exclusiveWriterOccupied,
      expectedStatus: 0,
      expectedAction: "observe_on_next_condition",
      expectedTaskActions: [{ task_id: "task-1", action: "observe_on_next_condition" }, { task_id: "task-2", action: "wait_owner_transition" }],
      expectedSafetyLocks: [],
      forbiddenActions: ["dispatch_task"],
      expectedIssues: [],
    },
    {
      id: "blocking-repair-budget-exhaustion-stops-mutation",
      value: blockingRepairBudget,
      expectedStatus: 0,
      expectedAction: "checkpoint_and_stop",
      expectedTaskActions: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      forbiddenActions: ["repair_then_reverify", "dispatch_reviewer"],
      expectedIssues: ["review.repair_identity_unchanged"],
    },
    {
      id: "reviewer-spawn-budget-exhaustion-stops-dispatch",
      value: reviewerSpawnBudget,
      expectedStatus: 0,
      expectedAction: "checkpoint_and_stop",
      expectedTaskActions: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "checkpoint_and_stop" }],
      forbiddenActions: ["dispatch_reviewer"],
      expectedIssues: [],
    },
    {
      id: "unknown-effect-survives-unrelated-receipt-error",
      value: unknownEffectWithUnrelatedError,
      expectedStatus: 1,
      expectedAction: "inspect_side_effect",
      expectedTaskActions: [{ task_id: "task-1", action: "inspect_side_effect" }],
      expectedSafetyLocks: [{ task_id: "task-1", action: "inspect_side_effect" }],
      forbiddenActions: ["repair_receipt", "repair_with_method_change", "retry_attempt"],
      expectedIssues: ["owner.evidence_missing"],
    },
    {
      id: "audit-source-overlap-uses-identity-binding",
      value: auditSynthesisOverlap,
      expectedStatus: 0,
      expectedAction: "observe_on_next_condition",
      expectedTaskActions: [{ task_id: "task-audit", action: "observe_on_next_condition" }, { task_id: "task-synthesis", action: "observe_on_next_condition" }],
      expectedSafetyLocks: [],
      forbiddenActions: ["freeze_and_rebind"],
      expectedIssues: [],
    },
  ];
  for (const definition of decisionCases) assertDecisionCase(definition);

  const finalValidationCases: FinalValidationCase[] = [
    { id: "valid-current-identities", value: makeFinal(), expectedStatus: 0, expectedIssues: [] },
    { id: "retained-unknown-effect", value: retainedSafetyReceipt("effect", true), expectedStatus: 1, expectedIssues: ["close.external_effect_missing"] },
    { id: "retained-known-applied", value: retainedSafetyReceipt("applied", true), expectedStatus: 1, expectedIssues: ["close.effect_reconciliation_missing"] },
    { id: "retained-ambiguous-authority", value: retainedSafetyReceipt("authority", true), expectedStatus: 1, expectedIssues: ["close.authority_missing"] },
    { id: "retained-unknown-scope", value: retainedSafetyReceipt("scope", true), expectedStatus: 1, expectedIssues: ["close.failure_scope_missing"] },
    { id: "false-complete-required-task", value: falseCompleteRun, expectedStatus: 1, expectedIssues: ["final.required_task_open", "run.false_completion"] },
    { id: "cancelled-live-optional", value: cancelledLiveOptional, expectedStatus: 1, expectedIssues: ["authority.cancelled_writer_active"] },
    { id: "blocking-pass-same-identity", value: (() => { const value = blockingIdentityReceipt(false); value.run_status = "complete"; (value.tasks as JsonRecord[])[0].status = "complete"; (value.tasks as JsonRecord[])[0].acceptance_evidence = ["owner://acceptance/task-1"]; (value.checkpoint as JsonRecord).accepted_artifacts = [{ ref: "artifacts/result.md", identity: "sha256:blocked-v1", attempt_id: "attempt-1" }]; (value.checkpoint as JsonRecord).terminal = true; return value; })(), expectedStatus: 1, expectedIssues: ["close.blocking_review_missing", "review.repair_identity_unchanged"] },
    { id: "blocking-pass-changed-identity", value: blockingIdentityReceipt(true), expectedStatus: 0, expectedIssues: [] },
    { id: "stale-verification", value: staleVerificationReceipt(true), expectedStatus: 1, expectedIssues: ["close.verification_missing", "verification.target_not_current"] },
    { id: "succeeded-integration-mismatch", value: (() => { const value = makeFinal(); value.authority = { integration_writer: "worker-ghost", reviewers: [], allow_parallel_writers: false }; return value; })(), expectedStatus: 1, expectedIssues: ["authority.integration_writer_not_current"] },
  ];
  for (const definition of finalValidationCases) assertFinalValidationCase(definition);

  const inspectValue = blockingIdentityReceipt(true);
  const inspectTask = (inspectValue.tasks as JsonRecord[])[0];
  inspectTask.attempts = [attempt({
    attempt_id: "attempt-old",
    worker_id: "worker-old",
    status: "succeeded",
    failure: failure({ authority_state: "fenced" }),
    artifacts: [artifact("artifacts/old.md", "sha256:old-v1")],
    evidence_refs: ["host://attempt/attempt-old/succeeded"],
    authority_evidence_refs: ["host://fence/attempt-old"],
  }), ...(inspectTask.attempts as JsonRecord[])];
  (inspectValue.budgets as JsonRecord).spawn_used = 2;
  (inspectValue.budgets as JsonRecord).restart_used = 1;
  (inspectValue.checkpoint as JsonRecord).stale_attempt_ids = ["attempt-old"];
  const inspectResult = run(inspectValue, "inspect");
  assert.equal(inspectResult.status, 0);
  const inspectedTask = (inspectResult.payload.tasks as JsonRecord[])[0];
  assert.equal(inspectedTask.current_attempt_id, "attempt-1");
  assert.equal((((inspectedTask.attempts as JsonRecord[])[0].failure as JsonRecord).authority_state), "fenced");
  assert.equal((((inspectedTask.attempts as JsonRecord[])[1].artifacts as JsonRecord[])[0].identity), "sha256:repaired-v2");
  assert.deepEqual((inspectedTask.reviews as JsonRecord[]).map((entry) => entry.verdict), ["blocking", "pass"]);
  assert.deepEqual((inspectResult.payload.checkpoint as JsonRecord).stale_attempt_ids, ["attempt-old"]);

  const missingVerification = clone(validFinal);
  (missingVerification.tasks as JsonRecord[])[0].verification = { target_attempt_id: "attempt-1", status: "pass", artifacts: [artifact()], evidence_refs: [] };
  const missingVerificationResult = run(missingVerification, "validate", true);
  assert.equal(missingVerificationResult.status, 1);
  assert.ok(issues(missingVerificationResult.payload).includes("verification.evidence_missing"));

  const ghostReview = clone(validFinal);
  ghostReview.route = { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" };
  ghostReview.authority = { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false };
  (ghostReview.tasks as JsonRecord[])[0].requires_review = true;
  const ghostReviewResult = run(ghostReview, "validate", true);
  assert.equal(ghostReviewResult.status, 1);
  assert.ok(issues(ghostReviewResult.payload).includes("close.review_missing"));

  const reviewedFinal = clone(ghostReview);
  const reviewedTask = (reviewedFinal.tasks as JsonRecord[])[0];
  reviewedTask.reviews = [{
    review_id: "review-1",
    reviewer_id: "reviewer-1",
    target_attempt_id: "attempt-1",
    target_artifacts: [artifact()],
    verdict: "pass",
    finding_refs: [],
    evidence_refs: ["host://review/review-1"],
    source_identity: { before: "sha256:scope-v1", after: "sha256:scope-v1", evidence_refs: ["host://snapshot/review-1"] },
  }];
  assert.equal(run(reviewedFinal, "validate", true).status, 0);

  const movingReview = clone(reviewedFinal);
  (((movingReview.tasks as JsonRecord[])[0].reviews as JsonRecord[])[0].source_identity as JsonRecord).after = "sha256:scope-v2";
  const movingReviewResult = run(movingReview, "validate", true);
  assert.equal(movingReviewResult.status, 1);
  assert.ok(issues(movingReviewResult.payload).includes("review.source_identity_changed"));

  const staleAccepted = clone(validFinal);
  const staleTask = (staleAccepted.tasks as JsonRecord[])[0];
  const oldAttempt = clone((staleTask.attempts as JsonRecord[])[0]);
  oldAttempt.attempt_id = "attempt-old";
  oldAttempt.failure = failure({ authority_state: "fenced" });
  oldAttempt.authority_evidence_refs = ["host://fence/attempt-old"];
  staleTask.attempts = [oldAttempt, (staleTask.attempts as JsonRecord[])[0]];
  (staleAccepted.budgets as JsonRecord).restart_used = 1;
  (staleAccepted.checkpoint as JsonRecord).stale_attempt_ids = ["attempt-old"];
  (staleAccepted.checkpoint as JsonRecord).accepted_artifacts = [{ ref: "artifacts/result.md", identity: "sha256:result-v1", attempt_id: "attempt-old" }];
  const staleAcceptedResult = run(staleAccepted, "validate", true);
  assert.equal(staleAcceptedResult.status, 1);
  assert.ok(issues(staleAcceptedResult.payload).includes("artifact.accepted_not_current"));

  const replacementRace = receipt({
    authority: { integration_writer: "worker-2", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 4, spawn_used: 2, observation_max: 4, observation_used: 0, intervention_max: 2, intervention_used: 0, restart_max: 2, restart_used: 1, human_gate_max: 1, human_gate_used: 0 },
  });
  const replacementTask = (replacementRace.tasks as JsonRecord[])[0];
  const first = (replacementTask.attempts as JsonRecord[])[0];
  const second = attempt({ attempt_id: "attempt-2", worker_id: "worker-2", authority_evidence_refs: ["host://capability/attempt-2"] });
  replacementTask.current_attempt_id = "attempt-2";
  replacementTask.attempts = [first, second];
  const raceDecision = run(replacementRace, "decide");
  assert.equal(action(raceDecision.payload), "freeze_and_rebind");
  assert.ok(issues(raceDecision.payload).includes("attempt.replacement_unfenced"));

  first.failure = failure({ authority_state: "fenced" });
  first.authority_evidence_refs = ["host://fence/attempt-1"];
  (replacementRace.checkpoint as JsonRecord).stale_attempt_ids = ["attempt-1"];
  assert.equal(action(run(replacementRace, "decide").payload), "observe_on_next_condition");

  first.status = "failed";
  first.failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", authority_state: "fenced", domain: "payments", evidence_refs: ["external://payment/timeout"] });
  assert.equal(action(run(replacementRace, "decide").payload), "inspect_side_effect");
  first.failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "known_not_applied", authority_state: "fenced", domain: "payments", evidence_refs: ["external://payment/readback"] });

  const providerFailure = receipt();
  const providerAttempt = (((providerFailure.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
  providerAttempt.status = "failed";
  providerAttempt.failure = failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "known_not_applied", domain: "provider-a", evidence_refs: ["host://provider-a/failure"] });
  const missingCircuit = run(providerFailure, "validate");
  assert.equal(missingCircuit.status, 0);
  assert.ok(issues(missingCircuit.payload).includes("circuit.not_open"));
  assert.equal(action(run(providerFailure, "decide").payload), "circuit_break_and_wait");
  providerFailure.circuits = [{ domain: "provider-a", status: "open", reason: "shared authentication failure", evidence_refs: ["host://provider-a/incident"] }];
  assert.equal(action(run(providerFailure, "decide").payload), "hold_open_circuit");

  const providerUnknownEffect = receipt();
  const providerUnknownAttempt = (((providerUnknownEffect.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
  providerUnknownAttempt.status = "failed";
  providerUnknownAttempt.failure = failure({ cause: "provider_fault", scope: "shared_domain", effect_state: "unknown", domain: "provider-a", evidence_refs: ["external://provider-a/timeout"] });
  assert.equal(action(run(providerUnknownEffect, "decide").payload), "inspect_side_effect");

  const unknownEffect = receipt();
  const unknownAttempt = (((unknownEffect.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
  unknownAttempt.status = "failed";
  unknownAttempt.failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", domain: "payments", evidence_refs: ["external://refund/timeout"] });
  assert.equal(action(run(unknownEffect, "decide").payload), "inspect_side_effect");

  const scopedCircuit = receipt({
    authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
    budgets: { spawn_max: 2, spawn_used: 0, observation_max: 2, observation_used: 0, intervention_max: 1, intervention_used: 0, restart_max: 0, restart_used: 0, human_gate_max: 0, human_gate_used: 0 },
    circuits: [{ domain: "provider-a", status: "open", reason: "shared authentication failure", evidence_refs: ["host://provider-a/incident"] }],
  });
  const affected = (scopedCircuit.tasks as JsonRecord[])[0];
  affected.status = "ready";
  affected.current_attempt_id = "";
  affected.attempts = [];
  affected.next_observation_condition = "";
  const independent = clone(affected);
  independent.task_id = "task-2";
  independent.execution_domain = "provider-b";
  independent.required_artifacts = ["artifacts/independent.md"];
  scopedCircuit.tasks = [affected, independent];
  const scopedActions = (run(scopedCircuit, "decide").payload.task_actions as JsonRecord[]).map((item) => String(item.action));
  assert.deepEqual(scopedActions, ["hold_open_circuit", "dispatch_task"]);

  const blockingReview = receipt({
    route: { topology: "delegated", assurance: "blocking_review", lifecycle: "normal" },
    authority: { integration_writer: "worker-1", reviewers: ["reviewer-1"], allow_parallel_writers: false },
  });
  const blockingTask = (blockingReview.tasks as JsonRecord[])[0];
  const blockingAttempt = (blockingTask.attempts as JsonRecord[])[0];
  blockingTask.status = "needs_repair";
  blockingTask.requires_review = true;
  blockingAttempt.status = "succeeded";
  blockingAttempt.artifacts = [artifact()];
  blockingTask.verification = { target_attempt_id: "attempt-1", status: "pass", artifacts: [artifact()], evidence_refs: ["host://verification/result-v1"] };
  blockingTask.reviews = [{ review_id: "review-1", reviewer_id: "reviewer-1", target_attempt_id: "attempt-1", target_artifacts: [artifact()], verdict: "blocking", finding_refs: ["reviews/p1.md"], evidence_refs: ["host://review/review-1"], source_identity: { before: "sha256:scope-v1", after: "sha256:scope-v1", evidence_refs: ["host://snapshot/review-1"] } }];
  assert.equal(action(run(blockingReview, "decide").payload), "repair_then_reverify");

  const exhaustedObservation = receipt();
  (exhaustedObservation.budgets as JsonRecord).observation_used = 4;
  assert.equal(action(run(exhaustedObservation, "decide").payload), "checkpoint_and_stop");

  const stalePremise = receipt();
  (((stalePremise.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]).status = "stale_premise";
  assert.equal(action(run(stalePremise, "decide").payload), "reconcile_owner_state");

  const scopeDrift = receipt();
  (scopeDrift.tasks as JsonRecord[])[0].drift = { status: "confirmed", kind: "scope", evidence_refs: ["host://drift/scope"] };
  assert.equal(action(run(scopeDrift, "decide").payload), "steer_to_boundary");

  const costDrift = receipt();
  (costDrift.tasks as JsonRecord[])[0].drift = { status: "confirmed", kind: "cost", evidence_refs: ["host://drift/cost"] };
  assert.equal(action(run(costDrift, "decide").payload), "reduce_or_stop_supervision");

  const pendingIntervention = clone(scopeDrift);
  (pendingIntervention.budgets as JsonRecord).intervention_used = 1;
  (pendingIntervention.tasks as JsonRecord[])[0].interventions = [{ target_attempt_id: "attempt-1", drift_kind: "scope", observation_refs: ["host://drift/scope"], action: "steer_to_boundary", intervention_refs: ["host://steer/1"], effect_status: "pending", effect_refs: [] }];
  assert.equal(action(run(pendingIntervention, "decide").payload), "observe_on_next_condition");

  const unresolvedIntervention = clone(pendingIntervention);
  const unresolved = ((unresolvedIntervention.tasks as JsonRecord[])[0].interventions as JsonRecord[])[0];
  unresolved.effect_status = "unresolved";
  unresolved.effect_refs = ["host://observation/still-drifting"];
  assert.equal(action(run(unresolvedIntervention, "decide").payload), "inspect_drift");

  const resolvedFinal = makeFinal();
  (resolvedFinal.budgets as JsonRecord).intervention_used = 1;
  (resolvedFinal.tasks as JsonRecord[])[0].interventions = [{ target_attempt_id: "attempt-1", drift_kind: "scope", observation_refs: ["host://drift/scope"], action: "steer_to_boundary", intervention_refs: ["host://steer/1"], effect_status: "resolved", effect_refs: ["host://observation/aligned"] }];
  assert.equal(run(resolvedFinal, "validate", true).status, 0);

  const resolvedReady = clone(resolvedFinal);
  resolvedReady.run_status = "active";
  (resolvedReady.checkpoint as JsonRecord).terminal = false;
  (resolvedReady.tasks as JsonRecord[])[0].status = "needs_repair";
  assert.equal(action(run(resolvedReady, "decide").payload), "report_task_ready");

  const resolvedWithoutEffect = clone(resolvedReady);
  (((resolvedWithoutEffect.tasks as JsonRecord[])[0].interventions as JsonRecord[])[0]).effect_refs = [];
  const resolvedWithoutEffectResult = run(resolvedWithoutEffect, "decide");
  assert.equal(resolvedWithoutEffectResult.status, 1);
  assert.equal(action(resolvedWithoutEffectResult.payload), "repair_receipt");
  assert.deepEqual(issues(resolvedWithoutEffectResult.payload), ["intervention.effect_evidence_missing"]);

  const secondBeforeEffect = clone(pendingIntervention);
  (secondBeforeEffect.budgets as JsonRecord).intervention_used = 2;
  ((secondBeforeEffect.tasks as JsonRecord[])[0].interventions as JsonRecord[]).push({ target_attempt_id: "attempt-1", drift_kind: "scope", observation_refs: ["host://drift/scope-still-open"], action: "steer_to_boundary", intervention_refs: ["host://steer/2"], effect_status: "pending", effect_refs: [] });
  const secondBeforeEffectResult = run(secondBeforeEffect, "decide");
  assert.equal(secondBeforeEffectResult.status, 1);
  assert.equal(action(secondBeforeEffectResult.payload), "repair_receipt");
  assert.deepEqual(issues(secondBeforeEffectResult.payload), ["intervention.effect_order"]);

  const methodPreference = receipt();
  (methodPreference.tasks as JsonRecord[])[0].drift = { status: "confirmed", kind: "method", evidence_refs: ["agent://preference"] };
  const methodResult = run(methodPreference, "validate");
  assert.equal(methodResult.status, 1);
  assert.ok(issues(methodResult.payload).includes("drift.method_boundary_missing"));

  const auditStable = receipt({
    route: { topology: "delegated", assurance: "audit", lifecycle: "normal" },
    authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false },
    tasks: [task({
      task_id: "audit-1",
      objective: "Audit protected source.",
      mutation_boundary: [],
      source_scope: ["modules/"],
      required_artifacts: [],
      current_attempt_id: "audit-attempt-1",
      attempts: [attempt({ attempt_id: "audit-attempt-1", worker_id: "auditor-1", role: "auditor", write_root: "", source_identity: { before: "sha256:modules-v1", after: "", evidence_refs: ["host://snapshot/audit-1"] } })],
    })],
  });
  assert.equal(action(run(auditStable, "decide").payload), "observe_on_next_condition");

  const auditChanged = clone(auditStable);
  const auditTask = (auditChanged.tasks as JsonRecord[])[0];
  const auditAttempt = (auditTask.attempts as JsonRecord[])[0];
  auditAttempt.status = "succeeded";
  (auditAttempt.source_identity as JsonRecord).after = "sha256:modules-v2";
  assert.equal(action(run(auditChanged, "decide").payload), "reconcile_owner_state");

  const planned = receipt({ tasks: [task({ status: "planned", current_attempt_id: "", attempts: [], next_observation_condition: "" })] });
  assert.equal(action(run(planned, "decide").payload), "wait_owner_transition");

  const blocked = receipt({ run_status: "blocked", authority: { integration_writer: "", reviewers: [], allow_parallel_writers: false }, tasks: [task({ status: "ready", current_attempt_id: "", attempts: [], next_observation_condition: "" })] });
  const blockedDecision = run(blocked, "decide").payload;
  assert.equal(action(blockedDecision), "checkpoint_and_stop");
  assert.equal(blockedDecision.run_ready, false);

  const blockedUnknownEffect = receipt({ run_status: "blocked" });
  const blockedUnknownAttempt = (((blockedUnknownEffect.tasks as JsonRecord[])[0].attempts as JsonRecord[])[0]);
  blockedUnknownAttempt.status = "failed";
  blockedUnknownAttempt.failure = failure({ cause: "logic_defect", scope: "lane", effect_state: "unknown", domain: "payments", evidence_refs: ["external://refund/timeout"] });
  assert.equal(action(run(blockedUnknownEffect, "decide").payload), "inspect_side_effect");

  const unresolvedFinding = makeFinal();
  unresolvedFinding.run_status = "active";
  (unresolvedFinding.checkpoint as JsonRecord).terminal = false;
  (unresolvedFinding.checkpoint as JsonRecord).unresolved_findings = ["review://p1"];
  assert.equal(action(run(unresolvedFinding, "decide").payload), "block_false_completion");

  const falseDependency = receipt({ authority: { integration_writer: "worker-1", reviewers: [], allow_parallel_writers: false } });
  const falseComplete = (falseDependency.tasks as JsonRecord[])[0];
  falseComplete.status = "complete";
  falseComplete.next_observation_condition = "";
  ((falseComplete.attempts as JsonRecord[])[0]).status = "succeeded";
  const dependent = task({ task_id: "task-2", status: "ready", depends_on: ["task-1"], current_attempt_id: "", attempts: [], next_observation_condition: "" });
  falseDependency.tasks = [falseComplete, dependent];
  const dependencyActions = (run(falseDependency, "decide").payload.task_actions as JsonRecord[]).map((item) => String(item.action));
  assert.ok(dependencyActions.includes("block_false_completion"));
  assert.ok(dependencyActions.includes("wait_dependency"));
  assert.ok(!dependencyActions.includes("dispatch_task"));

  const orderOne = scopedCircuit;
  const orderTwo = clone(scopedCircuit);
  orderTwo.tasks = [...(orderTwo.tasks as JsonRecord[])].reverse();
  assert.equal(action(run(orderOne, "decide").payload), action(run(orderTwo, "decide").payload));

  const overlappingWriters = receipt();
  const secondTask = clone((overlappingWriters.tasks as JsonRecord[])[0]);
  secondTask.task_id = "task-2";
  secondTask.current_attempt_id = "attempt-2";
  secondTask.required_artifacts = ["artifacts/second.md"];
  (secondTask.attempts as JsonRecord[])[0].attempt_id = "attempt-2";
  (secondTask.attempts as JsonRecord[])[0].worker_id = "worker-2";
  overlappingWriters.tasks = [(overlappingWriters.tasks as JsonRecord[])[0], secondTask];
  const writerResult = run(overlappingWriters, "validate");
  assert.equal(writerResult.status, 1);
  assert.ok(issues(writerResult.payload).includes("authority.parallel_writers"));
  assert.equal(action(run(overlappingWriters, "decide").payload), "freeze_and_rebind");

  const optionalOpen = clone(validFinal);
  optionalOpen.run_status = "active";
  (optionalOpen.checkpoint as JsonRecord).terminal = false;
  const optionalTask = task({ task_id: "task-optional", required: false, status: "planned", current_attempt_id: "", attempts: [], next_observation_condition: "" });
  optionalOpen.tasks = [...(optionalOpen.tasks as JsonRecord[]), optionalTask];
  const optionalDecision = run(optionalOpen, "decide").payload;
  assert.equal(optionalDecision.run_ready, false);
  assert.equal(action(optionalDecision), "wait_owner_transition");

  const extensionCompatible = clone(validFinal);
  extensionCompatible.adapter_extension = { host: "example", observation_cursor: "opaque" };
  ((extensionCompatible.tasks as JsonRecord[])[0]).extension_note = "consumer-owned extension";
  assert.equal(run(extensionCompatible, "validate", true).status, 0);

  const malformedAndIncomplete = clone(validFinal);
  malformedAndIncomplete.run_status = "active";
  (malformedAndIncomplete.route as JsonRecord).topology = "unknown-topology";
  (malformedAndIncomplete.tasks as JsonRecord[])[0].verification = { target_attempt_id: "attempt-1", status: "pass", artifacts: [artifact()], evidence_refs: [] };
  assert.equal(action(run(malformedAndIncomplete, "decide").payload), "repair_receipt");

  for (const ref of [
    "/tmp/machine-local-owner",
    "\\\\server\\share\\owner.json",
    "file:///synthetic-machine/private/owner.json",
    "vscode://file/synthetic-machine/private/owner.json",
  ]) {
    const machineLocalRef = clone(validFinal);
    (machineLocalRef.owner_snapshot as JsonRecord).ref = ref;
    const machineLocalResult = run(machineLocalRef, "validate", true);
    assert.equal(machineLocalResult.status, 1, `machine-local ref must fail: ${ref}`);
    assert.ok(issues(machineLocalResult.payload).includes("ref.machine_absolute"));
  }

  process.stdout.write(`ok: bagakit-supervisor public checks passed (${decisionCases.length} exact decisions, ${finalValidationCases.length} final validations, 1 inspect projection)\n`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
