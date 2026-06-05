import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runCommand, type CommandResult } from "../../../../dev/eval/src/lib/command.ts";
import { loadEvalDataset, reportEvalDataset } from "../../../../dev/eval/src/lib/dataset.ts";
import type { EvalCaseContext, EvalCaseResult, EvalSuiteDefinition } from "../../../../dev/eval/src/lib/model.ts";
import { cleanupTempDir, createTempDir, registerTempRepo } from "../../../../dev/eval/src/lib/temp.ts";

const CLARITY_DATASET_REL = "gate_eval/skills/paperwork/bagakit-writing-core/cases/writing-clarity-transfer-eval-dataset.json";
const CLARITY_CASE_IDS = [
  "en-procedure-keeps-order-and-actions",
  "en-rationale-resists-procedure-flattening",
  "en-terminology-stays-stable",
  "zh-nominalization-restores-actions",
  "zh-referents-preserve-role-mapping",
];
const CLARITY_RULE_IDS = new Set([
  "instruction-primary-action",
  "reader-burden-bounds-complexity",
  "referent-actor-action-visible",
  "terminology-stability-one-concept",
]);

function expectOk(result: CommandResult, label: string): void {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function withFixture(context: EvalCaseContext): { tempRepo: string; replacements: Array<{ from: string; to: string }> } {
  const tempRepo = createTempDir("bagakit-writing-core-eval-");
  return {
    tempRepo,
    replacements: registerTempRepo(context, tempRepo),
  };
}

export const SUITE: EvalSuiteDefinition = {
  id: "bagakit-writing-core-behavior-starter-eval",
  owner: "gate_eval/skills/paperwork/bagakit-writing-core",
  title: "Bagakit Writing Core Behavior Starter Eval",
  summary: "Check that route, rule metadata, no-regression, lint, review, and anti-rationalization surfaces are reachable through the writing-core CLI.",
  defaultOutputDir: "gate_eval/skills/paperwork/bagakit-writing-core/results/runs",
  cases: [
    {
      id: "core-route-lint-review-surfaces-are-reachable",
      title: "Core Route Lint Review Surfaces Are Reachable",
      summary: "The public CLI should expose route/foundation checks, rule metadata, no-regression inventory, lint JSON, review packet, and anti-rationalization discipline.",
      focus: ["route", "rules", "no-regression", "lint", "review-packet", "anti-rationalization"],
      run: (context): EvalCaseResult => {
        const fixture = withFixture(context);
        const cliRel = "skills/paperwork/bagakit-writing-core/scripts/bagakit-writing-core-cli.sh";
        const cli = path.join(context.repoRoot, cliRel);
        try {
          const routePath = path.join(fixture.tempRepo, "route.md");
          fs.writeFileSync(
            routePath,
            [
              "# Route",
              "",
              "- title_promise: A title must make a judgment.",
              "- first_question: What should the reader decide first?",
              "- evidence_movement: Start from claim, then evidence.",
              "- chapter_movement: Move from problem to mechanism to action.",
              "- exit_move: Decide the next writing action.",
              "",
            ].join("\n"),
          );
          const draftPath = path.join(fixture.tempRepo, "draft.md");
          fs.writeFileSync(
            draftPath,
            [
              "# Title With A Claim",
              "",
              "## First Claim",
              "",
              "本文将通过多个步骤从而进而说明这个问题。",
              "管住了一个开放、长期、容易跑偏的任务。",
              "",
              "- one",
              "- two",
              "- three",
              "- four",
              "",
              "## Second Claim",
              "",
              "The next action is check.",
              "",
              "## Third Claim",
              "",
              "Goal, status, next step.",
              "",
            ].join("\n"),
          );
          const foundationPath = path.join(fixture.tempRepo, "foundation.md");
          fs.writeFileSync(
            foundationPath,
            [
              "# Rewrite Core Needs A Rule Registry",
              "",
              "- title_promise: Core rules should be reusable metadata, not scattered advice.",
              "- first_question: Which generic writing checks should every L2 skill inherit?",
              "- evidence_shape: Source notes, rule ids, and benchmark 12 ms command output.",
              "- sample_boundary: Applies to paperwork L1 Core and excludes personal style overlays.",
              "- counterevidence: A tiny typo fix should not require a full review packet.",
              "- exit_move: Next action: run rules validate and inventory compare before accepting the rewrite.",
              "",
            ].join("\n"),
          );
          const sourcePath = path.join(fixture.tempRepo, "source.md");
          fs.writeFileSync(
            sourcePath,
            [
              "# Preserve Evidence",
              "",
              "Claim: Core must keep rewrite evidence visible.",
              "Evidence: benchmark source https://example.com/core shows `scripts/core-check.ts` at 12 ms.",
              "Constraint: must not drop protected implementation paths.",
              "Risk: deleting the command hides a review failure.",
              "Next action: run validate before publishing.",
              "",
            ].join("\n"),
          );
          const rewritePath = path.join(fixture.tempRepo, "rewrite.md");
          fs.writeFileSync(rewritePath, "# Preserve Evidence\n\nCore should improve the draft.\n");

          const route = runCommand("bash", [cli, "route", "check-foundation", routePath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(route, "route check");
          const routeJson = JSON.parse(route.stdout);
          assert.equal(routeJson.stable, true, "route fixture should be stable");

          const foundation = runCommand("bash", [cli, "route", "review-foundation", foundationPath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(foundation, "foundation review");
          const foundationJson = JSON.parse(foundation.stdout);
          assert.equal(foundationJson.schema, "bagakit.writing_core_foundation_review.v1");
          assert.equal(foundationJson.status, "stable", "foundation fixture should be stable");

          const rules = runCommand("bash", [cli, "rules", "validate"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(rules, "rules validate");
          const rulesJson = JSON.parse(rules.stdout);
          assert.equal(rulesJson.ok, true, "rule registry should validate");
          assert.ok(rulesJson.count >= 13, "rule registry should expose expanded Core rules");

          const ruleShow = runCommand("bash", [cli, "rules", "show", "title-promise-topic-label"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(ruleShow, "rules show");
          const ruleShowJson = JSON.parse(ruleShow.stdout);
          assert.equal(ruleShowJson.owner, "bagakit-writing-core");
          assert.ok(ruleShowJson.proof_mode, "shown rule should expose proof_mode");

          const rhythmRuleShow = runCommand("bash", [cli, "rules", "show", "object-before-short-judgment"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(rhythmRuleShow, "rules show object-before-short-judgment");
          const rhythmRuleShowJson = JSON.parse(rhythmRuleShow.stdout);
          assert.equal(rhythmRuleShowJson.owner, "bagakit-writing-core");
          assert.equal(rhythmRuleShowJson.proof_mode, "lint_json");

          const clarityRuleShow = runCommand("bash", [cli, "rules", "show", "terminology-stability-one-concept"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(clarityRuleShow, "rules show terminology-stability-one-concept");
          const clarityRuleShowJson = JSON.parse(clarityRuleShow.stdout);
          assert.equal(clarityRuleShowJson.owner, "bagakit-writing-core");
          assert.ok(Array.isArray(clarityRuleShowJson.source_refs) && clarityRuleShowJson.source_refs.length >= 2);

          const inventory = runCommand("bash", [cli, "inventory", "compare", sourcePath, rewritePath, "--fail-on", "risk"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          assert.equal(inventory.status, 2, `inventory compare should fail on risk\nstdout:\n${inventory.stdout}\nstderr:\n${inventory.stderr}`);
          const inventoryJson = JSON.parse(inventory.stdout);
          assert.equal(inventoryJson.schema, "bagakit.writing_core_inventory_compare.v1");
          assert.equal(inventoryJson.regressionRisk, true, "inventory compare should flag rewrite regression risk");
          assert.ok(
            (inventoryJson.missingCategories ?? []).length > 0 || (inventoryJson.missingProtectedLikeTokens ?? []).length > 0,
            "inventory compare should name missing categories or protected-like tokens",
          );

          const lint = runCommand("bash", [cli, "lint", "--fail-on", "none", draftPath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(lint, "lint");
          const lintJson = JSON.parse(lint.stdout);
          const codes = new Set((lintJson.findings ?? []).map((item: { code?: string }) => item.code));
          assert.ok(codes.has("AI_PATTERNS") || codes.has("LIST_BLOCK_CLUSTER"), "lint should expose at least one writing signal");
          assert.ok(codes.has("OBJECT_JUDGMENT_TAIL_ADVISORY"), "lint should expose object/judgment sentence-rhythm advisory");
          assert.ok(lintJson.proseMechanics, "lint should expose proseMechanics metrics");

          const deAiTone = runCommand("bash", [cli, "de-ai-tone", "lint", "--profile", "blog", "--fail-on", "none", draftPath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(deAiTone, "de-AI-tone dispatch");
          const deAiToneJson = JSON.parse(deAiTone.stdout);
          assert.equal(deAiToneJson.schema, "bagakit.de_ai_tone_lint.v1", "core should dispatch to de-AI-tone lint schema");

          const review = runCommand("bash", [cli, "print-review-packet-template"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(review, "review packet template");
          assert.ok(review.stdout.includes("skill: `bagakit-writing-core`"));
          assert.ok(review.stdout.includes("counterevidence"));

          const anti = runCommand("bash", [cli, "print-anti-rationalization-table"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(anti, "anti-rationalization table");
          assert.ok(anti.stdout.includes("The model knows the tool or API"));
          assert.ok(anti.stdout.includes("accepted deviation"));

          return {
            assertions: [
              "route check marks a complete route memo stable",
              "foundation review emits stable structured dimensions for a complete route artifact",
              "rule registry validates and exposes individual rule metadata",
              "object-before-short-judgment is exposed as lint-backed Core rule metadata",
              "STE-derived clarity rules expose source parentage without claiming compliance",
              "inventory compare flags dropped evidence, actions, risks, or protected-like tokens",
              "lint emits structured writing signals, sentence-rhythm advisory, and prose mechanics",
              "de-AI-tone primitive is reachable through writing-core",
              "review packet exposes the generic writing-core skill id",
              "anti-rationalization table is reachable through the public CLI",
            ],
            commands: [
              `bash ${cliRel} route check-foundation <temp-repo>/route.md`,
              `bash ${cliRel} route review-foundation <temp-repo>/foundation.md`,
              `bash ${cliRel} rules validate`,
              `bash ${cliRel} rules show title-promise-topic-label`,
              `bash ${cliRel} rules show object-before-short-judgment`,
              `bash ${cliRel} rules show terminology-stability-one-concept`,
              `bash ${cliRel} inventory compare <temp-repo>/source.md <temp-repo>/rewrite.md --fail-on risk`,
              `bash ${cliRel} lint --fail-on none <temp-repo>/draft.md`,
              `bash ${cliRel} de-ai-tone lint --profile blog --fail-on none <temp-repo>/draft.md`,
              `bash ${cliRel} print-review-packet-template`,
              `bash ${cliRel} print-anti-rationalization-table`,
            ],
            artifacts: [
              { label: "route-fixture", path: routePath },
              { label: "foundation-fixture", path: foundationPath },
              { label: "draft-fixture", path: draftPath },
              { label: "source-fixture", path: sourcePath },
              { label: "rewrite-fixture", path: rewritePath },
              { label: "writing-core-cli", path: cliRel },
            ],
            outputs: {
              route_stable: routeJson.stable,
              foundation_status: foundationJson.status,
              rules_count: rulesJson.count,
              inventory_status: inventoryJson.status,
              lint_codes: Array.from(codes).sort(),
            },
            replacements: fixture.replacements,
          };
        } finally {
          cleanupTempDir(fixture.tempRepo, context.keepTemp);
        }
      },
    },
    {
      id: "clarity-transfer-cases-preserve-information-and-boundaries",
      title: "Clarity Transfer Cases Preserve Information And Boundaries",
      summary: "The Core-owned case pack should cover STE-derived clarity gains and a holdout that rejects procedure-style flattening.",
      focus: ["clarity", "terminology", "referents", "instructions", "no-regression"],
      run: (context): EvalCaseResult => {
        const dataset = loadEvalDataset(path.join(context.repoRoot, CLARITY_DATASET_REL));
        const report = reportEvalDataset(dataset);
        const caseIds = dataset.items.map((item) => item.id).sort();
        assert.deepEqual(caseIds, [...CLARITY_CASE_IDS].sort());
        assert.equal(dataset.items.length, 5);
        assert.ok(report.splits.some((split) => split.split === "baseline" && split.count === 4));
        assert.ok(report.splits.some((split) => split.split === "holdout" && split.count === 1));
        assert.ok(dataset.items.every((item) => item.skill_id === "bagakit-writing-core"));

        const observedRuleIds = new Set<string>();
        for (const item of dataset.items) {
          assert.ok(item.prompt.length >= 150, `${item.id} prompt should define a real rewrite boundary`);
          assert.ok(item.expected_outcome.length >= 140, `${item.id} expected_outcome should guide review`);
          assert.ok(item.notes_for_human_review.length >= 80, `${item.id} review notes should identify failure modes`);
          const reference = item.reference_state as Record<string, unknown>;
          assert.ok(Array.isArray(reference.required_facts) && reference.required_facts.length >= 3, `${item.id} should preserve a fact ledger`);
          const applicable = reference.applicable_rule_ids;
          assert.ok(Array.isArray(applicable) && applicable.length >= 1, `${item.id} should name applicable Core rules`);
          for (const ruleId of applicable as string[]) {
            assert.ok(CLARITY_RULE_IDS.has(ruleId), `${item.id} references unknown clarity rule ${ruleId}`);
            observedRuleIds.add(ruleId);
          }
        }
        assert.deepEqual([...observedRuleIds].sort(), [...CLARITY_RULE_IDS].sort());

        return {
          assertions: [
            "clarity case pack covers all four new Core rule ids",
            "every case carries an explicit fact ledger for no-regression review",
            "holdout case rejects procedure-style flattening of technical rationale",
          ],
          artifacts: [{ label: "clarity-transfer-dataset", path: CLARITY_DATASET_REL }],
          outputs: {
            cases: caseIds,
            splits: report.splits,
            rule_ids: [...observedRuleIds].sort(),
          },
        };
      },
    },
  ],
};

export default SUITE;
