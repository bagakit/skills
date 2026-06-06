import path from "node:path";
import { parseArgs } from "node:util";

import {
  appendCheckpoint,
  activateFeatureTracker,
  applyFlowRunner,
  archiveItem,
  captureSnapshot,
  computeNextAction,
  computeResumeCandidates,
  createManualItem,
  ingestFeatureTracker,
  listItemSummaries,
  openIncident,
  resolveIncident,
  validateFlowRunner,
} from "./lib/core.ts";
import { CLEAN_STATES, INCIDENT_RESUMES, ITEM_STATUSES, SESSION_STATUSES } from "./lib/model.ts";

const defaultSkillDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function commonOptions() {
  return {
    root: { type: "string" as const, default: "." },
    "skill-dir": { type: "string" as const, default: defaultSkillDir },
  };
}

function parseFiniteNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number`);
  }
  return parsed;
}

function printHelp(): void {
  console.log(`bagakit flow runner

Commands:
  apply [--root <repo-root>] [--skill-dir <skill-dir>]
  add-item --item-id <id> --title <title> --source-kind <kind> --source-ref <ref> [--priority <n>] [--confidence <n>]
  ingest-feature-tracker [--root <repo-root>]
  activate-feature-tracker --feature <feature-id> [--root <repo-root>] [--json]
  list-items [--root <repo-root>] [--json]
  next [--root <repo-root>] [--item <item-id>] [--json]
  resume-candidates [--root <repo-root>] [--json]
  snapshot --root <repo-root> --item <item-id> --label <label> [--json]
  checkpoint --item <item-id> --stage <stage> --session-status <status> --objective <text> --attempted <text> --result <text> --next-action <text> --clean-state <yes|no|unknown> [--task-ref <upstream-item-id>] [--item-status <status>] [--json]
  open-incident --item <item-id> --family <family> --summary <summary> --recommended-resume <stay_blocked|resume_execution|closeout> [--json]
  resolve-incident --item <item-id> --incident <incident-id> --close-note <note> [--json]
  archive-item --item <item-id>
  validate [--root <repo-root>] [--json]`);
}

function cmdApply(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: commonOptions(),
    strict: true,
    allowPositionals: false,
  });
  const runnerDir = applyFlowRunner(path.resolve(values.root), path.resolve(values["skill-dir"]));
  console.log(`ok: flow-runner initialized at ${runnerDir}`);
  return 0;
}

function cmdAddItem(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      "item-id": { type: "string" as const },
      title: { type: "string" as const },
      "source-kind": { type: "string" as const },
      "source-ref": { type: "string" as const },
      priority: { type: "string" as const, default: "100" },
      confidence: { type: "string" as const, default: "0.7" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values["item-id"] || !values.title || !values["source-kind"] || !values["source-ref"]) {
    throw new Error("add-item requires --item-id, --title, --source-kind, and --source-ref");
  }
  const itemId = createManualItem(
    path.resolve(values.root),
    path.resolve(values["skill-dir"]),
    values["item-id"],
    values.title,
    values["source-kind"],
    values["source-ref"],
    parseFiniteNumber(values.priority, "--priority"),
    parseFiniteNumber(values.confidence, "--confidence"),
  );
  console.log(`ok: item added ${itemId}`);
  return 0;
}

function cmdIngestFeatureTracker(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: commonOptions(),
    strict: true,
    allowPositionals: false,
  });
  const result = ingestFeatureTracker(path.resolve(values.root));
  console.log(`ok: flow-runner ingest complete imported=${result.imported} updated=${result.updated} retired=${result.retired}`);
  return 0;
}

function cmdActivateFeatureTracker(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      feature: { type: "string" as const },
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.feature) {
    throw new Error("activate-feature-tracker requires --feature");
  }
  const payload = activateFeatureTracker(path.resolve(values.root), values.feature);
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`ok: activated feature ${payload.feature_id} -> ${payload.item_id}`);
  }
  return 0;
}

function cmdListItems(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const items = listItemSummaries(path.resolve(values.root));
  if (values.json) {
    console.log(JSON.stringify({ items }, null, 2));
    return 0;
  }
  for (const item of items) {
    console.log(`${item.item_id}\t${item.item_status}\t${item.current_stage}\t${item.title}`);
  }
  return 0;
}

function cmdNext(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      item: { type: "string" as const },
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const payload = computeNextAction(path.resolve(values.root), values.item || undefined);
  console.log(JSON.stringify(payload, null, 2));
  return 0;
}

function cmdResumeCandidates(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const payload = computeResumeCandidates(path.resolve(values.root));
  console.log(JSON.stringify(payload, null, 2));
  return 0;
}

function cmdSnapshot(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      item: { type: "string" as const },
      label: { type: "string" as const },
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.item || !values.label) {
    throw new Error("snapshot requires --item and --label");
  }
  const payload = captureSnapshot(path.resolve(values.root), values.item, values.label);
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`ok: snapshot created ${payload.snapshot_id}`);
  }
  return 0;
}

function cmdCheckpoint(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      item: { type: "string" as const },
      "task-ref": { type: "string" as const },
      stage: { type: "string" as const },
      "session-status": { type: "string" as const },
      objective: { type: "string" as const },
      attempted: { type: "string" as const },
      result: { type: "string" as const },
      "next-action": { type: "string" as const },
      "clean-state": { type: "string" as const },
      "item-status": { type: "string" as const },
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.item || !values.stage || !values["session-status"] || !values.objective || !values.attempted || !values.result || !values["next-action"] || !values["clean-state"]) {
    throw new Error("checkpoint requires --item, --stage, --session-status, --objective, --attempted, --result, --next-action, and --clean-state");
  }
  if (!(SESSION_STATUSES as readonly string[]).includes(values["session-status"])) {
    throw new Error(`invalid --session-status ${JSON.stringify(values["session-status"])}`);
  }
  if (!(CLEAN_STATES as readonly string[]).includes(values["clean-state"])) {
    throw new Error(`invalid --clean-state ${JSON.stringify(values["clean-state"])}`);
  }
  const itemStatus = values["item-status"];
  if (itemStatus && !(ITEM_STATUSES as readonly string[]).includes(itemStatus)) {
    throw new Error(`invalid --item-status ${JSON.stringify(itemStatus)}`);
  }
  const payload = appendCheckpoint(
    path.resolve(values.root),
    values.item,
    values.stage,
    values["session-status"] as (typeof SESSION_STATUSES)[number],
    values.objective,
    values.attempted,
    values.result,
    values["next-action"],
    values["clean-state"] as (typeof CLEAN_STATES)[number],
    itemStatus as (typeof ITEM_STATUSES)[number] | undefined,
    values["task-ref"],
  );
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`ok: checkpoint recorded ${payload.item_id} session=${payload.checkpoint_receipt.session_number}`);
  }
  return 0;
}

function cmdOpenIncident(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      item: { type: "string" as const },
      family: { type: "string" as const },
      summary: { type: "string" as const },
      "recommended-resume": { type: "string" as const },
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.item || !values.family || !values.summary || !values["recommended-resume"]) {
    throw new Error("open-incident requires --item, --family, --summary, and --recommended-resume");
  }
  if (!(INCIDENT_RESUMES as readonly string[]).includes(values["recommended-resume"])) {
    throw new Error(`invalid --recommended-resume ${JSON.stringify(values["recommended-resume"])}`);
  }
  const incidentId = openIncident(
    path.resolve(values.root),
    values.item,
    values.family,
    values.summary,
    values["recommended-resume"] as (typeof INCIDENT_RESUMES)[number],
  );
  if (values.json) {
    console.log(JSON.stringify({ incident_id: incidentId }, null, 2));
  } else {
    console.log(`ok: incident opened ${incidentId}`);
  }
  return 0;
}

function cmdResolveIncident(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      item: { type: "string" as const },
      incident: { type: "string" as const },
      "close-note": { type: "string" as const },
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.item || !values.incident || !values["close-note"]) {
    throw new Error("resolve-incident requires --item, --incident, and --close-note");
  }
  const incidentId = resolveIncident(path.resolve(values.root), values.item, values.incident, values["close-note"]);
  if (values.json) {
    console.log(JSON.stringify({ incident_id: incidentId }, null, 2));
  } else {
    console.log(`ok: incident resolved ${incidentId}`);
  }
  return 0;
}

function cmdArchiveItem(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      item: { type: "string" as const },
    },
    strict: true,
    allowPositionals: false,
  });
  if (!values.item) {
    throw new Error("archive-item requires --item");
  }
  archiveItem(path.resolve(values.root), values.item);
  console.log(`ok: item archived ${values.item}`);
  return 0;
}

function cmdValidate(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      ...commonOptions(),
      json: { type: "boolean" as const, default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const issues = validateFlowRunner(path.resolve(values.root));
  if (values.json) {
    console.log(JSON.stringify({ issues }, null, 2));
  } else if (issues.length === 0) {
    console.log("ok: flow-runner validation passed");
  } else {
    for (const issue of issues) {
      console.error(`error: ${issue}`);
    }
  }
  return issues.length === 0 ? 0 : 1;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return 0;
  }
  switch (command) {
    case "apply":
      return cmdApply(rest);
    case "add-item":
      return cmdAddItem(rest);
    case "ingest-feature-tracker":
      return cmdIngestFeatureTracker(rest);
    case "activate-feature-tracker":
      return cmdActivateFeatureTracker(rest);
    case "list-items":
      return cmdListItems(rest);
    case "next":
      return cmdNext(rest);
    case "resume-candidates":
      return cmdResumeCandidates(rest);
    case "snapshot":
      return cmdSnapshot(rest);
    case "checkpoint":
      return cmdCheckpoint(rest);
    case "open-incident":
      return cmdOpenIncident(rest);
    case "resolve-incident":
      return cmdResolveIncident(rest);
    case "archive-item":
      return cmdArchiveItem(rest);
    case "validate":
      return cmdValidate(rest);
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`bagakit-flow-runner: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
