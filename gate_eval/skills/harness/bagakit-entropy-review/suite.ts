import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import type { EvalSuiteDefinition } from "../../../../dev/eval/src/lib/model.ts";

interface ForwardCase {
  id: string;
  object_type: string;
  situation: string;
  expected: string;
  focus: string[];
  expected_disposition: string;
}

interface BaselineRecord {
  skill: string;
  family: string;
  evidence_coverage: string;
  profile: Record<string, string>;
  attention_band: string;
  gates: Record<string, string>;
  support: string;
  disposition: string;
  preserve: string;
  smallest_safe_action: string;
  calibration_status: string;
}

const REQUIRED_FORWARD_CASES = new Set([
  "duplicate-wording-checks",
  "independent-endpoint-proof",
  "short-ambiguous-skill",
  "coherent-combined-route",
  "unknown-reader-and-obligation",
  "requisite-variety-branch",
]);

const DIMENSIONS = new Set(["meaning", "structure", "choice", "coupling", "proof"]);
const BANDS = new Set(["E0", "E1", "E2", "E3", "unknown", "n/a"]);
const GATE_STATUSES = new Set(["pass", "fail", "unknown", "n/a"]);

export const SUITE: EvalSuiteDefinition = {
  id: "bagakit-entropy-review-baseline-eval",
  owner: "gate_eval/skills/harness/bagakit-entropy-review",
  title: "Bagakit Entropy Review Baseline Eval",
  summary: "Validate registered countercases and the structured current-skill-corpus baseline packet.",
  defaultOutputDir: "gate_eval/skills/harness/bagakit-entropy-review/results/runs",
  cases: [
    {
      id: "forward-cases-and-corpus-baseline",
      title: "Forward Cases And Corpus Baseline",
      summary: "Countercases remain complete and every frozen skill has one profile-first uncalibrated record.",
      focus: ["necessity", "preservation", "over-validation", "corpus", "calibration"],
      run: (context) => {
        const caseDir = path.join(context.repoRoot, "gate_eval", "skills", "harness", "bagakit-entropy-review", "cases");
        const forwardPath = path.join(caseDir, "forward-cases.json");
        const forward = JSON.parse(fs.readFileSync(forwardPath, "utf8")) as { schema: string; cases: ForwardCase[] };
        assert.equal(forward.schema, "bagakit.entropy-review-forward-cases/v1");
        const forwardIds = forward.cases.map((item) => item.id);
        assert.equal(new Set(forwardIds).size, forwardIds.length);
        assert.ok([...REQUIRED_FORWARD_CASES].every((id) => forwardIds.includes(id)));
        assert.ok(forward.cases.every((item) => item.object_type && item.situation && item.expected && item.focus.length > 0));

        const inventoryPath = path.join(caseDir, "current-skill-corpus-inventory.json");
        assert.ok(fs.existsSync(inventoryPath), "current skill corpus inventory is missing");
        const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8")) as {
          schema: string;
          snapshot_manifest_sha256: string;
          skill_ids: string[];
        };
        assert.equal(inventory.schema, "bagakit.entropy-review-skill-corpus-inventory/v1");
        assert.equal(new Set(inventory.skill_ids).size, inventory.skill_ids.length);

        const baselinePath = path.join(caseDir, "current-skill-corpus-baseline.json");
        assert.ok(fs.existsSync(baselinePath), "current skill corpus baseline is missing");
        const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as {
          schema: string;
          snapshot: { corpus_count: number; calibration_status: string; corpus_manifest_sha256: string };
          records: BaselineRecord[];
        };
        assert.equal(baseline.schema, "bagakit.entropy-review-skill-corpus-baseline/v1");
        assert.equal(baseline.snapshot.calibration_status, "uncalibrated");
        assert.equal(baseline.records.length, baseline.snapshot.corpus_count);
        assert.equal(baseline.snapshot.corpus_manifest_sha256, inventory.snapshot_manifest_sha256);
        const recordIds = baseline.records.map((item) => `${item.family}/${item.skill}`);
        assert.equal(new Set(recordIds).size, baseline.records.length);
        assert.deepEqual(new Set(recordIds), new Set(inventory.skill_ids));

        const skillRoot = path.join(context.repoRoot, "skills");
        const liveSkillIds: string[] = [];
        for (const family of fs.readdirSync(skillRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
          const familyRoot = path.join(skillRoot, family.name);
          for (const skill of fs.readdirSync(familyRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
            if (fs.existsSync(path.join(familyRoot, skill.name, "SKILL.md"))) {
              liveSkillIds.push(`${family.name}/${skill.name}`);
            }
          }
        }
        assert.deepEqual(new Set(inventory.skill_ids), new Set(liveSkillIds));

        for (const item of baseline.records) {
          assert.deepEqual(new Set(Object.keys(item.profile)), DIMENSIONS);
          assert.ok(Object.values(item.profile).every((value) => BANDS.has(value)));
          assert.deepEqual(new Set(Object.keys(item.gates)), new Set(["G0", "G1", "G2"]));
          assert.ok(Object.values(item.gates).every((value) => GATE_STATUSES.has(value)));
          assert.equal(item.calibration_status, "uncalibrated");
          assert.ok(item.preserve.trim());
          assert.ok(item.smallest_safe_action.trim());
        }

        return {
          assertions: [
            "all serious necessity and counterexample cases remain registered",
            "the frozen corpus contains one unique profile-first record per declared skill",
            "every first-baseline record remains explicitly uncalibrated",
          ],
          commands: ["node --experimental-strip-types dev/eval/src/cli.ts run --suite gate_eval/skills/harness/bagakit-entropy-review/suite.ts"],
          artifacts: [
            { label: "forward-cases", path: forwardPath },
            { label: "skill-corpus-inventory", path: inventoryPath },
            { label: "skill-corpus-baseline", path: baselinePath },
          ],
          outputs: {
            forward_case_count: forward.cases.length,
            corpus_count: baseline.records.length,
          },
        };
      },
    },
  ],
};

export default SUITE;
