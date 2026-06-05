import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runCommand, type CommandResult } from "../../../../dev/eval/src/lib/command.ts";
import { loadEvalDataset, reportEvalDataset } from "../../../../dev/eval/src/lib/dataset.ts";
import type { EvalCaseContext, EvalCaseResult, EvalSuiteDefinition } from "../../../../dev/eval/src/lib/model.ts";
import { cleanupTempDir, createTempDir, registerTempRepo } from "../../../../dev/eval/src/lib/temp.ts";

const REWRITE_DATASET_REL = "gate_eval/skills/paperwork/bagakit-writing-de-ai-tone/cases/ai-tone-rewrite-eval-dataset.json";

const REQUIRED_REWRITE_CASES = [
  "already-human-minimal-edit",
  "conflict-bait-public-note",
  "english-product-update-dehype",
  "quoted-source-product-label-boundary",
  "technical-doc-protected-spans",
  "zh-internal-status-accountability",
];

const REQUIRED_REWRITE_DIMENSIONS = [
  "detection_precision",
  "evidence_preservation",
  "minimal_edit_judgment",
  "protected_span_integrity",
  "rewrite_quality",
  "scene_fit",
  "second_pass_audit",
];

function expectOk(result: CommandResult, label: string): void {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
  return value;
}

function assertStringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.every((entry) => typeof entry === "string" && entry.trim() !== ""), `${label} must contain non-empty strings`);
  return value;
}

function assertRubric(value: unknown, label: string, dimensions: string[]): void {
  const rubric = assertRecord(value, label);
  for (const dimension of dimensions) {
    const description = assertString(rubric[dimension], `${label}.${dimension}`);
    assert.ok(description.length >= 40, `${label}.${dimension} should describe the review rule`);
  }
}

function withFixture(context: EvalCaseContext): { tempRepo: string; replacements: Array<{ from: string; to: string }> } {
  const tempRepo = createTempDir("bagakit-de-ai-tone-eval-");
  return {
    tempRepo,
    replacements: registerTempRepo(context, tempRepo),
  };
}

export const SUITE: EvalSuiteDefinition = {
  id: "bagakit-writing-de-ai-tone-behavior-starter-eval",
  owner: "gate_eval/skills/paperwork/bagakit-writing-de-ai-tone",
  title: "Bagakit Writing De-AI-Tone Behavior Starter Eval",
  summary: "Check AI-tone detection, technical profile exemptions, writing-core dispatch, and qualitative rewrite-case coverage.",
  defaultOutputDir: "gate_eval/skills/paperwork/bagakit-writing-de-ai-tone/results/runs",
  cases: [
    {
      id: "de-ai-tone-detects-patterns-and-core-dispatches",
      title: "De-AI-Tone Detects Patterns And Core Dispatches",
      summary: "The public CLI should flag representative Chinese AI-tone patterns while technical profile exemptions stay non-blocking.",
      focus: ["ai-tone", "profile-exemption", "core-dispatch"],
      run: (context): EvalCaseResult => {
        const fixture = withFixture(context);
        const cliRel = "skills/paperwork/bagakit-writing-de-ai-tone/scripts/bagakit-writing-de-ai-tone-cli.sh";
        const coreCliRel = "skills/paperwork/bagakit-writing-core/scripts/bagakit-writing-core-cli.sh";
        const cli = path.join(context.repoRoot, cliRel);
        const coreCli = path.join(context.repoRoot, coreCliRel);
        try {
          const aiTonePath = path.join(fixture.tempRepo, "ai-tone.md");
          fs.writeFileSync(
            aiTonePath,
            [
              "# 随着 AI 的不断发展",
              "",
              "随着 AI 的不断发展，团队通过统一能力进行分析，从而打通链路，进而赋能业务闭环。",
              "",
              "这不是工具问题，而是底层逻辑问题。不是流程问题，而是生态问题。",
              "",
              "大多数人会把它写成该做 vs 不该做。很多团队往往又会写成老路 vs 新路。",
              "",
              "业内人士指出，这具有里程碑式的意义。",
              "这次改造实现了对响应速度的显著提升。",
              "",
            ].join("\n"),
          );
          const technicalPath = path.join(fixture.tempRepo, "technical.md");
          fs.writeFileSync(
            technicalPath,
            [
              "# Pipeline note",
              "",
              "The network 链路 records packet timing. The control 闭环 is part of the simulator.",
              "The retry code is robust and documented in the API reference.",
              "",
            ].join("\n"),
          );

          const lint = runCommand("bash", [cli, "lint", "--profile", "blog", "--fail-on", "none", aiTonePath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(lint, "de-AI-tone lint");
          const lintJson = JSON.parse(lint.stdout);
          const codes = new Set((lintJson.findings ?? []).map((item: { code?: string }) => item.code));
          for (const expected of [
            "P1_FORMULAIC_OPENING",
            "P1_PROCESS_FILLER",
            "P1_LEXICON_ALWAYS",
            "P1_FAKE_CONTRAST",
            "P1_CONFLICT_BAIT_BINARY",
            "P1_UNSUPPORTED_PEOPLE_GENERALIZATION",
            "P2_NOMINALIZED_ACTION_SHELL",
          ]) {
            assert.ok(codes.has(expected), `lint should include ${expected}`);
          }

          const technical = runCommand("bash", [cli, "lint", "--profile", "technical", "--fail-on", "none", technicalPath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(technical, "technical profile lint");
          const technicalJson = JSON.parse(technical.stdout);
          const technicalCodes = new Set((technicalJson.findings ?? []).map((item: { code?: string }) => item.code));
          assert.equal(technicalCodes.has("P1_LEXICON_ALWAYS"), false, "technical exemption should suppress always lexicon warning in this fixture");

          const viaCore = runCommand("bash", [coreCli, "de-ai-tone", "lint", "--profile", "blog", "--fail-on", "none", aiTonePath], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(viaCore, "writing-core de-AI-tone dispatch");
          const viaCoreJson = JSON.parse(viaCore.stdout);
          assert.equal(viaCoreJson.schema, "bagakit.de_ai_tone_lint.v1");

          return {
            assertions: [
              "de-AI-tone lint catches representative structural and lexical AI-tone issues",
              "nominalized action shells stay advisory instead of becoming a generic clarity gate",
              "technical profile exemptions avoid false positives for precise technical terms",
              "writing-core dispatch reaches the de-AI-tone primitive",
            ],
            commands: [
              `bash ${cliRel} lint --profile blog --fail-on none <temp-repo>/ai-tone.md`,
              `bash ${cliRel} lint --profile technical --fail-on none <temp-repo>/technical.md`,
              `bash ${coreCliRel} de-ai-tone lint --profile blog --fail-on none <temp-repo>/ai-tone.md`,
            ],
            artifacts: [
              { label: "ai-tone-fixture", path: aiTonePath },
              { label: "technical-fixture", path: technicalPath },
              { label: "de-ai-tone-cli", path: cliRel },
              { label: "writing-core-cli", path: coreCliRel },
            ],
            outputs: {
              lint_codes: Array.from(codes).sort(),
              technical_codes: Array.from(technicalCodes).sort(),
            },
            replacements: fixture.replacements,
          };
        } finally {
          cleanupTempDir(fixture.tempRepo, context.keepTemp);
        }
      },
    },
    {
      id: "rewrite-case-pack-covers-human-quality-dimensions",
      title: "Rewrite Case Pack Covers Human Quality Dimensions",
      summary: "The de-AI-tone qualitative dataset should cover rewrite quality, protected-span integrity, scene fit, evidence preservation, second-pass audit, and minimal-edit judgment.",
      focus: ["rewrite-quality", "protected-spans", "human-review-rubric"],
      run: (context): EvalCaseResult => {
        const datasetPath = path.join(context.repoRoot, REWRITE_DATASET_REL);
        const dataset = loadEvalDataset(datasetPath);
        const report = reportEvalDataset(dataset);
        const caseIds = dataset.items.map((item) => item.id).sort();
        const coveredDimensions = new Set<string>();

        assert.deepEqual(caseIds, [...REQUIRED_REWRITE_CASES].sort());
        assert.equal(dataset.items.length, 6);
        assert.equal(report.totals.with_split, 6);
        assert.ok(report.splits.some((split) => split.split === "baseline" && split.count === 5), "dataset should have five baseline cases");
        assert.ok(report.splits.some((split) => split.split === "holdout" && split.count === 1), "dataset should have one holdout case");
        assert.ok(dataset.items.every((item) => item.skill_id === "bagakit-writing-de-ai-tone"));

        for (const item of dataset.items) {
          assert.ok(item.prompt.length >= 180, `${item.id} prompt should be substantial enough for a manual run`);
          assert.ok(item.expected_outcome.length >= 160, `${item.id} expected_outcome should guide review`);
          assert.ok(item.notes_for_human_review.length >= 80, `${item.id} notes_for_human_review should guide manual scoring`);
          assertStringArray(item.tags, `${item.id}.tags`);
          assertStringArray(item.risk_tags, `${item.id}.risk_tags`);
          assertStringArray(item.dimensions, `${item.id}.dimensions`);
          assertRubric(item.metadata?.rubric, `${item.id}.metadata.rubric`, item.dimensions ?? []);
          assertStringArray(item.metadata?.minimum_pass, `${item.id}.metadata.minimum_pass`);
          assertStringArray(item.metadata?.red_flags, `${item.id}.metadata.red_flags`);
          const reference = assertRecord(item.reference_state, `${item.id}.reference_state`);
          assertString(reference.profile, `${item.id}.reference_state.profile`);
          assertString(reference.scene, `${item.id}.reference_state.scene`);
          assertString(reference.source_text, `${item.id}.reference_state.source_text`);
          assertStringArray(reference.expected_issue_codes, `${item.id}.reference_state.expected_issue_codes`);
          assertStringArray(reference.forbidden_issue_codes ?? [], `${item.id}.reference_state.forbidden_issue_codes`);
          assertStringArray(reference.expected_protected_classes, `${item.id}.reference_state.expected_protected_classes`);
          if ((item.dimensions ?? []).includes("second_pass_audit")) {
            const minimumPass = assertStringArray(item.metadata?.minimum_pass, `${item.id}.metadata.minimum_pass`);
            assert.ok(
              minimumPass.some((entry) => /\bsecond-pass\b|audit/i.test(entry)),
              `${item.id}.metadata.minimum_pass should require a second-pass audit`,
            );
          }
          for (const dimension of item.dimensions ?? []) {
            coveredDimensions.add(dimension);
          }
        }

        for (const dimension of REQUIRED_REWRITE_DIMENSIONS) {
          assert.ok(coveredDimensions.has(dimension), `case pack should cover ${dimension}`);
        }

        return {
          assertions: [
            "rewrite dataset contains six representative de-AI-tone cases",
            "baseline and holdout splits are explicit",
            "cases carry human-review rubrics for all declared dimensions",
            "case references include source text, profile, scene, expected issue codes, and expected protected-span classes",
          ],
          artifacts: [{ label: "rewrite-dataset", path: REWRITE_DATASET_REL }],
          outputs: {
            cases: caseIds,
            splits: report.splits,
            covered_dimensions: [...coveredDimensions].sort(),
          },
        };
      },
    },
    {
      id: "rewrite-fixtures-trigger-expected-cli-signals",
      title: "Rewrite Fixtures Trigger Expected CLI Signals",
      summary: "Representative manual rewrite fixtures should trigger the expected deterministic de-AI-tone lint signals before subagents rewrite them.",
      focus: ["cli-signal", "expected-patterns", "protected-spans"],
      run: (context): EvalCaseResult => {
        const fixture = withFixture(context);
        const cliRel = "skills/paperwork/bagakit-writing-de-ai-tone/scripts/bagakit-writing-de-ai-tone-cli.sh";
        const cli = path.join(context.repoRoot, cliRel);
        const dataset = loadEvalDataset(path.join(context.repoRoot, REWRITE_DATASET_REL));
        const observedByCase: Record<string, string[]> = {};
        const protectedByCase: Record<string, string[]> = {};
        try {
          for (const item of dataset.items) {
            const reference = assertRecord(item.reference_state, `${item.id}.reference_state`);
            const sourceText = assertString(reference.source_text, `${item.id}.reference_state.source_text`);
            const profile = assertString(reference.profile, `${item.id}.reference_state.profile`);
            const scene = assertString(reference.scene, `${item.id}.reference_state.scene`);
            const expectedCodes = assertStringArray(reference.expected_issue_codes, `${item.id}.reference_state.expected_issue_codes`);
            const forbiddenCodes = assertStringArray(reference.forbidden_issue_codes ?? [], `${item.id}.reference_state.forbidden_issue_codes`);
            const expectedProtectedClasses = assertStringArray(
              reference.expected_protected_classes,
              `${item.id}.reference_state.expected_protected_classes`,
            );
            const sourcePath = path.join(fixture.tempRepo, `${item.id}.md`);
            fs.writeFileSync(sourcePath, sourceText, "utf8");

            const lint = runCommand("bash", [cli, "lint", "--profile", profile, "--scene", scene, "--fail-on", "none", sourcePath], {
              cwd: context.repoRoot,
              replacements: fixture.replacements,
            });
            expectOk(lint, `de-AI-tone lint ${item.id}`);
            const lintJson = JSON.parse(lint.stdout) as {
              findings?: Array<{ code?: string }>;
              protected_spans?: { classes?: Record<string, { count?: number }> };
              summary?: { fail?: number; warn?: number; advisory?: number };
            };
            const codes = new Set((lintJson.findings ?? []).map((finding) => finding.code).filter(Boolean) as string[]);
            for (const expectedCode of expectedCodes) {
              assert.ok(codes.has(expectedCode), `${item.id} should trigger ${expectedCode}`);
            }
            for (const forbiddenCode of forbiddenCodes) {
              assert.equal(codes.has(forbiddenCode), false, `${item.id} should not trigger ${forbiddenCode}`);
            }
            if (reference.expected_clean === true) {
              assert.equal(lintJson.summary?.fail ?? 0, 0, `${item.id} should not have P0 failures`);
              assert.equal(lintJson.summary?.warn ?? 0, 0, `${item.id} should not have warning-level findings`);
            }
            const protectedClasses = lintJson.protected_spans?.classes ?? {};
            for (const className of expectedProtectedClasses) {
              assert.ok(protectedClasses[className]?.count, `${item.id} should expose protected span class ${className}`);
            }
            observedByCase[item.id] = [...codes].sort();
            protectedByCase[item.id] = Object.keys(protectedClasses).sort();
          }

          return {
            assertions: [
              "manual rewrite fixtures trigger expected deterministic de-AI-tone lint codes",
              "protected command punctuation does not create forbidden false-positive lint codes",
              "clean holdout case stays below warning-level findings",
              "protected-span-heavy cases expose the expected span classes before rewrite",
            ],
            commands: [`bash ${cliRel} lint --profile <case-profile> --scene <case-scene> --fail-on none <temp-repo>/<case>.md`],
            artifacts: [
              { label: "rewrite-dataset", path: REWRITE_DATASET_REL },
              { label: "de-ai-tone-cli", path: cliRel },
            ],
            outputs: {
              observed_codes: observedByCase,
              protected_classes: protectedByCase,
            },
            replacements: fixture.replacements,
          };
        } finally {
          cleanupTempDir(fixture.tempRepo, context.keepTemp);
        }
      },
    },
  ],
};

export default SUITE;
