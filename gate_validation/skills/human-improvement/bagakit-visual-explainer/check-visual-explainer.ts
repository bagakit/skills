import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { parseTomlFile } from "../../../../dev/validator/src/lib/toml.ts";

const SKILL_ID = "bagakit-visual-explainer";
const SKILL_ROOT = `skills/human-improvement/${SKILL_ID}`;
const EXPECTED_STAGES = [
  "scope",
  "coverage",
  "orient",
  "map",
  "zoom",
  "walkthrough",
  "mechanism",
  "roots",
  "reassemble",
  "verify",
];
const REQUIRED_GUARDS = new Set([
  "user-language",
  "complex-topic-map",
  "coverage-before-compression",
  "few-words-not-few-ideas",
  "causal-depth",
  "analogy-boundary",
  "semantic-visuals",
  "intentional-style",
  "tonality-not-topic-stereotype",
  "no-false-mastery",
  "responsive-accessible",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a TOML table`);
  }
  return value as Record<string, unknown>;
}

function records(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of TOML tables`);
  }
  return value.map((item, index) => record(item, `${label}[${index}]`));
}

function require(condition: boolean, message: string, failures: string[]): void {
  if (!condition) failures.push(message);
}

function main(): number {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { root: { type: "string", default: "." } },
    strict: true,
    allowPositionals: false,
  });
  const root = path.resolve(values.root);
  const skillDir = path.join(root, SKILL_ROOT);
  const contract = record(
    parseTomlFile(path.join(skillDir, "references/visual-explanation-contract.toml")),
    "contract",
  );
  const frontdoor = record(
    parseTomlFile(path.join(skillDir, "references/frontdoor-rule.toml")),
    "frontdoor",
  );
  const skillText = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  const familyText = fs.readFileSync(
    path.join(root, "skills/human-improvement/README.md"),
    "utf8",
  );
  const failures: string[] = [];

  require(contract.version === 1, "contract version must be 1", failures);
  require(contract.skill === SKILL_ID, "contract skill identity drifted", failures);
  require(
    contract.default_delivery === "built_html",
    "default delivery must remain built_html",
    failures,
  );
  require(
    contract.runtime_surface === "none",
    "V0 must not claim a persistent runtime surface",
    failures,
  );

  const stageIds = records(contract.stage, "stage").map((stage) => stage.id);
  require(
    JSON.stringify(stageIds) === JSON.stringify(EXPECTED_STAGES),
    `stage order mismatch: expected ${EXPECTED_STAGES.join(", ")}; got ${stageIds.join(", ")}`,
    failures,
  );
  const guardIds = new Set(records(contract.guard, "guard").map((guard) => guard.id));
  const missingGuards = [...REQUIRED_GUARDS].filter((guard) => !guardIds.has(guard));
  require(
    missingGuards.length === 0,
    `missing contract guards: ${missingGuards.join(", ")}`,
    failures,
  );

  require(frontdoor.version === 1, "frontdoor version must be 1", failures);
  require(frontdoor.skill === SKILL_ID, "frontdoor skill identity drifted", failures);
  require(
    frontdoor.see === [SKILL_ROOT, "SKILL.md"].join("/"),
    "frontdoor see path must point to the canonical SKILL.md",
    failures,
  );
  require(
    skillText.includes("references/visual-explanation-contract.toml"),
    "SKILL.md must link the structured explanation contract",
    failures,
  );
  require(familyText.includes(SKILL_ID), "family README must discover the skill", failures);

  if (failures.length > 0) {
    for (const failure of failures) console.error(`fail: ${failure}`);
    return 1;
  }

  console.log("ok: bagakit-visual-explainer contract is aligned");
  return 0;
}

process.exitCode = main();
