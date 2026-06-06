import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { runCommand, type CommandResult } from "../../../../dev/eval/src/lib/command.ts";
import type { EvalCaseContext, EvalCaseResult, EvalSuiteDefinition } from "../../../../dev/eval/src/lib/model.ts";
import { cleanupTempDir, createTempDir, registerTempRepo } from "../../../../dev/eval/src/lib/temp.ts";

const PYTHON = process.env.PYTHON3 ?? "python3";

function expectOk(result: CommandResult, label: string): void {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function withFixture(context: EvalCaseContext): { tempRepo: string; replacements: Array<{ from: string; to: string }> } {
  const tempRepo = createTempDir("bagakit-paperwork-eval-");
  return {
    tempRepo,
    replacements: registerTempRepo(context, tempRepo),
  };
}

function readRepoFile(repoRoot: string, rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

export const SUITE: EvalSuiteDefinition = {
  id: "bagakit-paperwork-technical-writing-behavior-starter-eval",
  owner: "gate_eval/skills/paperwork/bagakit-paperwork-technical-writing",
  title: "Paperwork Technical Writing Behavior Starter Eval",
  summary: "Check source-parentage and counterevidence review surfaces across the CLI template and article validator.",
  defaultOutputDir: "gate_eval/skills/paperwork/bagakit-paperwork-technical-writing/results/runs",
  cases: [
    {
      id: "source-parentage-review-packet-is-auditable",
      title: "Source Parentage Review Packet Is Auditable",
      summary: "The review packet template and validator report should preserve source parentage and counterevidence checks.",
      focus: ["source-parentage", "counterevidence", "review-packet"],
      run: (context): EvalCaseResult => {
        const fixture = withFixture(context);
        const cliRel = "skills/paperwork/bagakit-paperwork-technical-writing/scripts/bagakit-paperwork-technical-writing-cli.sh";
        const checkerRel = "skills/paperwork/bagakit-paperwork-technical-writing/scripts/check-article.py";
        const validArticleRel = "gate_validation/skills/paperwork/bagakit-paperwork-technical-writing/fixtures/valid-article.md";
        const templateRel = "skills/paperwork/bagakit-paperwork-technical-writing/references/review-packet-template.md";
        try {
          const cli = path.join(context.repoRoot, cliRel);
          const checker = path.join(context.repoRoot, checkerRel);
          const reportPath = path.join(fixture.tempRepo, "paperwork-review-report.md");
          const template = runCommand("bash", [cli, "print-review-packet-template"], {
            cwd: context.repoRoot,
            replacements: fixture.replacements,
          });
          expectOk(template, "print-review-packet-template");

          const validate = runCommand(
            PYTHON,
            [
              checker,
              "--input",
              path.join(context.repoRoot, validArticleRel),
              "--strict",
              "--profile",
              "general",
              "--report",
              reportPath,
              "--json",
            ],
            { cwd: context.repoRoot, replacements: fixture.replacements },
          );
          expectOk(validate, "article validator");
          const parsed = JSON.parse(validate.stdout);
          assert.equal(parsed.status, "pass", "valid article fixture should pass");
          const report = fs.readFileSync(reportPath, "utf8");
          const checkedTemplate = readRepoFile(context.repoRoot, templateRel);
          for (const needle of ["Source Parentage", "Counterevidence", "claim_id", "source_refs"]) {
            assert.ok(template.stdout.includes(needle), `CLI template should include ${needle}`);
            assert.ok(checkedTemplate.includes(needle), `checked-in template should include ${needle}`);
          }
          assert.ok(report.toLowerCase().includes("source parentage"));
          assert.ok(!report.includes(fixture.tempRepo), "report should not leak temp path");

          return {
            assertions: [
              "CLI prints the source-parentage review packet template",
              "valid article fixture passes the owned validator",
              "generated review report avoids temp path leakage",
            ],
            commands: [
              `bash ${cliRel} print-review-packet-template`,
              `python3 ${checkerRel} --input ${validArticleRel} --strict --profile general --report <temp-repo>/paperwork-review-report.md --json`,
            ],
            artifacts: [
              { label: "review-packet-template", path: templateRel },
              { label: "valid-article-fixture", path: validArticleRel },
              { label: "generated-review-report", path: reportPath },
            ],
            outputs: {
              validator_status: parsed.status,
              template_fields: ["Source Parentage", "Counterevidence", "claim_id", "source_refs"],
            },
            replacements: fixture.replacements,
          };
        } finally {
          cleanupTempDir(fixture.tempRepo, context.keepTemp);
        }
      },
    },
    {
      id: "execution-appendix-exposes-procedural-precision",
      title: "Execution Appendix Exposes Procedural Precision",
      summary: "The public CLI and appendix template should activate stronger clarity for procedures without claiming universal STE compliance.",
      focus: ["procedure", "terminology", "actor-action", "scope-boundary"],
      run: (context): EvalCaseResult => {
        const cliRel = "skills/paperwork/bagakit-paperwork-technical-writing/scripts/bagakit-paperwork-technical-writing-cli.sh";
        const appendixRel = "skills/paperwork/bagakit-paperwork-technical-writing/references/tpl/execution-appendix-template.md";
        const guideRel = "skills/paperwork/bagakit-paperwork-technical-writing/references/procedural-precision.md";
        const cli = path.join(context.repoRoot, cliRel);
        const guide = runCommand("bash", [cli, "print-procedural-precision"], { cwd: context.repoRoot });
        expectOk(guide, "print-procedural-precision");
        const appendix = readRepoFile(context.repoRoot, appendixRel);
        for (const token of ["controlled_technical", "instruction-primary-action", "reader-burden-bounds-complexity"]) {
          assert.ok(guide.stdout.includes(token), `precision guide should expose ${token}`);
        }
        for (const token of ["Primary action", "Actor", "Preconditions", "Expected signal", "Deviation"]) {
          assert.ok(appendix.includes(token), `execution appendix should expose ${token}`);
        }
        assert.ok(guide.stdout.includes("does not ship the controlled"));
        assert.ok(guide.stdout.includes("Do not apply this mode to article narrative"));

        return {
          assertions: [
            "procedural precision is reachable through the public technical-writing CLI",
            "execution appendix records actor, action, order, signal, and deviations",
            "strict procedure mode excludes article narrative and makes no STE compliance claim",
          ],
          commands: [`bash ${cliRel} print-procedural-precision`],
          artifacts: [
            { label: "execution-appendix-template", path: appendixRel },
            { label: "procedural-precision-guide", path: guideRel },
          ],
          outputs: { route: "controlled_technical", enforcement: "review" },
        };
      },
    },
  ],
};

export default SUITE;
