import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  ACTIVATION_SCHEMA,
  PLAN_REVISION_SCHEMA,
  SNAPSHOT_SCHEMA,
  type CheckpointPayload,
  type CleanState,
  type FeatureActivationPayload,
  type IncidentRecord,
  type IncidentResume,
  type ItemPaths,
  type ItemState,
  type ItemStatus,
  type NextActionPayload,
  type PlanRevision,
  type ResolutionKind,
  type ResumeCandidate,
  type ResumeCandidatesPayload,
  type RunnerPolicy,
  type SessionStatus,
  type SnapshotMetadata,
} from "./model.ts";
import {
  CLEAN_STATES,
  FLOW_PROTOCOL_SCHEMAS,
  INCIDENT_RESUMES,
  INCIDENT_STATUSES,
  SESSION_STATUSES,
  applySnapshotAnchor,
  applySourceRefresh,
  archiveFlowItem,
  createFlowItem,
  normalizeFlowState,
  openIncident as protocolOpenIncident,
  persistMutationSideEffects,
  projectNextAction,
  projectResumeCandidates,
  recordCheckpoint,
  resolveIncident as protocolResolveIncident,
  validateItemState,
  validateMutationReceipt,
  validateNextActionPayload,
  validateResumeCandidatesPayload,
  type FlowMutationResult,
} from "./protocol/index.ts";
import {
  copyTemplateIfMissing,
  ensureGitRepo,
  readJsonFile,
  readNdjson,
  readText,
  runGit,
  sanitizeSnapshotLabel,
  utcNow,
  writeJsonFile,
  writeText,
} from "./io.ts";
import { FlowRunnerPaths } from "./paths.ts";

const FLOW_RUNNER_SURFACE_TOML = `schema_version = 1
surface_id = "flow-runner-runtime"
surface_root = ".bagakit/flow-runner"
owner_kind = "skill"
owner_id = "bagakit-flow-runner"
lifecycle_class = "durable_state"
edit_policy = "mixed"
cleanup_safe = false
source_of_truth = [
  "docs/specs/runtime-surface-contract.md",
  "docs/specs/flow-runner-contract.md",
  "skills/harness/bagakit-flow-runner/SKILL.md",
  "skills/harness/bagakit-flow-runner/README.md",
]
reviewable_outputs = [
  "items/<item-id>/state.json",
  "items/<item-id>/checkpoints.ndjson",
  "items/<item-id>/progress.ndjson",
  "items/<item-id>/mutation-receipts.ndjson",
  "archive/<item-id>/",
]
`;

function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function toRepoRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

export function ensureRunnerExists(paths: FlowRunnerPaths): void {
  if (!fs.existsSync(paths.runnerDir)) {
    throw new Error("flow-runner is not initialized. run flow-runner.sh apply --root <repo> first");
  }
}

export function loadPolicy(paths: FlowRunnerPaths): RunnerPolicy {
  const payload = readJsonFile<unknown>(paths.policyFile);
  const record = assertRecord(payload, paths.policyFile);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.policy) {
    throw new Error(`invalid flow-runner policy schema in ${paths.policyFile}`);
  }
  const safety = assertRecord(record.safety, `${paths.policyFile}.safety`);
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.policy,
    safety: {
      snapshot_before_session: assertBoolean(safety.snapshot_before_session, "policy.safety.snapshot_before_session"),
      checkpoint_before_stop: assertBoolean(safety.checkpoint_before_stop, "policy.safety.checkpoint_before_stop"),
      persist_state_before_stop: assertBoolean(safety.persist_state_before_stop, "policy.safety.persist_state_before_stop"),
    },
  };
}

export function loadRecipe(paths: FlowRunnerPaths): LoopRecipe {
  const payload = readJsonFile<unknown>(paths.recipeFile);
  const record = assertRecord(payload, paths.recipeFile);
  if (record.schema !== FLOW_PROTOCOL_SCHEMAS.recipe) {
    throw new Error(`invalid flow-runner recipe schema in ${paths.recipeFile}`);
  }
  const stagesRaw = record.stage_chain;
  if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) {
    throw new Error(`recipe stage_chain must be a non-empty array: ${paths.recipeFile}`);
  }
  const stage_chain = stagesRaw.map((item, index) => {
    const stage = assertRecord(item, `recipe.stage_chain[${index}]`);
    return {
      stage_key: assertString(stage.stage_key, `recipe.stage_chain[${index}].stage_key`),
      goal: assertString(stage.goal, `recipe.stage_chain[${index}].goal`),
    };
  });
  return {
    schema: FLOW_PROTOCOL_SCHEMAS.recipe,
    recipe_id: assertString(record.recipe_id, "recipe.recipe_id"),
    recipe_version: assertString(record.recipe_version, "recipe.recipe_version"),
    stage_chain,
  };
}

export function loadItemState(filePath: string): ItemState {
  const payload = readJsonFile<unknown>(filePath);
  return validateItemState(payload, filePath);
}

function uniqueTimestampedId(baseDir: string, prefix: string, middle: string, fileSuffix = ""): string {
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
  let attempt = 0;
  while (true) {
    const suffix = attempt === 0 ? "" : `-${String(attempt + 1).padStart(2, "0")}`;
    const candidate = `${prefix}${stamp}-${middle}${suffix}`;
    const targetPath = path.join(baseDir, `${candidate}${fileSuffix}`);
    if (!fs.existsSync(targetPath)) {
      return candidate;
    }
    attempt += 1;
  }
}

function ensureItemLayout(paths: FlowRunnerPaths, itemId: string): void {
  fs.mkdirSync(paths.itemDir(itemId), { recursive: true });
  fs.mkdirSync(paths.itemPlanRevisionsDir(itemId), { recursive: true });
  fs.mkdirSync(paths.itemIncidentsDir(itemId), { recursive: true });
  if (!fs.existsSync(paths.itemHandoff(itemId))) {
    writeText(paths.itemHandoff(itemId), `# Work Item Handoff: ${itemId}\n`);
  }
  if (!fs.existsSync(paths.itemCheckpoints(itemId))) {
    writeText(paths.itemCheckpoints(itemId), "");
  }
  if (!fs.existsSync(paths.itemProgressLog(itemId))) {
    writeText(paths.itemProgressLog(itemId), "");
  }
  if (!fs.existsSync(paths.itemMutationReceipts(itemId))) {
    writeText(paths.itemMutationReceipts(itemId), "");
  }
}

function initialItemPaths(paths: FlowRunnerPaths, itemId: string): ItemPaths {
  return itemPathsForLocation(paths, itemId, false);
}

function itemPathsForLocation(paths: FlowRunnerPaths, itemId: string, archived: boolean): ItemPaths {
  return {
    handoff: toRepoRelative(paths.root, paths.itemHandoff(itemId, archived)),
    checkpoints: toRepoRelative(paths.root, paths.itemCheckpoints(itemId, archived)),
    progress_log: toRepoRelative(paths.root, paths.itemProgressLog(itemId, archived)),
    mutation_receipts: toRepoRelative(paths.root, paths.itemMutationReceipts(itemId, archived)),
    plan_revisions_dir: toRepoRelative(paths.root, paths.itemPlanRevisionsDir(itemId, archived)),
    incidents_dir: toRepoRelative(paths.root, paths.itemIncidentsDir(itemId, archived)),
  };
}

function persistItemMutation(
  paths: FlowRunnerPaths,
  itemId: string,
  statePath: string,
  mutation: FlowMutationResult<unknown>,
  sideEffects: Parameters<typeof persistMutationSideEffects>[0] = [],
): void {
  persistMutationSideEffects([
    { kind: "ndjson", path: paths.itemMutationReceipts(itemId), value: mutation.receipt },
    ...sideEffects,
    { kind: "json", path: statePath, value: mutation.state },
  ]);
}

function initialPlanRevision(sourceKind: string, sourceRef: string, title: string, currentTaskSnapshot: string): PlanRevision {
  return {
    schema: PLAN_REVISION_SCHEMA,
    revision_id: "pr-001",
    created_at: utcNow(),
    source_kind: sourceKind,
    source_ref: sourceRef,
    title_snapshot: title,
    current_task_snapshot: currentTaskSnapshot,
    notes: [],
  };
}

function closedIncidentSideEffects(
  paths: FlowRunnerPaths,
  itemId: string,
  incidentIds: readonly string[],
  closeNote: string,
  closedAt: string,
  archived = false,
): Parameters<typeof persistMutationSideEffects>[0] {
  const sideEffects: Parameters<typeof persistMutationSideEffects>[0] = [];
  for (const incidentId of incidentIds) {
    const incidentPath = paths.itemIncident(itemId, incidentId, archived);
    if (!fs.existsSync(incidentPath)) {
      continue;
    }
    const incident = readJsonFile<IncidentRecord>(incidentPath);
    if (incident.schema !== FLOW_PROTOCOL_SCHEMAS.incident || incident.status !== "open") {
      continue;
    }
    sideEffects.push({
      kind: "json",
      path: incidentPath,
      value: {
        ...incident,
        status: "closed",
        closed_at: closedAt,
        close_note: closeNote,
      } satisfies IncidentRecord,
    });
  }
  return sideEffects;
}

export function applyFlowRunner(root: string, skillDir: string): string {
  ensureGitRepo(root);
  const paths = new FlowRunnerPaths(root);
  fs.mkdirSync(paths.runnerDir, { recursive: true });
  fs.mkdirSync(paths.itemsDir, { recursive: true });
  fs.mkdirSync(paths.archiveDir, { recursive: true });
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  if (!fs.existsSync(paths.surfaceFile)) {
    writeText(paths.surfaceFile, FLOW_RUNNER_SURFACE_TOML);
  }
  copyTemplateIfMissing(skillDir, "runner-policy-template.json", paths.policyFile);
  copyTemplateIfMissing(skillDir, "loop-recipe-template.json", paths.recipeFile);
  if (!fs.existsSync(path.join(paths.runnerDir, ".gitignore"))) {
    writeText(path.join(paths.runnerDir, ".gitignore"), "backups/\n");
  }
  writeJsonFile(paths.nextActionFile, {
    schema: FLOW_PROTOCOL_SCHEMAS.nextAction,
    command: "next",
    recommended_action: "stop",
    action_reason: "no_actionable_item",
    session_contract: {
      launch_bounded_session: false,
      persist_state_before_stop: true,
      checkpoint_before_stop: true,
      snapshot_before_session: false,
      archive_only_closeout: false,
    },
  });
  writeJsonFile(paths.resumeCandidatesFile, {
    schema: FLOW_PROTOCOL_SCHEMAS.resumeCandidates,
    command: "resume-candidates",
    live: [],
    closeout: [],
  });
  return paths.runnerDir;
}

export function createManualItem(
  root: string,
  skillDir: string,
  itemId: string,
  title: string,
  sourceKind: string,
  sourceRef: string,
  priority: number,
  confidence: number,
): string {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const recipe = loadRecipe(paths);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(itemId)) {
    throw new Error(`invalid item id: ${itemId}`);
  }
  if (fs.existsSync(paths.itemDir(itemId)) || fs.existsSync(paths.itemDir(itemId, true))) {
    throw new Error(`item already exists: ${itemId}`);
  }
  if (sourceKind === "feature-tracker") {
    throw new Error("feature-tracker sourced items must be imported or activated from feature-tracker, not added manually");
  }
  if (!Number.isFinite(priority)) {
    throw new Error("priority must be a finite number");
  }
  if (!Number.isFinite(confidence)) {
    throw new Error("confidence must be a finite number");
  }
  ensureItemLayout(paths, itemId);
  const activePlanRevisionId = "pr-001";
  const mutation = createFlowItem({
    item_id: itemId,
    title,
    source_kind: sourceKind,
    source_ref: sourceRef,
    priority,
    confidence,
    recipe,
    paths: initialItemPaths(paths, itemId),
    now: utcNow(),
    active_plan_revision_id: activePlanRevisionId,
  });
  const state = mutation.state;
  const template = readText(path.join(skillDir, "references", "tpl", "item-handoff-template.md"));
  persistItemMutation(paths, itemId, paths.itemState(itemId), mutation, [
    {
      kind: "text",
      path: paths.itemHandoff(itemId),
      value: template
        .replaceAll("<item-id>", itemId)
        .replaceAll("<title>", title)
        .replaceAll("<stage>", state.current_stage)
        .replaceAll("<status>", state.status)
        .replaceAll("<next-action>", "run one bounded session"),
    },
    {
      kind: "json",
      path: paths.itemPlanRevision(itemId, activePlanRevisionId),
      value: initialPlanRevision(sourceKind, sourceRef, title, ""),
    },
  ]);
  return itemId;
}

function featureTrackerIndex(root: string): Record<string, unknown> {
  const indexPath = path.join(root, ".bagakit", "feature-tracker", "index", "features.json");
  const payload = readJsonFile<unknown>(indexPath);
  const record = assertRecord(payload, indexPath);
  if (!Array.isArray(record.features)) {
    throw new Error(`feature tracker index missing features list: ${indexPath}`);
  }
  return record;
}

function loadFeatureSource(root: string, featureId: string): { statePath: string; state: Record<string, unknown>; tasks: Record<string, unknown> } {
  const candidates = [
    path.join(root, ".bagakit", "feature-tracker", "features", featureId),
    path.join(root, ".bagakit", "feature-tracker", "features-archived", featureId),
    path.join(root, ".bagakit", "feature-tracker", "features-discarded", featureId),
  ];
  for (const candidate of candidates) {
    const statePath = path.join(candidate, "state.json");
    const tasksPath = path.join(candidate, "tasks.json");
    if (fs.existsSync(statePath) && fs.existsSync(tasksPath)) {
      return {
        statePath,
        state: assertRecord(readJsonFile(statePath), statePath),
        tasks: assertRecord(readJsonFile(tasksPath), tasksPath),
      };
    }
  }
  throw new Error(`missing feature-tracker state for ${featureId}`);
}

function sourceTaskSnapshot(tasks: Record<string, unknown>, currentTaskId: string): string {
  const rawTasks = Array.isArray(tasks.tasks) ? tasks.tasks : [];
  for (const task of rawTasks) {
    if (!task || typeof task !== "object") {
      continue;
    }
    const record = task as Record<string, unknown>;
    if (String(record.id ?? "") === currentTaskId) {
      return `${currentTaskId} ${String(record.title ?? "").trim()}`.trim();
    }
  }
  return "";
}

function mapFeatureSourceStatus(sourceState: Record<string, unknown>): ItemStatus {
  const workspaceMode = String(sourceState.workspace_mode ?? "").trim();
  const sourceStatus = String(sourceState.status ?? "").trim();
  if (workspaceMode === "proposal_only") {
    return "blocked";
  }
  if (sourceStatus === "blocked") {
    return "blocked";
  }
  if (sourceStatus === "in_progress") {
    return "in_progress";
  }
  if (sourceStatus === "done") {
    return "completed";
  }
  return "todo";
}

function parseFeatureSourceRef(sourceRef: string): string | null {
  const prefix = "feature-tracker:";
  if (!sourceRef.startsWith(prefix)) {
    return null;
  }
  const featureId = sourceRef.slice(prefix.length).trim();
  return featureId || null;
}

function trackerMirrorSourceStatus(root: string, state: ItemState): ItemStatus {
  const featureId = parseFeatureSourceRef(state.source_ref);
  if (!featureId) {
    throw new Error(`invalid feature-tracker source_ref: ${state.source_ref}`);
  }
  return mapFeatureSourceStatus(loadFeatureSource(root, featureId).state);
}

function trackerItemId(featureId: string): string {
  return `feature-${featureId}`;
}

export function ingestFeatureTracker(root: string): { imported: number; updated: number; retired: number } {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const recipe = loadRecipe(paths);
  const features = featureTrackerIndex(root).features as Record<string, unknown>[];
  let imported = 0;
  let updated = 0;
  let retired = 0;

  for (const feature of features) {
    const featureId = String(feature.feat_id ?? feature.feature_id ?? "").trim();
    if (!featureId) {
      continue;
    }
    const source = loadFeatureSource(root, featureId);
    const itemId = trackerItemId(featureId);
    const sourceStatus = String(source.state.status ?? "").trim();
    const currentTaskId = String(source.state.current_task_id ?? "").trim();
    const currentTaskSnapshot = currentTaskId ? sourceTaskSnapshot(source.tasks, currentTaskId) : "";
    const titleBase = String(feature.title ?? featureId).trim();
    const title = currentTaskSnapshot ? `${titleBase} / ${currentTaskSnapshot}` : titleBase;
    const activeStatePath = paths.itemState(itemId);
    const archivedStatePath = paths.itemState(itemId, true);
    const activeExists = fs.existsSync(activeStatePath);
    const archivedExists = fs.existsSync(archivedStatePath);

    if (sourceStatus === "archived" || sourceStatus === "discarded") {
      if (activeExists && archivedExists) {
        throw new Error(`duplicate active and archived runner items detected: ${itemId}`);
      }
      if (activeExists) {
        const current = loadItemState(activeStatePath);
        const retiredAt = utcNow();
        const closeIncidentEffects = closedIncidentSideEffects(
          paths,
          itemId,
          current.runtime.open_incident_ids,
          "closed automatically because feature-tracker retired the mirrored item",
          retiredAt,
        );
        const refreshMutation = applySourceRefresh(current, {
          now: retiredAt,
          source_status: sourceStatus === "archived" ? "completed" : "cancelled",
          close_open_incidents: true,
        });
        const retirementMutation = normalizeFlowState(refreshMutation.state, {
          now: retiredAt,
          archive_status: "archived",
          paths: itemPathsForLocation(paths, itemId, true),
          authority: "source_mirror",
          notes: ["feature-tracker retired mirrored item"],
        });
        persistMutationSideEffects([
          { kind: "ndjson", path: paths.itemMutationReceipts(itemId), value: refreshMutation.receipt },
          { kind: "ndjson", path: paths.itemMutationReceipts(itemId), value: retirementMutation.receipt },
          ...closeIncidentEffects,
          { kind: "json", path: activeStatePath, value: retirementMutation.state },
        ]);
        fs.mkdirSync(paths.archiveDir, { recursive: true });
        fs.renameSync(paths.itemDir(itemId), paths.itemDir(itemId, true));
        retired += 1;
      }
      continue;
    }

    if (archivedExists && !activeExists) {
      throw new Error(`archived runner item conflicts with active feature-tracker source: ${itemId}`);
    }
    if (archivedExists && activeExists) {
      throw new Error(`duplicate active and archived runner items detected: ${itemId}`);
    }

    const mappedStatus = mapFeatureSourceStatus(source.state);
    if (activeExists) {
      const current = loadItemState(activeStatePath);
      const clearOpenIncidents = mappedStatus === "completed" || mappedStatus === "cancelled";
      const closeIncidentEffects = clearOpenIncidents
        ? closedIncidentSideEffects(
          paths,
          itemId,
          current.runtime.open_incident_ids,
          "closed automatically because feature-tracker closeout became authoritative",
          utcNow(),
        )
        : [];
      const refreshMutation = applySourceRefresh(current, {
        now: utcNow(),
        source_status: mappedStatus,
        title,
        source_ref: `feature-tracker:${featureId}`,
        close_open_incidents: clearOpenIncidents,
      });
      persistItemMutation(paths, itemId, activeStatePath, refreshMutation, closeIncidentEffects);
      updated += 1;
      continue;
    }

    ensureItemLayout(paths, itemId);
    const activePlanRevisionId = "pr-001";
    const mutation = createFlowItem({
      item_id: itemId,
      title,
      source_kind: "feature-tracker",
      source_ref: `feature-tracker:${featureId}`,
      status: mappedStatus,
      priority: 100,
      confidence: 0.7,
      recipe,
      paths: initialItemPaths(paths, itemId),
      now: utcNow(),
      active_plan_revision_id: activePlanRevisionId,
    });
    const state = mutation.state;
    persistItemMutation(paths, itemId, activeStatePath, mutation, [
      {
        kind: "text",
        path: paths.itemHandoff(itemId),
        value: `# Work Item Handoff: ${itemId}\n\n- source: feature-tracker:${featureId}\n- title: ${title}\n- workspace_mode: ${String(source.state.workspace_mode ?? "").trim()}\n`,
      },
      {
        kind: "json",
        path: paths.itemPlanRevision(itemId, activePlanRevisionId),
        value: initialPlanRevision("feature-tracker", `feature-tracker:${featureId}`, title, currentTaskSnapshot),
      },
    ]);
    imported += 1;
  }

  return { imported, updated, retired };
}

export function activateFeatureTracker(root: string, featureId: string): FeatureActivationPayload {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const source = loadFeatureSource(root, featureId);
  const sourceStatus = String(source.state.status ?? "").trim();
  const workspaceMode = String(source.state.workspace_mode ?? "").trim();
  if (sourceStatus === "archived" || sourceStatus === "discarded") {
    throw new Error(`feature-tracker source is already closed: ${featureId}`);
  }
  if (workspaceMode === "proposal_only") {
    throw new Error(`feature-tracker source is proposal_only and not execution-ready: ${featureId}`);
  }
  if (sourceStatus === "blocked") {
    throw new Error(`feature-tracker source is blocked and not execution-ready: ${featureId}`);
  }

  ingestFeatureTracker(root);
  const itemId = trackerItemId(featureId);
  const nextPayload = computeNextAction(root, itemId);
  if (nextPayload.recommended_action !== "run_session") {
    throw new Error(
      `feature-tracker source did not activate into a runnable flow item: ${featureId}; ` +
      `got ${nextPayload.recommended_action}:${nextPayload.action_reason}`,
    );
  }
  if (!nextPayload.item_path) {
    throw new Error(`activated flow item is missing item_path: ${itemId}`);
  }
  return {
    schema: ACTIVATION_SCHEMA,
    command: "activate-feature-tracker",
    feature_id: featureId,
    item_id: itemId,
    item_path: nextPayload.item_path,
    source_state_path: toRepoRelative(root, source.statePath),
    workspace_mode: workspaceMode,
    source_status: sourceStatus,
    flow_next: nextPayload,
  };
}

function listItemStates(paths: FlowRunnerPaths, archived = false): ItemState[] {
  const baseDir = archived ? paths.archiveDir : paths.itemsDir;
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadItemState(path.join(baseDir, entry.name, "state.json")))
    .sort((left, right) => left.item_id.localeCompare(right.item_id));
}

export function computeNextAction(root: string, explicitItemId?: string): NextActionPayload {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const policy = loadPolicy(paths);
  const payload = projectNextAction({
    items: listItemStates(paths),
    policy,
    explicit_item_id: explicitItemId,
    item_path_for: (state) => toRepoRelative(root, paths.itemState(state.item_id)),
    checkpoint_command_for: (state, sessionStatus) =>
      `bash "$BAGAKIT_FLOW_RUNNER_SKILL_DIR/scripts/flow-runner.sh" checkpoint --root . --item ${state.item_id} ` +
      `--stage ${state.current_stage} --session-status ${sessionStatus} --objective "..." --attempted "..." ` +
      `--result "..." --next-action "..." --clean-state yes`,
  });
  writeJsonFile(paths.nextActionFile, payload);
  return payload;
}

function resumeCandidateFromState(paths: FlowRunnerPaths, state: ItemState, archived = false): ResumeCandidate {
  return {
    item_id: state.item_id,
    item_path: toRepoRelative(paths.root, paths.itemState(state.item_id, archived)),
    title: state.title,
    source_kind: state.source_kind,
    source_ref: state.source_ref,
    item_status: state.status,
    resolution: state.resolution,
    current_stage: state.current_stage,
    current_step_status: state.current_step_status,
    active_plan_revision_id: state.runtime.active_plan_revision_id,
    active_action_id: state.runtime.active_action_id,
    session_number: state.runtime.session_count,
    progress_log_path: state.paths.progress_log,
    current_safe_anchor: state.runtime.current_safe_anchor,
    open_incident_ids: [...state.runtime.open_incident_ids],
  };
}

export function computeResumeCandidates(root: string): ResumeCandidatesPayload {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const payload = projectResumeCandidates(listItemStates(paths), {
    item_path_for: (state) => toRepoRelative(root, paths.itemState(state.item_id)),
  });
  writeJsonFile(paths.resumeCandidatesFile, payload);
  return payload;
}

export function listItemSummaries(root: string): ResumeCandidate[] {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  return listItemStates(paths).map((state) => resumeCandidateFromState(paths, state));
}

function isVanishedPathError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}

function assertSnapshotRelativePath(root: string, relativePath: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, relativePath);
  if (resolvedPath === resolvedRoot || !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`git returned an unsafe untracked path: ${relativePath}`);
  }
}

function stageUntrackedPath(root: string, stagingDir: string, relativePath: string): boolean {
  assertSnapshotRelativePath(root, relativePath);
  const sourcePath = path.join(root, relativePath);
  const stagedPath = path.join(stagingDir, relativePath);
  try {
    const sourceStat = fs.lstatSync(sourcePath);
    fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
    if (sourceStat.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(sourcePath), stagedPath);
    } else if (sourceStat.isDirectory()) {
      fs.cpSync(sourcePath, stagedPath, {
        dereference: false,
        preserveTimestamps: true,
        recursive: true,
        verbatimSymlinks: true,
      });
    } else if (sourceStat.isFile()) {
      fs.copyFileSync(sourcePath, stagedPath, fs.constants.COPYFILE_FICLONE);
      fs.chmodSync(stagedPath, sourceStat.mode);
      fs.utimesSync(stagedPath, sourceStat.atime, sourceStat.mtime);
    } else {
      throw new Error(`unsupported untracked path type: ${relativePath}`);
    }
    return true;
  } catch (error) {
    if (!isVanishedPathError(error)) {
      throw error;
    }
    fs.rmSync(stagedPath, { recursive: true, force: true });
    return false;
  }
}

function archiveUntrackedPaths(root: string, snapshotDir: string, untracked: string[]): boolean {
  if (untracked.length === 0) {
    return false;
  }
  const stagingDir = path.join(snapshotDir, ".untracked-stage");
  fs.mkdirSync(stagingDir, { recursive: false });
  try {
    const stagedCount = untracked.reduce(
      (count, relativePath) => count + (stageUntrackedPath(root, stagingDir, relativePath) ? 1 : 0),
      0,
    );
    if (stagedCount === 0) {
      return false;
    }
    const tarPath = path.join(snapshotDir, "untracked.tar");
    const result = spawnSync("tar", ["-cf", tarPath, "-C", stagingDir, "."], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        COPYFILE_DISABLE: "1",
      },
    });
    if (result.status !== 0) {
      throw new Error((result.stderr || result.stdout || "tar failed").trim());
    }
    return true;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

export function captureSnapshot(root: string, itemId: string, label: string): SnapshotMetadata {
  ensureGitRepo(root);
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const state = loadItemState(paths.itemState(itemId));
  const safeLabel = sanitizeSnapshotLabel(label);
  const snapshotId = uniqueTimestampedId(paths.backupsDir, "", `${itemId}-${safeLabel}`);
  const snapshotDir = path.join(paths.backupsDir, snapshotId);
  fs.mkdirSync(snapshotDir, { recursive: false });

  const branch = runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
  const head = runGit(root, ["rev-parse", "HEAD"]).trim();
  writeText(path.join(snapshotDir, "branch.txt"), `${branch}\n`);
  writeText(path.join(snapshotDir, "head.txt"), `${head}\n`);
  writeText(path.join(snapshotDir, "status.txt"), runGit(root, ["status", "--short"]));
  writeText(path.join(snapshotDir, "diff.patch"), runGit(root, ["diff"]));
  writeText(path.join(snapshotDir, "staged.patch"), runGit(root, ["diff", "--staged"]));

  const untracked = runGit(root, ["ls-files", "-z", "--others", "--exclude-standard"])
    .split("\0")
    .filter((entry) => entry.length > 0);
  const hasUntrackedArchive = archiveUntrackedPaths(root, snapshotDir, untracked);

  const metadata: SnapshotMetadata = {
    schema: SNAPSHOT_SCHEMA,
    snapshot_id: snapshotId,
    item_id: itemId,
    created_at: utcNow(),
    label: safeLabel,
    branch,
    head,
    has_untracked_archive: hasUntrackedArchive,
  };
  writeJsonFile(path.join(snapshotDir, "metadata.json"), metadata);

  const mutation = applySnapshotAnchor(state, {
    now: metadata.created_at,
    snapshot_id: snapshotId,
    anchor: {
      kind: "git_snapshot",
      ref: toRepoRelative(root, snapshotDir),
      summary: safeLabel,
    },
  });
  persistItemMutation(paths, itemId, paths.itemState(itemId), mutation);
  return metadata;
}

export function appendCheckpoint(
  root: string,
  itemId: string,
  stage: string,
  sessionStatus: SessionStatus,
  objective: string,
  attempted: string,
  result: string,
  nextAction: string,
  cleanState: CleanState,
  itemStatusOverride?: ItemStatus,
  taskRef?: string,
): CheckpointPayload {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const state = loadItemState(paths.itemState(itemId));
  const sourceStatus = state.source_kind === "feature-tracker" ? trackerMirrorSourceStatus(root, state) : undefined;
  const mutation = recordCheckpoint(state, {
    task_ref: taskRef,
    stage,
    session_status: sessionStatus,
    objective,
    attempted,
    result,
    next_action: nextAction,
    clean_state: cleanState,
    now: utcNow(),
    item_path: toRepoRelative(root, paths.itemState(itemId)),
    item_status_override: itemStatusOverride,
    source_status: sourceStatus,
  });
  persistItemMutation(paths, itemId, paths.itemState(itemId), mutation, [
    {
      kind: "ndjson",
      path: paths.itemCheckpoints(itemId),
      value: {
        schema: FLOW_PROTOCOL_SCHEMAS.checkpoint,
        command: "checkpoint",
        item_id: itemId,
        ...mutation.payload.checkpoint.checkpoint_receipt,
      },
    },
    { kind: "ndjson", path: paths.itemProgressLog(itemId), value: mutation.payload.progress },
  ]);
  return mutation.payload.checkpoint;
}

export function openIncident(root: string, itemId: string, family: string, summary: string, recommendedResume: IncidentResume): string {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const state = loadItemState(paths.itemState(itemId));
  const incidentId = uniqueTimestampedId(paths.itemIncidentsDir(itemId), "inc-", itemId, ".json");
  const mutation = protocolOpenIncident(state, {
    incident_id: incidentId,
    family,
    summary,
    recommended_resume: recommendedResume,
    now: utcNow(),
  });
  persistItemMutation(paths, itemId, paths.itemState(itemId), mutation, [
    { kind: "json", path: paths.itemIncident(itemId, incidentId), value: mutation.payload.incident },
  ]);
  return incidentId;
}

export function resolveIncident(root: string, itemId: string, incidentId: string, closeNote: string): string {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const state = loadItemState(paths.itemState(itemId));
  const incidentPath = paths.itemIncident(itemId, incidentId);
  const incident = readJsonFile<IncidentRecord>(incidentPath);
  const mutation = protocolResolveIncident(state, incident, {
    close_note: closeNote,
    now: utcNow(),
    source_status: state.source_kind === "feature-tracker" ? trackerMirrorSourceStatus(root, state) : undefined,
  });
  persistItemMutation(paths, itemId, paths.itemState(itemId), mutation, [
    { kind: "json", path: incidentPath, value: mutation.payload.incident },
  ]);
  return incidentId;
}

export function archiveItem(root: string, itemId: string): void {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const activeStatePath = paths.itemState(itemId);
  if (!fs.existsSync(activeStatePath)) {
    throw new Error(`item not found: ${itemId}`);
  }
  const state = loadItemState(activeStatePath);
  if (state.status !== "completed" && state.status !== "cancelled") {
    throw new Error("only completed or cancelled items may be archived");
  }
  if (state.source_kind === "feature-tracker") {
    throw new Error("feature-tracker sourced items must be closed by feature-tracker, not archived by flow-runner");
  }
  const archivedDir = paths.itemDir(itemId, true);
  if (fs.existsSync(archivedDir)) {
    throw new Error(`archived item already exists: ${itemId}`);
  }
  const mutation = archiveFlowItem(state, {
    now: utcNow(),
    archived_paths: itemPathsForLocation(paths, itemId, true),
  });
  persistItemMutation(paths, itemId, activeStatePath, mutation);
  fs.mkdirSync(paths.archiveDir, { recursive: true });
  fs.renameSync(paths.itemDir(itemId), archivedDir);
}

function validateNextActionFile(root: string, paths: FlowRunnerPaths, issues: string[]): void {
  try {
    if (!fs.existsSync(paths.nextActionFile)) {
      issues.push(`missing next-action file: ${paths.nextActionFile}`);
      return;
    }
    const payload = readJsonFile<unknown>(paths.nextActionFile);
    const record = validateNextActionPayload(payload, paths.nextActionFile);
    if (record.item_id !== undefined) {
      if (!fs.existsSync(paths.itemState(record.item_id)) && !fs.existsSync(paths.itemState(record.item_id, true))) {
        issues.push(`next-action item_id does not exist in runtime trees: ${paths.nextActionFile}`);
      }
    }
  } catch (error) {
    issues.push(String(error));
  }
}

function validateResumeCandidatesFile(paths: FlowRunnerPaths, issues: string[]): void {
  try {
    if (!fs.existsSync(paths.resumeCandidatesFile)) {
      issues.push(`missing resume-candidates file: ${paths.resumeCandidatesFile}`);
      return;
    }
    const payload = readJsonFile<unknown>(paths.resumeCandidatesFile);
    validateResumeCandidatesPayload(payload, paths.resumeCandidatesFile);
  } catch (error) {
    issues.push(String(error));
  }
}

function validateCheckpointEntries(filePath: string, itemId: string, issues: string[]): number {
  try {
    let count = 0;
    for (const [index, entry] of readNdjson<unknown>(filePath).entries()) {
      count = index + 1;
      const record = assertRecord(entry, `${filePath} line ${index + 1}`);
      if (record.schema !== FLOW_PROTOCOL_SCHEMAS.checkpoint) {
        issues.push(`invalid checkpoint schema in ${filePath} at line ${index + 1}`);
      }
      if (record.command !== "checkpoint") {
        issues.push(`invalid checkpoint command in ${filePath} at line ${index + 1}`);
      }
      if (String(record.session_number ?? "") !== String(index + 1)) {
        issues.push(`checkpoint session_number drift in ${filePath} at line ${index + 1}`);
      }
      if (String(record.stage ?? "").trim() === "") {
        issues.push(`checkpoint stage missing in ${filePath} at line ${index + 1}`);
      }
      if (!(SESSION_STATUSES as readonly string[]).includes(String(record.session_status ?? ""))) {
        issues.push(`invalid checkpoint session_status in ${filePath} at line ${index + 1}`);
      }
      if (!(CLEAN_STATES as readonly string[]).includes(String(record.clean_state ?? ""))) {
        issues.push(`invalid checkpoint clean_state in ${filePath} at line ${index + 1}`);
      }
      if (String(record.item_id ?? "") !== itemId) {
        issues.push(`checkpoint item_id drift in ${filePath} at line ${index + 1}`);
      }
      if (record.task_ref !== undefined && typeof record.task_ref !== "string") {
        issues.push(`checkpoint task_ref must be a string in ${filePath} at line ${index + 1}`);
      }
    }
    return count;
  } catch (error) {
    issues.push(String(error));
    return -1;
  }
}

function validateProgressEntries(filePath: string, itemId: string, issues: string[]): number {
  try {
    let count = 0;
    for (const [index, entry] of readNdjson<unknown>(filePath).entries()) {
      count = index + 1;
      const record = assertRecord(entry, `${filePath} line ${index + 1}`);
      if (record.schema !== FLOW_PROTOCOL_SCHEMAS.progress) {
        issues.push(`invalid progress schema in ${filePath} at line ${index + 1}`);
      }
      if (String(record.session_number ?? "") !== String(index + 1)) {
        issues.push(`progress session_number drift in ${filePath} at line ${index + 1}`);
      }
      if (String(record.stage ?? "").trim() === "") {
        issues.push(`progress stage missing in ${filePath} at line ${index + 1}`);
      }
      if (!(SESSION_STATUSES as readonly string[]).includes(String(record.session_status ?? ""))) {
        issues.push(`invalid progress session_status in ${filePath} at line ${index + 1}`);
      }
      if (!(CLEAN_STATES as readonly string[]).includes(String(record.clean_state ?? ""))) {
        issues.push(`invalid progress clean_state in ${filePath} at line ${index + 1}`);
      }
      if (String(record.item_id ?? "") !== itemId) {
        issues.push(`progress item_id drift in ${filePath} at line ${index + 1}`);
      }
      if (record.task_ref !== undefined && typeof record.task_ref !== "string") {
        issues.push(`progress task_ref must be a string in ${filePath} at line ${index + 1}`);
      }
    }
    return count;
  } catch (error) {
    issues.push(String(error));
    return -1;
  }
}

function validateMutationReceiptEntries(filePath: string, itemId: string, issues: string[]): string[] {
  const mutations: string[] = [];
  const receiptIds = new Set<string>();
  try {
    for (const [index, entry] of readNdjson<unknown>(filePath).entries()) {
      const label = `${filePath} line ${index + 1}`;
      const receipt = validateMutationReceipt(entry, label);
      mutations.push(receipt.mutation);
      if (receipt.item_id !== itemId) {
        issues.push(`mutation receipt item_id drift in ${filePath} at line ${index + 1}`);
      }
      if (receiptIds.has(receipt.receipt_id)) {
        issues.push(`duplicate mutation receipt_id in ${filePath}: ${receipt.receipt_id}`);
      }
      receiptIds.add(receipt.receipt_id);
    }
    return mutations;
  } catch (error) {
    issues.push(String(error));
    return mutations;
  }
}

function validatePlanRevisionDir(dirPath: string, activeRevisionId: string, issues: string[]): void {
  try {
    if (!fs.existsSync(dirPath)) {
      issues.push(`missing plan-revisions dir: ${dirPath}`);
      return;
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    if (entries.length === 0) {
      issues.push(`plan-revisions dir is empty: ${dirPath}`);
    }
    for (const entry of entries) {
      const filePath = path.join(dirPath, entry.name);
      const record = assertRecord(readJsonFile<unknown>(filePath), filePath);
      if (record.schema !== PLAN_REVISION_SCHEMA) {
        issues.push(`invalid plan revision schema: ${filePath}`);
      }
      const revisionId = String(record.revision_id ?? "").trim();
      if (revisionId !== entry.name.replace(/\.json$/, "")) {
        issues.push(`plan revision id drift in ${filePath}`);
      }
    }
    if (!fs.existsSync(path.join(dirPath, `${activeRevisionId}.json`))) {
      issues.push(`missing active plan revision ${activeRevisionId} in ${dirPath}`);
    }
  } catch (error) {
    issues.push(String(error));
  }
}

function validateIncidentDir(dirPath: string, openIds: string[], issues: string[]): void {
  try {
    if (!fs.existsSync(dirPath)) {
      issues.push(`missing incidents dir: ${dirPath}`);
      return;
    }
    const seenIds = new Set<string>();
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const filePath = path.join(dirPath, entry.name);
      const record = assertRecord(readJsonFile<unknown>(filePath), filePath);
      if (record.schema !== FLOW_PROTOCOL_SCHEMAS.incident) {
        issues.push(`invalid incident schema: ${filePath}`);
      }
      const incidentId = String(record.incident_id ?? "").trim();
      if (!incidentId) {
        issues.push(`missing incident id in ${filePath}`);
        continue;
      }
      if (incidentId !== entry.name.replace(/\.json$/, "")) {
        issues.push(`incident id drift in ${filePath}`);
      }
      if (seenIds.has(incidentId)) {
        issues.push(`duplicate incident id in ${dirPath}: ${incidentId}`);
      }
      seenIds.add(incidentId);
      const status = String(record.status ?? "").trim();
      if (!(INCIDENT_STATUSES as readonly string[]).includes(status)) {
        issues.push(`invalid incident status in ${filePath}`);
      }
      if (!(INCIDENT_RESUMES as readonly string[]).includes(String(record.recommended_resume ?? ""))) {
        issues.push(`invalid incident recommended_resume in ${filePath}`);
      }
      if (openIds.includes(incidentId) && status !== "open") {
        issues.push(`incident must remain open while referenced from runtime: ${filePath}`);
      }
      if (!openIds.includes(incidentId) && status === "open") {
        issues.push(`open incident file must remain referenced from runtime: ${filePath}`);
      }
    }
    if (new Set(openIds).size !== openIds.length) {
      issues.push(`runtime open_incident_ids contains duplicates: ${dirPath}`);
    }
    for (const openId of openIds) {
      if (!seenIds.has(openId)) {
        issues.push(`missing incident file referenced from runtime: ${path.join(dirPath, `${openId}.json`)}`);
      }
    }
  } catch (error) {
    issues.push(String(error));
  }
}

function validateSnapshotDir(snapshotDir: string, issues: string[]): void {
  try {
    const metadataPath = path.join(snapshotDir, "metadata.json");
    if (!fs.existsSync(metadataPath)) {
      issues.push(`missing snapshot metadata: ${metadataPath}`);
      return;
    }
    const record = assertRecord(readJsonFile<unknown>(metadataPath), metadataPath);
    if (record.schema !== SNAPSHOT_SCHEMA) {
      issues.push(`invalid snapshot schema: ${metadataPath}`);
    }
  } catch (error) {
    issues.push(String(error));
  }
}

export function validateFlowRunner(root: string): string[] {
  const paths = new FlowRunnerPaths(root);
  ensureRunnerExists(paths);
  const issues: string[] = [];
  if (!fs.existsSync(paths.surfaceFile)) {
    issues.push(`missing flow-runner surface marker: ${paths.surfaceFile}`);
  }
  try {
    loadPolicy(paths);
  } catch (error) {
    issues.push(String(error));
  }
  try {
    loadRecipe(paths);
  } catch (error) {
    issues.push(String(error));
  }
  validateNextActionFile(root, paths, issues);
  validateResumeCandidatesFile(paths, issues);

  const seenItemIds = new Set<string>();
  let activeInProgress = 0;
  for (const archived of [false, true]) {
    const baseDir = archived ? paths.archiveDir : paths.itemsDir;
    if (!fs.existsSync(baseDir)) {
      continue;
    }
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        issues.push(`unexpected non-directory under flow-runner runtime: ${path.join(baseDir, entry.name)}`);
        continue;
      }
      const statePath = path.join(baseDir, entry.name, "state.json");
      let state: ItemState;
      try {
        state = loadItemState(statePath);
      } catch (error) {
        issues.push(String(error));
        continue;
      }
      if (seenItemIds.has(state.item_id)) {
        issues.push(`duplicate flow-runner item_id across active and archive trees: ${state.item_id}`);
      }
      seenItemIds.add(state.item_id);
      if (state.archive_status !== (archived ? "archived" : "active")) {
        issues.push(`archive_status does not match physical location: ${statePath}`);
      }
      const currentStep = state.steps.find((step) => step.stage_key === state.current_stage);
      if (!currentStep) {
        issues.push(`current_stage does not exist in steps for ${statePath}`);
      } else if (currentStep.status !== state.current_step_status) {
        issues.push(`current_step_status drift from steps[] in ${statePath}`);
      }
      const expectedResolution: ResolutionKind =
        state.status === "completed" || state.status === "cancelled" ? "closeout" : "live";
      if (state.resolution !== expectedResolution) {
        issues.push(`resolution must match item status in ${statePath}`);
      }
      if (archived && state.runtime.open_incident_ids.length > 0) {
        issues.push(`archived item must not keep open incidents: ${statePath}`);
      }
      if (!archived && state.status === "in_progress") {
        activeInProgress += 1;
      }
      if (state.paths.handoff !== toRepoRelative(root, paths.itemHandoff(state.item_id, archived))) {
        issues.push(`handoff path drift in ${statePath}`);
      }
      if (state.paths.checkpoints !== toRepoRelative(root, paths.itemCheckpoints(state.item_id, archived))) {
        issues.push(`checkpoint path drift in ${statePath}`);
      }
      if (state.paths.progress_log !== toRepoRelative(root, paths.itemProgressLog(state.item_id, archived))) {
        issues.push(`progress path drift in ${statePath}`);
      }
      if (state.paths.mutation_receipts !== toRepoRelative(root, paths.itemMutationReceipts(state.item_id, archived))) {
        issues.push(`mutation receipt path drift in ${statePath}`);
      }
      if (!fs.existsSync(paths.itemHandoff(state.item_id, archived))) {
        issues.push(`missing handoff file: ${paths.itemHandoff(state.item_id, archived)}`);
      }
      if (!fs.existsSync(paths.itemCheckpoints(state.item_id, archived))) {
        issues.push(`missing checkpoints file: ${paths.itemCheckpoints(state.item_id, archived)}`);
      } else {
        const checkpointCount = validateCheckpointEntries(paths.itemCheckpoints(state.item_id, archived), state.item_id, issues);
        if (checkpointCount >= 0 && checkpointCount !== state.runtime.session_count) {
          issues.push(`session_count drift from checkpoints.ndjson in ${statePath}`);
        }
      }
      if (!fs.existsSync(paths.itemProgressLog(state.item_id, archived))) {
        issues.push(`missing progress log: ${paths.itemProgressLog(state.item_id, archived)}`);
      } else {
        const progressCount = validateProgressEntries(paths.itemProgressLog(state.item_id, archived), state.item_id, issues);
        if (progressCount >= 0 && progressCount !== state.runtime.session_count) {
          issues.push(`session_count drift from progress.ndjson in ${statePath}`);
        }
      }
      if (!fs.existsSync(paths.itemMutationReceipts(state.item_id, archived))) {
        issues.push(`missing mutation receipts log: ${paths.itemMutationReceipts(state.item_id, archived)}`);
      } else {
        const receiptMutations = validateMutationReceiptEntries(paths.itemMutationReceipts(state.item_id, archived), state.item_id, issues);
        const checkpointReceiptCount = receiptMutations.filter((mutation) => mutation === "checkpoint").length;
        if (checkpointReceiptCount !== state.runtime.session_count) {
          issues.push(`checkpoint mutation receipt count drifts from session_count in ${statePath}`);
        }
        if (state.runtime.latest_snapshot_id && !receiptMutations.includes("snapshot_anchor")) {
          issues.push(`latest_snapshot_id exists without snapshot_anchor mutation receipt in ${statePath}`);
        }
        if (archived && !receiptMutations.includes("archive_item") && !receiptMutations.includes("state_normalization")) {
          issues.push(`archived item is missing archive mutation receipt in ${statePath}`);
        }
      }
      validatePlanRevisionDir(paths.itemPlanRevisionsDir(state.item_id, archived), state.runtime.active_plan_revision_id, issues);
      validateIncidentDir(paths.itemIncidentsDir(state.item_id, archived), state.runtime.open_incident_ids, issues);
      if (state.runtime.open_incident_ids.length > 0 && !archived && state.status !== "blocked") {
        issues.push(`active item with open incidents must remain blocked: ${statePath}`);
      }
      if (!archived && state.status === "blocked" && state.runtime.open_incident_ids.length === 0) {
        if (state.source_kind === "feature-tracker") {
          try {
            if (trackerMirrorSourceStatus(root, state) !== "blocked") {
              issues.push(`blocked tracker mirror must keep an open incident or a blocked upstream source: ${statePath}`);
            }
          } catch (error) {
            issues.push(String(error));
          }
        } else {
          issues.push(`blocked item must keep an open incident or an upstream blocking source: ${statePath}`);
        }
      }
      if (state.runtime.latest_snapshot_id) {
        const snapshotDir = path.join(paths.backupsDir, state.runtime.latest_snapshot_id);
        if (!fs.existsSync(snapshotDir)) {
          issues.push(`missing snapshot dir for latest_snapshot_id in ${statePath}`);
        } else {
          validateSnapshotDir(snapshotDir, issues);
        }
      }
      if (state.source_kind === "feature-tracker") {
        const featureId = parseFeatureSourceRef(state.source_ref);
        if (!featureId) {
          issues.push(`invalid feature-tracker source_ref in ${statePath}`);
        } else {
          try {
            const source = loadFeatureSource(root, featureId);
            const sourceStatus = String(source.state.status ?? "").trim();
            const workspaceMode = String(source.state.workspace_mode ?? "").trim();
            if ((sourceStatus === "archived" || sourceStatus === "discarded") && state.archive_status !== "archived") {
              issues.push(`feature-tracker source is closed but runner item remains active: ${statePath}`);
            }
            if (workspaceMode === "proposal_only" && state.status === "in_progress") {
              issues.push(`proposal_only feature must not appear as in_progress in flow-runner: ${statePath}`);
            }
            if (sourceStatus === "done" && state.status !== "completed" && state.status !== "cancelled") {
              issues.push(`done feature must map to completed or cancelled runner state: ${statePath}`);
            }
            if (sourceStatus !== "archived" && sourceStatus !== "discarded" && state.archive_status === "archived") {
              issues.push(`active feature-tracker source must not map to archived runner item: ${statePath}`);
            }
          } catch (error) {
            issues.push(String(error));
          }
        }
      }
    }
  }
  if (activeInProgress > 1) {
    issues.push("multiple in-progress active items detected");
  }
  return issues;
}
