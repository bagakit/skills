"""Validate bagakit-paperwork-technical-writing article gate behavior."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


SKILL_DIR = Path("skills/paperwork/bagakit-paperwork-technical-writing")
FIXTURE_DIR = Path("gate_validation/skills/paperwork/bagakit-paperwork-technical-writing/fixtures")


def run(cmd: list[str], root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=root,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def require(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def load_json(stdout: str, label: str, failures: list[str]) -> dict:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError as exc:
        failures.append(f"{label} did not emit valid JSON: {exc}")
        return {}
    if not isinstance(payload, dict):
        failures.append(f"{label} JSON payload must be an object")
        return {}
    return payload


def main() -> int:
    root = Path(".").resolve()
    failures: list[str] = []

    cli = SKILL_DIR / "scripts/bagakit-paperwork-technical-writing-cli.sh"
    readme = SKILL_DIR / "README.md"
    check_script = SKILL_DIR / "scripts/check-article.py"
    review_template = SKILL_DIR / "references/review-packet-template.md"
    report_template = SKILL_DIR / "references/tpl/review-report-template.md"
    execution_template = SKILL_DIR / "references/tpl/execution-appendix-template.md"
    procedural_reference = SKILL_DIR / "references/procedural-precision.md"
    distillation_workflow = SKILL_DIR / "references/distillation-workflow.md"
    refined_template = SKILL_DIR / "references/refined-document-template.md"
    distillation_guards = SKILL_DIR / "references/distillation-guardrails.md"
    mask_helper = SKILL_DIR / "scripts/mask-secrets.py"
    spec = Path("docs/specs/review-packet-contract.md")

    for path in [cli, readme, check_script, review_template, report_template, execution_template, procedural_reference, distillation_workflow, refined_template, distillation_guards, mask_helper, spec]:
        require((root / path).is_file(), f"missing required file: {path}", failures)

    if failures:
        for failure in failures:
            print(f"error: {failure}")
        return 1

    cli_validate = run(["bash", str(cli), "validate"], root)
    require(cli_validate.returncode == 0, "skill CLI validate failed", failures)

    skill_text = (root / SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    distillation_text = (root / distillation_workflow).read_text(encoding="utf-8")
    refined_text = (root / refined_template).read_text(encoding="utf-8")
    guards_text = (root / distillation_guards).read_text(encoding="utf-8")
    for token in ["distill", "refined.md", "not a second runtime", "$refine-doc", "$bagakit-refine-doc", "[已脱敏]", "bagakit-writing-intake", "bagakit-writing-core", "bagakit-writing-de-ai-tone"]:
        require(token in skill_text, f"technical-writing skill missing distill/composition token: {token}", failures)
    for token in ["Source Inventory", "provenance", "conclusion", "data", "step", "resource", "pitfall", "Verification Pass"]:
        require(token.lower() in distillation_text.lower(), f"distillation workflow missing token: {token}", failures)
    for token in ["结论速览", "踩坑与避坑指南", "待确认与缺口", "附录：来源与局限"]:
        require(token in refined_text, f"refined template missing token: {token}", failures)
    for token in ["No Hallucination", "Time Validity", "[已脱敏]", "read-only"]:
        require(token.lower() in guards_text.lower(), f"distillation guardrails missing token: {token}", failures)

    core_proc = run(["bash", str(cli), "core", "describe"], root)
    require(core_proc.returncode == 0, "technical-writing core dispatch failed", failures)
    require("bagakit-writing-core" in core_proc.stdout, "technical-writing core dispatch did not reach writing-core", failures)

    de_ai_proc = run(["bash", str(cli), "core", "de-ai-tone", "describe"], root)
    require(de_ai_proc.returncode == 0, "technical-writing core de-AI-tone dispatch failed", failures)
    require(
        "bagakit-writing-de-ai-tone" in de_ai_proc.stdout,
        "technical-writing core dispatch did not reach de-AI-tone primitive",
        failures,
    )

    template_proc = run(["bash", str(cli), "print-review-packet-template"], root)
    require(template_proc.returncode == 0, "print-review-packet-template failed", failures)
    for token in [
        "Source Parentage",
        "Counterevidence",
        "accepted_deviations",
        "reviewer_ownership",
        "docs/specs/review-packet-contract.md",
    ]:
        require(token in template_proc.stdout, f"review packet template missing token: {token}", failures)

    procedural_proc = run(["bash", str(cli), "print-procedural-precision"], root)
    require(procedural_proc.returncode == 0, "print-procedural-precision failed", failures)
    for token in [
        "controlled_technical",
        "instruction-primary-action",
        "reader-burden-bounds-complexity",
        "does not ship the controlled",
    ]:
        require(token in procedural_proc.stdout, f"procedural precision guide missing token: {token}", failures)

    distillation_proc = run(["bash", str(cli), "print-distillation-workflow"], root)
    require(distillation_proc.returncode == 0, "print-distillation-workflow failed", failures)
    for token in ["Source Inventory", "Extraction Pass", "Reconciliation Pass", "Verification Pass", "conclusion", "data", "step", "resource", "pitfall"]:
        require(token in distillation_proc.stdout, f"distillation workflow missing token: {token}", failures)

    refined_proc = run(["bash", str(cli), "print-refined-document-template"], root)
    require(refined_proc.returncode == 0, "print-refined-document-template failed", failures)
    for token in ["结论速览", "踩坑与避坑指南", "待确认与缺口", "附录：来源与局限"]:
        require(token in refined_proc.stdout, f"refined document template missing token: {token}", failures)

    guards_proc = run(["bash", str(cli), "print-distillation-guardrails"], root)
    require(guards_proc.returncode == 0, "print-distillation-guardrails failed", failures)
    for token in ["No Hallucination", "Time Validity", "Privacy And Collaboration Boundaries", "[已脱敏]", "时效未知"]:
        require(token in guards_proc.stdout, f"distillation guardrails missing token: {token}", failures)

    mask_input = "api_key=sk-1234567890abcdef1234\\nAuthorization: Bearer abcdefghijklmnopQRST\\n"
    mask_proc = subprocess.run(
        [sys.executable, str(mask_helper)],
        cwd=root,
        input=mask_input,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    require(mask_proc.returncode == 0, f"mask helper failed: {mask_proc.stderr}", failures)
    require("[已脱敏]" in mask_proc.stdout, "mask helper did not mask candidate credentials", failures)
    require("sk-1234567890abcdef1234" not in mask_proc.stdout, "mask helper leaked a candidate credential", failures)

    report_text = (root / report_template).read_text(encoding="utf-8")
    for token in [
        "Source Parentage And Counterevidence",
        "Counterevidence checked",
        "Accepted deviations",
        "Review packet path",
    ]:
        require(token in report_text, f"review report template missing token: {token}", failures)

    execution_text = (root / execution_template).read_text(encoding="utf-8")
    for token in ["Procedural precision", "Primary action", "Preconditions", "Expected signal", "Deviation"]:
        require(token in execution_text, f"execution appendix template missing token: {token}", failures)

    with tempfile.TemporaryDirectory(prefix="paperwork-gate-") as tmp_dir:
        valid_report = Path(tmp_dir) / "valid-report.md"
        valid_proc = run(
            [
                sys.executable,
                str(check_script),
                "--input",
                str(FIXTURE_DIR / "valid-article.md"),
                "--strict",
                "--profile",
                "general",
                "--report",
                str(valid_report),
                "--json",
            ],
            root,
        )
        require((valid_report).is_file(), "valid article report was not written", failures)
    require(valid_proc.returncode == 0, f"valid article check failed: {valid_proc.stderr}", failures)
    valid_payload = load_json(valid_proc.stdout, "valid article", failures)
    require(valid_payload.get("status") == "pass", "valid article should pass hard gates", failures)

    invalid_proc = run(
        [
            sys.executable,
            str(check_script),
            "--input",
            str(FIXTURE_DIR / "invalid-article.md"),
            "--strict",
            "--profile",
            "general",
            "--json",
        ],
        root,
    )
    require(invalid_proc.returncode == 1, "invalid article should fail strict mode", failures)
    invalid_payload = load_json(invalid_proc.stdout, "invalid article", failures)
    issue_codes = {
        str(issue.get("code"))
        for issue in invalid_payload.get("issues", [])
        if isinstance(issue, dict)
    }
    require("PLACEHOLDER" in issue_codes, "invalid article should report placeholder error", failures)
    require("H2_RANGE" in issue_codes, "invalid article should report H2 range error", failures)

    if failures:
        print("paperwork technical-writing gate failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("ok: paperwork technical-writing gate passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
