"""Core implementation for bagakit-feature-tracker."""

from __future__ import annotations

import argparse
import copy
import fcntl
import hashlib
import html
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, Iterable

sys.dont_write_bytecode = True

FEATURE_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
FEATURE_ID_BASE = len(FEATURE_ID_ALPHABET)
FEATURE_ID_SCHEME = "feature-tracker-id-v1-c3n2g4"
FEAT_CURSOR_WIDTH = 3
FEAT_NAMESPACE_WIDTH = 2
FEAT_GUARD_WIDTH = 4
LOCAL_GUARD_KEY_WIDTH = 12
LOCAL_ISSUER_VERSION = 1
LOCAL_ISSUER_FILENAME = "issuer.json"
LOCAL_GUARD_KEY_CONFIG = "bagakit.feature-tracker.guard-key"
CURRENT_FEAT_ID_RE = re.compile(r"^f-[23456789abcdefghjkmnpqrstuvwxyz]{9}$")
TRANSITIONAL_FEAT_ID_RE = re.compile(r"^f-[0-9a-z]{7}$")
LEGACY_FEAT_ID_RE = re.compile(r"^f-\d{8}-[a-z0-9][a-z0-9-]*$")
TASK_ID_RE = re.compile(r"^T-\d{3}$")
URI_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")
WINDOWS_DRIVE_ABSOLUTE_RE = re.compile(r"^[A-Za-z]:[\\/]")
FEAT_STATUS = {"proposal", "ready", "in_progress", "blocked", "done", "archived", "discarded"}
TASK_STATUS = {"todo", "in_progress", "done", "blocked"}
GATE_STATUS = {"pass", "fail"}
WORKSPACE_MODES = {"worktree", "current_tree", "proposal_only"}
CLOSED_FEAT_STATUS = {"archived", "discarded"}
FEATURE_SCOPES = {"active", "archived", "discarded"}
DEFAULT_FEATURE_SCOPES = frozenset({"active"})
RUNTIME_ROLES = {"standalone", "frontdoor_context", "execution_owner", "foreground_owner"}
BLOCKED_REASON_CLASSES = {"none", "external_blocker", "internal_blocker", "parked_context"}
RUNTIME_RELATION_TYPES = {"frontdoor_for", "handoff_from"}
RUNTIME_RELATION_REVERSE = {
    "frontdoor_for": "handoff_from",
    "handoff_from": "frontdoor_for",
}
PLANNING_ENTRY_HANDOFF_SCHEMA = "bagakit/planning-entry-handoff/v1"
PLANNING_ENTRY_HANDOFF_STATUS = {"draft", "approved", "superseded", "applied", "rejected"}
PLANNING_ENTRY_HANDOFF_CLARIFICATION_STATUS = {"pending", "in_progress", "complete", "blocked"}
PLANNING_ENTRY_HANDOFF_USER_REVIEW_STATUS = {"pending", "approved", "changes_requested"}
PLANNING_ENTRY_HANDOFF_SCENES = {"analysis_only", "ambiguous_delivery", "clear_delivery", "execution_ready"}
PLANNING_ENTRY_FEATURE_RECIPE_IDS = {"planning-entry-brainstorm-to-feature", "planning-entry-brainstorm-feature-flow"}
RUNTIME_POLICY_FILENAME = "runtime-policy.json"
LEGACY_CONFIG_FILENAME = "config.json"
FEATURE_PROPOSAL_FILENAME = "proposal.md"
FEATURE_SPEC_DELTA_FILENAME = "spec-delta.md"
FEATURE_VERIFICATION_FILENAME = "verification.md"
FEATURE_GOAL_FILENAME = "goal.md"
FEATURE_SUMMARY_FILENAME = "summary.md"
FEATURE_OWNER_RECEIPT_FILENAME = "owner-receipt.json"
LEGACY_UI_VERIFICATION_FILENAME = "ui-verification.md"
TASK_PLAN_SCHEMA = "bagakit.feature-task-plan.v1"
OWNER_RECEIPT_SCHEMA = "bagakit.execution-owner-receipt.v1"
FEATURE_GOAL_SCHEMA = "bagakit.feature-goal.v1"
FEATURE_CLOSEOUT_REVIEW_SCHEMA = "bagakit.feature-closeout-review.v1"
TASK_PLAN_STATUSES = {"draft", "reviewed"}
TASK_VERIFICATION_KINDS = {"command", "artifact", "manual", "owner_receipt"}
CLOSEOUT_DOCUMENTATION_DISPOSITIONS = {"updated", "verified_current", "not_applicable"}
CLOSEOUT_LEARNING_DISPOSITIONS = {"no_reusable_learning", "candidates_reviewed"}
CLOSEOUT_PROMOTION_DISPOSITIONS = {"not_needed", "routed_for_review", "promoted"}
FEATURE_REQUIRED_ROOT_FILES = frozenset({"state.json", "tasks.json"})
FEATURE_DERIVED_ROOT_FILES = frozenset({FEATURE_OWNER_RECEIPT_FILENAME})
FEATURE_CONTROL_ROOT_FILES = frozenset({FEATURE_GOAL_FILENAME})
FEATURE_OPTIONAL_ROOT_FILES = frozenset(
    {
        FEATURE_PROPOSAL_FILENAME,
        FEATURE_SPEC_DELTA_FILENAME,
        FEATURE_VERIFICATION_FILENAME,
    }
)
FEATURE_CLOSEOUT_ROOT_FILES = frozenset({FEATURE_SUMMARY_FILENAME})
FEATURE_ALLOWED_ROOT_DIRS = frozenset({"artifacts"})
FEATURE_CLOSEOUT_PRESERVE_DIRNAME = "closeout-preserved-root"
FEATURE_ROOT_FILE_HINTS = {
    "prd.md": "route feature intent and scope to proposal.md or an upstream planning artifact instead",
    "changelog.md": "route change history to repo/release surfaces; use summary.md only for closeout narrative",
    "design.md": "route behavior or contract deltas to spec-delta.md when that helper is actually needed",
    "tasks.md": "tasks.json is the only task source of truth",
    LEGACY_UI_VERIFICATION_FILENAME: "rename ui-verification.md to verification.md; the ui-only filename is retired",
}
POSIX_SEP = chr(47)
MACHINE_LOCAL_PATH_RE = re.compile(
    r"(?:file:"
    + re.escape(POSIX_SEP * 2)
    + r"|"
    + re.escape(POSIX_SEP)
    + r"(?:Users|home|private|tmp|var|opt|workspace|Volumes)"
    + re.escape(POSIX_SEP)
    + r"|[A-Za-z]:[\\\\/]|\\\\\\\\[A-Za-z0-9_.-]+[\\\\/])"
)
LEGACY_RUNTIME_PATH_HINTS = {
    "feats": ".bagakit/feature-tracker/features/",
    "feats-archived": ".bagakit/feature-tracker/features-archived/",
    "feats-discarded": ".bagakit/feature-tracker/features-discarded/",
}


def sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def json_payload_bytes(data: Any) -> bytes:
    return (
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    ).encode("utf-8")


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(json_payload_bytes(data))
    tmp.replace(path)


def read_text(path: Path) -> str:
    with path.open("r", encoding="utf-8") as f:
        return f.read()


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def write_text_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_bytes_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, raw_tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    tmp = Path(raw_tmp)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
        tmp.replace(path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def normalized_markdown(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").rstrip() + "\n"


def validate_feature_goal_text(text: str, *, feat_id: str) -> list[str]:
    issues: list[str] = []
    if "\x00" in text:
        issues.append("goal.md must not contain NUL bytes")
        return issues
    normalized = normalized_markdown(text)
    lines = normalized.splitlines()
    contract_marker = f"Contract: `{FEATURE_GOAL_SCHEMA}`"
    feature_marker = f"Feature: `{feat_id}`"
    declared_contracts = [line for line in lines if line.startswith("Contract: ")]
    declared_features = [line for line in lines if line.startswith("Feature: ")]
    if declared_contracts != [contract_marker]:
        issues.append(f"goal.md must declare Contract: `{FEATURE_GOAL_SCHEMA}`")
    if declared_features != [feature_marker]:
        issues.append(f"goal.md must bind Feature: `{feat_id}`")
    control_lines = [
        line.strip()
        for line in lines
        if line.strip()
        and line not in {contract_marker, feature_marker}
        and not line.startswith("#")
    ]
    if not control_lines:
        issues.append("goal.md must contain non-empty control content")
    if MACHINE_LOCAL_PATH_RE.search(normalized):
        issues.append("goal.md contains a machine-local absolute path or file URI")
    return issues


def require_record(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise SystemExit(f"error: {label} must be an object")
    return value


def require_nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise SystemExit(f"error: {label} must be a non-empty string")
    return value.strip()


def require_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise SystemExit(f"error: {label} must be a non-empty list of strings")
    out: list[str] = []
    for index, item in enumerate(value):
        out.append(require_nonempty_string(item, f"{label}[{index}]"))
    return out


def require_optional_string_list(value: Any, label: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"error: {label} must be a list of strings")
    return [require_nonempty_string(item, f"{label}[{index}]") for index, item in enumerate(value)]


def normalize_repo_relative_ref(value: Any, label: str) -> str:
    raw = require_nonempty_string(value, label)
    path_part, separator, anchor = raw.partition("#")
    if URI_SCHEME_RE.match(path_part):
        raise SystemExit(f"error: {label} must not use a URI or drive-qualified path")
    if WINDOWS_DRIVE_ABSOLUTE_RE.match(path_part) or path_part.startswith(("/", "\\")):
        raise SystemExit(f"error: {label} must be repo-relative")
    portable_path = path_part.replace("\\", "/")
    normalized_text = os.path.normpath(portable_path).replace("\\", "/")
    normalized = Path(normalized_text)
    if normalized_text in {"", ".", ".."} or normalized_text.startswith("../"):
        raise SystemExit(f"error: {label} must not escape the repository root")
    result = normalized.as_posix()
    return f"{result}#{anchor}" if separator else result


def require_repo_relative_ref(root: Path, value: Any, label: str) -> str:
    result = normalize_repo_relative_ref(value, label)
    path_part = result.partition("#")[0]
    normalized = Path(path_part)
    try:
        (root / normalized).resolve().relative_to(root.resolve())
    except ValueError as exc:
        raise SystemExit(f"error: {label} must not escape the repository root") from exc
    return result


def require_repo_relative_refs(root: Path, value: Any, label: str) -> list[str]:
    refs = require_string_list(value, label)
    return [require_repo_relative_ref(root, ref, f"{label}[{index}]") for index, ref in enumerate(refs)]


def canonical_closeout_review(
    root: Path,
    value: Any,
    *,
    feat_id: str,
) -> dict[str, Any]:
    label = f"{feat_id}: closeout_review"
    review = require_record(value, label)
    expected_keys = {"schema", "documentation", "learning", "promotion"}
    if set(review) != expected_keys:
        raise SystemExit(
            f"error: {label} must contain exactly {', '.join(sorted(expected_keys))}"
        )
    if review.get("schema") != FEATURE_CLOSEOUT_REVIEW_SCHEMA:
        raise SystemExit(
            f"error: {label}.schema must be {FEATURE_CLOSEOUT_REVIEW_SCHEMA}"
        )

    options = {
        "documentation": CLOSEOUT_DOCUMENTATION_DISPOSITIONS,
        "learning": CLOSEOUT_LEARNING_DISPOSITIONS,
        "promotion": CLOSEOUT_PROMOTION_DISPOSITIONS,
    }
    normalized: dict[str, Any] = {"schema": FEATURE_CLOSEOUT_REVIEW_SCHEMA}
    for group, allowed in options.items():
        group_label = f"{label}.{group}"
        item = require_record(review.get(group), group_label)
        if set(item) != {"disposition", "rationale", "refs"}:
            raise SystemExit(
                f"error: {group_label} must contain exactly disposition, rationale, and refs"
            )
        disposition = require_nonempty_string(
            item.get("disposition"), f"{group_label}.disposition"
        )
        if disposition not in allowed:
            raise SystemExit(
                f"error: {group_label}.disposition must be one of {', '.join(sorted(allowed))}"
            )
        rationale = require_nonempty_string(item.get("rationale"), f"{group_label}.rationale")
        if MACHINE_LOCAL_PATH_RE.search(rationale):
            raise SystemExit(
                f"error: {group_label}.rationale contains a machine-local absolute path or file URI"
            )
        refs = require_optional_string_list(item.get("refs"), f"{group_label}.refs")
        refs = [
            require_repo_relative_ref(root, ref, f"{group_label}.refs[{index}]")
            for index, ref in enumerate(refs)
        ]
        normalized[group] = {
            "disposition": disposition,
            "rationale": rationale,
            "refs": refs,
        }

    documentation = normalized["documentation"]
    if documentation["disposition"] in {"updated", "verified_current"} and not documentation["refs"]:
        raise SystemExit(
            f"error: {label}.documentation.refs is required when documentation is "
            f"{documentation['disposition']}"
        )
    learning = normalized["learning"]
    if learning["disposition"] == "candidates_reviewed" and not learning["refs"]:
        raise SystemExit(
            f"error: {label}.learning.refs is required when learning is candidates_reviewed"
        )
    promotion = normalized["promotion"]
    if promotion["disposition"] in {"routed_for_review", "promoted"} and not promotion["refs"]:
        raise SystemExit(
            f"error: {label}.promotion.refs is required when promotion is "
            f"{promotion['disposition']}"
        )
    if (
        learning["disposition"] == "no_reusable_learning"
        and promotion["disposition"] != "not_needed"
    ):
        raise SystemExit(
            f"error: {label} cannot route or promote learning after declaring no_reusable_learning"
        )
    return normalized


def closeout_review_guidance_lines() -> list[str]:
    return [
        "closeout review checklist:",
        "- documentation: updated | verified_current | not_applicable",
        "  arguments: --documentation-disposition <choice> --documentation-rationale <why> [--documentation-ref <repo-relative-ref>]",
        "  method: identify changed public behavior or contracts and update only the owning SSOT; requirement changes must come from user-confirmed discussion or explicitly delegated review evidence, never Agent inference; do not edit docs only to satisfy closeout",
        "- learning: candidates_reviewed | no_reusable_learning",
        "  arguments: --learning-disposition <choice> --learning-rationale <why> [--learning-ref <repo-relative-ref>]",
        "  method: the Agent may summarize bounded plan revisions, gate failures, user corrections, and final evidence; compare original intent and non-goals with delivered scope; check that the shortest useful vertical closure came before expansion and that later work raised quality rather than only task count; merge duplicates, keep the result concise, and never promote Agent-authored learning into a requirement without user confirmation; keep raw sessions with their host",
        "- promotion: routed_for_review | promoted | not_needed",
        "  arguments: --promotion-disposition <choice> --promotion-rationale <why> [--promotion-ref <repo-relative-ref>]",
        "  method: check repository principles, merge same-class candidates, and use the existing Chronicle, Evolver, Principle Layer, or Living Knowledge owner; remove obsolete guidance instead of appending a competing rule",
        "required: one disposition and non-empty rationale per item; add repo-relative refs for updated/verified_current, candidates_reviewed, routed_for_review, or promoted",
    ]


def closeout_review_from_args(
    root: Path,
    args: argparse.Namespace,
    *,
    feat_id: str,
) -> dict[str, Any]:
    raw = {
        "schema": FEATURE_CLOSEOUT_REVIEW_SCHEMA,
        "documentation": {
            "disposition": str(getattr(args, "documentation_disposition", "") or ""),
            "rationale": str(getattr(args, "documentation_rationale", "") or ""),
            "refs": list(getattr(args, "documentation_ref", []) or []),
        },
        "learning": {
            "disposition": str(getattr(args, "learning_disposition", "") or ""),
            "rationale": str(getattr(args, "learning_rationale", "") or ""),
            "refs": list(getattr(args, "learning_ref", []) or []),
        },
        "promotion": {
            "disposition": str(getattr(args, "promotion_disposition", "") or ""),
            "rationale": str(getattr(args, "promotion_rationale", "") or ""),
            "refs": list(getattr(args, "promotion_ref", []) or []),
        },
    }
    try:
        return canonical_closeout_review(root, raw, feat_id=feat_id)
    except SystemExit as exc:
        detail = normalize_error_text(exc)
        raise SystemExit(
            "error: " + detail + "\n" + "\n".join(closeout_review_guidance_lines())
        ) from exc


def has_closeout_review_args(args: argparse.Namespace) -> bool:
    return any(
        getattr(args, name, None)
        for name in (
            "documentation_disposition",
            "documentation_rationale",
            "documentation_ref",
            "learning_disposition",
            "learning_rationale",
            "learning_ref",
            "promotion_disposition",
            "promotion_rationale",
            "promotion_ref",
        )
    )


def parse_task_plan_candidate(
    value: Any,
    *,
    root: Path,
    label: str,
    inherited_review_ref: str | None = None,
) -> dict[str, Any]:
    plan = require_record(value, label)
    schema = require_nonempty_string(plan.get("schema"), f"{label}.schema")
    if schema != TASK_PLAN_SCHEMA:
        raise SystemExit(f"error: {label}.schema must be {TASK_PLAN_SCHEMA}")

    if inherited_review_ref is None:
        review = require_record(plan.get("review"), f"{label}.review")
        review_status = require_nonempty_string(review.get("status"), f"{label}.review.status")
        if review_status != "approved":
            raise SystemExit(f"error: {label}.review.status must be approved")
        review_ref = require_repo_relative_ref(root, review.get("evidence_ref"), f"{label}.review.evidence_ref")
    else:
        review_ref = require_repo_relative_ref(root, inherited_review_ref, f"{label}.review_ref")

    source_refs = require_repo_relative_refs(root, plan.get("source_refs"), f"{label}.source_refs")
    raw_tasks = plan.get("tasks")
    if not isinstance(raw_tasks, list) or not raw_tasks:
        raise SystemExit(f"error: {label}.tasks must be a non-empty list")

    tasks: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_task in enumerate(raw_tasks):
        task_label = f"{label}.tasks[{index}]"
        task = require_record(raw_task, task_label)
        task_id = require_nonempty_string(task.get("id"), f"{task_label}.id")
        if not TASK_ID_RE.fullmatch(task_id):
            raise SystemExit(f"error: {task_label}.id must match T-000")
        if task_id in seen_ids:
            raise SystemExit(f"error: duplicate task id in reviewed plan: {task_id}")
        seen_ids.add(task_id)

        verification_raw = task.get("verification")
        if not isinstance(verification_raw, list) or not verification_raw:
            raise SystemExit(f"error: {task_label}.verification must be a non-empty list")
        verification: list[dict[str, str]] = []
        for verification_index, raw_mapping in enumerate(verification_raw):
            mapping_label = f"{task_label}.verification[{verification_index}]"
            mapping = require_record(raw_mapping, mapping_label)
            kind = require_nonempty_string(mapping.get("kind"), f"{mapping_label}.kind")
            if kind not in TASK_VERIFICATION_KINDS:
                raise SystemExit(
                    f"error: {mapping_label}.kind must be one of {', '.join(sorted(TASK_VERIFICATION_KINDS))}"
                )
            verification.append(
                {
                    "kind": kind,
                    "ref": require_repo_relative_ref(root, mapping.get("ref"), f"{mapping_label}.ref"),
                    "proves": require_nonempty_string(mapping.get("proves"), f"{mapping_label}.proves"),
                }
            )

        supersedes = require_optional_string_list(task.get("supersedes"), f"{task_label}.supersedes")
        if len(set(supersedes)) != len(supersedes):
            raise SystemExit(f"error: {task_label}.supersedes must not contain duplicates")
        for superseded_id in supersedes:
            if not TASK_ID_RE.fullmatch(superseded_id):
                raise SystemExit(f"error: {task_label}.supersedes entries must match T-000")
            if superseded_id == task_id:
                raise SystemExit(f"error: {task_label} must not supersede itself")

        tasks.append(
            {
                "id": task_id,
                "title": require_nonempty_string(task.get("title"), f"{task_label}.title"),
                "objective": require_nonempty_string(task.get("objective"), f"{task_label}.objective"),
                "outcome": require_nonempty_string(task.get("outcome"), f"{task_label}.outcome"),
                "acceptance": require_string_list(task.get("acceptance"), f"{task_label}.acceptance"),
                "verification": verification,
                "source_refs": require_repo_relative_refs(root, task.get("source_refs"), f"{task_label}.source_refs"),
                "supersedes": supersedes,
            }
        )

    return {
        "schema": schema,
        "review_ref": review_ref,
        "source_refs": source_refs,
        "tasks": tasks,
    }


def canonical_runtime_role(value: Any, *, feat_id: str) -> str:
    raw = str(value or "standalone").strip()
    if raw not in RUNTIME_ROLES:
        raise SystemExit(
            f"error: {feat_id}: runtime_role must be one of {', '.join(sorted(RUNTIME_ROLES))}"
        )
    return raw


def canonical_blocked_reason_class(value: Any, *, feat_id: str, status: str) -> str:
    if value is None:
        raw = "none"
    elif not isinstance(value, str) or value != value.strip() or not value:
        raise SystemExit(
            f"error: {feat_id}: blocked_reason_class must be a canonical non-empty string"
        )
    else:
        raw = value
    if raw not in BLOCKED_REASON_CLASSES:
        raise SystemExit(
            "error: "
            f"{feat_id}: blocked_reason_class must be one of {', '.join(sorted(BLOCKED_REASON_CLASSES))}"
        )
    if status != "blocked" and raw != "none":
        raise SystemExit(
            f"error: {feat_id}: blocked_reason_class `{raw}` requires state status=blocked"
        )
    return raw


def canonical_blocker_pair(
    reason_class: Any,
    reason: Any,
    *,
    class_label: str,
    reason_label: str,
) -> tuple[str, str]:
    if not isinstance(reason_class, str) or not reason_class.strip():
        raise SystemExit(f"error: {class_label} is required")
    if reason_class != reason_class.strip():
        raise SystemExit(f"error: {class_label} must not have surrounding whitespace")
    if reason_class == "none" or reason_class not in BLOCKED_REASON_CLASSES:
        allowed = ", ".join(sorted(BLOCKED_REASON_CLASSES - {"none"}))
        raise SystemExit(f"error: {class_label} must be one of {allowed}")
    if not isinstance(reason, str) or not reason.strip():
        raise SystemExit(f"error: {reason_label} is required")
    if reason != reason.strip():
        raise SystemExit(f"error: {reason_label} must not have surrounding whitespace")
    return reason_class, reason


def canonical_task_finish_blocker(
    *,
    result: str,
    blocked_reason_class: Any,
    blocked_reason: Any,
) -> tuple[str | None, str | None]:
    if result == "blocked":
        try:
            return canonical_blocker_pair(
                blocked_reason_class,
                blocked_reason,
                class_label="--blocked-reason-class",
                reason_label="--blocked-reason",
            )
        except SystemExit as exc:
            raise SystemExit(f"{exc} with --result blocked") from None
    if blocked_reason_class is not None or blocked_reason is not None:
        raise SystemExit(
            "error: --blocked-reason-class and --blocked-reason are valid only with --result blocked"
        )
    return None, None


def canonical_feature_blocker(
    state: dict[str, Any],
    *,
    feat_id: str,
) -> tuple[str, str | None]:
    status = str(state.get("status") or "")
    raw_reason = state.get("blocked_reason")
    blocked_task_id = state.get("blocked_task_id")
    if status == "blocked":
        reason_class, raw_reason = canonical_blocker_pair(
            state.get("blocked_reason_class"),
            raw_reason,
            class_label=f"{feat_id}: blocked_reason_class",
            reason_label=f"{feat_id}: blocked_reason",
        )
        if not isinstance(blocked_task_id, str) or not TASK_ID_RE.fullmatch(blocked_task_id):
            raise SystemExit(f"error: {feat_id}: blocked feature requires a canonical blocked_task_id")
        runtime_role = canonical_runtime_role(state.get("runtime_role"), feat_id=feat_id)
        if reason_class == "parked_context" and runtime_role != "frontdoor_context":
            raise SystemExit(
                f"error: {feat_id}: blocked_reason_class parked_context requires runtime_role=frontdoor_context"
            )
        return reason_class, raw_reason
    reason_class = canonical_blocked_reason_class(
        state.get("blocked_reason_class"),
        feat_id=feat_id,
        status=status,
    )
    if "blocked_reason" in state:
        raise SystemExit(f"error: {feat_id}: blocked_reason requires state status=blocked")
    if "blocked_task_id" in state:
        raise SystemExit(f"error: {feat_id}: blocked_task_id requires state status=blocked")
    return reason_class, None


def canonical_task_last_blocker(
    task: dict[str, Any],
    *,
    feat_id: str,
) -> tuple[str, str] | None:
    task_id = str(task.get("id") or "<unknown>")
    raw = task.get("last_blocker")
    if raw is None:
        return None
    if task.get("status") == "todo":
        raise SystemExit(f"error: {feat_id}/{task_id}: todo task must not carry last_blocker")
    if not isinstance(raw, dict) or set(raw) != {"class", "reason"}:
        raise SystemExit(
            f"error: {feat_id}/{task_id}: last_blocker must contain exactly class and reason"
        )
    return canonical_blocker_pair(
        raw.get("class"),
        raw.get("reason"),
        class_label=f"{feat_id}/{task_id}: last_blocker.class",
        reason_label=f"{feat_id}/{task_id}: last_blocker.reason",
    )


def require_canonical_task_blockers(tasks: dict[str, Any], *, feat_id: str) -> None:
    task_items = tasks.get("tasks")
    if not isinstance(task_items, list):
        return
    for task in task_items:
        if isinstance(task, dict):
            canonical_task_last_blocker(task, feat_id=feat_id)


def require_current_blocker_task_evidence(
    state: dict[str, Any],
    tasks: dict[str, Any],
    *,
    feat_id: str,
) -> None:
    reason_class, reason = canonical_feature_blocker(state, feat_id=feat_id)
    if str(state.get("status") or "") != "blocked":
        return
    assert reason is not None
    task_id = str(state["blocked_task_id"])
    task = find_task(tasks, task_id)
    if task.get("status") != "blocked":
        raise SystemExit(
            f"error: {feat_id}/{task_id}: current blocker task must remain blocked"
        )
    if canonical_task_last_blocker(task, feat_id=feat_id) != (reason_class, reason):
        raise SystemExit(
            f"error: {feat_id}/{task_id}: current blocker drifts from task last_blocker"
        )


@dataclass(frozen=True)
class CloseoutPublication:
    state: dict[str, Any]
    tasks: dict[str, Any]
    index: dict[str, Any]
    receipt: dict[str, Any] | None
    summary: str
    root_moves: list[tuple[str, str]]


def prepare_closed_feature_publication(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
    *,
    feat_id: str,
    target_status: str,
    event_action: str,
    event_detail: str,
    closeout_review: dict[str, Any],
    discard_reason: str | None = None,
    replacement_feat_id: str | None = None,
) -> CloseoutPublication:
    if target_status not in CLOSED_FEAT_STATUS:
        raise SystemExit(f"error: unsupported closeout target status: {target_status}")
    current_status = str(state.get("status") or "")
    require_valid_feature_goal_contract(paths, state)
    canonical_feature_blocker(state, feat_id=feat_id)
    require_canonical_task_blockers(tasks, feat_id=feat_id)
    if current_status == "blocked":
        require_current_blocker_task_evidence(state, tasks, feat_id=feat_id)

    candidate_state = copy.deepcopy(state)
    candidate_tasks = copy.deepcopy(tasks)
    candidate_tasks["closeout_review"] = copy.deepcopy(closeout_review)
    candidate_state["closed_from_status"] = current_status
    candidate_state["status"] = target_status
    candidate_state["blocked_reason_class"] = "none"
    candidate_state.pop("blocked_reason", None)
    candidate_state.pop("blocked_task_id", None)
    if target_status == "discarded":
        candidate_state["discard_reason"] = discard_reason
        candidate_state["replacement_feat_id"] = replacement_feat_id
    candidate_state.setdefault("history", []).append(
        history_event(event_action, event_detail)
    )
    normalize_state_payload(candidate_state)
    normalize_tasks_payload(candidate_tasks)
    normalize_feature_goal_ref(paths, candidate_state)
    canonical_feature_blocker(candidate_state, feat_id=feat_id)
    require_canonical_task_blockers(candidate_tasks, feat_id=feat_id)

    active_dir = paths.feat_dir(feat_id, status=current_status)
    root_moves = plan_closeout_root_entries(
        active_dir,
        include_closeout_root_files=True,
    )
    preserved_root_entries = [target for _, target in root_moves]
    index_candidate = copy.deepcopy(load_index(paths))
    upsert_feat_index_entry(index_candidate, candidate_state)

    state_ref = relative_display(
        paths.root,
        paths.feat_state(feat_id, status=target_status),
    )
    tasks_ref = relative_display(
        paths.root,
        paths.feat_tasks(feat_id, status=target_status),
    )
    evidence_hashes = {
        state_ref: sha256_bytes(json_payload_bytes(candidate_state)),
        tasks_ref: sha256_bytes(json_payload_bytes(candidate_tasks)),
    }
    if candidate_state.get("goal_contract") is not None:
        goal_path = paths.feat_goal(feat_id, status=current_status)
        evidence_hashes[
            relative_display(paths.root, paths.feat_goal(feat_id, status=target_status))
        ] = sha256_file(goal_path)
    receipt = None
    if has_reviewed_task_plan(candidate_tasks) or candidate_state.get("goal_contract") is not None:
        receipt = build_owner_receipt_payload(
            paths,
            candidate_state,
            candidate_tasks,
            evidence_hashes,
        )

    summary = render_summary(
        candidate_state,
        candidate_tasks,
        preserved_root_entries=preserved_root_entries,
    )
    return CloseoutPublication(
        state=candidate_state,
        tasks=candidate_tasks,
        index=index_candidate,
        receipt=receipt,
        summary=summary,
        root_moves=root_moves,
    )


def canonical_runtime_relations(value: Any, *, feat_id: str) -> list[dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise SystemExit(f"error: {feat_id}: runtime_relations must be a list")

    out: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for index, item in enumerate(value):
        rel = require_record(item, f"{feat_id}: runtime_relations[{index}]")
        relation = require_nonempty_string(rel.get("relation"), f"{feat_id}: runtime_relations[{index}].relation")
        if relation not in RUNTIME_RELATION_TYPES:
            raise SystemExit(
                f"error: {feat_id}: runtime_relations[{index}].relation must be one of {', '.join(sorted(RUNTIME_RELATION_TYPES))}"
            )
        target_feat = require_nonempty_string(rel.get("feat_id"), f"{feat_id}: runtime_relations[{index}].feat_id")
        if not is_valid_feat_id(target_feat):
            raise SystemExit(f"error: {feat_id}: invalid runtime relation feature id: {target_feat}")
        if target_feat == feat_id:
            raise SystemExit(f"error: {feat_id}: runtime relation may not target self")
        pair = (relation, target_feat)
        if pair in seen:
            continue
        seen.add(pair)
        out.append({"relation": relation, "feat_id": target_feat})
    out.sort(key=lambda item: (item["relation"], feat_sort_key(item["feat_id"])))
    return out


def optional_principle_layer(value: Any, *, root: Path) -> dict[str, Any] | None:
    if value is None:
        return None
    layer = require_record(value, "planning-entry handoff principle_layer")
    return {
        "what": require_nonempty_string(layer.get("what"), "planning-entry handoff principle_layer.what"),
        "why": require_nonempty_string(layer.get("why"), "planning-entry handoff principle_layer.why"),
        "intended_generalization": require_nonempty_string(
            layer.get("intended_generalization"),
            "planning-entry handoff principle_layer.intended_generalization",
        ),
        "failure_boundary": require_nonempty_string(
            layer.get("failure_boundary"),
            "planning-entry handoff principle_layer.failure_boundary",
        ),
        "behavior_examples": require_string_list(
            layer.get("behavior_examples"),
            "planning-entry handoff principle_layer.behavior_examples",
        ),
        "transfer_checks": require_string_list(
            layer.get("transfer_checks"),
            "planning-entry handoff principle_layer.transfer_checks",
        ),
        "evidence_refs": require_repo_relative_refs(
            root,
            layer.get("evidence_refs"),
            "planning-entry handoff principle_layer.evidence_refs",
        ),
    }


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def unsupported_feature_root_file_error(rel_path: str, *, closed_root: bool = False) -> str:
    name = Path(rel_path).name.lower()
    if closed_root:
        return (
            f"unsupported feature-root file: {rel_path}; "
            f"hint: closed feature roots keep state.json, tasks.json, owner-receipt.json, "
            f"optional goal.md, summary.md, and artifacts/ at the root; "
            f"preserve live or legacy root entries under artifacts/{FEATURE_CLOSEOUT_PRESERVE_DIRNAME}/ instead"
        )
    hint = FEATURE_ROOT_FILE_HINTS.get(name)
    if hint:
        return f"unsupported feature-root file: {rel_path}; hint: {hint}"
    allowed = ", ".join(sorted(FEATURE_OPTIONAL_ROOT_FILES | FEATURE_CONTROL_ROOT_FILES))
    return (
        f"unsupported feature-root file: {rel_path}; "
        f"allowed live-feature helper files are state.json, tasks.json, {allowed}, and artifacts/"
    )


def normalize_error_text(exc: BaseException) -> str:
    text = str(exc).strip()
    if text.startswith("error: "):
        return text[len("error: ") :]
    return text


def relative_display(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def legacy_runtime_path_error(root: Path, legacy_dir: Path) -> str:
    rel = relative_display(root, legacy_dir)
    mapped = LEGACY_RUNTIME_PATH_HINTS.get(legacy_dir.name)
    if mapped:
        return (
            f"legacy feature-tracker runtime path is not supported: {rel}; "
            f"repair: move contents to {mapped} and remove {rel}"
        )
    return f"legacy feature-tracker runtime path is not supported: {rel}"


def is_public_token(raw: str, *, width: int) -> bool:
    return len(raw) == width and all(ch in FEATURE_ID_ALPHABET for ch in raw)


def encode_public_token(value: int, *, width: int) -> str:
    if value < 0:
        raise SystemExit("error: public token encoding requires non-negative integers")
    if value == 0:
        encoded = FEATURE_ID_ALPHABET[0]
    else:
        chars: list[str] = []
        current = value
        while current:
            current, remainder = divmod(current, FEATURE_ID_BASE)
            chars.append(FEATURE_ID_ALPHABET[remainder])
        encoded = "".join(reversed(chars))
    if len(encoded) > width:
        raise SystemExit(f"error: {FEATURE_ID_SCHEME} exhausted for width {width}")
    return encoded.rjust(width, FEATURE_ID_ALPHABET[0])


def public_token_int(raw: str) -> int:
    value = 0
    for ch in raw:
        value = value * FEATURE_ID_BASE + FEATURE_ID_ALPHABET.index(ch)
    return value


def short_hash_token(text: str, *, width: int) -> str:
    digest = hashlib.blake2s(text.encode("utf-8"), digest_size=8).digest()
    return encode_public_token(int.from_bytes(digest, "big") % (FEATURE_ID_BASE ** width), width=width)


def random_token(*, width: int = 8) -> str:
    return short_hash_token(os.urandom(16).hex(), width=width)


def is_valid_feat_id(feat_id: str) -> bool:
    return bool(CURRENT_FEAT_ID_RE.match(feat_id) or TRANSITIONAL_FEAT_ID_RE.match(feat_id) or LEGACY_FEAT_ID_RE.match(feat_id))


def parse_current_feat_cursor(feat_id: str) -> int | None:
    if not CURRENT_FEAT_ID_RE.match(feat_id):
        return None
    payload = feat_id.removeprefix("f-")
    return public_token_int(payload[:FEAT_CURSOR_WIDTH])


def parse_current_feat_namespace(feat_id: str) -> str | None:
    if not CURRENT_FEAT_ID_RE.match(feat_id):
        return None
    payload = feat_id.removeprefix("f-")
    start = FEAT_CURSOR_WIDTH
    end = start + FEAT_NAMESPACE_WIDTH
    return payload[start:end]


def parse_transitional_feat_sequence(feat_id: str) -> int | None:
    if not TRANSITIONAL_FEAT_ID_RE.match(feat_id):
        return None
    payload = feat_id.removeprefix("f-")
    try:
        return int(payload[:4], 36)
    except ValueError:
        return None


def feat_sort_key(feat_id: str) -> tuple[int, int, str]:
    if LEGACY_FEAT_ID_RE.match(feat_id):
        return (0, -1, feat_id)
    seq = parse_transitional_feat_sequence(feat_id)
    if seq is not None:
        return (1, seq, feat_id)
    seq = parse_current_feat_cursor(feat_id)
    if seq is not None:
        return (2, seq, feat_id)
    return (3, -1, feat_id)


def history_event(action: str, detail: str) -> dict[str, str]:
    return {"action": action, "detail": detail}


def active_feature_ids(paths: "HarnessPaths") -> set[str]:
    payload = load_index(paths)
    return {
        str(item.get("feat_id", "")).strip()
        for item in payload.get("features", [])
        if isinstance(item, dict) and str(item.get("feat_id", "")).strip()
    }


def load_planning_entry_handoff(handoff_path: Path, *, root: Path) -> dict[str, Any]:
    payload = require_record(load_json(handoff_path), f"planning-entry handoff {handoff_path}")
    schema = require_nonempty_string(payload.get("schema"), "planning-entry handoff schema")
    if schema != PLANNING_ENTRY_HANDOFF_SCHEMA:
        raise SystemExit(
            f"error: planning-entry handoff schema must be {PLANNING_ENTRY_HANDOFF_SCHEMA}: {schema}"
        )

    status = require_nonempty_string(payload.get("status"), "planning-entry handoff status")
    if status not in PLANNING_ENTRY_HANDOFF_STATUS:
        raise SystemExit(f"error: invalid planning-entry handoff status: {status}")

    clarification_status = require_nonempty_string(
        payload.get("clarification_status"),
        "planning-entry handoff clarification_status",
    )
    if clarification_status not in PLANNING_ENTRY_HANDOFF_CLARIFICATION_STATUS:
        raise SystemExit(f"error: invalid planning-entry handoff clarification_status: {clarification_status}")

    user_review_status = require_nonempty_string(
        payload.get("user_review_status"),
        "planning-entry handoff user_review_status",
    )
    if user_review_status not in PLANNING_ENTRY_HANDOFF_USER_REVIEW_STATUS:
        raise SystemExit(f"error: invalid planning-entry handoff user_review_status: {user_review_status}")

    discussion_clear = payload.get("discussion_clear")
    if not isinstance(discussion_clear, bool):
        raise SystemExit("error: planning-entry handoff discussion_clear must be a boolean")

    route = require_record(payload.get("recommended_route"), "planning-entry handoff recommended_route")
    scene = require_nonempty_string(route.get("scene"), "planning-entry handoff recommended_route.scene")
    if scene not in PLANNING_ENTRY_HANDOFF_SCENES:
        raise SystemExit(f"error: invalid planning-entry handoff recommended_route.scene: {scene}")
    recipe_id = require_nonempty_string(
        route.get("recipe_id"),
        "planning-entry handoff recommended_route.recipe_id",
    )
    principle_layer = optional_principle_layer(payload.get("principle_layer"), root=root)
    task_plan = None
    if payload.get("task_plan") is not None:
        task_plan = parse_task_plan_candidate(
            payload.get("task_plan"),
            root=root,
            label="planning-entry handoff task_plan",
            inherited_review_ref=relative_display(root, handoff_path),
        )

    return {
        "schema": schema,
        "handoff_id": require_nonempty_string(payload.get("handoff_id"), "planning-entry handoff handoff_id"),
        "status": status,
        "producer_surface": require_nonempty_string(
            payload.get("producer_surface"),
            "planning-entry handoff producer_surface",
        ),
        "title": require_nonempty_string(payload.get("title"), "planning-entry handoff title"),
        "goal": require_nonempty_string(payload.get("goal"), "planning-entry handoff goal"),
        "objective": require_nonempty_string(payload.get("objective"), "planning-entry handoff objective"),
        "demand_summary": require_nonempty_string(
            payload.get("demand_summary"),
            "planning-entry handoff demand_summary",
        ),
        "principle_layer": principle_layer,
        "success_criteria": require_string_list(
            payload.get("success_criteria"),
            "planning-entry handoff success_criteria",
        ),
        "constraints": require_string_list(payload.get("constraints"), "planning-entry handoff constraints"),
        "clarification_status": clarification_status,
        "discussion_clear": discussion_clear,
        "user_review_status": user_review_status,
        "recommended_route": {
            "scene": scene,
            "recipe_id": recipe_id,
        },
        "source_artifacts": require_repo_relative_refs(
            root,
            payload.get("source_artifacts"),
            "planning-entry handoff source_artifacts",
        ),
        "source_refs": require_repo_relative_refs(
            root,
            payload.get("source_refs"),
            "planning-entry handoff source_refs",
        ),
        "task_plan": task_plan,
    }


def render_planning_entry_proposal(feat_id: str, handoff: dict[str, Any]) -> str:
    success_lines = [f"  - {item}" for item in handoff["success_criteria"]]
    constraint_lines = [f"- {item}" for item in handoff["constraints"]]
    artifact_lines = [f"- `{item}`" for item in handoff["source_artifacts"]]
    ref_lines = [f"- `{item}`" for item in handoff["source_refs"]]
    layer = handoff.get("principle_layer")
    if not isinstance(layer, dict):
        layer = {
            "what": handoff["objective"],
            "why": handoff["demand_summary"],
            "intended_generalization": (
                "Apply this clarified planning intent to canonical tracker tasks derived from the approved handoff."
            ),
            "failure_boundary": (
                "Do not treat the handoff artifact as a second planning source of truth, and do not infer scope outside approved success criteria and constraints."
            ),
            "behavior_examples": [handoff["goal"]],
            "transfer_checks": [
                "A handoff with similar wording but without approved review must not be materialized.",
                "Raw brainstorm prose outside the normalized handoff must not define tracker scope.",
                "Tracker tasks should still be validated by task gates rather than proposal prose.",
            ],
            "evidence_refs": handoff["source_refs"],
        }
    behavior_example_lines = [f"  - {item}" for item in layer["behavior_examples"]]
    transfer_check_lines = [f"  - {item}" for item in layer["transfer_checks"]]
    evidence_ref_lines = [f"  - `{item}`" for item in layer["evidence_refs"]]
    transfer_check_top_lines = [f"- {item}" for item in layer["transfer_checks"]]
    return "\n".join(
        [
            f"# Feature Proposal: {feat_id}",
            "",
            "## Why",
            f"- {handoff['demand_summary']}",
            "",
            "## Goal",
            f"- {handoff['goal']}",
            "",
            "## Principle Layer",
            f"- What: {layer['what']}",
            f"- Why: {layer['why']}",
            f"- Intended generalization: {layer['intended_generalization']}",
            f"- Failure boundary: {layer['failure_boundary']}",
            "- Behavior examples:",
            *behavior_example_lines,
            "- Transfer checks:",
            *transfer_check_lines,
            "- Evidence refs:",
            *evidence_ref_lines,
            "",
            "## Scope",
            "- In scope:",
            *success_lines,
            "- Out of scope:",
            "  - Replacing canonical tracker truth with the handoff artifact itself.",
            "",
            "## Acceptance Criteria",
            *success_lines,
            "",
            "## Transfer Checks",
            *transfer_check_top_lines,
            "",
            "## Impact",
            "- Code paths:",
            "  - To be refined by canonical task planning.",
            "- Tests:",
            "  - To be refined by canonical task planning.",
            "- Rollout notes:",
            f"  - Generated from planning-entry handoff `{handoff['handoff_id']}`.",
            "",
            "## Planning Entry Handoff",
            f"- Handoff id: `{handoff['handoff_id']}`",
            f"- Producer surface: `{handoff['producer_surface']}`",
            f"- Title: {handoff['title']}",
            f"- Objective: {handoff['objective']}",
            f"- Route: `{handoff['recommended_route']['scene']}` / `{handoff['recommended_route']['recipe_id']}`",
            f"- Clarification status: `{handoff['clarification_status']}`",
            f"- Discussion clear: `{str(handoff['discussion_clear']).lower()}`",
            f"- User review: `{handoff['user_review_status']}`",
            "",
            "## Constraints",
            *constraint_lines,
            "",
            "## Source Artifacts",
            *artifact_lines,
            "",
            "## Source Refs",
            *ref_lines,
            "",
        ]
    )


def next_numbered_path(directory: Path, *, prefix: str, suffix: str) -> Path:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+){re.escape(suffix)}$")
    next_number = 1
    if directory.exists():
        for entry in directory.iterdir():
            match = pattern.match(entry.name)
            if not match:
                continue
            next_number = max(next_number, int(match.group(1)) + 1)
    return directory / f"{prefix}{next_number:04d}{suffix}"


def move_path(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        src.rename(dst)
    except OSError:
        shutil.move(str(src), str(dst))


def first_tree_symlink(root: Path) -> Path | None:
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        parent = Path(dirpath)
        for name in (*dirnames, *filenames):
            child = parent / name
            if child.is_symlink():
                return child
    return None


def make_owned_tree_writable(root: Path) -> None:
    for dirpath, dirnames, _filenames in os.walk(root):
        path = Path(dirpath)
        path.chmod(path.stat().st_mode | 0o700)
        for dirname in dirnames:
            child = path / dirname
            if not child.is_symlink():
                child.chmod(child.stat().st_mode | 0o700)


def remove_owned_tree(root: Path) -> None:
    if not root.exists():
        return
    make_owned_tree_writable(root)
    shutil.rmtree(root)


def run_cmd(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
        check=False,
    )


def run_shell(command: str, *, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        errors="replace",
        capture_output=True,
        shell=True,
        check=False,
    )


def ensure_git_repo(root: Path) -> None:
    cp = run_cmd(["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"])
    if cp.returncode != 0 or cp.stdout.strip() != "true":
        raise SystemExit(f"error: not a git repository: {root}")


def git_common_dir(root: Path) -> Path:
    cp = run_cmd(["git", "-C", str(root), "rev-parse", "--git-common-dir"])
    if cp.returncode != 0:
        raise SystemExit(cp.stderr.strip() or cp.stdout.strip() or f"error: cannot resolve git common dir for {root}")
    raw = cp.stdout.strip()
    if not raw:
        raise SystemExit(f"error: empty git common dir for {root}")
    path = Path(raw)
    return path if path.is_absolute() else (root / path).resolve()


def command_exists(name: str) -> bool:
    cp = run_cmd(["bash", "-lc", f"command -v {shlex.quote(name)} >/dev/null 2>&1"])
    return cp.returncode == 0


def current_branch(root: Path) -> str:
    cp = run_cmd(["git", "-C", str(root), "rev-parse", "--abbrev-ref", "HEAD"])
    if cp.returncode != 0:
        return ""
    branch = cp.stdout.strip()
    return "" if branch == "HEAD" else branch


def path_from_porcelain_line(line: str) -> str:
    raw = line[3:] if len(line) > 3 else line
    if " -> " in raw:
        raw = raw.split(" -> ", 1)[1]
    return raw.strip().strip('"')


def is_harness_generated_gitignore(root: Path, rel_path: str) -> bool:
    if rel_path != ".gitignore":
        return False
    target = root / rel_path
    if not target.exists():
        return False
    lines = [line.strip() for line in target.read_text(encoding="utf-8").splitlines() if line.strip()]
    return lines == [".worktrees"]


def non_harness_git_status_lines(root: Path) -> list[str]:
    cp = run_cmd(["git", "-C", str(root), "status", "--porcelain"])
    if cp.returncode != 0:
        raise SystemExit(cp.stderr.strip() or cp.stdout.strip() or "git status failed")

    ignored_prefixes = (".bagakit/", ".worktrees/")
    out: list[str] = []
    for raw in cp.stdout.splitlines():
        line = raw.rstrip()
        if not line:
            continue
        path = path_from_porcelain_line(line)
        if path.startswith(ignored_prefixes):
            continue
        if is_harness_generated_gitignore(root, path):
            continue
        out.append(line)
    return out


def recommend_workspace_mode(root: Path) -> tuple[str, str]:
    changes = non_harness_git_status_lines(root)
    if changes:
        return (
            "worktree",
            "repository has non-harness changes; isolated worktree is safer",
        )
    return (
        "current_tree",
        "repository is clean aside from harness metadata; current_tree is lighter than a dedicated worktree",
    )


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    if not value:
        raise SystemExit("error: slug became empty after normalization")
    return value


@dataclass
class HarnessPaths:
    root: Path

    @property
    def harness_dir(self) -> Path:
        return self.root / ".bagakit" / "feature-tracker"

    @property
    def feats_dir(self) -> Path:
        return self.harness_dir / "features"

    @property
    def feats_archived_dir(self) -> Path:
        return self.harness_dir / "features-archived"

    @property
    def feats_discarded_dir(self) -> Path:
        return self.harness_dir / "features-discarded"

    @property
    def index_dir(self) -> Path:
        return self.harness_dir / "index"

    @property
    def artifacts_dir(self) -> Path:
        return self.harness_dir / "artifacts"

    @property
    def local_dir(self) -> Path:
        return self.harness_dir / "local"

    @property
    def index_file(self) -> Path:
        return self.index_dir / "features.json"

    @property
    def runtime_policy_file(self) -> Path:
        return self.harness_dir / RUNTIME_POLICY_FILENAME

    @property
    def legacy_config_file(self) -> Path:
        return self.harness_dir / LEGACY_CONFIG_FILENAME

    @property
    def issuer_file(self) -> Path:
        return self.local_dir / LOCAL_ISSUER_FILENAME

    def feat_dir(self, feat_id: str, *, status: str | None = None) -> Path:
        if status == "archived":
            base = self.feats_archived_dir
        elif status == "discarded":
            base = self.feats_discarded_dir
        else:
            base = self.feats_dir
        return base / feat_id

    def feat_state(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / "state.json"

    def feat_tasks(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / "tasks.json"

    def feat_owner_receipt(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / FEATURE_OWNER_RECEIPT_FILENAME

    def feat_goal(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / FEATURE_GOAL_FILENAME

    def feat_summary(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / "summary.md"

    def feat_proposal(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / FEATURE_PROPOSAL_FILENAME

    def feat_spec_delta(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / FEATURE_SPEC_DELTA_FILENAME

    def feat_verification(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / FEATURE_VERIFICATION_FILENAME

    def feat_artifacts_dir(self, feat_id: str, *, status: str | None = None) -> Path:
        return self.feat_dir(feat_id, status=status) / "artifacts"


@dataclass(frozen=True)
class FeatureExecutionRoot:
    path: Path
    workspace_mode: str
    detail: str


@contextmanager
def tracker_state_lock(root: Path, *, allow_create: bool = False) -> Generator[None, None, None]:
    paths = HarnessPaths(root)
    if not allow_create and not paths.harness_dir.exists():
        raise SystemExit("error: tracker not initialized. run feature-tracker.sh initialize-tracker first")
    lock_file = git_common_dir(root) / "bagakit" / "feature-tracker.lock"
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    with lock_file.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def infer_next_feat_sequence(index_data: dict[str, Any]) -> int:
    max_seen = -1
    for item in index_data.get("features", []):
        feat_id = str(item.get("feat_id") or "")
        seq = parse_current_feat_cursor(feat_id)
        if seq is None:
            seq = parse_transitional_feat_sequence(feat_id)
        if seq is not None:
            max_seen = max(max_seen, seq)
    return max_seen + 1


def ensure_feature_id_issuance(index_data: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    changed = False
    if "id_allocator" in index_data:
        raise SystemExit(
            "error: unsupported feature index field: id_allocator; canonical runtime does not auto-migrate legacy allocators"
        )
    issuance = index_data.get("feature_id_issuance")
    if not isinstance(issuance, dict):
        issuance = {}
        index_data["feature_id_issuance"] = issuance
        changed = True

    scheme = str(issuance.get("scheme") or "")
    if scheme != FEATURE_ID_SCHEME:
        issuance["scheme"] = FEATURE_ID_SCHEME
        changed = True

    inferred_next = infer_next_feat_sequence(index_data)
    raw_next = issuance.get("next_cursor")
    baseline_next = max(
        inferred_next,
        int(raw_next) if isinstance(raw_next, int) else 0,
    )
    if issuance.get("next_cursor") != baseline_next:
        issuance["next_cursor"] = baseline_next
        changed = True

    return issuance, changed


def normalize_index_data(index_data: dict[str, Any]) -> None:
    if not isinstance(index_data.get("features"), list):
        index_data["features"] = []
    index_data.pop("updated_at", None)
    ensure_feature_id_issuance(index_data)


def normalize_history(items: Any) -> list[dict[str, str]]:
    if not isinstance(items, list):
        return []
    out: list[dict[str, str]] = []
    for raw in items:
        if isinstance(raw, dict):
            action = str(raw.get("action") or "").strip()
            detail = str(raw.get("detail") or "").strip()
            if action:
                out.append(history_event(action, detail))
        elif raw is not None:
            text = str(raw).strip()
            if text:
                out.append(history_event("note", text))
    return out


def normalize_state_payload(state: dict[str, Any]) -> None:
    for key in ("created_at", "updated_at", "archived_at", "discarded_at"):
        state.pop(key, None)
    gate = state.get("gate")
    if isinstance(gate, dict):
        gate.pop("last_checked_at", None)
    history = normalize_history(state.get("history"))
    if history:
        state["history"] = history
    else:
        state.pop("history", None)


def normalize_tasks_payload(tasks: dict[str, Any]) -> None:
    tasks.pop("updated_at", None)
    if not isinstance(tasks.get("tasks"), list):
        return
    for item in tasks["tasks"]:
        if not isinstance(item, dict):
            continue
        for key in ("last_gate_at", "started_at", "finished_at", "updated_at", "last_commit_hash"):
            item.pop(key, None)


def draft_tasks_payload(feat_id: str) -> dict[str, Any]:
    return {
        "version": 2,
        "feat_id": feat_id,
        "plan_status": "draft",
        "plan_revision": 0,
        "supersedes_revision": None,
        "review_ref": "",
        "source_refs": [],
        "plan_history": [],
        "tasks": [],
    }


def latest_plan_task_ids(tasks: dict[str, Any]) -> list[str]:
    history = tasks.get("plan_history")
    if not isinstance(history, list) or not history:
        return []
    latest = history[-1]
    if not isinstance(latest, dict) or latest.get("revision") != tasks.get("plan_revision"):
        return []
    task_ids = latest.get("task_ids")
    if not isinstance(task_ids, list) or not task_ids:
        return []
    out: list[str] = []
    for task_id in task_ids:
        if not isinstance(task_id, str) or not TASK_ID_RE.fullmatch(task_id) or task_id in out:
            return []
        out.append(task_id)
    return out


def historical_task_first_revisions(tasks: dict[str, Any]) -> dict[str, int]:
    first_revisions: dict[str, int] = {}
    history = tasks.get("plan_history")
    if not isinstance(history, list):
        return first_revisions
    for entry in history:
        if not isinstance(entry, dict):
            continue
        revision = entry.get("revision")
        task_ids = entry.get("task_ids")
        if (
            not isinstance(revision, int)
            or isinstance(revision, bool)
            or not isinstance(task_ids, list)
        ):
            continue
        for task_id in task_ids:
            if isinstance(task_id, str) and TASK_ID_RE.fullmatch(task_id):
                first_revisions.setdefault(task_id, revision)
    return first_revisions


def plan_history_supersedes_by_task(
    entry: dict[str, Any],
) -> tuple[bool, dict[str, set[str]] | None]:
    raw = entry.get("supersedes_by_task")
    if raw is None:
        return True, None
    if not isinstance(raw, dict):
        return False, None
    out: dict[str, set[str]] = {}
    for raw_owner, raw_supersedes in raw.items():
        owner = str(raw_owner)
        if (
            not TASK_ID_RE.fullmatch(owner)
            or not isinstance(raw_supersedes, list)
            or not raw_supersedes
        ):
            return False, None
        supersedes = {str(item) for item in raw_supersedes}
        if (
            len(supersedes) != len(raw_supersedes)
            or owner in supersedes
            or any(not TASK_ID_RE.fullmatch(str(item)) for item in raw_supersedes)
        ):
            return False, None
        out[owner] = supersedes
    return True, out


def latest_supersedes_by_task(tasks: dict[str, Any]) -> dict[str, set[str]]:
    history = tasks.get("plan_history")
    if not isinstance(history, list) or not history:
        return {}
    valid, explicit = (
        plan_history_supersedes_by_task(history[-1])
        if isinstance(history[-1], dict)
        else (False, None)
    )
    if not valid:
        return {}
    if explicit is not None:
        return explicit
    current_ids = set(latest_plan_task_ids(tasks))
    out: dict[str, set[str]] = {}
    for task in tasks.get("tasks", []):
        if not isinstance(task, dict) or str(task.get("id")) not in current_ids:
            continue
        supersedes = task.get("supersedes")
        if isinstance(supersedes, list) and supersedes:
            out[str(task["id"])] = {str(item) for item in supersedes}
    return out


def task_has_execution_evidence(task: dict[str, Any]) -> bool:
    return bool(
        task.get("status") in {"done", "blocked"}
        or task.get("gate_result") is not None
        or bool(task.get("last_gate_commands"))
    )


def task_has_unstart_evidence(
    paths: HarnessPaths,
    state: dict[str, Any],
    task: dict[str, Any],
    task_id: str,
) -> bool:
    if task.get("gate_result") is not None or bool(task.get("last_gate_commands")):
        return True
    for event in state.get("history", []):
        if (
            isinstance(event, dict)
            and event.get("action") == "task_finished"
            and str(event.get("detail") or "").startswith(f"{task_id} =>")
        ):
            return True
    gate = state.get("gate")
    if isinstance(gate, dict) and str(gate.get("last_task_id") or "") == task_id:
        if (
            gate.get("last_result") is not None
            or bool(gate.get("last_check_commands"))
            or bool(str(gate.get("last_log_path") or "").strip())
        ):
            return True
    for event in state.get("history", []):
        if (
            isinstance(event, dict)
            and event.get("action") == "task_gate"
            and str(event.get("detail") or "").startswith(f"{task_id} =>")
        ):
            return True
    artifacts_dir = paths.feat_artifacts_dir(
        str(state.get("feat_id") or ""),
        status=str(state.get("status") or ""),
    )
    if artifacts_dir.is_dir() and any(
        path.is_file()
        for path in artifacts_dir.iterdir()
        if re.fullmatch(rf"gate-{re.escape(task_id)}-r[0-9]+-[0-9]{{4}}\.log", path.name)
    ):
        return True
    return False


def task_has_canonical_semantics(task: dict[str, Any]) -> bool:
    if not isinstance(task, dict) or not TASK_ID_RE.fullmatch(str(task.get("id") or "")):
        return False
    if task.get("status") not in TASK_STATUS:
        return False
    if not isinstance(task.get("introduced_in_revision"), int) or isinstance(
        task.get("introduced_in_revision"), bool
    ):
        return False
    for field in ("title", "objective", "outcome"):
        if not isinstance(task.get(field), str) or not str(task.get(field)).strip():
            return False
    for field in ("acceptance", "source_refs"):
        values = task.get(field)
        if not isinstance(values, list) or not values or any(not isinstance(item, str) or not item.strip() for item in values):
            return False
    try:
        for index, ref in enumerate(task["source_refs"]):
            normalize_repo_relative_ref(ref, f"task.source_refs[{index}]")
    except SystemExit:
        return False
    supersedes = task.get("supersedes")
    if not isinstance(supersedes, list) or any(
        not isinstance(item, str) or not TASK_ID_RE.fullmatch(item) for item in supersedes
    ):
        return False
    if len(set(supersedes)) != len(supersedes) or str(task.get("id")) in supersedes:
        return False
    verification = task.get("verification")
    if not isinstance(verification, list) or not verification:
        return False
    for mapping in verification:
        if not isinstance(mapping, dict) or mapping.get("kind") not in TASK_VERIFICATION_KINDS:
            return False
        if not isinstance(mapping.get("ref"), str) or not str(mapping.get("ref")).strip():
            return False
        try:
            normalize_repo_relative_ref(mapping.get("ref"), "task.verification.ref")
        except SystemExit:
            return False
        if not isinstance(mapping.get("proves"), str) or not str(mapping.get("proves")).strip():
            return False
    return True


def has_reviewed_task_plan(tasks: dict[str, Any]) -> bool:
    task_items = tasks.get("tasks")
    if not isinstance(task_items, list) or not task_items:
        return False
    revision = tasks.get("plan_revision")
    if (
        tasks.get("version") != 2
        or tasks.get("plan_status") != "reviewed"
        or not isinstance(revision, int)
        or isinstance(revision, bool)
        or revision < 1
    ):
        return False
    expected_supersedes_revision = None if revision == 1 else revision - 1
    if tasks.get("supersedes_revision") != expected_supersedes_revision:
        return False
    try:
        normalize_repo_relative_ref(tasks.get("review_ref"), "tasks.review_ref")
    except SystemExit:
        return False
    source_refs = tasks.get("source_refs")
    if not isinstance(source_refs, list) or not source_refs:
        return False
    try:
        for index, ref in enumerate(source_refs):
            normalize_repo_relative_ref(ref, f"tasks.source_refs[{index}]")
    except SystemExit:
        return False
    history = tasks.get("plan_history")
    if not isinstance(history, list) or len(history) != revision:
        return False
    previous_history_ids: set[str] = set()
    cumulative_superseded_ids: set[str] = set()
    retired_history_ids: set[str] = set()
    owner_maps_started = False
    previous_owner_map: dict[str, set[str]] = {}
    for history_index, entry in enumerate(history):
        expected_revision = history_index + 1
        if not isinstance(entry, dict) or entry.get("revision") != expected_revision:
            return False
        if entry.get("supersedes_revision") != (None if expected_revision == 1 else expected_revision - 1):
            return False
        try:
            normalize_repo_relative_ref(entry.get("review_ref"), "plan_history.review_ref")
            entry_source_refs = entry.get("source_refs")
            if not isinstance(entry_source_refs, list) or not entry_source_refs:
                return False
            for source_ref in entry_source_refs:
                normalize_repo_relative_ref(source_ref, "plan_history.source_refs")
        except SystemExit:
            return False
        raw_entry_ids = entry.get("task_ids")
        raw_superseded_ids = entry.get("superseded_task_ids")
        if not isinstance(raw_entry_ids, list) or not raw_entry_ids or not isinstance(raw_superseded_ids, list):
            return False
        entry_ids = {str(item) for item in raw_entry_ids}
        superseded_ids = {str(item) for item in raw_superseded_ids}
        if (
            len(entry_ids) != len(raw_entry_ids)
            or len(superseded_ids) != len(raw_superseded_ids)
            or any(not TASK_ID_RE.fullmatch(str(item)) for item in raw_entry_ids)
            or any(not TASK_ID_RE.fullmatch(str(item)) for item in raw_superseded_ids)
        ):
            return False
        if entry_ids & retired_history_ids:
            return False
        expected_removed = previous_history_ids - entry_ids if history_index > 0 else set()
        if superseded_ids != expected_removed:
            return False
        valid_owner_map, owner_map = plan_history_supersedes_by_task(entry)
        if not valid_owner_map:
            return False
        if owner_map is not None:
            owner_maps_started = True
            if set(owner_map) - entry_ids:
                return False
            declared = {task_id for supersedes in owner_map.values() for task_id in supersedes}
            if not superseded_ids.issubset(declared):
                return False
            if previous_owner_map:
                for owner, supersedes in owner_map.items():
                    prior = previous_owner_map.get(owner, set())
                    if not (supersedes - superseded_ids).issubset(prior):
                        return False
                for owner in set(previous_owner_map) & entry_ids:
                    if not previous_owner_map[owner].issubset(owner_map.get(owner, set())):
                        return False
            previous_owner_map = owner_map
        elif owner_maps_started:
            return False
        cumulative_superseded_ids.update(superseded_ids)
        retired_history_ids.update(expected_removed)
        previous_history_ids = entry_ids
    if history[-1].get("review_ref") != tasks.get("review_ref") or history[-1].get("source_refs") != source_refs:
        return False
    current_ids = latest_plan_task_ids(tasks)
    if not current_ids:
        return False
    task_by_id: dict[str, dict[str, Any]] = {}
    for task in task_items:
        if not task_has_canonical_semantics(task):
            return False
        task_id = str(task["id"])
        if task_id in task_by_id:
            return False
        task_by_id[task_id] = task
    for task_id in current_ids:
        task = task_by_id.get(task_id)
        if task is None or bool(task.get("superseded_by")):
            return False
    declared_latest_supersedes = {
        superseded_id
        for task_id in current_ids
        for superseded_id in task_by_id[task_id].get("supersedes", [])
    }
    latest_superseded_ids = {str(item) for item in history[-1].get("superseded_task_ids", [])}
    if (
        not latest_superseded_ids.issubset(declared_latest_supersedes)
        or not declared_latest_supersedes.issubset(cumulative_superseded_ids)
    ):
        return False
    valid_owner_map, latest_owner_map = plan_history_supersedes_by_task(history[-1])
    if not valid_owner_map:
        return False
    if latest_owner_map is not None:
        declared_by_task = {
            task_id: set(task_by_id[task_id].get("supersedes", []))
            for task_id in current_ids
            if task_by_id[task_id].get("supersedes")
        }
        if declared_by_task != latest_owner_map:
            return False
    return True


def claims_reviewed_task_plan(tasks: dict[str, Any]) -> bool:
    return tasks.get("plan_status") == "reviewed"


def require_canonical_reviewed_claim(tasks: dict[str, Any], *, feat_id: str, action: str) -> None:
    if not claims_reviewed_task_plan(tasks) or has_reviewed_task_plan(tasks):
        return
    raise SystemExit(
        "error: "
        f"feat {feat_id} claims plan_status=reviewed but its task plan is not canonical; "
        "run feature-tracker.sh repair-reviewed-task-plan with exact SHA-256 guards "
        f"before {action}"
    )


def require_reviewed_task_plan(tasks: dict[str, Any], *, feat_id: str, action: str) -> None:
    if has_reviewed_task_plan(tasks):
        return
    raise SystemExit(
        "error: "
        f"feat {feat_id} has no reviewed task plan; run feature-tracker.sh set-task-plan "
        f"before {action}"
    )


def build_reviewed_tasks_payload(
    feat_id: str,
    candidate: dict[str, Any],
    *,
    revision: int,
    supersedes_revision: int | None,
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    previous = previous or draft_tasks_payload(feat_id)
    previous_items = previous.get("tasks") if isinstance(previous.get("tasks"), list) else []
    if any(isinstance(task, dict) and task.get("status") == "in_progress" for task in previous_items):
        raise SystemExit("error: task plan cannot be replaced while a task is in_progress")

    previous_by_id = {
        str(task.get("id")): task
        for task in previous_items
        if isinstance(task, dict) and str(task.get("id") or "").strip()
    }
    previous_ids = set(previous_by_id)
    historical_first_revisions = historical_task_first_revisions(previous)
    historical_ids = set(historical_first_revisions)
    previous_active_ids = set(latest_plan_task_ids(previous)) if has_reviewed_task_plan(previous) else previous_ids
    candidate_ids = {str(task["id"]) for task in candidate["tasks"]}
    reintroduced_historical = {
        task_id
        for task_id in candidate_ids
        if task_id in historical_ids and task_id not in previous_active_ids
    }
    if reintroduced_historical:
        raise SystemExit(
            "error: reviewed task plan cannot reactivate historical superseded tasks: "
            + ", ".join(sorted(reintroduced_historical))
        )
    superseded_ids = previous_active_ids - candidate_ids
    previous_history = previous.get("plan_history")
    cumulative_historical_supersedes = (
        {
            str(task_id)
            for entry in previous_history
            if isinstance(entry, dict)
            for task_id in entry.get("superseded_task_ids", [])
            if isinstance(task_id, str)
        }
        if isinstance(previous_history, list)
        else set()
    )
    declared_current_supersedes: set[str] = set()
    invalid_carried_supersedes: set[str] = set()
    for task in candidate["tasks"]:
        task_id = str(task["id"])
        previous_task = previous_by_id.get(task_id)
        previous_task_supersedes = (
            set(previous_task.get("supersedes", []))
            if isinstance(previous_task, dict) and isinstance(previous_task.get("supersedes"), list)
            else set()
        )
        carried_historical = previous_task_supersedes & cumulative_historical_supersedes
        candidate_supersedes = set(task.get("supersedes", []))
        dropped_carried = carried_historical - candidate_supersedes
        if dropped_carried:
            raise SystemExit(
                "error: retained task must preserve its historical supersession lineage: "
                f"{task_id} dropped {', '.join(sorted(dropped_carried))}"
            )
        for superseded in task.get("supersedes", []):
            if superseded in previous_active_ids:
                declared_current_supersedes.add(superseded)
                continue
            if (
                superseded not in cumulative_historical_supersedes
                or superseded not in previous_task_supersedes
            ):
                invalid_carried_supersedes.add(superseded)
    if invalid_carried_supersedes:
        raise SystemExit(
            "error: reviewed task plan may carry historical supersession only on the same retained task: "
            + ", ".join(sorted(invalid_carried_supersedes))
        )
    retained_supersedes = declared_current_supersedes & candidate_ids
    if retained_supersedes:
        raise SystemExit(
            "error: reviewed task plan cannot supersede tasks retained in the current plan: "
            + ", ".join(sorted(retained_supersedes))
        )
    missing_lineage = superseded_ids - declared_current_supersedes
    if missing_lineage:
        raise SystemExit(
            "error: reviewed task plan must preserve supersession lineage for removed tasks: "
            + ", ".join(sorted(missing_lineage))
        )

    history = list(previous.get("plan_history") or [])
    history.append(
        {
            "revision": revision,
            "supersedes_revision": supersedes_revision,
            "review_ref": candidate["review_ref"],
            "source_refs": candidate["source_refs"],
            "task_ids": [task["id"] for task in candidate["tasks"]],
            "superseded_task_ids": sorted(superseded_ids),
            "supersedes_by_task": {
                task["id"]: sorted(task.get("supersedes", []))
                for task in candidate["tasks"]
                if task.get("supersedes")
            },
        }
    )
    semantic_fields = (
        "title",
        "objective",
        "outcome",
        "acceptance",
        "verification",
        "source_refs",
        "supersedes",
    )
    tasks = []
    for task in candidate["tasks"]:
        previous_task = previous_by_id.get(task["id"])
        previous_has_evidence = bool(previous_task and task_has_execution_evidence(previous_task))
        if previous_task and previous_has_evidence:
            changed = [field for field in semantic_fields if previous_task.get(field) != task.get(field)]
            if changed:
                raise SystemExit(
                    "error: executed task semantics are immutable across plan revisions: "
                    f"{task['id']} changed {', '.join(changed)}"
                )
            tasks.append(dict(previous_task))
            continue
        introduced_in_revision = historical_first_revisions.get(task["id"], revision)
        tasks.append(
            {
                **task,
                "introduced_in_revision": introduced_in_revision,
                "status": "todo",
                "gate_result": None,
                "last_gate_commands": [],
                "notes": [],
            }
        )

    superseded_by: dict[str, list[str]] = {}
    for task in candidate["tasks"]:
        for superseded in task.get("supersedes", []):
            superseded_by.setdefault(superseded, []).append(task["id"])
    preserved_historical_ids = previous_ids - previous_active_ids
    for task_id in sorted(preserved_historical_ids):
        previous_task = previous_by_id[task_id]
        if task_has_execution_evidence(previous_task):
            tasks.append(dict(previous_task))
    for task_id in sorted(superseded_ids):
        previous_task = previous_by_id[task_id]
        previous_has_evidence = task_has_execution_evidence(previous_task)
        if previous_has_evidence:
            preserved = dict(previous_task)
            preserved["superseded_by"] = sorted(superseded_by.get(task_id, []))
            tasks.append(preserved)
    return {
        "version": 2,
        "feat_id": feat_id,
        "plan_status": "reviewed",
        "plan_revision": revision,
        "supersedes_revision": supersedes_revision,
        "review_ref": candidate["review_ref"],
        "source_refs": candidate["source_refs"],
        "plan_history": history,
        "tasks": tasks,
    }


def load_local_issuer(paths: HarnessPaths) -> dict[str, Any] | None:
    if not paths.issuer_file.exists():
        return None
    payload = load_json(paths.issuer_file)
    if not isinstance(payload, dict):
        raise SystemExit(f"error: invalid local issuer schema: {paths.issuer_file}")
    return payload


def normalize_local_issuer_payload(payload: dict[str, Any], *, namespace: str) -> dict[str, Any]:
    return {
        "version": LOCAL_ISSUER_VERSION,
        "scheme": FEATURE_ID_SCHEME,
        "namespace": namespace,
        "guard_key_source": f"git-config:{LOCAL_GUARD_KEY_CONFIG}",
    }


def tracked_paths_under(root: Path, rel_path: Path) -> list[str]:
    cp = run_cmd(["git", "-C", str(root), "ls-files", "--", rel_path.as_posix()])
    if cp.returncode != 0:
        return []
    return [line.strip() for line in cp.stdout.splitlines() if line.strip()]


def git_local_config_get(root: Path, key: str) -> str:
    cp = run_cmd(["git", "-C", str(root), "config", "--local", "--get", key])
    if cp.returncode != 0:
        return ""
    return cp.stdout.strip()


def git_local_config_set(root: Path, key: str, value: str) -> None:
    cp = run_cmd(["git", "-C", str(root), "config", "--local", key, value])
    if cp.returncode != 0:
        raise SystemExit(cp.stderr.strip() or cp.stdout.strip() or f"error: failed to set git config {key}")


def used_current_namespaces(paths: HarnessPaths) -> set[str]:
    namespaces: set[str] = set()
    if not paths.index_file.exists():
        return namespaces
    for item in load_index(paths).get("features", []):
        namespace = parse_current_feat_namespace(str(item.get("feat_id") or ""))
        if namespace:
            namespaces.add(namespace)
    return namespaces


def choose_local_namespace(paths: HarnessPaths, *, exclude: set[str] | None = None) -> str:
    blocked = used_current_namespaces(paths) | (exclude or set())
    for _ in range(FEATURE_ID_BASE ** FEAT_NAMESPACE_WIDTH):
        namespace = random_token(width=FEAT_NAMESPACE_WIDTH)
        if namespace not in blocked:
            return namespace
    raise SystemExit("error: no free local issuer namespace available for the current tracker scheme")


def ensure_local_issuer_state(root: Path, paths: HarnessPaths, *, force_rotate: bool = False) -> dict[str, Any]:
    existing = load_local_issuer(paths)
    current_namespace = str(existing.get("namespace") or "").strip() if isinstance(existing, dict) else ""

    namespace = current_namespace
    should_rewrite_issuer = force_rotate or not is_public_token(namespace, width=FEAT_NAMESPACE_WIDTH)
    if should_rewrite_issuer:
        namespace = choose_local_namespace(
            paths,
            exclude={current_namespace} if current_namespace else set(),
        )
    payload = normalize_local_issuer_payload(existing or {}, namespace=namespace)
    if existing != payload:
        save_json(paths.issuer_file, payload)
        print(f"write: {paths.issuer_file}")

    guard_key = git_local_config_get(root, LOCAL_GUARD_KEY_CONFIG)
    if force_rotate or not is_public_token(guard_key, width=LOCAL_GUARD_KEY_WIDTH):
        guard_key = random_token(width=LOCAL_GUARD_KEY_WIDTH)
        git_local_config_set(root, LOCAL_GUARD_KEY_CONFIG, guard_key)
        print(f"write: git-config {LOCAL_GUARD_KEY_CONFIG}")

    payload = load_local_issuer(paths)
    if payload is None:
        raise SystemExit(f"error: missing local issuer after initialization: {paths.issuer_file}")
    return payload


def build_guard_token(root: Path, namespace: str, cursor_token: str) -> str:
    guard_key = git_local_config_get(root, LOCAL_GUARD_KEY_CONFIG)
    if not is_public_token(guard_key, width=LOCAL_GUARD_KEY_WIDTH):
        raise SystemExit(
            "error: missing git-local guard key; run feature-tracker.sh initialize-tracker "
            "or feature-tracker.sh rekey-local-issuer"
        )
    return short_hash_token(
        f"{FEATURE_ID_SCHEME}:{guard_key}:{cursor_token}:{namespace}",
        width=FEAT_GUARD_WIDTH,
    )


def load_index(paths: HarnessPaths) -> dict[str, Any]:
    if not paths.index_file.exists():
        raise SystemExit(f"error: missing harness index: {paths.index_file}")
    data = load_json(paths.index_file)
    if not isinstance(data, dict) or "features" not in data:
        raise SystemExit(f"error: invalid index schema: {paths.index_file}")
    normalize_index_data(data)
    return data


def save_index(paths: HarnessPaths, index_data: dict[str, Any]) -> None:
    normalize_index_data(index_data)
    save_json(paths.index_file, index_data)


def load_runtime_policy(paths: HarnessPaths) -> dict[str, Any]:
    target = paths.runtime_policy_file
    if not target.exists():
        if paths.legacy_config_file.exists():
            raise SystemExit(
                "error: detected legacy policy file "
                f"{paths.legacy_config_file}. "
                "legacy compatibility is disabled; migrate manually by comparing current SKILL.md "
                "and creating runtime-policy.json."
            )
        raise SystemExit(
            f"error: missing runtime policy file: {paths.runtime_policy_file}. "
            "run feature-tracker.sh initialize-tracker to scaffold the latest layout."
        )
    try:
        payload = load_json(target)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemExit(
            f"error: invalid runtime policy JSON: {target}: {normalize_error_text(exc)}"
        ) from None
    if not isinstance(payload, dict):
        raise SystemExit(f"error: invalid runtime policy schema: {target}")
    return payload


def runtime_gate_config(config: dict[str, Any]) -> dict[str, Any]:
    gate_cfg = config.get("gate")
    if not isinstance(gate_cfg, dict):
        raise SystemExit("error: runtime policy gate must be an object")
    return gate_cfg


def ensure_runtime_policy(paths: HarnessPaths, skill_dir: Path) -> Path:
    if paths.runtime_policy_file.exists():
        return paths.runtime_policy_file
    if paths.legacy_config_file.exists():
        raise SystemExit(
            "error: detected legacy policy file "
            f"{paths.legacy_config_file}. "
            "automatic compatibility migration is disabled; migrate manually to runtime-policy.json."
        )

    copy_template_if_missing(skill_dir, "tpl/runtime-policy-template.json", paths.runtime_policy_file)
    return paths.runtime_policy_file


def resolve_workspace_mode(policy: dict[str, Any], requested: str | None) -> str:
    workspace_cfg = policy.get("workspace", {}) if isinstance(policy, dict) else {}
    raw = str(requested or workspace_cfg.get("default_mode", "proposal_only")).strip().lower()
    if raw not in WORKSPACE_MODES:
        raise SystemExit(
            "error: invalid workspace mode: "
            f"{raw}. expected one of {', '.join(sorted(WORKSPACE_MODES))}"
        )
    return raw


def resolve_branch_prefix(policy: dict[str, Any], requested: str | None) -> str:
    git_cfg = policy.get("git", {}) if isinstance(policy, dict) else {}
    raw = str(requested if requested is not None else git_cfg.get("branch_prefix", "feat/")).strip()
    if not raw:
        raise SystemExit("error: branch prefix must not be empty")
    return raw


def workspace_mode_of(state: dict[str, Any]) -> str:
    raw = str(state.get("workspace_mode") or "").strip().lower()
    if raw not in WORKSPACE_MODES:
        raise SystemExit(
            "error: invalid or missing workspace_mode in feat state: "
            f"{state.get('feat_id', '<unknown>')}"
        )
    return raw


def workspace_signature(state: dict[str, Any], execution: FeatureExecutionRoot) -> dict[str, str]:
    return {
        "workspace_mode": str(state.get("workspace_mode") or ""),
        "branch": str(state.get("branch") or ""),
        "worktree_path": str(state.get("worktree_path") or ""),
        "execution_root": str(execution.path.resolve()),
    }


def revalidate_workspace_signature(
    root: Path,
    state: dict[str, Any],
    expected: dict[str, str],
    *,
    label: str,
) -> FeatureExecutionRoot | None:
    try:
        execution = resolve_feature_execution_root(root, state)
    except SystemExit as exc:
        eprint(str(exc))
        eprint(f"error: workspace changed while {label} was running; result was not recorded")
        return None
    current = workspace_signature(state, execution)
    if current != expected:
        eprint(f"error: workspace changed while {label} was running; result was not recorded")
        return None
    return execution


def make_worktree_assignment(
    root: Path,
    *,
    feat_id: str,
    branch_prefix: str,
) -> tuple[str, str, str, Path, str]:
    branch = f"{branch_prefix}{feat_id}"
    wt_name = f"wt-{feat_id}"
    wt_rel = str(Path(".worktrees") / wt_name)
    wt_abs = root / wt_rel
    base_ref = pick_base_branch(root)

    ensure_worktree_assignment_preflight(root, branch=branch, wt_abs=wt_abs)
    ensure_worktrees_ignored(root)
    (root / ".worktrees").mkdir(parents=True, exist_ok=True)

    cp = run_cmd(
        [
            "git",
            "-C",
            str(root),
            "worktree",
            "add",
            str(wt_abs),
            "-b",
            branch,
            base_ref,
        ]
    )
    if cp.returncode != 0:
        err = cp.stderr.strip() or cp.stdout.strip() or "failed to create worktree"
        raise SystemExit(f"error: {err}")

    return branch, wt_name, wt_rel, wt_abs, base_ref


def ensure_worktree_assignment_preflight(
    root: Path,
    *,
    branch: str,
    wt_abs: Path,
) -> None:
    worktrees_root = root / ".worktrees"
    if worktrees_root.exists() and not worktrees_root.is_dir():
        raise SystemExit(
            f"error: worktrees root path is not a directory: {relative_display(root, worktrees_root)}"
        )
    if git_local_branch_exists(root, branch):
        raise SystemExit(f"error: worktree branch already exists: {branch}")
    if wt_abs in git_worktree_paths(root):
        raise SystemExit(
            f"error: worktree path already registered: {relative_display(root, wt_abs)}"
        )
    if os.path.lexists(wt_abs):
        raise SystemExit(
            f"error: worktree path already exists: {relative_display(root, wt_abs)}"
        )


def get_feat_index_entry(index_data: dict[str, Any], feat_id: str) -> dict[str, Any] | None:
    for item in index_data.get("features", []):
        if item.get("feat_id") == feat_id:
            return item
    return None


def feat_index_payload(state: dict[str, Any]) -> dict[str, Any]:
    feat_id = str(state["feat_id"])
    status = str(state.get("status") or "proposal")
    runtime_role = canonical_runtime_role(state.get("runtime_role"), feat_id=feat_id)
    blocked_reason_class, _ = canonical_feature_blocker(state, feat_id=feat_id)
    runtime_relations = canonical_runtime_relations(state.get("runtime_relations"), feat_id=feat_id)

    payload = {
        "feat_id": state["feat_id"],
        "title": state.get("title", ""),
        "status": status,
        "workspace_mode": state.get("workspace_mode", ""),
        "branch": state.get("branch", ""),
        "worktree_name": state.get("worktree_name", ""),
    }
    if runtime_role != "standalone" or "runtime_role" in state:
        payload["runtime_role"] = runtime_role
    if blocked_reason_class != "none" or "blocked_reason_class" in state:
        payload["blocked_reason_class"] = blocked_reason_class
    if runtime_relations or "runtime_relations" in state:
        payload["runtime_relations"] = runtime_relations
    return payload


def upsert_feat_index_entry(index_data: dict[str, Any], state: dict[str, Any]) -> None:
    normalize_index_data(index_data)
    entries = index_data.setdefault("features", [])
    payload = feat_index_payload(state)
    for i, item in enumerate(entries):
        if item.get("feat_id") == payload["feat_id"]:
            entries[i] = payload
            return
    entries.append(payload)
    entries.sort(key=lambda x: feat_sort_key(str(x.get("feat_id", ""))))


def upsert_feat_index(
    paths: HarnessPaths,
    state: dict[str, Any],
    *,
    index_data: dict[str, Any] | None = None,
) -> None:
    working = index_data if index_data is not None else load_index(paths)
    upsert_feat_index_entry(working, state)
    save_index(paths, working)


def feat_index_status(paths: HarnessPaths, feat_id: str) -> str:
    index_data = load_index(paths)
    entry = get_feat_index_entry(index_data, feat_id)
    if entry is None:
        raise SystemExit(f"error: feat not indexed: {feat_id}")
    return str(entry.get("status") or "proposal")


def load_feat(paths: HarnessPaths, feat_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    status = feat_index_status(paths, feat_id)
    state_file = paths.feat_state(feat_id, status=status)
    tasks_file = paths.feat_tasks(feat_id, status=status)
    if not state_file.exists():
        raise SystemExit(f"error: missing feat state file: {state_file}")
    if not tasks_file.exists():
        raise SystemExit(f"error: missing feat tasks file: {tasks_file}")
    state = load_json(state_file)
    tasks = load_json(tasks_file)
    return state, tasks


def guarded_file_revision(path: Path, expected: str, *, label: str) -> None:
    expected = str(expected or "").strip().lower()
    if expected == "none":
        if path.exists():
            raise SystemExit(
                f"error: stale {label} revision: expected none, current {sha256_file(path)}"
            )
        return
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise SystemExit(f"error: --expected-{label}-sha256 must be `none` or a lowercase SHA-256 digest")
    if not path.is_file():
        raise SystemExit(f"error: stale {label} revision: expected {expected}, current none")
    current = sha256_file(path)
    if current != expected:
        raise SystemExit(
            f"error: stale {label} revision: expected {expected}, current {current}"
        )


def expected_feature_goal_ref(paths: HarnessPaths, state: dict[str, Any]) -> str:
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "")
    return relative_display(paths.root, paths.feat_goal(feat_id, status=status))


def feature_goal_contract_issues(paths: HarnessPaths, state: dict[str, Any]) -> list[str]:
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "")
    goal_path = paths.feat_goal(feat_id, status=status)
    contract = state.get("goal_contract")
    if contract is None:
        return [f"{feat_id}: goal.md exists without state.json goal_contract"] if goal_path.exists() else []
    if not isinstance(contract, dict):
        return [f"{feat_id}: state.json goal_contract must be an object"]

    issues: list[str] = []
    if contract.get("schema") != FEATURE_GOAL_SCHEMA:
        issues.append(f"{feat_id}: goal_contract.schema must be {FEATURE_GOAL_SCHEMA}")
    expected_ref = expected_feature_goal_ref(paths, state)
    if contract.get("ref") != expected_ref:
        issues.append(f"{feat_id}: goal_contract.ref must be {expected_ref}")
    revision = contract.get("revision")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{64}", revision):
        issues.append(f"{feat_id}: goal_contract.revision must be a lowercase SHA-256 digest")
    if not goal_path.is_file():
        issues.append(f"{feat_id}: goal_contract target is missing: {expected_ref}")
        return issues

    text = read_text(goal_path)
    issues.extend(f"{feat_id}: {issue}" for issue in validate_feature_goal_text(text, feat_id=feat_id))
    actual_revision = sha256_file(goal_path)
    if isinstance(revision, str) and revision != actual_revision:
        issues.append(f"{feat_id}: goal_contract.revision drifts from goal.md")
    return issues


def require_valid_feature_goal_contract(paths: HarnessPaths, state: dict[str, Any]) -> None:
    issues = feature_goal_contract_issues(paths, state)
    if issues:
        raise SystemExit("error: " + "; ".join(issues))


def normalize_feature_goal_ref(paths: HarnessPaths, state: dict[str, Any]) -> None:
    contract = state.get("goal_contract")
    if isinstance(contract, dict):
        contract["ref"] = expected_feature_goal_ref(paths, state)


def ensure_closed_feat_rerun_state(
    paths: HarnessPaths,
    feat_id: str,
    *,
    expected_status: str,
) -> None:
    if expected_status not in CLOSED_FEAT_STATUS:
        raise SystemExit(f"error: unsupported closed feat status for rerun verification: {expected_status}")

    active_dir = paths.feat_dir(feat_id)
    expected_dir = paths.feat_dir(feat_id, status=expected_status)
    sibling_status = "discarded" if expected_status == "archived" else "archived"
    sibling_dir = paths.feat_dir(feat_id, status=sibling_status)

    if active_dir.exists():
        raise SystemExit(
            "error: feat "
            f"{feat_id} claims status={expected_status} but still lives under features/ directory: "
            f"{relative_display(paths.root, active_dir)}"
        )
    if sibling_dir.exists():
        raise SystemExit(
            "error: feat "
            f"{feat_id} claims status={expected_status} but also exists under "
            f"{sibling_dir.parent.name} directory: {relative_display(paths.root, sibling_dir)}"
        )
    if not expected_dir.exists():
        raise SystemExit(
            "error: feat "
            f"{feat_id} claims status={expected_status} but closed feat dir missing: "
            f"{relative_display(paths.root, expected_dir)}"
        )

    state_file = paths.feat_state(feat_id, status=expected_status)
    tasks_file = paths.feat_tasks(feat_id, status=expected_status)
    summary_file = paths.feat_summary(feat_id, status=expected_status)
    if not state_file.exists():
        raise SystemExit(
            "error: closed feat state file missing for "
            f"{feat_id}: {relative_display(paths.root, state_file)}"
        )
    if not tasks_file.exists():
        raise SystemExit(
            "error: closed feat tasks file missing for "
            f"{feat_id}: {relative_display(paths.root, tasks_file)}"
        )
    if not summary_file.exists():
        raise SystemExit(
            "error: closed feat summary missing for "
            f"{feat_id}: {relative_display(paths.root, summary_file)}"
        )

    closed_state = load_json(state_file)
    actual_status = str(closed_state.get("status") or "")
    if actual_status != expected_status:
        raise SystemExit(
            f"error: closed feat state status drift for {feat_id}: expected {expected_status}, found {actual_status or '<missing>'}"
        )
    closed_tasks = load_json(tasks_file)
    canonical_closeout_review(
        paths.root,
        closed_tasks.get("closeout_review"),
        feat_id=feat_id,
    )


def canonical_depends_on(state: dict[str, Any], *, feat_id: str) -> list[str]:
    if "depends_on" not in state:
        return []
    raw_deps = state.get("depends_on")
    if not isinstance(raw_deps, list):
        raise SystemExit(
            f"error: {feat_id}: state.json depends_on must be a list of feature ids"
        )

    deps: list[str] = []
    seen: set[str] = set()
    for index, raw_dep in enumerate(raw_deps):
        dep = str(raw_dep).strip()
        if not dep:
            raise SystemExit(
                f"error: {feat_id}: state.json depends_on[{index}] must be a non-empty feature id"
            )
        if not is_valid_feat_id(dep):
            raise SystemExit(f"error: {feat_id}: invalid depends_on feature id: {dep}")
        if dep == feat_id:
            raise SystemExit(f"error: feat cannot depend on itself: {feat_id}")
        if dep in seen:
            continue
        seen.add(dep)
        deps.append(dep)
    return deps


def plan_closeout_root_entries(
    feat_dir: Path,
    *,
    include_closeout_root_files: bool = False,
) -> list[tuple[str, str]]:
    moves: list[tuple[str, str]] = []
    if not feat_dir.exists():
        return moves

    preserve_dir = feat_dir / "artifacts" / FEATURE_CLOSEOUT_PRESERVE_DIRNAME
    reserved = {path.name for path in preserve_dir.iterdir()} if preserve_dir.exists() else set()
    for child in sorted(feat_dir.iterdir()):
        if child.is_file() and child.name in (
            FEATURE_REQUIRED_ROOT_FILES | FEATURE_DERIVED_ROOT_FILES | FEATURE_CONTROL_ROOT_FILES
        ):
            continue
        if child.is_file() and child.name in FEATURE_CLOSEOUT_ROOT_FILES and not include_closeout_root_files:
            continue
        if child.is_dir() and child.name == "artifacts":
            continue
        target_name = child.name
        stem = child.stem if child.suffix else child.name
        suffix = child.suffix if child.suffix else ""
        counter = 1
        while target_name in reserved:
            target_name = f"{stem}-{counter:04d}{suffix}"
            counter += 1
        reserved.add(target_name)
        moves.append(
            (
                child.name,
                (Path("artifacts") / FEATURE_CLOSEOUT_PRESERVE_DIRNAME / target_name).as_posix(),
            )
        )
    return moves


def materialize_feature_artifact(
    paths: HarnessPaths,
    skill_dir: Path,
    feat_id: str,
    *,
    kind: str,
    overwrite: bool,
) -> Path:
    state, _ = load_feat(paths, feat_id)
    status = str(state.get("status") or "")
    if status in CLOSED_FEAT_STATUS:
        raise SystemExit(
            "error: closed feats keep state.json, tasks.json, optional goal.md, summary.md, and artifacts/ at the root; "
            "live-feature helper files are not materializable after closeout"
        )
    if kind == "proposal":
        target = paths.feat_proposal(feat_id, status=status)
        template = (
            load_template(skill_dir, "tpl/feature-proposal-template.md")
            .replace("<feat-id>", feat_id)
            .replace("<feature-id>", feat_id)
            .replace("<goal>", str(state.get("goal") or ""))
        )
    elif kind == "spec-delta":
        target = paths.feat_spec_delta(feat_id, status=status)
        template = load_template(skill_dir, "tpl/feature-spec-delta-template.md").replace("<capability>", "core")
    elif kind == "verification":
        target = paths.feat_verification(feat_id, status=status)
        template = load_template(skill_dir, "tpl/verification-template.md")
    else:
        raise SystemExit(f"error: unsupported artifact kind: {kind}")

    if target.exists() and not overwrite:
        raise SystemExit(f"error: artifact already exists: {target}")

    write_text(target, template)
    return target


def resolve_input_file(root: Path, raw: str, *, label: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    if not path.is_file():
        raise SystemExit(f"error: {label} does not exist: {path}")
    return path


def cmd_validate_feature_goal(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    state, _ = load_feat(paths, args.feat)
    status = str(state.get("status") or "")
    if args.goal_file:
        source = resolve_input_file(root, args.goal_file, label="goal file")
        issues = validate_feature_goal_text(read_text(source), feat_id=args.feat)
    else:
        issues = feature_goal_contract_issues(paths, state)
        if state.get("goal_contract") is None and not paths.feat_goal(args.feat, status=status).exists():
            issues.append(f"{args.feat}: feature has no goal.md contract")
    if issues:
        for issue in issues:
            eprint(f"error: {issue}")
        return 1
    print(f"ok: feature goal valid {args.feat}")
    return 0


def cmd_set_feature_goal(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    state, tasks = load_feat(paths, args.feat)
    require_canonical_reviewed_claim(tasks, feat_id=args.feat, action="setting a Feature Goal")
    status = str(state.get("status") or "")
    if status in CLOSED_FEAT_STATUS:
        eprint("error: closed features preserve goal.md but do not accept Goal updates")
        return 1

    source = resolve_input_file(root, args.goal_file, label="goal file")
    candidate = normalized_markdown(read_text(source))
    issues = validate_feature_goal_text(candidate, feat_id=args.feat)
    if issues:
        for issue in issues:
            eprint(f"error: {issue}")
        return 1

    target = paths.feat_goal(args.feat, status=status)
    current_contract = state.get("goal_contract")
    if current_contract is not None:
        if not isinstance(current_contract, dict):
            eprint("error: state.json goal_contract must be an object")
            return 1
        if current_contract.get("schema") != FEATURE_GOAL_SCHEMA:
            eprint(f"error: goal_contract.schema must be {FEATURE_GOAL_SCHEMA}")
            return 1
        if current_contract.get("ref") != expected_feature_goal_ref(paths, state):
            eprint("error: goal_contract.ref is not the canonical feature goal path")
            return 1
        current_revision = str(current_contract.get("revision") or "")
        if not re.fullmatch(r"[0-9a-f]{64}", current_revision):
            eprint("error: goal_contract.revision must be a lowercase SHA-256 digest")
            return 1
    else:
        if target.exists():
            eprint("error: goal.md exists without state.json goal_contract; resolve the collision before setting Goal")
            return 1
        current_revision = "none"
    expected_revision = str(args.expected_revision or "").strip().lower()
    if expected_revision != "none" and not re.fullmatch(r"[0-9a-f]{64}", expected_revision):
        eprint("error: --expected-revision must be `none` or a lowercase SHA-256 digest")
        return 1
    if expected_revision != current_revision:
        eprint(
            "error: stale Goal revision: "
            f"expected {expected_revision}, current {current_revision}"
        )
        return 1

    old_bytes = target.read_bytes() if target.exists() else None
    old_mode = target.stat().st_mode & 0o777 if target.exists() else None
    old_state = copy.deepcopy(state)
    old_tasks = copy.deepcopy(tasks)
    try:
        write_text_atomic(target, candidate)
        revision = sha256_file(target)
        state["goal_contract"] = {
            "schema": FEATURE_GOAL_SCHEMA,
            "ref": relative_display(root, target),
            "revision": revision,
        }
        state.setdefault("history", []).append(
            history_event("feature_goal_set", f"{current_revision} -> {revision}")
        )
        save_feat(paths, args.feat, state, tasks)
    except BaseException:
        if old_bytes is None:
            target.unlink(missing_ok=True)
        else:
            target.write_bytes(old_bytes)
            if old_mode is not None:
                target.chmod(old_mode)
        try:
            save_feat(paths, args.feat, old_state, old_tasks)
        except BaseException:
            pass
        raise

    print(f"goal: {relative_display(root, target)}")
    print(f"revision: {revision}")
    return 0


def save_feat(
    paths: HarnessPaths,
    feat_id: str,
    state: dict[str, Any],
    tasks: dict[str, Any],
    *,
    index_data: dict[str, Any] | None = None,
) -> None:
    normalize_state_payload(state)
    normalize_tasks_payload(tasks)
    require_canonical_reviewed_claim(tasks, feat_id=feat_id, action="saving Feature state")
    normalize_feature_goal_ref(paths, state)
    require_valid_feature_goal_contract(paths, state)
    status = str(state.get("status") or "")
    canonical_feature_blocker(state, feat_id=feat_id)
    require_canonical_task_blockers(tasks, feat_id=feat_id)
    if status == "blocked":
        require_current_blocker_task_evidence(state, tasks, feat_id=feat_id)
    save_json(paths.feat_state(feat_id, status=status), state)
    save_json(paths.feat_tasks(feat_id, status=status), tasks)
    receipt_path = paths.feat_owner_receipt(feat_id, status=status)
    if has_reviewed_task_plan(tasks) or state.get("goal_contract") is not None:
        save_json(receipt_path, build_owner_receipt(paths, state, tasks))
    elif receipt_path.exists():
        receipt_path.unlink()
    upsert_feat_index(paths, state, index_data=index_data)


def owner_continuation(
    state: dict[str, Any],
    tasks: dict[str, Any],
) -> tuple[str, dict[str, str] | None, str | None]:
    status = str(state.get("status") or "proposal")
    replacement = str(state.get("replacement_feat_id") or "").strip() or None
    if status in {"done", "archived"}:
        return "complete", None, None
    if status == "discarded":
        if replacement:
            return "superseded", None, replacement
        return "unavailable", None, None
    if not has_reviewed_task_plan(tasks):
        return (
            "blocked",
            {"class": "task_plan_missing", "reason": "Feature has no reviewed semantic task plan."},
            None,
        )
    if status in {"ready", "in_progress"}:
        return "continue", None, None
    if status == "blocked":
        reason_class, reason = canonical_feature_blocker(
            state,
            feat_id=str(state.get("feat_id") or ""),
        )
        assert reason is not None
        return "blocked", {"class": reason_class, "reason": reason}, None
    return (
        "blocked",
        {"class": "workspace_unassigned", "reason": "Feature has no assigned execution workspace."},
        None,
    )


def build_owner_receipt(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
) -> dict[str, Any]:
    require_valid_feature_goal_contract(paths, state)
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "proposal")
    feat_dir = paths.feat_dir(feat_id, status=status)
    evidence_refs = [
        relative_display(paths.root, feat_dir / "state.json"),
        relative_display(paths.root, feat_dir / "tasks.json"),
    ]
    if state.get("goal_contract") is not None:
        evidence_refs.append(relative_display(paths.root, feat_dir / FEATURE_GOAL_FILENAME))
    evidence_hashes: dict[str, str] = {}
    for evidence_ref in evidence_refs:
        evidence_path = paths.root / evidence_ref
        if not evidence_path.is_file():
            raise SystemExit(f"error: owner receipt evidence missing: {evidence_ref}")
        evidence_hashes[evidence_ref] = sha256_file(evidence_path)
    return build_owner_receipt_payload(paths, state, tasks, evidence_hashes)


def build_owner_receipt_payload(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
    evidence_hashes: dict[str, str],
) -> dict[str, Any]:
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "proposal")
    current_item_id = str(state.get("current_task_id") or "").strip() or None
    continuation, blocker, replacement_id = owner_continuation(state, tasks)
    replacement_ref = None
    if replacement_id:
        replacement_status = feat_index_status(paths, replacement_id)
        replacement_ref = relative_display(
            paths.root,
            paths.feat_owner_receipt(replacement_id, status=replacement_status),
        )
    evidence_refs = list(evidence_hashes)
    semantic_projection = {
        "owner_kind": "feature_tracker",
        "owner_id": feat_id,
        "lifecycle_status": status,
        "continuation": continuation,
        "current_item_id": current_item_id,
        "blocker": blocker,
        "replacement_ref": replacement_ref,
        "evidence_hashes": evidence_hashes,
    }
    semantic_revision = sha256_bytes(
        json.dumps(semantic_projection, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )
    return {
        "schema": OWNER_RECEIPT_SCHEMA,
        "owner_kind": "feature_tracker",
        "owner_id": feat_id,
        "semantic_revision": semantic_revision,
        "lifecycle_status": status,
        "continuation": continuation,
        "current_item_id": current_item_id,
        "blocker": blocker,
        "replacement_ref": replacement_ref,
        "evidence_refs": evidence_refs,
        "evidence_hashes": evidence_hashes,
    }


def load_current_owner_receipt(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
) -> dict[str, Any]:
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "")
    expected = build_owner_receipt(paths, state, tasks)
    receipt_path = paths.feat_owner_receipt(feat_id, status=status)
    if not receipt_path.exists():
        raise SystemExit(
            "error: missing persisted owner receipt: "
            f"{relative_display(paths.root, receipt_path)}"
        )
    persisted = load_json(receipt_path)
    if persisted != expected:
        raise SystemExit(
            "error: owner receipt drift from canonical feature state: "
            f"{relative_display(paths.root, receipt_path)}"
        )
    return persisted


def find_task(tasks: dict[str, Any], task_id: str) -> dict[str, Any]:
    for item in tasks.get("tasks", []):
        if item.get("id") == task_id:
            return item
    raise SystemExit(f"error: task not found: {task_id}")


def count_tasks(tasks: dict[str, Any], status: str) -> int:
    return sum(1 for t in tasks.get("tasks", []) if t.get("status") == status)


def apply_task_finish_transition(
    state: dict[str, Any],
    tasks: dict[str, Any],
    *,
    feat_id: str,
    task_id: str,
    result: str,
    blocked_reason_class: Any = None,
    blocked_reason: Any = None,
) -> None:
    task = find_task(tasks, task_id)
    if task.get("status") != "in_progress":
        raise SystemExit(f"error: task is not in_progress: {task_id}")
    if state.get("current_task_id") != task_id:
        raise SystemExit("error: state current_task_id mismatch")

    reason_class, reason = canonical_task_finish_blocker(
        result=result,
        blocked_reason_class=blocked_reason_class,
        blocked_reason=blocked_reason,
    )
    if result == "done" and task.get("gate_result") != "pass":
        raise SystemExit("error: cannot finish task as done without gate pass")

    task["status"] = result
    state["current_task_id"] = None
    state.setdefault("counters", {})["no_progress_rounds"] = 0
    state.setdefault("history", []).append(
        history_event("task_finished", f"{task_id} => {result}")
    )

    if result == "blocked":
        assert reason_class is not None and reason is not None
        task["last_blocker"] = {"class": reason_class, "reason": reason}
        state["status"] = "blocked"
        state["blocked_reason_class"] = reason_class
        state["blocked_reason"] = reason
        state["blocked_task_id"] = task_id
        state.setdefault("history", []).append(
            history_event("blocked_reason_set", f"{task_id} => {reason_class}")
        )
        canonical_feature_blocker(state, feat_id=feat_id)
        canonical_task_last_blocker(task, feat_id=feat_id)
        return

    state["blocked_reason_class"] = "none"
    state.pop("blocked_reason", None)
    state.pop("blocked_task_id", None)
    if count_tasks(tasks, "todo") == 0 and count_tasks(tasks, "in_progress") == 0:
        state["status"] = "done"
    else:
        state["status"] = "ready"
    canonical_feature_blocker(state, feat_id=feat_id)


def feature_scope_for_status(status: str) -> str:
    if status == "archived":
        return "archived"
    if status == "discarded":
        return "discarded"
    return "active"


def parse_feature_scopes(raw_items: list[str] | None) -> set[str]:
    if not raw_items:
        return set(DEFAULT_FEATURE_SCOPES)
    scopes: set[str] = set()
    for raw in raw_items:
        for item in re.split(r"[,|]", raw):
            scope = item.strip()
            if not scope:
                continue
            if scope not in FEATURE_SCOPES:
                allowed = ", ".join(sorted(FEATURE_SCOPES))
                raise SystemExit(f"error: invalid feature scope: {scope}; expected one of: {allowed}")
            scopes.add(scope)
    if not scopes:
        return set(DEFAULT_FEATURE_SCOPES)
    return scopes


def ensure_harness_exists(paths: HarnessPaths) -> None:
    if not paths.harness_dir.exists():
        raise SystemExit(
            "error: tracker not initialized. run feature-tracker.sh initialize-tracker first"
        )


def ensure_harness_gitignore(paths: HarnessPaths) -> None:
    target = paths.harness_dir / ".gitignore"
    content = target.read_text(encoding="utf-8") if target.exists() else ""
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    changed = False
    for rule in ("artifacts/*.log", "local/"):
        if rule not in lines:
            lines.append(rule)
            changed = True
    if not changed:
        return
    write_text(target, "\n".join(lines) + "\n")
    print(f"write: {target}")


def ensure_worktrees_ignored(root: Path) -> None:
    gitignore = root / ".gitignore"
    content = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
    lines = [line.strip() for line in content.splitlines()]
    if ".worktrees" not in lines:
        with gitignore.open("a", encoding="utf-8") as f:
            if content and not content.endswith("\n"):
                f.write("\n")
            f.write(".worktrees\n")
        print(f"write: {gitignore} (+.worktrees)")


def load_template(skill_dir: Path, rel: str) -> str:
    path = skill_dir / "references" / rel
    if not path.exists():
        raise SystemExit(f"error: missing template: {path}")
    return read_text(path)


def copy_template_if_missing(skill_dir: Path, rel: str, dest: Path) -> None:
    if dest.exists():
        return
    write_text(dest, load_template(skill_dir, rel))
    print(f"write: {dest}")


def cmd_apply(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    skill_dir = Path(args.skill_dir).resolve()
    paths = HarnessPaths(root)
    ensure_git_repo(root)

    paths.harness_dir.mkdir(parents=True, exist_ok=True)
    paths.feats_dir.mkdir(parents=True, exist_ok=True)
    paths.feats_archived_dir.mkdir(parents=True, exist_ok=True)
    paths.feats_discarded_dir.mkdir(parents=True, exist_ok=True)
    paths.index_dir.mkdir(parents=True, exist_ok=True)
    paths.artifacts_dir.mkdir(parents=True, exist_ok=True)

    copy_template_if_missing(skill_dir, "tpl/features-index-template.json", paths.index_file)
    save_index(paths, load_index(paths))
    ensure_runtime_policy(paths, skill_dir)
    ensure_harness_gitignore(paths)
    ensure_local_issuer_state(root, paths)

    ensure_worktrees_ignored(root)
    print(f"ok: harness initialized at {paths.harness_dir}")
    return 0


def pick_base_branch(root: Path) -> str:
    for candidate in ("main", "master"):
        cp = run_cmd(["git", "-C", str(root), "show-ref", "--verify", f"refs/heads/{candidate}"])
        if cp.returncode == 0:
            return candidate
    cp = run_cmd(["git", "-C", str(root), "rev-parse", "--abbrev-ref", "HEAD"])
    branch = cp.stdout.strip() if cp.returncode == 0 else ""
    return branch or "HEAD"


def cmd_rekey_local_issuer(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)
    payload = ensure_local_issuer_state(root, paths, force_rotate=True)
    print(f"namespace: {payload.get('namespace', '')}")
    return 0


def cmd_materialize_feature_artifact(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    skill_dir = Path(args.skill_dir).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    target = materialize_feature_artifact(
        paths,
        skill_dir,
        args.feat,
        kind=args.kind,
        overwrite=bool(args.overwrite),
    )
    print(f"write: {target}")
    return 0


def allocate_feat_id(root: Path, paths: HarnessPaths) -> tuple[str, dict[str, Any]]:
    index_data = load_index(paths)
    issuance, _ = ensure_feature_id_issuance(index_data)
    existing_ids = {str(item.get("feat_id", "")) for item in index_data.get("features", [])}
    issuer = ensure_local_issuer_state(root, paths)
    namespace = str(issuer.get("namespace") or "")

    def exists(feat_id: str) -> bool:
        return (
            feat_id in existing_ids
            or paths.feat_dir(feat_id).exists()
            or paths.feat_dir(feat_id, status="archived").exists()
            or paths.feat_dir(feat_id, status="discarded").exists()
        )

    next_sequence = int(issuance.get("next_cursor", 0))
    while True:
        cursor_token = encode_public_token(next_sequence, width=FEAT_CURSOR_WIDTH)
        guard_token = build_guard_token(root, namespace, cursor_token)
        candidate = f"f-{cursor_token}{namespace}{guard_token}"
        next_sequence += 1
        if exists(candidate):
            continue
        issuance["next_cursor"] = next_sequence
        return candidate, index_data


def build_create_dag_projection_payload(
    paths: HarnessPaths,
    *,
    feat_id: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    states, _ = load_non_archived_feats(paths)
    if feat_id in states:
        raise SystemExit(f"error: feat already exists in active graph: {feat_id}")
    states[feat_id] = copy.deepcopy(state)
    all_status_by_feat = feature_status_by_id(paths)
    all_status_by_feat[feat_id] = str(state.get("status") or "proposal")
    return build_dag_projection_payload(states, all_status_by_feat=all_status_by_feat)


def build_closeout_dag_projection_payload(
    paths: HarnessPaths,
    *,
    feat_id: str,
    target_status: str,
) -> dict[str, Any]:
    states, _ = load_non_archived_feats(paths)
    states.pop(feat_id, None)
    all_status_by_feat = feature_status_by_id(paths)
    all_status_by_feat[feat_id] = target_status
    return build_dag_projection_payload(states, all_status_by_feat=all_status_by_feat)


def active_feature_family_ids(paths: HarnessPaths, slug: str) -> list[str]:
    states, _ = load_non_archived_feats(paths)
    return sorted(
        (
            feat_id
            for feat_id, state in states.items()
            if str(state.get("slug") or "") == slug
        ),
        key=feat_sort_key,
    )


def active_feature_family_id(paths: HarnessPaths, slug: str) -> str | None:
    matches = active_feature_family_ids(paths, slug)
    if len(matches) > 1:
        raise SystemExit(
            "error: active feature family is not unique: "
            f"slug={slug}; features={','.join(matches)}"
        )
    return matches[0] if matches else None


def cmd_feat_new(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    ensure_git_repo(root)
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    title = args.title.strip()
    goal = args.goal.strip()
    slug = slugify(args.slug if args.slug else title)
    task_plan = getattr(args, "task_plan", None)
    tasks_file_raw = str(getattr(args, "tasks_file", "") or "").strip()
    if task_plan is not None and tasks_file_raw:
        eprint("error: internal task_plan and --tasks-file cannot be supplied together")
        return 1
    if tasks_file_raw:
        tasks_file = Path(tasks_file_raw)
        if not tasks_file.is_absolute():
            tasks_file = root / tasks_file
        if not tasks_file.exists():
            eprint(f"error: reviewed task plan file not found: {tasks_file}")
            return 1
        task_plan = parse_task_plan_candidate(
            load_json(tasks_file),
            root=root,
            label=f"reviewed task plan {relative_display(root, tasks_file)}",
        )

    try:
        existing_feat_id = active_feature_family_id(paths, slug)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    if existing_feat_id is not None:
        existing_state, existing_tasks = load_feat(paths, existing_feat_id)
        if task_plan is not None:
            current_revision = existing_tasks.get("plan_revision")
            if not isinstance(current_revision, int) or isinstance(current_revision, bool):
                current_revision = 0
            eprint(
                "error: active feature family already exists; extensions must update its Task plan: "
                f"slug={slug}; feature={existing_feat_id}; current_revision={current_revision}"
            )
            eprint(
                "next: feature-tracker.sh set-task-plan "
                f"--root {root} --feature {existing_feat_id} --tasks-file <reviewed-task-plan.json> "
                f"--expected-revision {current_revision}"
            )
            return 1
        print(f"reuse: active feature family {slug} => {existing_feat_id}")
        print(f"feature_status: {existing_state.get('status', '')}")
        print(f"feature_id: {existing_feat_id}")
        return 0

    policy = load_runtime_policy(paths)
    workspace_mode = resolve_workspace_mode(policy, args.workspace_mode)
    if task_plan is None and workspace_mode != "proposal_only":
        eprint(
            "error: create-feature without a reviewed task plan must use workspace_mode=proposal_only; "
            "supply --tasks-file or materialize a plan later with set-task-plan"
        )
        return 1

    feat_id, planned_index_data = allocate_feat_id(root, paths)
    if not is_valid_feat_id(feat_id):
        eprint(f"error: generated invalid feat id: {feat_id}")
        return 1

    branch_prefix = resolve_branch_prefix(policy, args.branch_prefix)
    base_ref = pick_base_branch(root)
    root_branch = current_branch(root)
    branch = ""
    wt_name = ""
    wt_rel = ""
    wt_abs: Path | None = None

    state: dict[str, Any] = {
        "version": 1,
        "feat_id": feat_id,
        "title": title,
        "slug": slug,
        "goal": goal,
        "status": "ready" if task_plan is not None and workspace_mode != "proposal_only" else "proposal",
        "workspace_mode": workspace_mode,
        "base_ref": base_ref,
        "branch": branch,
        "worktree_name": wt_name,
        "worktree_path": wt_rel,
        "current_task_id": None,
        "runtime_role": "standalone",
        "blocked_reason_class": "none",
        "runtime_relations": [],
        "counters": {
            "gate_fail_streak": 0,
            "no_progress_rounds": 0,
            "round_count": 0,
        },
        "gate": {
            "last_result": None,
            "last_task_id": None,
            "last_check_commands": [],
            "last_log_path": None,
        },
        "history": [
            history_event(
                "feat_created",
                (
                    f"workspace_mode={workspace_mode}; base_ref={base_ref}; "
                    f"root_branch={root_branch or 'detached'}"
                ),
            )
        ],
    }

    try:
        build_create_dag_projection_payload(paths, feat_id=feat_id, state=state)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    if workspace_mode == "worktree":
        branch = f"{branch_prefix}{feat_id}"
        wt_abs = (root / ".worktrees" / f"wt-{feat_id}").resolve()
        try:
            ensure_worktree_assignment_preflight(root, branch=branch, wt_abs=wt_abs)
        except SystemExit as exc:
            eprint(str(exc))
            return 1
    save_index(paths, planned_index_data)

    if workspace_mode == "worktree":
        try:
            branch, wt_name, wt_rel, wt_abs, base_ref = make_worktree_assignment(
                root,
                feat_id=feat_id,
                branch_prefix=branch_prefix,
            )
        except SystemExit as exc:
            eprint(str(exc))
            return 1
        state["base_ref"] = base_ref
        state["branch"] = branch
        state["worktree_name"] = wt_name
        state["worktree_path"] = wt_rel

    tasks = (
        build_reviewed_tasks_payload(
            feat_id,
            task_plan,
            revision=1,
            supersedes_revision=None,
        )
        if task_plan is not None
        else draft_tasks_payload(feat_id)
    )

    feat_dir = paths.feat_dir(feat_id)
    feat_dir.mkdir(parents=True, exist_ok=False)
    save_feat(paths, feat_id, state, tasks, index_data=planned_index_data)

    print(f"write: {feat_dir / 'state.json'}")
    print(f"write: {feat_dir / 'tasks.json'}")
    print(f"workspace_mode: {workspace_mode}")
    print(f"branch: {branch}")
    print(f"worktree: {wt_abs if wt_abs is not None else ''}")
    print(f"feature_id: {feat_id}")
    return 0


def cmd_feat_new_from_planning_entry_handoff(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    ensure_git_repo(root)
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    handoff_path = Path(args.handoff).resolve()
    if not handoff_path.exists():
        eprint(f"error: planning-entry handoff not found: {handoff_path}")
        return 1

    handoff = load_planning_entry_handoff(handoff_path, root=root)
    if handoff["status"] != "approved":
        eprint(
            "error: planning-entry handoff must be approved before feature creation: "
            f"{handoff['status']}"
        )
        return 1
    if handoff["clarification_status"] != "complete":
        eprint(
            "error: planning-entry handoff clarification_status must be complete before feature creation: "
            f"{handoff['clarification_status']}"
        )
        return 1
    if not handoff["discussion_clear"]:
        eprint("error: planning-entry handoff discussion_clear must be true before feature creation")
        return 1
    if handoff["user_review_status"] != "approved":
        eprint(
            "error: planning-entry handoff user_review_status must be approved before feature creation: "
            f"{handoff['user_review_status']}"
        )
        return 1
    recipe_id = str(handoff["recommended_route"]["recipe_id"])
    if recipe_id not in PLANNING_ENTRY_FEATURE_RECIPE_IDS:
        eprint(
            "error: planning-entry handoff recommended_route.recipe_id must target tracker materialization: "
            f"{recipe_id}"
        )
        return 1
    task_plan = handoff.get("task_plan")
    if task_plan is None and args.workspace_mode not in {None, "proposal_only"}:
        eprint(
            "error: planning-entry handoff without task_plan can only create a proposal_only feature"
        )
        return 1

    family_slug = slugify(args.slug if args.slug else handoff["title"])
    try:
        existing_feat_id = active_feature_family_id(paths, family_slug)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    if existing_feat_id is not None:
        eprint(
            "error: planning-entry handoff resolves to an existing active feature family; "
            f"feature={existing_feat_id}; slug={family_slug}; route the extension through its Task plan"
        )
        return 1

    before_ids = active_feature_ids(paths)
    create_args = argparse.Namespace(
        root=str(root),
        title=handoff["title"],
        slug=args.slug,
        goal=handoff["goal"],
        workspace_mode=args.workspace_mode if task_plan is not None else "proposal_only",
        branch_prefix=args.branch_prefix,
        tasks_file="",
        task_plan=task_plan,
    )
    result = cmd_feat_new(create_args)
    if result != 0:
        return result

    after_ids = active_feature_ids(paths)
    new_ids = sorted(after_ids - before_ids, key=feat_sort_key)
    if len(new_ids) != 1:
        eprint(
            "error: expected exactly one new feature after planning-entry handoff materialization, "
            f"found {len(new_ids)}"
        )
        return 1

    feat_id = new_ids[0]
    proposal_path = paths.feat_proposal(feat_id)
    write_text(proposal_path, render_planning_entry_proposal(feat_id, handoff))
    state, tasks = load_feat(paths, feat_id)
    state.setdefault("history", []).append(
        history_event(
            "planning_entry_handoff_applied",
            f"{handoff['handoff_id']}; recipe={recipe_id}",
        )
    )
    save_feat(paths, feat_id, state, tasks)
    print(f"handoff: {relative_display(root, handoff_path)}")
    print(f"proposal: {relative_display(root, proposal_path)}")
    return 0


def cmd_set_task_plan(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    state, tasks = load_feat(paths, args.feat)
    status = str(state.get("status") or "")
    if status in CLOSED_FEAT_STATUS or status == "in_progress":
        eprint(f"error: task plan cannot be replaced while feature status is {status}")
        return 1
    if state.get("current_task_id") is not None:
        eprint("error: task plan cannot be replaced while current_task_id is set")
        return 1

    current_revision = tasks.get("plan_revision")
    if not isinstance(current_revision, int) or isinstance(current_revision, bool):
        current_revision = 1 if has_reviewed_task_plan(tasks) else 0
    if args.expected_revision != current_revision:
        eprint(
            "error: task plan revision conflict: "
            f"expected {args.expected_revision}, current {current_revision}"
        )
        return 1

    tasks_file = Path(args.tasks_file)
    if not tasks_file.is_absolute():
        tasks_file = root / tasks_file
    if not tasks_file.exists():
        eprint(f"error: reviewed task plan file not found: {tasks_file}")
        return 1
    candidate = parse_task_plan_candidate(
        load_json(tasks_file),
        root=root,
        label=f"reviewed task plan {relative_display(root, tasks_file)}",
    )
    next_revision = current_revision + 1
    tasks = build_reviewed_tasks_payload(
        args.feat,
        candidate,
        revision=next_revision,
        supersedes_revision=current_revision if current_revision > 0 else None,
        previous=tasks,
    )
    if count_tasks(tasks, "todo") > 0 and status in {"blocked", "done"}:
        state["status"] = "proposal" if workspace_mode_of(state) == "proposal_only" else "ready"
        state["blocked_reason_class"] = "none"
        state.pop("blocked_reason", None)
        state.pop("blocked_task_id", None)
    state.setdefault("history", []).append(
        history_event(
            "task_plan_set",
            f"revision={next_revision}; supersedes_revision={current_revision if current_revision > 0 else 'none'}",
        )
    )
    save_feat(paths, args.feat, state, tasks)
    print(f"ok: task plan set {args.feat} revision={next_revision}")
    return 0


def validate_repaired_task_plan(
    state: dict[str, Any],
    previous: dict[str, Any],
    replacement: dict[str, Any],
    *,
    feat_id: str,
) -> None:
    normalize_tasks_payload(replacement)
    if replacement.get("feat_id") != feat_id:
        raise SystemExit(f"error: repaired task plan feat_id must be {feat_id}")
    if not has_reviewed_task_plan(replacement):
        raise SystemExit("error: repaired task plan must be a complete canonical reviewed tasks.json")
    previous_revision = previous.get("plan_revision")
    replacement_revision = replacement.get("plan_revision")
    if (
        not isinstance(previous_revision, int)
        or isinstance(previous_revision, bool)
        or replacement_revision < previous_revision
    ):
        raise SystemExit(
            "error: repaired task plan must not lower plan_revision; "
            f"current {previous_revision}, replacement {replacement_revision}"
        )
    require_canonical_task_blockers(replacement, feat_id=feat_id)
    current_task_id = state.get("current_task_id")
    in_progress = [
        str(task.get("id"))
        for task in replacement.get("tasks", [])
        if isinstance(task, dict) and task.get("status") == "in_progress"
    ]
    if current_task_id is None:
        if in_progress:
            raise SystemExit("error: repaired task plan introduces an in_progress task without current_task_id")
    elif in_progress != [current_task_id]:
        raise SystemExit(
            "error: repaired task plan must preserve the active current_task_id as the only in_progress task"
        )


def publish_repaired_task_plan(
    paths: HarnessPaths,
    state: dict[str, Any],
    replacement: dict[str, Any],
    *,
    feat_id: str,
) -> None:
    status = str(state.get("status") or "")
    tasks_path = paths.feat_tasks(feat_id, status=status)
    receipt_path = paths.feat_owner_receipt(feat_id, status=status)
    old_tasks = tasks_path.read_bytes()
    old_receipt = receipt_path.read_bytes() if receipt_path.exists() else None
    try:
        write_bytes_atomic(tasks_path, json_payload_bytes(replacement))
        save_json(receipt_path, build_owner_receipt(paths, state, replacement))
    except BaseException:
        write_bytes_atomic(tasks_path, old_tasks)
        if old_receipt is None:
            receipt_path.unlink(missing_ok=True)
        else:
            write_bytes_atomic(receipt_path, old_receipt)
        raise


def cmd_repair_reviewed_task_plan(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    state, tasks = load_feat(paths, args.feat)
    status = str(state.get("status") or "")
    if status in CLOSED_FEAT_STATUS:
        eprint("error: closed features do not accept task-plan repair")
        return 1

    state_path = paths.feat_state(args.feat, status=status)
    tasks_path = paths.feat_tasks(args.feat, status=status)
    goal_path = paths.feat_goal(args.feat, status=status)
    receipt_path = paths.feat_owner_receipt(args.feat, status=status)
    guarded_file_revision(state_path, args.expected_state_sha256, label="state")
    guarded_file_revision(tasks_path, args.expected_tasks_sha256, label="tasks")
    guarded_file_revision(goal_path, args.expected_goal_sha256, label="goal")
    guarded_file_revision(receipt_path, args.expected_receipt_sha256, label="receipt")

    source = resolve_input_file(root, args.tasks_file, label="repaired tasks file")
    replacement = load_json(source)
    if not isinstance(replacement, dict):
        eprint("error: repaired tasks file must contain a JSON object")
        return 1
    replacement = copy.deepcopy(replacement)
    validate_repaired_task_plan(state, tasks, replacement, feat_id=args.feat)
    normalize_feature_goal_ref(paths, state)
    require_valid_feature_goal_contract(paths, state)
    canonical_feature_blocker(state, feat_id=args.feat)
    if status == "blocked":
        require_current_blocker_task_evidence(state, replacement, feat_id=args.feat)

    publish_repaired_task_plan(paths, state, replacement, feat_id=args.feat)
    print(
        "ok: reviewed task plan repaired "
        f"{args.feat} revision={replacement['plan_revision']} tasks_sha256={sha256_file(tasks_path)}"
    )
    return 0


def cmd_get_owner_receipt(args: argparse.Namespace) -> int:
    paths = HarnessPaths(Path(args.root).resolve())
    ensure_harness_exists(paths)
    state, tasks = load_feat(paths, args.feat)
    receipt = load_current_owner_receipt(paths, state, tasks)
    if args.json:
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
        return 0
    print(f"owner: {receipt['owner_kind']}/{receipt['owner_id']}")
    print(f"semantic_revision: {receipt['semantic_revision']}")
    print(f"lifecycle_status: {receipt['lifecycle_status']}")
    print(f"continuation: {receipt['continuation']}")
    print(f"current_item_id: {receipt['current_item_id'] or 'none'}")
    return 0


def cmd_assign_feat_workspace(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)

    state, tasks = load_feat(paths, args.feat)
    if str(state.get("status") or "") in CLOSED_FEAT_STATUS:
        eprint(f"error: cannot assign workspace for closed feat: {args.feat}")
        return 1
    try:
        require_reviewed_task_plan(tasks, feat_id=args.feat, action="workspace assignment")
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    current_mode = workspace_mode_of(state)
    if current_mode == "worktree" or str(state.get("worktree_path") or "").strip():
        eprint(
            f"error: feat already has worktree assignment: {args.feat}. "
            "manual cleanup is required before reassigning."
        )
        return 1

    policy = load_runtime_policy(paths)
    target_mode = resolve_workspace_mode(policy, args.workspace_mode)
    if target_mode == "proposal_only":
        eprint("error: assign-feature-workspace only supports worktree or current_tree")
        return 1
    if target_mode == current_mode:
        print(f"ok: workspace already assigned {args.feat} => {target_mode}")
        return 0
    if count_tasks(tasks, "in_progress") > 0:
        eprint(
            f"error: cannot reassign workspace while feat has in_progress tasks: {args.feat}"
        )
        return 1

    branch = ""
    wt_name = ""
    wt_rel = ""
    wt_abs: Path | None = None
    base_ref = str(state.get("base_ref") or pick_base_branch(root))

    if target_mode == "worktree":
        branch_prefix = resolve_branch_prefix(policy, args.branch_prefix)
        try:
            branch, wt_name, wt_rel, wt_abs, base_ref = make_worktree_assignment(
                root,
                feat_id=args.feat,
                branch_prefix=branch_prefix,
            )
        except SystemExit as exc:
            eprint(str(exc))
            return 1

    state["workspace_mode"] = target_mode
    if state.get("status") == "proposal":
        state["status"] = "ready"
    state["base_ref"] = base_ref
    state["branch"] = branch
    state["worktree_name"] = wt_name
    state["worktree_path"] = wt_rel
    state.setdefault("history", []).append(
        history_event(
            "workspace_assigned",
            (
                f"{current_mode} -> {target_mode}; root_branch={current_branch(root) or 'detached'}"
                if current_mode != target_mode
                else f"{target_mode}; root_branch={current_branch(root) or 'detached'}"
            ),
        )
    )
    save_feat(paths, args.feat, state, tasks)

    print(f"ok: workspace assigned {args.feat} => {target_mode}")
    print(f"branch: {branch}")
    print(f"worktree: {wt_abs if wt_abs is not None else ''}")
    return 0


FEATURE_STATUS_PRESENTATION = {
    "in_progress": ("In progress", "amber"),
    "blocked": ("Blocked", "red"),
    "ready": ("Ready", "blue"),
    "proposal": ("Proposal", "slate"),
    "done": ("Needs closeout", "green"),
    "archived": ("Archived", "slate"),
    "discarded": ("Discarded", "red"),
}
FEATURE_STATUS_ORDER = ("proposal", "ready", "in_progress", "blocked", "done")


def human_status_label(status: Any) -> str:
    token = str(status or "unknown")
    return FEATURE_STATUS_PRESENTATION.get(token, (token.replace("_", " ").title(), "slate"))[0]


def html_text(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def xml_text(value: Any) -> str:
    return html.escape(str(value or ""), quote=False)


def feature_current_task(state: dict[str, Any], tasks: dict[str, Any]) -> dict[str, Any] | None:
    current_id = str(state.get("current_task_id") or "")
    if not current_id:
        return None
    return next(
        (task for task in tasks.get("tasks", []) if str(task.get("id") or "") == current_id),
        None,
    )


def render_task_stats_html(tasks: dict[str, Any]) -> str:
    parts = []
    for status in ("in_progress", "blocked", "todo", "done"):
        count = count_tasks(tasks, status)
        if count:
            parts.append(
                f'<span class="task-count task-count--{status.replace("_", "-")}">'
                f"{html_text(status.replace('_', ' ').title())} {count}</span>"
            )
    return "".join(parts) or '<span class="task-count">No tasks</span>'


def build_agent_claim_message(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
) -> str:
    feat_id = str(state.get("feat_id") or "")
    feature_name = str(state.get("title") or feat_id)
    worktree = str(state.get("worktree_path") or "").strip() or "none"
    branch = str(state.get("branch") or "").strip() or "none"
    feature_status = str(state.get("status") or "unknown")
    current_task = feature_current_task(state, tasks)
    task_id = str(current_task.get("id") or "none") if current_task else "none"
    task_title = str(current_task.get("title") or "none") if current_task else "none"
    task_counts = ", ".join(
        f"{status}={count_tasks(tasks, status)}"
        for status in ("todo", "in_progress", "done", "blocked")
    )
    feature_dir = relative_display(
        paths.root,
        paths.feat_dir(feat_id, status=feature_status),
    )
    canonical_refs = [f"{feature_dir}/state.json", f"{feature_dir}/tasks.json"]
    if paths.feat_goal(feat_id, status=feature_status).is_file():
        canonical_refs.insert(0, f"{feature_dir}/goal.md")
    if paths.feat_owner_receipt(feat_id, status=feature_status).is_file():
        canonical_refs.insert(1 if canonical_refs[0].endswith("goal.md") else 0, f"{feature_dir}/owner-receipt.json")
    canonical_text = "\n".join(f"{index}. {ref}" for index, ref in enumerate(canonical_refs, 1))
    generated_time = datetime.now(timezone.utc).isoformat(timespec="seconds")
    name = f"Feature-Tracker-{feat_id}"
    nearest_action = f"当前定位到 {task_id} · {task_title}。" if current_task else "当前未定位到 active Task。"
    body = f"""你是认领 Feature“{feature_name}”（{feat_id}）的 Agent。先从 canonical truth 建立自己的 Goal model，对齐后直接行动，不需要仅为确认而回复。

Feature name: {feature_name}
Feature ID: {feat_id}
Worktree: {worktree}
Branch: {branch}
Progress snapshot: status={feature_status}; current_task={task_id}; {task_counts}

SSOT（按顺序读取）：
{canonical_text}

{nearest_action} 上面的 progress 只帮助定位，不是状态副本。请从 SSOT 恢复 Goal、当前 Task、验收、blocker、authority 和下一步；若两者不一致，以 SSOT 为准。

本消息只传递认领上下文，不授予超出当前 Host 和 Owner truth 的写入、外部副作用、合并或发布权限。对齐后直接推进最接近验收证据的动作；只有在 verified result、稳定 checkpoint、真实 blocker、方向或权限 mismatch、不可逆决策，或完成当前任务验收时，按 Goal / Result / Evidence / Mismatch or blocker / Next 返回。

如果通过追加 user 或 prompt 消息联系其他 Agent，必须使用 bagakit-msg，不能发送裸指令。"""
    return (
        f'<bagakit-msg type="agent-set-v1" name="{html_text(name)}" time="{html_text(generated_time)}">\n'
        f"{xml_text(body)}\n"
        "</bagakit-msg>"
    )


def current_plan_tasks(tasks: dict[str, Any]) -> list[dict[str, Any]]:
    current_ids = set(latest_plan_task_ids(tasks))
    return [
        task
        for task in tasks.get("tasks", [])
        if not current_ids or str(task.get("id") or "") in current_ids
    ]


def local_ref_href(root: Path, ref: Any) -> str | None:
    raw = str(ref or "").strip()
    path_part = raw.partition("#")[0]
    if not path_part or URI_SCHEME_RE.match(path_part) or path_part.startswith(("/", "\\")):
        return None
    target = (root / path_part).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return None
    return target.as_uri() if target.is_file() else None


def render_task_review_html(root: Path, task: dict[str, Any]) -> str:
    status = str(task.get("status") or "todo")
    gate_result = str(task.get("gate_result") or "").strip()
    acceptance = task.get("acceptance") if isinstance(task.get("acceptance"), list) else []
    verification = task.get("verification") if isinstance(task.get("verification"), list) else []
    acceptance_html = (
        '<ul class="acceptance-list">'
        + "".join(f"<li>{html_text(item)}</li>" for item in acceptance)
        + "</ul>"
        if acceptance
        else '<p class="empty">No acceptance statements.</p>'
    )
    verification_rows = []
    for item in verification:
        if not isinstance(item, dict):
            continue
        ref = str(item.get("ref") or "")
        href = local_ref_href(root, ref)
        ref_html = (
            f'<a href="{html_text(href)}" target="_blank" rel="noreferrer">{html_text(ref)}</a>'
            if href
            else f"<code>{html_text(ref)}</code>"
        )
        verification_rows.append(
            '<li><span class="verification-kind">'
            f'{html_text(item.get("kind") or "evidence")}</span>{ref_html}'
            f'<p>{html_text(item.get("proves"))}</p></li>'
        )
    verification_html = (
        '<ul class="verification-list">' + "".join(verification_rows) + "</ul>"
        if verification_rows
        else '<p class="empty">No verification mappings.</p>'
    )
    gate_html = f'<span class="gate">Gate {html_text(gate_result)}</span>' if gate_result else ""
    return (
        '<section class="review-task">'
        '<div class="task-heading">'
        f'<span class="task-id">{html_text(task.get("id"))}</span>'
        f'<span class="task-status task-status--{html_text(status.replace("_", "-"))}">'
        f"{html_text(status.replace('_', ' ').title())}</span>"
        + gate_html
        + "</div>"
        f'<h4>{html_text(task.get("title"))}</h4>'
        f'<p class="review-copy"><strong>Objective</strong>{html_text(task.get("objective"))}</p>'
        f'<p class="review-copy"><strong>Outcome</strong>{html_text(task.get("outcome"))}</p>'
        '<div class="review-grid"><div><h5>Acceptance</h5>'
        + acceptance_html
        + "</div><div><h5>Verification</h5>"
        + verification_html
        + "</div></div></section>"
    )


def render_feature_review_html(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
) -> str:
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "")
    branch = str(state.get("branch") or "").strip()
    worktree = str(state.get("worktree_path") or "").strip()
    workspace_detail = branch or worktree or "repository root"
    dependencies = state.get("depends_on", [])
    dependency_text = ", ".join(str(item) for item in dependencies) if isinstance(dependencies, list) else ""
    feature_dir = paths.feat_dir(feat_id, status=status)
    canonical_files = [
        ("state.json", paths.feat_state(feat_id, status=status)),
        ("tasks.json", paths.feat_tasks(feat_id, status=status)),
        ("goal.md", paths.feat_goal(feat_id, status=status)),
        ("verification.md", feature_dir / FEATURE_VERIFICATION_FILENAME),
    ]
    canonical_links = "".join(
        f'<a href="{html_text(path.resolve().as_uri())}" target="_blank" rel="noreferrer">{label}</a>'
        for label, path in canonical_files
        if path.is_file()
    )
    reviewed_tasks = current_plan_tasks(tasks)
    tasks_html = (
        "".join(render_task_review_html(paths.root, task) for task in reviewed_tasks)
        if reviewed_tasks
        else '<p class="empty">No reviewed tasks.</p>'
    )
    return (
        '<div class="review-panel"><div class="review-header"><div><span class="eyebrow">Review</span>'
        '<h3>Current plan and proof</h3></div>'
        f'<nav class="canonical-links" aria-label="Canonical files">{canonical_links}</nav></div>'
        '<dl class="review-facts">'
        f'<div><dt>Status</dt><dd>{html_text(human_status_label(status))}</dd></div>'
        f'<div><dt>Workspace</dt><dd>{html_text(workspace_detail)}</dd></div>'
        f'<div><dt>Runtime role</dt><dd>{html_text(state.get("runtime_role") or "standalone")}</dd></div>'
        f'<div><dt>Depends on</dt><dd>{html_text(dependency_text or "none")}</dd></div>'
        "</dl>"
        f'<div class="review-tasks">{tasks_html}</div></div>'
    )


def render_feature_card_html(
    paths: HarnessPaths,
    state: dict[str, Any],
    tasks: dict[str, Any],
    *,
    open_review: bool,
) -> str:
    current_task = feature_current_task(state, tasks)
    current_task_html = (
        '<div class="current-task">'
        '<span class="eyebrow">Current task</span>'
        f'<strong>{html_text(current_task.get("id"))} · {html_text(current_task.get("title"))}</strong>'
        "</div>"
        if current_task
        else '<div class="current-task current-task--empty">No task is currently active</div>'
    )
    blocker = str(state.get("blocked_reason") or "").strip()
    blocker_html = (
        f'<p class="blocker"><strong>Blocked:</strong> {html_text(blocker)}</p>' if blocker else ""
    )
    goal = str(state.get("goal") or "").strip()
    open_attr = " open" if open_review else ""
    claim_message = build_agent_claim_message(paths, state, tasks)
    feature_title = str(state.get("title") or state.get("feat_id") or "Feature")

    return (
        f'<article class="feature-card" id="{html_text(state.get("feat_id"))}">'
        f'<details class="feature-review"{open_attr}>'
        '<summary class="feature-summary">'
        '<div class="card-kicker">'
        f'<span class="feature-id">{html_text(state.get("feat_id"))}</span>'
        f'<span class="workspace-chip">{html_text(state.get("workspace_mode") or "unassigned")}</span>'
        "</div>"
        f'<h3>{html_text(state.get("title"))}</h3>'
        + (f'<p class="goal">{html_text(goal)}</p>' if goal else "")
        + blocker_html
        + current_task_html
        + f'<div class="task-counts">{render_task_stats_html(tasks)}</div>'
        + '<span class="review-hint">Review <span aria-hidden="true">↓</span></span>'
        + "</summary>"
        + render_feature_review_html(paths, state, tasks)
        + "</details>"
        + '<div class="claim-bar"><button type="button" class="claim-trigger" '
        f'data-feature-title="{html_text(feature_title)}">Agent 认领</button>'
        '<span>生成 agent-set-v1 认领消息</span></div>'
        f'<textarea class="claim-draft" hidden>{html_text(claim_message)}</textarea>'
        + "</article>"
    )


def render_closed_features_html(items: list[dict[str, Any]]) -> str:
    if not items:
        return ""
    rows = []
    for item in items:
        rows.append(
            '<li><span class="closed-id">'
            f'{html_text(item.get("feat_id"))}</span><strong>{html_text(item.get("title"))}</strong>'
            f'<span class="closed-status">{html_text(human_status_label(item.get("status")))}</span></li>'
        )
    return (
        '<section class="closed-section"><details><summary>Closed history '
        f'<span>{len(items)}</span></summary><ul>{"".join(rows)}</ul></details></section>'
    )


def render_feature_status_html(paths: HarnessPaths, *, feat_id: str | None) -> str:
    index_items = load_index(paths).get("features", [])
    if feat_id:
        state, tasks = load_feat(paths, feat_id)
        active_records = [(state, tasks)]
        closed_items: list[dict[str, Any]] = []
        page_title = str(state.get("title") or feat_id)
    else:
        active_records = []
        closed_items = []
        for item in index_items:
            status = str(item.get("status") or "")
            if status in CLOSED_FEAT_STATUS:
                closed_items.append(item)
                continue
            state, tasks = load_feat(paths, str(item.get("feat_id") or ""))
            active_records.append((state, tasks))
        page_title = "Feature Tracker"

    by_status: dict[str, list[tuple[dict[str, Any], dict[str, Any]]]] = {}
    for state, tasks in active_records:
        by_status.setdefault(str(state.get("status") or "unknown"), []).append((state, tasks))

    status_order = list(FEATURE_STATUS_ORDER)
    status_order.extend(sorted(status for status in by_status if status not in FEATURE_STATUS_ORDER))
    columns = []
    for status in status_order:
        records = by_status.get(status, [])
        if not records:
            continue
        tone = FEATURE_STATUS_PRESENTATION.get(status, ("", "slate"))[1]
        cards = "".join(
            render_feature_card_html(paths, state, tasks, open_review=bool(feat_id))
            for state, tasks in records
        )
        columns.append(
            f'<section class="status-column status-column--{html_text(tone)}">'
            '<header><div class="status-title">'
            f'<span class="status-dot" aria-hidden="true"></span><h2>{html_text(human_status_label(status))}</h2>'
            f'<span class="status-count">{len(records)}</span></div></header>'
            f'<div class="feature-list">{cards}</div></section>'
        )

    active_count = sum(
        1 for state, _ in active_records if str(state.get("status") or "") not in CLOSED_FEAT_STATUS
    )
    in_progress_count = len(by_status.get("in_progress", []))
    blocked_count = len(by_status.get("blocked", []))
    closeout_count = len(by_status.get("done", []))
    board_html = (
        f'<main class="status-board">{"".join(columns)}</main>'
        if columns
        else '<main class="status-board status-board--empty"><p class="empty">No active features.</p></main>'
    )

    document_head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
<title>Feature Tracker Status</title>
<style>
:root { color-scheme:light; --canvas:#f5f5f2; --surface:#fff; --ink:#1d1d1b; --muted:#74756f; --shadow:0 2px 8px rgb(28 28 24 / .055); font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
* { box-sizing:border-box; }
body { margin:0; background:var(--canvas); color:var(--ink); font-size:14px; }
.shell { min-height:100vh; padding:28px; }
.page-header { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin:0 0 20px; }
.page-header h1 { margin:3px 0 0; font-size:24px; line-height:1.25; letter-spacing:-.025em; }
.page-header p { margin:0; color:var(--muted); font-size:12px; }
.projection-note { max-width:420px; text-align:right; }
.metrics { display:flex; flex-wrap:wrap; gap:14px 34px; margin:0 0 20px; padding:0 2px; }
.metric { min-width:86px; }
.metric strong { display:block; font-size:23px; line-height:1.15; font-variant-numeric:tabular-nums; }
.metric span { color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.055em; }
.status-board { display:grid; grid-auto-flow:column; grid-auto-columns:auto; gap:10px; align-items:start; overflow-x:auto; padding-bottom:12px; }
.status-column { --tone:#8b8c86; --tint:#ecece7; width:266px; min-height:180px; border-radius:15px; background:color-mix(in srgb,var(--tint) 72%,var(--canvas)); padding:9px; }
.status-column--amber { --tone:#b98313; --tint:#fbf5e5; }
.status-column--red { --tone:#c4413b; --tint:#fbefee; }
.status-column--blue { --tone:#3578c7; --tint:#edf4fb; }
.status-column--green { --tone:#2f8a5c; --tint:#edf7f1; }
.status-column:has(.feature-review[open]) { width:min(720px,calc(100vw - 64px)); }
.status-column > header { padding:6px 6px 10px; }
.status-title { display:flex; align-items:center; gap:7px; }
.status-title h2 { margin:0; font-size:12px; font-weight:650; }
.status-dot { width:8px; height:8px; border:2px solid var(--tone); border-radius:999px; }
.status-count { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
.feature-list { display:grid; gap:8px; }
.feature-card { border-radius:12px; background:var(--surface); box-shadow:var(--shadow); overflow:hidden; }
.feature-review { display:block; }
.feature-summary { cursor:pointer; list-style:none; padding:12px; }
.feature-summary::-webkit-details-marker { display:none; }
.feature-summary:focus-visible { outline:2px solid var(--tone); outline-offset:-3px; border-radius:12px; }
.feature-card:has(.feature-review[open]) { box-shadow:0 8px 24px rgb(28 28 24 / .09); }
.card-kicker,.task-heading { display:flex; align-items:center; gap:6px; min-width:0; }
.feature-id,.task-id { color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums; }
.workspace-chip,.task-status,.gate { margin-left:auto; border-radius:999px; background:#f0f0ed; color:#5f605b; padding:2px 6px; font-size:10px; white-space:nowrap; }
.feature-card h3 { margin:7px 0 0; font-size:14px; line-height:1.35; letter-spacing:-.01em; }
.goal { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; margin:5px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
.blocker { margin:8px 0 0; border-radius:7px; background:#fff0ef; color:#8e2d29; padding:7px; font-size:11px; line-height:1.45; }
.current-task { display:grid; gap:2px; margin-top:10px; border-radius:8px; background:color-mix(in srgb,var(--tone) 6%,transparent); padding:7px 8px; font-size:12px; line-height:1.4; }
.current-task--empty { background:#f7f7f4; color:var(--muted); }
.eyebrow { color:var(--muted); font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
.task-counts { display:flex; flex-wrap:wrap; gap:5px; margin-top:10px; }
.task-count { border-radius:999px; background:#f2f2ef; color:#666761; padding:2px 6px; font-size:10px; font-variant-numeric:tabular-nums; }
.task-count--in-progress { background:#fff4d8; color:#7a5610; }
.task-count--blocked { background:#fff0ef; color:#8e2d29; }
.task-count--done { background:#eaf7ef; color:#256746; }
.review-hint { display:inline-flex; align-items:center; gap:4px; margin-top:10px; color:var(--tone); font-size:11px; font-weight:650; }
.feature-review[open] .review-hint span { transform:rotate(180deg); }
.review-panel { margin:0 8px 8px; border-radius:10px; background:#f8f8f5; padding:14px; }
.review-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.review-header h3 { margin:2px 0 0; font-size:15px; }
.canonical-links { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px; }
.canonical-links a { border-radius:999px; background:#eaeae5; color:#4f504b; padding:4px 8px; font-size:10px; text-decoration:none; }
.canonical-links a:hover { background:#dfdfd8; color:var(--ink); }
.review-facts { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px 16px; margin:14px 0 0; }
.review-facts div { display:grid; grid-template-columns:76px 1fr; gap:8px; }
.review-facts dt { color:var(--muted); font-size:10px; text-transform:uppercase; }
.review-facts dd { margin:0; overflow-wrap:anywhere; font-size:11px; }
.review-tasks { margin-top:18px; }
.review-task + .review-task { margin-top:22px; }
.review-task h4 { margin:8px 0 0; font-size:14px; }
.review-copy { display:grid; grid-template-columns:70px 1fr; gap:9px; margin:7px 0 0; color:var(--muted); font-size:11px; line-height:1.5; }
.review-copy strong { color:var(--ink); font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
.review-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; margin-top:13px; }
.review-grid h5 { margin:0 0 7px; font-size:11px; }
.acceptance-list,.verification-list { display:grid; gap:6px; margin:0; padding-left:17px; color:#555650; font-size:11px; line-height:1.45; }
.verification-list { padding:0; list-style:none; }
.verification-list li { min-width:0; }
.verification-list a,.verification-list code { color:#356f9e; overflow-wrap:anywhere; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; }
.verification-list p { margin:2px 0 0; color:var(--muted); }
.verification-kind { display:inline-block; margin-right:5px; border-radius:999px; background:#e9eee9; color:#46604d; padding:1px 5px; font-size:9px; text-transform:uppercase; }
.claim-bar { display:flex; align-items:center; gap:8px; padding:0 12px 12px; }
.claim-bar span { color:var(--muted); font-size:10px; }
.claim-trigger,.dialog-action { border:0; border-radius:8px; background:#292a27; color:#fff; cursor:pointer; padding:6px 9px; font:inherit; font-size:11px; font-weight:650; }
.claim-trigger:hover,.dialog-action:hover { background:#42433e; }
.claim-dialog { width:min(760px,calc(100vw - 32px)); max-height:calc(100vh - 40px); border:0; border-radius:16px; background:#fff; color:var(--ink); padding:0; box-shadow:0 24px 80px rgb(20 20 16 / .24); }
.claim-dialog::backdrop { background:rgb(20 20 16 / .28); backdrop-filter:blur(2px); }
.claim-dialog-shell { display:grid; gap:13px; padding:20px; }
.claim-dialog-header { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; }
.claim-dialog-header h2 { margin:2px 0 0; font-size:18px; }
.dialog-close { border:0; border-radius:999px; background:#efefeb; color:var(--muted); cursor:pointer; height:30px; width:30px; font-size:17px; }
.claim-note { margin:0; color:var(--muted); font-size:12px; line-height:1.5; }
.claim-message { width:100%; min-height:300px; resize:vertical; border:0; border-radius:10px; background:#f4f4f0; color:#343530; padding:14px; font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
.claim-message:focus { outline:2px solid #8ba8bf; }
.claim-actions { display:flex; align-items:center; gap:8px; }
.dialog-action--secondary { background:#e8e8e3; color:#343530; }
.dialog-action--secondary:hover { background:#dcdcd5; }
.claim-status { margin-left:auto; color:var(--muted); font-size:11px; }
.task-status { margin-left:0; }
.gate { margin-left:0; }
.closed-section { margin-top:20px; padding:0 4px; }
.closed-section summary { cursor:pointer; color:var(--muted); font-size:11px; font-weight:600; }
.closed-section summary span { font-weight:400; }
.closed-section ul { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:5px 12px; margin:10px 0 0; padding:0; list-style:none; }
.closed-section li { display:grid; grid-template-columns:auto 1fr auto; gap:7px; align-items:center; color:var(--muted); font-size:11px; }
.closed-section li strong { overflow:hidden; color:var(--ink); font-weight:500; text-overflow:ellipsis; white-space:nowrap; }
.closed-status { color:var(--muted); }
.empty { color:var(--muted); }
@media (max-width:720px) { .shell{padding:18px 12px}.page-header{align-items:flex-start;flex-direction:column}.projection-note{text-align:left}.metrics{gap:12px 22px}.status-board{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:1fr;overflow:visible}.status-column,.status-column:has(.feature-review[open]){width:auto}.review-header,.claim-dialog-header{flex-direction:column}.canonical-links{justify-content:flex-start}.review-facts,.review-grid{grid-template-columns:1fr}.claim-bar{align-items:flex-start;flex-direction:column}.claim-dialog-shell{padding:15px}.claim-message{min-height:270px}.claim-actions{align-items:stretch;flex-direction:column}.claim-status{margin:0;text-align:center} }
</style>
</head>
<body>
"""

    claim_dialog = r"""
<dialog class="claim-dialog" id="claim-dialog">
  <div class="claim-dialog-shell">
    <header class="claim-dialog-header">
      <div><span class="eyebrow">Agent claim draft</span><h2 id="claim-dialog-title">认领 Feature</h2></div>
      <form method="dialog"><button class="dialog-close" aria-label="Close">×</button></form>
    </header>
    <p class="claim-note">这是 <code>agent-set-v1</code> 路由草稿：只告诉 Agent 去哪里恢复 SSOT，不复制 Task 或运行状态。它不认证发送者、不投递消息，也不授予 Host 或 Owner 权限。</p>
    <textarea class="claim-message" id="claim-message" readonly spellcheck="false"></textarea>
    <div class="claim-actions">
      <button type="button" class="dialog-action" id="copy-claim">复制认领消息</button>
      <button type="button" class="dialog-action dialog-action--secondary" id="share-claim">系统分享</button>
      <span class="claim-status" id="claim-status" aria-live="polite"></span>
    </div>
  </div>
</dialog>
<script>
(() => {
  const dialog = document.getElementById("claim-dialog");
  const title = document.getElementById("claim-dialog-title");
  const message = document.getElementById("claim-message");
  const status = document.getElementById("claim-status");

  function refreshTime() {
    const now = new Date().toISOString();
    message.value = message.value.replace(/ time="[^"]*"/, ` time="${now}"`);
    return message.value;
  }

  async function copyMessage() {
    const text = refreshTime();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard API unavailable");
      }
    } catch (_) {
      message.focus();
      message.select();
      document.execCommand("copy");
    }
    status.textContent = "已复制；请通过 Host 发送给目标 Agent";
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".claim-trigger");
    if (!trigger) return;
    const card = trigger.closest(".feature-card");
    const draft = card && card.querySelector(".claim-draft");
    if (!draft) return;
    title.textContent = `认领 ${trigger.dataset.featureTitle || "Feature"}`;
    message.value = draft.value;
    refreshTime();
    status.textContent = "";
    dialog.showModal();
  });

  document.getElementById("copy-claim").addEventListener("click", copyMessage);
  document.getElementById("share-claim").addEventListener("click", async () => {
    const text = refreshTime();
    if (!navigator.share) {
      await copyMessage();
      status.textContent = "当前浏览器不支持系统分享，已复制";
      return;
    }
    try {
      await navigator.share({ title: title.textContent, text });
      status.textContent = "已交给系统分享；交付与认领效果仍由 Host 确认";
    } catch (error) {
      if (error && error.name === "AbortError") return;
      await copyMessage();
      status.textContent = "系统分享失败，已复制";
    }
  });
})();
</script>
"""

    return (
        document_head
        + '<div class="shell"><header class="page-header"><div><p>Bagakit · read-only projection</p>'
        f'<h1>{html_text(page_title)}</h1></div>'
        '<p class="projection-note">Computed on demand from Feature Tracker canonical state. This page stores no planning or runtime truth.</p></header>'
        '<section class="metrics" aria-label="Feature summary">'
        f'<div class="metric"><strong>{active_count}</strong><span>Active</span></div>'
        f'<div class="metric"><strong>{in_progress_count}</strong><span>In progress</span></div>'
        f'<div class="metric"><strong>{blocked_count}</strong><span>Blocked</span></div>'
        f'<div class="metric"><strong>{closeout_count}</strong><span>Needs closeout</span></div>'
        "</section>"
        + board_html
        + render_closed_features_html(closed_items)
        + "</div>"
        + claim_dialog
        + "</body></html>"
    )


def cmd_feat_status(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    index_data = load_index(paths)
    feats = index_data.get("features", [])

    if args.format == "html":
        print(render_feature_status_html(paths, feat_id=args.feat))
        return 0

    if args.feat:
        state, tasks = load_feat(paths, args.feat)
        payload = {
            "feature": state,
            "tasks": tasks,
        }
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        print(f"feature_id: {state['feat_id']}")
        print(f"title: {state.get('title', '')}")
        print(f"status: {state.get('status', '')}")
        print(f"workspace_mode: {state.get('workspace_mode', '')}")
        print(f"branch: {state.get('branch', '')}")
        print(f"worktree: {state.get('worktree_path', '')}")
        print(f"current_task: {state.get('current_task_id')}")
        print(
            "tasks: "
            f"todo={count_tasks(tasks, 'todo')} "
            f"in_progress={count_tasks(tasks, 'in_progress')} "
            f"done={count_tasks(tasks, 'done')} "
            f"blocked={count_tasks(tasks, 'blocked')}"
        )
        return 0

    if args.json:
        print(json.dumps({"features": feats}, ensure_ascii=False, indent=2))
        return 0

    if not feats:
        print("no features")
        return 0

    print("feature_id	status	workspace	title	branch")
    for item in feats:
        print(
            f"{item.get('feat_id','')}\t{item.get('status','')}\t{item.get('workspace_mode','')}\t"
            f"{item.get('title','')}\t{item.get('branch','')}"
        )
    return 0


def cmd_task_start(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)
    state, tasks = load_feat(paths, args.feat)
    try:
        require_reviewed_task_plan(tasks, feat_id=args.feat, action="task start")
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    workspace_mode = workspace_mode_of(state)
    if workspace_mode == "proposal_only":
        recommended_mode, reason = recommend_workspace_mode(root)
        next_cmd = (
            "feature-tracker.sh assign-feature-workspace "
            f"--root {shlex.quote(str(root))} --feature {args.feat} --workspace-mode {recommended_mode}"
        )
        alternative = (
            "feature-tracker.sh assign-feature-workspace "
            f"--root {shlex.quote(str(root))} --feature {args.feat} "
            f"--workspace-mode {'worktree' if recommended_mode == 'current_tree' else 'current_tree'}"
        )
        eprint(
            f"error: feat {args.feat} is proposal_only; "
            "assign a workspace first with feature-tracker.sh assign-feature-workspace"
        )
        print(f"recommendation: {recommended_mode} ({reason})")
        print(f"next: {next_cmd}")
        print(f"alternative: {alternative}")
        return 1

    task_id = args.task
    if not TASK_ID_RE.fullmatch(task_id):
        eprint(f"error: invalid task id: {task_id}")
        return 1
    if task_id not in set(latest_plan_task_ids(tasks)):
        eprint(f"error: task {task_id} is not part of the current reviewed task plan")
        return 1

    for t in tasks.get("tasks", []):
        if t.get("status") == "in_progress" and t.get("id") != task_id:
            eprint(f"error: another task is already in_progress: {t.get('id')}")
            return 1

    target = find_task(tasks, task_id)
    if target.get("superseded_by"):
        eprint(f"error: task {task_id} has been superseded and cannot be restarted")
        return 1
    if target.get("status") not in {"todo", "blocked"}:
        eprint(f"error: task {task_id} cannot be started from status={target.get('status')}")
        return 1

    execution = resolve_feature_execution_root(root, state)
    target["status"] = "in_progress"
    state["status"] = "in_progress"
    state["blocked_reason_class"] = "none"
    state.pop("blocked_reason", None)
    state.pop("blocked_task_id", None)
    state["current_task_id"] = task_id
    state.setdefault("history", []).append(
        history_event("task_started", task_id)
    )
    save_feat(paths, args.feat, state, tasks)
    print(f"ok: task started {args.feat}/{task_id}")
    return 0


def cmd_task_unstart(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)
    state, tasks = load_feat(paths, args.feat)
    try:
        load_current_owner_receipt(paths, state, tasks)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    task = find_task(tasks, args.task)

    if task.get("status") != "in_progress":
        eprint(f"error: task is not in_progress: {args.task}")
        return 1
    if state.get("current_task_id") != args.task:
        eprint("error: state current_task_id mismatch")
        return 1
    if task_has_unstart_evidence(paths, state, task, args.task):
        eprint(f"error: task has execution evidence and cannot be unstarted: {args.task}")
        return 1
    try:
        execution = resolve_feature_execution_root(root, state)
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    try:
        changes = non_harness_git_status_lines(execution.path)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    if changes:
        eprint(f"error: feature execution worktree is dirty: {execution.path}")
        return 1

    head = run_cmd(["git", "-C", str(execution.path), "rev-parse", "HEAD"])
    if head.returncode != 0:
        eprint(head.stderr.strip() or head.stdout.strip() or "git rev-parse HEAD failed")
        return 1
    actual_head = head.stdout.strip()
    if actual_head != args.expected_head:
        eprint(
            "error: feature execution HEAD conflict: "
            f"expected {args.expected_head}, current {actual_head}"
        )
        return 1

    try:
        final_changes = non_harness_git_status_lines(execution.path)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    final_head = run_cmd(["git", "-C", str(execution.path), "rev-parse", "HEAD"])
    if final_head.returncode != 0:
        eprint(final_head.stderr.strip() or final_head.stdout.strip() or "git rev-parse HEAD failed")
        return 1
    if final_changes or final_head.stdout.strip() != actual_head:
        eprint(f"error: feature execution Git state changed during task unstart: {execution.path}")
        return 1

    task["status"] = "todo"
    state["current_task_id"] = None
    state["status"] = "ready"
    state.setdefault("history", []).append(history_event("task_unstarted", args.task))
    save_feat(paths, args.feat, state, tasks)
    print(f"ok: task unstarted {args.feat}/{args.task}")
    print(f"feat_status: {state['status']}")
    return 0


def detect_project_type(root: Path, config: dict[str, Any]) -> str:
    gate_cfg = runtime_gate_config(config)
    explicit_value = gate_cfg.get("project_type", "auto")
    if not isinstance(explicit_value, str):
        raise SystemExit("error: gate.project_type must be auto, ui, or non_ui")
    explicit = explicit_value.strip()
    if explicit in {"ui", "non_ui"}:
        return explicit
    if explicit != "auto":
        raise SystemExit("error: gate.project_type must be auto, ui, or non_ui")

    rules = gate_cfg.get("project_type_rules", {})
    if not isinstance(rules, dict):
        raise SystemExit("error: gate.project_type_rules must be an object")
    ui_rules = rules.get("ui", {})
    non_ui_rules = rules.get("non_ui", {})
    default_type = rules.get("default", "non_ui")
    if default_type not in {"ui", "non_ui"}:
        raise SystemExit("error: gate.project_type_rules.default must be ui or non_ui")

    def matches(rule_set: Any, *, label: str) -> bool:
        if not isinstance(rule_set, dict):
            raise SystemExit(f"error: gate.project_type_rules.{label} must be an object")
        matched = False
        for field in ("any_path_exists", "all_paths_exist"):
            paths = rule_set.get(field, [])
            if not isinstance(paths, list) or any(
                not isinstance(rel, str) or not rel.strip() for rel in paths
            ):
                raise SystemExit(
                    f"error: gate.project_type_rules.{label}.{field} must be a list of non-empty paths"
                )
            if field == "any_path_exists" and paths:
                matched = matched or any((root / rel).exists() for rel in paths)
            if field == "all_paths_exist" and paths:
                matched = matched or all((root / rel).exists() for rel in paths)
        return matched

    if matches(ui_rules, label="ui"):
        return "ui"
    if matches(non_ui_rules, label="non_ui"):
        return "non_ui"
    return default_type


def collect_non_ui_commands(root: Path, config: dict[str, Any]) -> list[str]:
    gate_cfg = runtime_gate_config(config)
    custom = gate_cfg.get("non_ui_commands", [])
    if not isinstance(custom, list):
        raise SystemExit("error: gate.non_ui_commands must be a list of non-empty commands")
    if custom:
        commands = [item.strip() for item in custom if isinstance(item, str) and item.strip()]
        if len(commands) != len(custom):
            raise SystemExit("error: gate.non_ui_commands must be a list of non-empty commands")
        return commands

    commands: list[str] = []
    if (root / "pyproject.toml").exists() or (root / "requirements.txt").exists() or (root / "pytest.ini").exists():
        if command_exists("pytest"):
            commands.append("pytest -q")
    if (root / "go.mod").exists() and command_exists("go"):
        commands.append("go test ./...")
    if (root / "Cargo.toml").exists() and command_exists("cargo"):
        commands.append("cargo test -q")
    package_json = root / "package.json"
    if package_json.exists() and command_exists("npm"):
        try:
            data = load_json(package_json)
            scripts = data.get("scripts", {}) if isinstance(data, dict) else {}
            if isinstance(scripts, dict) and "test" in scripts:
                commands.append("npm test --silent")
        except Exception:  # noqa: BLE001
            pass
    return commands


def resolve_verification_policy(config: dict[str, Any]) -> str:
    gate_cfg = runtime_gate_config(config)
    raw = str(gate_cfg.get("verification_policy", "on_demand")).strip().lower()
    allowed = {"never", "on_demand", "auto_ui", "required"}
    if raw not in allowed:
        raise SystemExit(
            "error: invalid gate.verification_policy: "
            f"{raw}. expected one of {', '.join(sorted(allowed))}"
        )
    return raw


def verification_required(policy: str, *, project_type: str, evidence_file: Path) -> bool:
    if policy == "never":
        return False
    if policy == "required":
        return True
    if policy == "auto_ui":
        return project_type == "ui" or evidence_file.exists()
    return evidence_file.exists()


def validate_verification_evidence(evidence_file: Path) -> list[str]:
    errors: list[str] = []
    if not evidence_file.exists():
        return [f"missing verification file: {evidence_file}"]
    try:
        text = read_text(evidence_file)
    except (OSError, UnicodeError) as exc:
        return [f"invalid verification evidence: {normalize_error_text(exc)}"]

    lines = text.splitlines()
    headings = ("## Automated Checks", "## Manual Checks", "## Residual Risks")
    heading_positions: list[int] = []
    for heading in headings:
        positions = [index for index, line in enumerate(lines) if line.strip() == heading]
        if not positions:
            errors.append(f"missing heading in verification evidence: {heading}")
        else:
            heading_positions.append(positions[0])
    if errors:
        return errors
    if heading_positions != sorted(heading_positions):
        return ["verification evidence headings must use canonical order"]

    automated_start, manual_start, residual_start = heading_positions
    sections = {
        "Command": lines[automated_start + 1 : manual_start],
        "Result": lines[automated_start + 1 : manual_start],
        "Step": lines[manual_start + 1 : residual_start],
        "Outcome": lines[manual_start + 1 : residual_start],
    }
    placeholder_labels = ("Command", "Result", "Step", "Outcome")
    values: dict[str, list[str]] = {label: [] for label in placeholder_labels}
    for label, section_lines in sections.items():
        prefix = f"- {label}:"
        for line in section_lines:
            stripped = line.strip()
            if stripped.startswith(prefix):
                value = stripped[len(prefix) :].strip()
                if not value:
                    errors.append(f"blank verification evidence field: {label}")
                values[label].append(value)
    placeholder_tokens = {"todo", "tbd", "pending", "unknown", "n/a"}

    def substantive(value: str) -> bool:
        normalized = unicodedata.normalize("NFKC", value).strip().casefold()
        normalized = re.sub(r"^[\W_]+|[\W_]+$", "", normalized)
        return normalized not in placeholder_tokens and any(
            character.isalnum() for character in normalized
        )

    if not any(
        substantive(value)
        for label in ("Result", "Outcome")
        for value in values[label]
        if value
    ):
        errors.append("verification evidence requires a substantive Result or Outcome")

    residual_lines = [
        line.strip().removeprefix("-").strip()
        for line in lines[residual_start + 1 :]
        if line.strip() and not line.startswith("#")
    ]
    if not any(substantive(line) for line in residual_lines):
        errors.append("verification evidence requires an explicit residual-risk disposition")
    return errors


def cmd_task_gate(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    records: list[dict[str, Any]] = []
    failed = False
    fail_reasons: list[str] = []
    commands: list[str] = []
    command_failure_prefix = "command failed"

    with tracker_state_lock(root):
        state, tasks = load_feat(paths, args.feat)
        task = find_task(tasks, args.task)
        if task.get("status") != "in_progress":
            eprint(f"error: task {args.task} must be in_progress before gate")
            return 1
        if state.get("current_task_id") != args.task:
            eprint("error: current feature current_task_id does not match requested task")
            return 1
        try:
            execution = resolve_feature_execution_root(root, state)
        except SystemExit as exc:
            eprint(str(exc))
            return 1
        execution_sig = workspace_signature(state, execution)

        project_type = "invalid"
        try:
            config = load_runtime_policy(paths)
            project_type = detect_project_type(execution.path, config)
            verification_policy = resolve_verification_policy(config)
            verification_file = paths.feat_verification(
                args.feat, status=str(state.get("status") or "")
            )

            if verification_required(
                verification_policy,
                project_type=project_type,
                evidence_file=verification_file,
            ):
                verification_errors = validate_verification_evidence(verification_file)
                if verification_errors:
                    failed = True
                    fail_reasons.extend(verification_errors)

            if project_type == "ui":
                ui_cmds = runtime_gate_config(config).get("ui_commands", [])
                if isinstance(ui_cmds, list):
                    commands = [
                        item.strip()
                        for item in ui_cmds
                        if isinstance(item, str) and item.strip()
                    ]
                    if len(commands) != len(ui_cmds):
                        commands = []
                command_failure_prefix = "ui command failed"
                if not commands:
                    failed = True
                    fail_reasons.append(
                        "no UI gate command available; "
                        f"set gate.ui_commands in {paths.runtime_policy_file.relative_to(root)}"
                    )
            else:
                commands = collect_non_ui_commands(execution.path, config)
                if not commands:
                    failed = True
                    fail_reasons.append(
                        "no non-ui gate command available; "
                        f"set gate.non_ui_commands in {paths.runtime_policy_file.relative_to(root)}"
                    )
        except SystemExit as exc:
            commands = []
            if project_type not in {"ui", "non_ui"}:
                project_type = "invalid"
            failed = True
            fail_reasons.append(normalize_error_text(exc))

    for cmd in commands:
        cp = run_shell(cmd, cwd=execution.path)
        rec = {
            "command": cmd,
            "exit_code": cp.returncode,
            "status": "pass" if cp.returncode == 0 else "fail",
        }
        records.append(rec)
        if cp.returncode != 0:
            failed = True
            fail_reasons.append(f"{command_failure_prefix}: {cmd}")

    gate_result = "fail" if failed else "pass"

    with tracker_state_lock(root):
        state, tasks = load_feat(paths, args.feat)
        task = find_task(tasks, args.task)
        if task.get("status") != "in_progress" or state.get("current_task_id") != args.task:
            eprint("error: task state changed while gate was running; gate result was not recorded")
            return 1
        if revalidate_workspace_signature(root, state, execution_sig, label="gate") is None:
            return 1

        logs_dir = paths.feat_artifacts_dir(args.feat, status=str(state.get("status") or ""))
        logs_dir.mkdir(parents=True, exist_ok=True)
        next_round = int(state.setdefault("counters", {}).get("round_count", 0)) + 1
        log_file = next_numbered_path(logs_dir, prefix=f"gate-{args.task}-r{next_round}-", suffix=".log")
        lines = [
            f"project_type={project_type}",
            f"execution_root={relative_display(root, execution.path)}",
            f"workspace_mode={execution.workspace_mode}",
            f"execution_detail={execution.detail}",
            f"result={gate_result}",
        ]
        if fail_reasons:
            lines.append("reasons:")
            for r in fail_reasons:
                lines.append(f"- {r}")
        lines.append("commands:")
        for rec in records:
            lines.append(f"- {rec['command']} => {rec['status']} ({rec['exit_code']})")
        write_text(log_file, "\n".join(lines) + "\n")

        counters = state.setdefault("counters", {})
        counters["round_count"] = int(counters.get("round_count", 0)) + 1
        counters["no_progress_rounds"] = int(counters.get("no_progress_rounds", 0)) + 1
        if gate_result == "pass":
            counters["gate_fail_streak"] = 0
        else:
            counters["gate_fail_streak"] = int(counters.get("gate_fail_streak", 0)) + 1

        state["gate"] = {
            "last_result": gate_result,
            "last_task_id": args.task,
            "last_check_commands": records,
            "last_log_path": str(log_file.relative_to(root)),
        }
        state.setdefault("history", []).append(
            history_event("task_gate", f"{args.task} => {gate_result}")
        )

        task["gate_result"] = gate_result
        task["last_gate_commands"] = records

        save_feat(paths, args.feat, state, tasks)

    if gate_result == "fail":
        eprint(f"error: gate failed for {args.feat}/{args.task}")
        for reason in fail_reasons:
            eprint(f"error: {reason}")
        if any(reason.startswith("missing verification file:") for reason in fail_reasons):
            print(
                "next: feature-tracker.sh materialize-feature-artifact "
                f"--root {shlex.quote(str(root))} --feature {args.feat} --kind verification"
            )
        print(f"gate_log: {log_file}")
        return 1

    print(f"ok: gate passed {args.feat}/{args.task}")
    print(f"execution_root: {execution.path}")
    print(f"gate_log: {log_file}")
    return 0


def cmd_task_finish(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    try:
        state, tasks = load_feat(paths, args.feat)
        apply_task_finish_transition(
            state,
            tasks,
            feat_id=args.feat,
            task_id=args.task,
            result=args.result,
            blocked_reason_class=args.blocked_reason_class,
            blocked_reason=args.blocked_reason,
        )
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    save_feat(paths, args.feat, state, tasks)
    print(f"ok: task finished {args.feat}/{args.task} => {args.result}")
    print(f"feat_status: {state['status']}")
    if state["status"] == "done":
        root_q = shlex.quote(str(root))
        closeout_cmd = f"feature-tracker.sh closeout-feature --root {root_q} --feature {args.feat}"
        discard_cmd = (
            "feature-tracker.sh closeout-feature "
            f"--root {root_q} --feature {args.feat} --mode discard --reason superseded"
        )
        if workspace_mode_of(state) == "worktree":
            branch = str(state.get("branch") or "")
            base_ref = str(state.get("base_ref") or pick_base_branch(root))
            branch_merged = bool(branch and git_local_branch_exists(root, branch) and git_branch_merged_into(root, branch, base_ref))
            if branch and not branch_merged:
                print(
                    "next: git -C "
                    f"{root_q} checkout {shlex.quote(base_ref)} "
                    f"&& git -C {root_q} merge --no-ff {shlex.quote(branch)}"
                )
                print(f"after_merge: {closeout_cmd}")
            else:
                print(f"next: {closeout_cmd}")
        else:
            print(f"next: {closeout_cmd}")
        print(f"alternative: {discard_cmd}")
    return 0


def render_summary(
    state: dict[str, Any],
    tasks: dict[str, Any],
    *,
    preserved_root_entries: list[str] | None = None,
) -> str:
    feat_id = state["feat_id"]
    workspace_mode = state.get("workspace_mode", "")
    todo = count_tasks(tasks, "todo")
    in_prog = count_tasks(tasks, "in_progress")
    done = count_tasks(tasks, "done")
    blocked = count_tasks(tasks, "blocked")
    counters = state.get("counters", {})
    preserved = preserved_root_entries or []
    reviewed_plan = has_reviewed_task_plan(tasks)
    reviewed_revision = str(tasks.get("plan_revision")) if reviewed_plan else "none"
    confirmation_ref = str(tasks.get("review_ref") or "") if reviewed_plan else ""
    closeout_review = tasks.get("closeout_review")
    review_lines: list[str] = []
    if isinstance(closeout_review, dict):
        for group, title in (
            ("documentation", "Documentation"),
            ("learning", "Execution Learning (Agent-authored)"),
            ("promotion", "Promotion"),
        ):
            item = closeout_review.get(group)
            if not isinstance(item, dict):
                continue
            rationale = " ".join(str(item.get("rationale") or "").split())
            refs = item.get("refs") if isinstance(item.get("refs"), list) else []
            review_lines.extend(
                [
                    f"- {title}: {item.get('disposition', '')}",
                    f"  - Rationale: {rationale}",
                    f"  - Refs: {', '.join(str(ref) for ref in refs)}",
                ]
            )

    return "\n".join(
        [
            f"# Feature Summary: {feat_id}",
            "",
            f"- Title: {state.get('title', '')}",
            f"- Final Status: {state.get('status', '')}",
            f"- Closed From Status: {state.get('closed_from_status', '')}",
            f"- Workspace Mode: {workspace_mode}",
            f"- Base Ref: {state.get('base_ref', '')}",
            f"- Branch: {state.get('branch', '')}",
            f"- Worktree: {state.get('worktree_path', '')}",
            f"- Discard Reason: {state.get('discard_reason') or ''}",
            f"- Replacement Feat: {state.get('replacement_feat_id') or ''}",
            "",
            "## Requirement Authority",
            "- Archive Synthesis: none; archive does not reinterpret or rewrite requirements",
            "- Canonical Truth: tasks.json",
            f"- Confirmed Plan Revision: {reviewed_revision}",
            f"- Confirmation Ref: {confirmation_ref}",
            "",
            "## Closure",
            "- Git Workspace: unchanged; use ordinary Git commands for worktree or branch cleanup",
            f"- Preserved Root Entries: {', '.join(preserved) if preserved else ''}",
            "",
            "## Task Stats",
            f"- todo: {todo}",
            f"- in_progress: {in_prog}",
            f"- done: {done}",
            f"- blocked: {blocked}",
            "",
            "## Closeout Review",
            *review_lines,
            "",
            "## Counters",
            f"- gate_fail_streak: {counters.get('gate_fail_streak', 0)}",
            f"- no_progress_rounds: {counters.get('no_progress_rounds', 0)}",
            f"- round_count: {counters.get('round_count', 0)}",
            "",
            "## Notes",
            "- Closeout review is final planning truth; durable knowledge remains with its existing project owner.",
            "- Agent-authored execution learning is not requirement authority and must not redefine confirmed scope.",
            "",
        ]
    )


def apply_template(template: str, replacements: dict[str, str]) -> str:
    out = template
    for k, v in replacements.items():
        out = out.replace(k, v)
    return out


def resolve_worktree_abs(root: Path, raw: str) -> Path:
    p = Path(raw)
    if p.is_absolute():
        return p
    return (root / p).resolve()


def git_local_branch_exists(root: Path, branch: str) -> bool:
    cp = run_cmd(["git", "-C", str(root), "show-ref", "--verify", f"refs/heads/{branch}"])
    return cp.returncode == 0


def git_branch_merged_into(root: Path, branch: str, base_ref: str) -> bool:
    cp = run_cmd(["git", "-C", str(root), "merge-base", "--is-ancestor", branch, base_ref])
    return cp.returncode == 0


def git_worktree_paths(root: Path) -> set[Path]:
    cp = run_cmd(["git", "-C", str(root), "worktree", "list", "--porcelain"])
    if cp.returncode != 0:
        return set()
    out: set[Path] = set()
    for raw in cp.stdout.splitlines():
        line = raw.strip()
        if not line.startswith("worktree "):
            continue
        path = line[len("worktree ") :].strip()
        if not path:
            continue
        out.add(Path(path).resolve())
    return out


def resolve_feature_execution_root(root: Path, state: dict[str, Any]) -> FeatureExecutionRoot:
    feat_id = str(state.get("feat_id") or "<unknown>")
    workspace_mode = workspace_mode_of(state)
    if workspace_mode == "current_tree":
        return FeatureExecutionRoot(
            path=root,
            workspace_mode=workspace_mode,
            detail="current_tree uses the tracker root",
        )
    if workspace_mode == "worktree":
        raw = str(state.get("worktree_path") or "").strip()
        if not raw:
            raise SystemExit(f"error: feat {feat_id} workspace_mode=worktree but state.worktree_path is missing")
        execution_root = resolve_worktree_abs(root, raw).resolve()
        if not execution_root.exists():
            raise SystemExit(f"error: feat {feat_id} worktree path does not exist: {execution_root}")
        if not execution_root.is_dir():
            raise SystemExit(f"error: feat {feat_id} worktree path is not a directory: {execution_root}")
        cp = run_cmd(["git", "-C", str(execution_root), "rev-parse", "--is-inside-work-tree"])
        if cp.returncode != 0 or cp.stdout.strip() != "true":
            raise SystemExit(f"error: feat {feat_id} worktree path is not a git work tree: {execution_root}")
        if execution_root not in git_worktree_paths(root):
            raise SystemExit(
                "error: feat "
                f"{feat_id} worktree path is not registered under tracker root: {execution_root}"
            )
        branch = str(state.get("branch") or "").strip()
        if not branch:
            raise SystemExit(f"error: feat {feat_id} workspace_mode=worktree but state.branch is missing")
        current = current_branch(execution_root)
        if current != branch:
            actual = current or "detached"
            raise SystemExit(
                f"error: feat {feat_id} worktree is on {actual}, expected {branch}: {execution_root}"
            )
        return FeatureExecutionRoot(
            path=execution_root,
            workspace_mode=workspace_mode,
            detail=f"worktree uses state.worktree_path={raw}",
        )
    raise SystemExit(f"error: feat {feat_id} is not execution-ready: workspace_mode={workspace_mode}")


def preflight_closeout_workspace(
    root: Path,
    state: dict[str, Any],
    *,
    target_status: str,
) -> None:
    workspace_mode = workspace_mode_of(state)
    branch = str(state.get("branch") or "")
    base_ref = str(state.get("base_ref") or pick_base_branch(root))
    worktree_path = str(state.get("worktree_path") or "")
    wt_abs = resolve_worktree_abs(root, worktree_path) if worktree_path else None

    branch_exists = bool(branch) and git_local_branch_exists(root, branch)
    if (
        target_status == "archived"
        and workspace_mode == "worktree"
        and branch_exists
        and not git_branch_merged_into(root, branch, base_ref)
    ):
        raise SystemExit(
            f"error: feature branch is not merged into {base_ref}: {branch}; "
            "merge it before archiving"
        )

    if workspace_mode == "current_tree":
        changes = non_harness_git_status_lines(root)
        if changes and target_status == "archived":
            eprint("warn: current_tree archive leaves unrelated non-harness repo changes untouched")
        if changes and target_status == "discarded":
            raise SystemExit(
                "error: current_tree feature has non-harness changes; preserve or clean "
                "the root tree before discarding"
            )

    if workspace_mode == "worktree" and wt_abs is not None:
        registered = wt_abs in git_worktree_paths(root)
        if not wt_abs.exists():
            if registered:
                raise SystemExit(
                    f"error: missing registered worktree requires ordinary Git repair: {wt_abs}"
                )
            return
        if not registered:
            raise SystemExit(f"error: feature worktree is not registered under tracker root: {wt_abs}")
        cp = run_cmd(["git", "-C", str(wt_abs), "status", "--porcelain"])
        if cp.returncode != 0:
            raise SystemExit(cp.stderr.strip() or cp.stdout.strip() or "git status failed")
        if cp.stdout.strip():
            raise SystemExit(
                f"error: worktree has uncommitted changes: {wt_abs}; "
                "preserve or clean it with ordinary Git before closeout"
            )


def publish_closeout(
    root: Path,
    paths: HarnessPaths,
    feat_id: str,
    *,
    current_status: str,
    target_status: str,
    publication: CloseoutPublication,
) -> int:
    src_dir = paths.feat_dir(feat_id, status=current_status)
    dst_dir = paths.feat_dir(feat_id, status=target_status)
    stage_dir = dst_dir.with_name(f".{dst_dir.name}.staging")
    backup_dir = src_dir.with_name(f".{src_dir.name}.closing")
    if not src_dir.exists():
        eprint(f"error: missing feature directory: {src_dir}")
        return 1
    if dst_dir.exists():
        eprint(f"error: closed feature directory already exists: {dst_dir}")
        return 1
    if stage_dir.exists() or backup_dir.exists():
        eprint(
            "error: closeout staging residue exists; inspect before retry: "
            f"{stage_dir if stage_dir.exists() else backup_dir}"
        )
        return 1

    try:
        dst_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src_dir, stage_dir, symlinks=True)
        staged_symlink = first_tree_symlink(stage_dir)
        if staged_symlink is not None:
            raise OSError(
                "feature tree contains unsupported symlink: "
                f"{staged_symlink.relative_to(stage_dir)}"
            )
        make_owned_tree_writable(stage_dir)
        for source_name, target_rel in publication.root_moves:
            move_path(stage_dir / source_name, stage_dir / target_rel)
        save_json(stage_dir / "state.json", publication.state)
        save_json(stage_dir / "tasks.json", publication.tasks)
        receipt_path = stage_dir / FEATURE_OWNER_RECEIPT_FILENAME
        if publication.receipt is None:
            receipt_path.unlink(missing_ok=True)
        else:
            save_json(receipt_path, publication.receipt)
        write_text_atomic(stage_dir / FEATURE_SUMMARY_FILENAME, publication.summary)
    except BaseException as exc:
        if stage_dir.exists():
            try:
                remove_owned_tree(stage_dir)
            except OSError as cleanup_exc:
                eprint(f"warn: closeout staging cleanup pending: {cleanup_exc}")
        eprint(f"error: closeout publication failed without changing active state: {exc}")
        return 1

    try:
        src_dir.rename(backup_dir)
    except BaseException as exc:
        try:
            remove_owned_tree(stage_dir)
        except OSError as cleanup_exc:
            eprint(f"warn: closeout staging cleanup pending: {cleanup_exc}")
        eprint(f"error: closeout publication failed without changing active state: {exc}")
        return 1

    try:
        stage_dir.rename(dst_dir)
        save_index(paths, publication.index)
    except BaseException as exc:
        rollback_errors: list[str] = []
        if dst_dir.exists() and not stage_dir.exists():
            try:
                dst_dir.rename(stage_dir)
            except BaseException as rollback_exc:
                rollback_errors.append(
                    f"closed placement restore failed: {normalize_error_text(rollback_exc)}"
                )
        if backup_dir.exists() and not src_dir.exists():
            try:
                backup_dir.rename(src_dir)
            except BaseException as rollback_exc:
                rollback_errors.append(
                    f"active placement restore failed: {normalize_error_text(rollback_exc)}"
                )

        restored = (
            src_dir.exists()
            and not dst_dir.exists()
            and not backup_dir.exists()
        )
        if restored:
            if stage_dir.exists():
                try:
                    remove_owned_tree(stage_dir)
                except OSError as cleanup_exc:
                    eprint(f"warn: closeout staging cleanup pending: {cleanup_exc}")
            eprint(f"error: closeout publication failed without changing active state: {exc}")
            return 1

        eprint(f"error: closeout publication failed and rollback is incomplete: {exc}")
        for rollback_error in rollback_errors:
            eprint(f"error: {rollback_error}")
        eprint("error: manual repair required; ambiguous closeout residues were preserved")
        eprint(f"active_path: {src_dir}")
        eprint(f"active_backup_path: {backup_dir}")
        eprint(f"closed_path: {dst_dir}")
        eprint(f"staging_path: {stage_dir}")
        eprint(f"index_path: {paths.index_file}")
        eprint("index_publication: unknown; validate index before manual repair")
        return 1

    try:
        remove_owned_tree(backup_dir)
    except OSError as exc:
        eprint(f"warn: closed feature published; active backup cleanup pending: {exc}")
    preserved_root_entries = [target for _, target in publication.root_moves]
    if preserved_root_entries:
        print(f"preserved_root_entries: {len(preserved_root_entries)}")
        print(
            "preserved_root_dir: "
            + relative_display(
                root, dst_dir / "artifacts" / FEATURE_CLOSEOUT_PRESERVE_DIRNAME
            )
        )
    print(f"ok: feat {target_status} {feat_id}")
    return 0


def archive_feature(
    root: Path,
    paths: HarnessPaths,
    feat_id: str,
    state: dict[str, Any],
    tasks: dict[str, Any],
    closeout_review: dict[str, Any] | None,
) -> int:
    current_status = str(state.get("status") or "")
    if current_status == "archived":
        try:
            ensure_closed_feat_rerun_state(paths, feat_id, expected_status="archived")
        except SystemExit as exc:
            eprint(str(exc))
            return 1
        print(f"ok: feat already archived {feat_id}")
        return 0
    if current_status not in {"done", "blocked"}:
        eprint(
            "error: feat must be done/blocked before archive "
            f"(current={current_status})"
        )
        return 1
    if closeout_review is None:
        eprint(f"error: {feat_id}: closeout review is required before archive")
        for line in closeout_review_guidance_lines():
            eprint(line)
        return 1
    try:
        build_closeout_dag_projection_payload(
            paths,
            feat_id=feat_id,
            target_status="archived",
        )
        preflight_closeout_workspace(root, state, target_status="archived")
        publication = prepare_closed_feature_publication(
            paths,
            state,
            tasks,
            feat_id=feat_id,
            target_status="archived",
            event_action="feat_archived",
            event_detail="tracker metadata closed; Git workspace unchanged",
            closeout_review=closeout_review,
        )
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    return publish_closeout(
        root,
        paths,
        feat_id,
        current_status=current_status,
        target_status="archived",
        publication=publication,
    )


def cmd_feat_archive(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)
    state, tasks = load_feat(paths, args.feat)
    if str(state.get("status") or "") == "archived" and has_closeout_review_args(args):
        eprint("error: closed feature review is immutable; rerun archive-feature without review arguments")
        return 1
    closeout_review = None
    if str(state.get("status") or "") in {"done", "blocked"}:
        try:
            closeout_review = closeout_review_from_args(root, args, feat_id=args.feat)
        except SystemExit as exc:
            eprint(str(exc))
            return 1
    return archive_feature(root, paths, args.feat, state, tasks, closeout_review)


def cmd_feat_discard(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)

    state, tasks = load_feat(paths, args.feat)
    current_status = str(state.get("status") or "")
    if current_status == "discarded":
        if has_closeout_review_args(args):
            eprint("error: closed feature review is immutable; rerun discard-feature without review arguments")
            return 1
        try:
            ensure_closed_feat_rerun_state(paths, args.feat, expected_status="discarded")
        except SystemExit as exc:
            eprint(str(exc))
            return 1
        print(f"ok: feat already discarded {args.feat}")
        return 0
    if current_status == "archived":
        eprint(f"error: archived feat cannot be discarded: {args.feat}")
        return 1
    if current_status not in {"proposal", "ready", "in_progress", "blocked", "done"}:
        eprint(f"error: feat cannot be discarded from status={current_status}")
        return 1
    if current_status == "in_progress" and count_tasks(tasks, "in_progress") > 0:
        eprint("error: cannot discard feat while a task is in_progress")
        eprint("hint: finish the active task as blocked or done before discard-feature")
        return 1

    try:
        closeout_review = closeout_review_from_args(root, args, feat_id=args.feat)
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    replacement = str(args.replacement).strip()
    if replacement:
        if replacement == args.feat:
            eprint("error: replacement feat must differ from discarded feat")
            return 1
        replacement_entry = get_feat_index_entry(load_index(paths), replacement)
        if replacement_entry is None:
            eprint(f"error: replacement feat not indexed: {replacement}")
            return 1
        replacement_status = str(replacement_entry.get("status") or "proposal")
        replacement_receipt = paths.feat_owner_receipt(replacement, status=replacement_status)
        if not replacement_receipt.is_file():
            eprint(
                "error: replacement feat has no execution-owner receipt: "
                f"{relative_display(root, replacement_receipt)}"
            )
            return 1

    try:
        build_closeout_dag_projection_payload(
            paths,
            feat_id=args.feat,
            target_status="discarded",
        )
        preflight_closeout_workspace(root, state, target_status="discarded")
        publication = prepare_closed_feature_publication(
            paths,
            state,
            tasks,
            feat_id=args.feat,
            target_status="discarded",
            event_action="feat_discarded",
            event_detail=f"reason={args.reason}; replacement={replacement or 'none'}",
            closeout_review=closeout_review,
            discard_reason=args.reason,
            replacement_feat_id=replacement or None,
        )
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    return publish_closeout(
        root,
        paths,
        args.feat,
        current_status=current_status,
        target_status="discarded",
        publication=publication,
    )


def closeout_plan_lines(root: Path, state: dict[str, Any], tasks: dict[str, Any]) -> list[str]:
    feat_id = str(state.get("feat_id") or "")
    status = str(state.get("status") or "")
    root_q = shlex.quote(str(root))
    lines: list[str] = []

    if status in CLOSED_FEAT_STATUS:
        lines.append(f"{feat_id}: already {status}")
        return lines

    if status == "done":
        lines.append(
            f"{feat_id}: active done; review and close with "
            f"feature-tracker.sh closeout-feature --root {root_q} --feature {feat_id}"
        )
        return lines

    if status == "blocked":
        lines.append(
            f"{feat_id}: blocked; review and choose closeout-feature --archive-blocked or "
            "--mode discard --reason stale|superseded|cancelled|invalid"
        )
        return lines

    if status == "in_progress":
        task_id = str(state.get("current_task_id") or "")
        task = find_task(tasks, task_id) if task_id else None
        if not task:
            lines.append(f"{feat_id}: in_progress without current_task_id; inspect tracker state")
            return lines
        gate_result = str(task.get("gate_result") or "")
        if gate_result != "pass":
            lines.append(
                f"{feat_id}: task {task_id} needs passing gate before closeout; run "
                f"feature-tracker.sh run-task-gate --root {root_q} --feature {feat_id} --task {task_id}"
            )
            return lines
        lines.append(
            f"{feat_id}: task {task_id} gate passed; review and close with "
            f"feature-tracker.sh closeout-feature --root {root_q} --feature {feat_id} "
            f"--task {task_id} --result done"
        )
        return lines

    lines.append(f"{feat_id}: status={status}; no automatic closeout plan")
    return lines


def active_closeout_plan_lines(root: Path, paths: HarnessPaths) -> list[str]:
    index_data = load_index(paths)
    lines: list[str] = []
    for item in index_data.get("features", []):
        feat_id = str(item.get("feat_id", ""))
        state, tasks = load_feat(paths, feat_id)
        status = str(state.get("status") or "")
        if status in CLOSED_FEAT_STATUS:
            continue
        if status not in {"done", "blocked", "in_progress"}:
            continue
        lines.extend(closeout_plan_lines(root, state, tasks))
    return lines


def cmd_feat_closeout(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    state, tasks = load_feat(paths, args.feat)
    status = str(state.get("status") or "")
    feat_id = str(state.get("feat_id") or args.feat)

    mode = args.mode
    task_id = args.task.strip()
    result = args.result if args.result is not None else "done"
    has_task_transition_args = bool(
        task_id
        or args.result is not None
        or args.blocked_reason_class is not None
        or args.blocked_reason is not None
    )

    if mode == "archive" and (args.reason or args.replacement):
        eprint("error: --reason and --replacement are valid only with --mode discard")
        return 1
    if mode == "discard" and args.archive_blocked:
        eprint("error: --archive-blocked is valid only with --mode archive")
        return 1
    if mode == "discard" and has_task_transition_args:
        eprint(
            "error: --task, --result, and blocker arguments are valid only "
            "for archive closeout of an in_progress task"
        )
        return 1
    if status != "blocked" and args.archive_blocked:
        eprint("error: --archive-blocked requires a blocked feature")
        return 1
    if status in CLOSED_FEAT_STATUS:
        if has_closeout_review_args(args):
            eprint("error: closed feature review is immutable; rerun closeout-feature without review arguments")
            return 1
        if has_task_transition_args:
            eprint("error: closed feature cannot consume task result or blocker arguments")
            return 1
        if mode != "archive":
            eprint("error: closed feature rerun requires the matching direct closeout command")
            return 1
        try:
            ensure_closed_feat_rerun_state(paths, feat_id, expected_status=status)
        except SystemExit as exc:
            eprint(str(exc))
            return 1
        print(f"ok: feat already {status} {args.feat}")
        return 0

    if mode == "discard":
        if not args.reason:
            eprint("error: --reason is required with --mode discard")
            return 1
        if status == "in_progress" and count_tasks(tasks, "in_progress") > 0:
            eprint("error: cannot discard feat while a task is in_progress")
            eprint("hint: finish the active task as blocked or done before discard closeout")
            return 1
        if not args.execute:
            for line in closeout_review_guidance_lines():
                print(line)
            print("next: rerun closeout-feature with all review choices and --execute")
            return 0
        return cmd_feat_discard(
            argparse.Namespace(
                root=str(root),
                feat=feat_id,
                reason=args.reason,
                replacement=args.replacement,
                documentation_disposition=args.documentation_disposition,
                documentation_rationale=args.documentation_rationale,
                documentation_ref=args.documentation_ref,
                learning_disposition=args.learning_disposition,
                learning_rationale=args.learning_rationale,
                learning_ref=args.learning_ref,
                promotion_disposition=args.promotion_disposition,
                promotion_rationale=args.promotion_rationale,
                promotion_ref=args.promotion_ref,
            )
        )

    if status != "in_progress" and has_task_transition_args:
        eprint(
            "error: task result and blocker arguments require an in_progress feature"
        )
        return 1

    if status == "blocked" and not args.archive_blocked:
        eprint("error: blocked feat closeout requires --archive-blocked or --mode discard --reason <reason>")
        return 1

    if status == "in_progress":
        candidate_state = copy.deepcopy(state)
        candidate_tasks = copy.deepcopy(tasks)
        task_id = task_id or str(state.get("current_task_id") or "")
        if not task_id:
            eprint("error: --task is required when closing an in_progress feat without current_task_id")
            return 1
        try:
            apply_task_finish_transition(
                candidate_state,
                candidate_tasks,
                feat_id=feat_id,
                task_id=task_id,
                result=result,
                blocked_reason_class=args.blocked_reason_class,
                blocked_reason=args.blocked_reason,
            )
        except SystemExit as exc:
            eprint(str(exc))
            return 1
        blocker_args = ""
        if result == "blocked":
            blocker_args = (
                f" --blocked-reason-class {shlex.quote(args.blocked_reason_class)}"
                f" --blocked-reason {shlex.quote(args.blocked_reason)}"
            )
        finish_plan = (
            "plan: feature-tracker.sh finish-task "
            f"--root {shlex.quote(str(root))} --feature {feat_id} --task {task_id} "
            f"--result {result}{blocker_args}"
        )
        if not args.execute:
            print(finish_plan)
            if candidate_state["status"] == "done":
                for line in closeout_review_guidance_lines():
                    print(line)
                print("next: rerun closeout-feature with all review choices and --execute")
            else:
                print("next: rerun closeout-feature with --execute")
            return 0
        if candidate_state["status"] != "done":
            save_feat(paths, feat_id, candidate_state, candidate_tasks)
            print(f"ok: task finished {feat_id}/{task_id} => {result}")
            print(f"feat_status: {candidate_state['status']}")
            return 0
        state, tasks, status = candidate_state, candidate_tasks, "done"

    if status not in {"done", "blocked"}:
        for line in closeout_plan_lines(root, state, tasks):
            print(f"plan: {line}")
        return 1

    if not args.execute:
        for line in closeout_review_guidance_lines():
            print(line)
        print("next: rerun closeout-feature with all review choices and --execute")
        return 0

    try:
        closeout_review = closeout_review_from_args(root, args, feat_id=feat_id)
    except SystemExit as exc:
        eprint(str(exc))
        return 1
    return archive_feature(root, paths, feat_id, state, tasks, closeout_review)


def validate_feat(paths: HarnessPaths, root: Path, feat_id: str) -> list[str]:
    errors: list[str] = []
    state, tasks = load_feat(paths, feat_id)
    status = state.get("status")

    if not is_valid_feat_id(feat_id):
        errors.append(f"invalid feat id format: {feat_id}")

    if status not in FEAT_STATUS:
        errors.append(f"{feat_id}: invalid feature status: {status}")

    if state.get("feat_id") != feat_id:
        errors.append(f"{feat_id}: state feat_id mismatch")

    errors.extend(feature_goal_contract_issues(paths, state))

    raw_slug = state.get("slug")
    if not isinstance(raw_slug, str) or not raw_slug.strip():
        errors.append(f"{feat_id}: missing feature slug")
    else:
        try:
            normalized_slug = slugify(raw_slug)
        except SystemExit as exc:
            errors.append(f"{feat_id}: {normalize_error_text(exc)}")
        else:
            if raw_slug != normalized_slug:
                errors.append(f"{feat_id}: feature slug is not normalized: {raw_slug}")

    try:
        canonical_depends_on(state, feat_id=feat_id)
    except SystemExit as exc:
        errors.append(normalize_error_text(exc))

    try:
        state_runtime_role = canonical_runtime_role(state.get("runtime_role"), feat_id=feat_id)
    except SystemExit as exc:
        errors.append(normalize_error_text(exc))
        state_runtime_role = "standalone"

    try:
        state_blocked_reason, _ = canonical_feature_blocker(state, feat_id=feat_id)
    except SystemExit as exc:
        errors.append(normalize_error_text(exc))
        state_blocked_reason = "none"
    try:
        require_canonical_task_blockers(tasks, feat_id=feat_id)
        if status == "blocked":
            require_current_blocker_task_evidence(state, tasks, feat_id=feat_id)
    except SystemExit as exc:
        errors.append(normalize_error_text(exc))

    try:
        state_runtime_relations = canonical_runtime_relations(state.get("runtime_relations"), feat_id=feat_id)
    except SystemExit as exc:
        errors.append(normalize_error_text(exc))
        state_runtime_relations = []

    if state_runtime_role == "frontdoor_context":
        invalid = [item["relation"] for item in state_runtime_relations if item["relation"] != "frontdoor_for"]
        if invalid:
            errors.append(
                f"{feat_id}: frontdoor_context may only declare runtime_relations with relation=frontdoor_for"
            )
    if state_runtime_role in {"execution_owner", "foreground_owner"}:
        invalid = [item["relation"] for item in state_runtime_relations if item["relation"] != "handoff_from"]
        if invalid:
            errors.append(
                f"{feat_id}: {state_runtime_role} may only declare runtime_relations with relation=handoff_from"
            )
    if state_blocked_reason == "parked_context" and state_runtime_role != "frontdoor_context":
        errors.append(f"{feat_id}: blocked_reason_class parked_context requires runtime_role=frontdoor_context")

    index_entry = get_feat_index_entry(load_index(paths), feat_id)
    if index_entry is None:
        errors.append(f"{feat_id}: missing feature index entry")
    else:
        if str(index_entry.get("status") or "") != str(state.get("status") or ""):
            errors.append(f"{feat_id}: index status drift from state.json")
        if str(index_entry.get("title") or "") != str(state.get("title") or ""):
            errors.append(f"{feat_id}: index title drift from state.json")
        if str(index_entry.get("workspace_mode") or "") != str(state.get("workspace_mode") or ""):
            errors.append(f"{feat_id}: index workspace_mode drift from state.json")
        if str(index_entry.get("branch") or "") != str(state.get("branch") or ""):
            errors.append(f"{feat_id}: index branch drift from state.json")
        try:
            index_runtime_role = canonical_runtime_role(index_entry.get("runtime_role"), feat_id=feat_id)
        except SystemExit as exc:
            errors.append(normalize_error_text(exc))
            index_runtime_role = "standalone"
        if index_runtime_role != state_runtime_role:
            errors.append(f"{feat_id}: index runtime_role drift from state.json")
        try:
            index_blocked_reason = canonical_blocked_reason_class(
                index_entry.get("blocked_reason_class"),
                feat_id=feat_id,
                status=str(index_entry.get("status") or ""),
            )
        except SystemExit as exc:
            errors.append(normalize_error_text(exc))
            index_blocked_reason = "none"
        if index_blocked_reason != state_blocked_reason:
            errors.append(f"{feat_id}: index blocked_reason_class drift from state.json")
        try:
            index_runtime_relations = canonical_runtime_relations(index_entry.get("runtime_relations"), feat_id=feat_id)
        except SystemExit as exc:
            errors.append(normalize_error_text(exc))
            index_runtime_relations = []
        if index_runtime_relations != state_runtime_relations:
            errors.append(f"{feat_id}: index runtime_relations drift from state.json")

    workspace_mode = str(state.get("workspace_mode") or "").strip()
    if workspace_mode not in WORKSPACE_MODES:
        errors.append(f"{feat_id}: invalid workspace_mode: {workspace_mode or '<missing>'}")
    else:
        branch = str(state.get("branch") or "").strip()
        wt_name = str(state.get("worktree_name") or "").strip()
        wt_path = str(state.get("worktree_path") or "").strip()
        if workspace_mode == "worktree":
            if not branch:
                errors.append(f"{feat_id}: worktree mode requires branch")
            if not wt_name:
                errors.append(f"{feat_id}: worktree mode requires worktree_name")
            if not wt_path:
                errors.append(f"{feat_id}: worktree mode requires worktree_path")
        else:
            if branch:
                errors.append(f"{feat_id}: {workspace_mode} mode must not track dedicated branch")
            if wt_name or wt_path:
                errors.append(f"{feat_id}: {workspace_mode} mode must not track worktree fields")

    counters = state.get("counters", {})
    for key in ("gate_fail_streak", "no_progress_rounds", "round_count"):
        try:
            val = int(counters.get(key, 0))
            if val < 0:
                errors.append(f"{feat_id}: counter {key} must be >= 0")
        except Exception:  # noqa: BLE001
            errors.append(f"{feat_id}: counter {key} not integer")

    task_items = tasks.get("tasks")
    if not isinstance(task_items, list):
        errors.append(f"{feat_id}: tasks.json missing tasks array")
        return errors

    explicit_plan = "plan_status" in tasks
    current_plan_ids: set[str] = set()
    latest_superseded_ids: set[str] = set()
    if explicit_plan:
        if tasks.get("version") != 2:
            errors.append(f"{feat_id}: explicit task plan requires version 2")
        plan_status = str(tasks.get("plan_status") or "")
        plan_revision = tasks.get("plan_revision")
        if plan_status not in TASK_PLAN_STATUSES:
            errors.append(f"{feat_id}: invalid task plan status: {plan_status or '<missing>'}")
        if not isinstance(plan_revision, int) or isinstance(plan_revision, bool) or plan_revision < 0:
            errors.append(f"{feat_id}: plan_revision must be a non-negative integer")
        if plan_status == "draft":
            if plan_revision != 0 or task_items:
                errors.append(f"{feat_id}: draft task plan must use revision 0 and contain no executable tasks")
            if tasks.get("supersedes_revision") is not None:
                errors.append(f"{feat_id}: draft task plan supersedes_revision must be null")
            if tasks.get("plan_history") != []:
                errors.append(f"{feat_id}: draft task plan history must be empty")
            if status not in CLOSED_FEAT_STATUS and (status != "proposal" or workspace_mode != "proposal_only"):
                errors.append(f"{feat_id}: draft task plan requires proposal status and proposal_only workspace")
        elif not task_items:
            errors.append(f"{feat_id}: reviewed task plan must contain at least one task")
        if plan_status == "reviewed":
            expected_supersedes_revision = None if plan_revision == 1 else (
                plan_revision - 1 if isinstance(plan_revision, int) and not isinstance(plan_revision, bool) else None
            )
            if tasks.get("supersedes_revision") != expected_supersedes_revision:
                errors.append(f"{feat_id}: reviewed task plan supersedes_revision must identify the prior revision")
            try:
                require_repo_relative_ref(root, tasks.get("review_ref"), f"{feat_id}: reviewed task plan review_ref")
            except SystemExit as exc:
                errors.append(normalize_error_text(exc))
            try:
                require_repo_relative_refs(root, tasks.get("source_refs"), f"{feat_id}: reviewed task plan source_refs")
            except SystemExit as exc:
                errors.append(normalize_error_text(exc))

            history = tasks.get("plan_history")
            if not isinstance(history, list):
                errors.append(f"{feat_id}: reviewed task plan requires plan_history")
            else:
                if isinstance(plan_revision, int) and not isinstance(plan_revision, bool) and len(history) != plan_revision:
                    errors.append(f"{feat_id}: plan_history length must equal plan_revision")
                previous_history_ids: set[str] = set()
                for history_index, raw_entry in enumerate(history):
                    history_label = f"{feat_id}: plan_history[{history_index}]"
                    if not isinstance(raw_entry, dict):
                        errors.append(f"{history_label} must be an object")
                        continue
                    expected_revision = history_index + 1
                    if raw_entry.get("revision") != expected_revision:
                        errors.append(f"{history_label}.revision must be {expected_revision}")
                    expected_prior = None if expected_revision == 1 else expected_revision - 1
                    if raw_entry.get("supersedes_revision") != expected_prior:
                        errors.append(f"{history_label}.supersedes_revision must be {expected_prior}")
                    try:
                        require_repo_relative_ref(root, raw_entry.get("review_ref"), f"{history_label}.review_ref")
                    except SystemExit as exc:
                        errors.append(normalize_error_text(exc))
                    try:
                        require_repo_relative_refs(root, raw_entry.get("source_refs"), f"{history_label}.source_refs")
                    except SystemExit as exc:
                        errors.append(normalize_error_text(exc))
                    entry_task_ids = raw_entry.get("task_ids")
                    if not isinstance(entry_task_ids, list) or not entry_task_ids:
                        errors.append(f"{history_label}.task_ids must be a non-empty list")
                        entry_ids: set[str] = set()
                    else:
                        entry_ids = {str(item) for item in entry_task_ids}
                        if len(entry_ids) != len(entry_task_ids) or any(
                            not TASK_ID_RE.fullmatch(str(item)) for item in entry_task_ids
                        ):
                            errors.append(f"{history_label}.task_ids must contain unique task ids")
                    raw_superseded_ids = raw_entry.get("superseded_task_ids")
                    if not isinstance(raw_superseded_ids, list):
                        errors.append(f"{history_label}.superseded_task_ids must be a list")
                        entry_superseded_ids: set[str] = set()
                    else:
                        entry_superseded_ids = {str(item) for item in raw_superseded_ids}
                        if len(entry_superseded_ids) != len(raw_superseded_ids) or any(
                            not TASK_ID_RE.fullmatch(str(item)) for item in raw_superseded_ids
                        ):
                            errors.append(f"{history_label}.superseded_task_ids must contain unique task ids")
                    expected_removed = previous_history_ids - entry_ids if history_index > 0 else set()
                    if entry_superseded_ids != expected_removed:
                        errors.append(f"{history_label}.superseded_task_ids drift from revision lineage")
                    previous_history_ids = entry_ids
                    if history_index == len(history) - 1:
                        current_plan_ids = entry_ids
                        latest_superseded_ids = entry_superseded_ids
                if history and isinstance(history[-1], dict):
                    if history[-1].get("review_ref") != tasks.get("review_ref"):
                        errors.append(f"{feat_id}: current review_ref drift from latest plan_history entry")
                    if history[-1].get("source_refs") != tasks.get("source_refs"):
                        errors.append(f"{feat_id}: current source_refs drift from latest plan_history entry")
            if not has_reviewed_task_plan(tasks):
                errors.append(f"{feat_id}: reviewed task plan is not canonical executable v2 state")
    elif status not in CLOSED_FEAT_STATUS:
        errors.append(f"{feat_id}: active feature requires an explicit version 2 reviewed task plan")

    seen: set[str] = set()
    in_progress: list[str] = []
    for task in task_items:
        if not isinstance(task, dict):
            errors.append(f"{feat_id}: task entries must be objects")
            continue
        tid = str(task.get("id", ""))
        if not TASK_ID_RE.fullmatch(tid):
            errors.append(f"{feat_id}: invalid task id: {tid}")
        if tid in seen:
            errors.append(f"{feat_id}: duplicate task id: {tid}")
        seen.add(tid)

        tstatus = task.get("status")
        if tstatus not in TASK_STATUS:
            errors.append(f"{feat_id}/{tid}: invalid task status: {tstatus}")
        if tstatus == "in_progress":
            in_progress.append(tid)
        if explicit_plan and tasks.get("plan_status") == "reviewed":
            for field in ("title", "objective", "outcome"):
                if not str(task.get(field) or "").strip():
                    errors.append(f"{feat_id}/{tid}: reviewed task requires {field}")
            for field in ("acceptance", "verification", "source_refs"):
                value = task.get(field)
                if not isinstance(value, list) or not value:
                    errors.append(f"{feat_id}/{tid}: reviewed task requires non-empty {field}")
            acceptance = task.get("acceptance")
            if isinstance(acceptance, list) and any(not isinstance(item, str) or not item.strip() for item in acceptance):
                errors.append(f"{feat_id}/{tid}: acceptance entries must be non-empty strings")
            try:
                require_repo_relative_refs(root, task.get("source_refs"), f"{feat_id}/{tid}: source_refs")
            except SystemExit as exc:
                errors.append(normalize_error_text(exc))
            verification = task.get("verification")
            if isinstance(verification, list):
                for mapping_index, mapping in enumerate(verification):
                    mapping_label = f"{feat_id}/{tid}: verification[{mapping_index}]"
                    if not isinstance(mapping, dict):
                        errors.append(f"{mapping_label} must be an object")
                        continue
                    if mapping.get("kind") not in TASK_VERIFICATION_KINDS:
                        errors.append(f"{mapping_label}.kind is invalid")
                    try:
                        require_repo_relative_ref(root, mapping.get("ref"), f"{mapping_label}.ref")
                    except SystemExit as exc:
                        errors.append(normalize_error_text(exc))
                    if not isinstance(mapping.get("proves"), str) or not str(mapping.get("proves")).strip():
                        errors.append(f"{mapping_label}.proves must be a non-empty string")
            supersedes = task.get("supersedes")
            if not isinstance(supersedes, list):
                errors.append(f"{feat_id}/{tid}: supersedes must be a list")
            else:
                if len(set(str(item) for item in supersedes)) != len(supersedes):
                    errors.append(f"{feat_id}/{tid}: supersedes must not contain duplicates")
                for superseded_id in supersedes:
                    if not isinstance(superseded_id, str) or not TASK_ID_RE.fullmatch(superseded_id):
                        errors.append(f"{feat_id}/{tid}: supersedes entries must be task ids")
                    elif superseded_id == tid:
                        errors.append(f"{feat_id}/{tid}: task must not supersede itself")
            introduced_revision = task.get("introduced_in_revision")
            if (
                not isinstance(introduced_revision, int)
                or isinstance(introduced_revision, bool)
                or introduced_revision < 1
                or not isinstance(plan_revision, int)
                or introduced_revision > plan_revision
            ):
                errors.append(f"{feat_id}/{tid}: reviewed task requires introduced_in_revision")
            superseded_by = task.get("superseded_by")
            if tid in current_plan_ids and superseded_by:
                errors.append(f"{feat_id}/{tid}: current-plan task must not be superseded")
            if tid not in current_plan_ids:
                if not task_has_execution_evidence(task):
                    errors.append(f"{feat_id}/{tid}: historical task requires preserved execution evidence")
                if not isinstance(superseded_by, list) or not superseded_by:
                    errors.append(f"{feat_id}/{tid}: historical task requires superseded_by lineage")

    if explicit_plan and tasks.get("plan_status") == "reviewed":
        by_id = {
            str(task.get("id")): task
            for task in task_items
            if isinstance(task, dict) and str(task.get("id") or "")
        }
        missing_current = current_plan_ids - set(by_id)
        if missing_current:
            errors.append(f"{feat_id}: latest plan_history references missing tasks: {', '.join(sorted(missing_current))}")
        declared_latest_supersedes = {
            superseded_id
            for task_id in current_plan_ids
            for superseded_id in (
                by_id.get(task_id, {}).get("supersedes", [])
                if isinstance(by_id.get(task_id, {}).get("supersedes", []), list)
                else []
            )
        }
        history = tasks.get("plan_history")
        cumulative_superseded_ids = {
            str(task_id)
            for entry in history
            if isinstance(entry, dict)
            for task_id in entry.get("superseded_task_ids", [])
            if isinstance(task_id, str)
        } if isinstance(history, list) else set()
        if (
            not latest_superseded_ids.issubset(declared_latest_supersedes)
            or not declared_latest_supersedes.issubset(cumulative_superseded_ids)
        ):
            errors.append(f"{feat_id}: current task supersedes lineage drifts from latest plan_history")
        known_plan_task_ids = set(by_id)
        if isinstance(history, list):
            for entry in history:
                if isinstance(entry, dict) and isinstance(entry.get("task_ids"), list):
                    known_plan_task_ids.update(str(item) for item in entry["task_ids"])
        for task_id, task in by_id.items():
            superseded_by = task.get("superseded_by")
            if not isinstance(superseded_by, list):
                continue
            invalid_targets = {
                str(target)
                for target in superseded_by
                if not isinstance(target, str) or target not in known_plan_task_ids
            }
            if invalid_targets:
                errors.append(f"{feat_id}/{task_id}: superseded_by references unknown tasks")

    if len(in_progress) > 1:
        errors.append(f"{feat_id}: more than one in_progress task: {', '.join(in_progress)}")

    cur = state.get("current_task_id")
    if cur is not None and cur not in in_progress:
        errors.append(f"{feat_id}: current_task_id does not match in_progress task")
    if workspace_mode == "proposal_only" and in_progress:
        errors.append(f"{feat_id}: proposal_only feat must not have in_progress tasks")

    if status in CLOSED_FEAT_STATUS:
        try:
            canonical_closeout_review(
                root,
                tasks.get("closeout_review"),
                feat_id=feat_id,
            )
        except SystemExit as exc:
            errors.append(normalize_error_text(exc))
    elif "closeout_review" in tasks:
        errors.append(f"{feat_id}: closeout_review is valid only in final closed tasks.json")

    feat_dir = paths.feat_dir(feat_id, status=str(state.get("status") or ""))
    if feat_dir.exists():
        is_closed = str(state.get("status") or "") in CLOSED_FEAT_STATUS
        allowed_files = set(
            FEATURE_REQUIRED_ROOT_FILES | FEATURE_DERIVED_ROOT_FILES | FEATURE_CONTROL_ROOT_FILES
        )
        if is_closed:
            allowed_files |= set(FEATURE_CLOSEOUT_ROOT_FILES)
        else:
            allowed_files |= set(FEATURE_OPTIONAL_ROOT_FILES)
        for child in sorted(feat_dir.iterdir()):
            name = child.name
            rel = child.relative_to(root).as_posix()
            if child.is_dir():
                if name not in FEATURE_ALLOWED_ROOT_DIRS:
                    errors.append(f"{feat_id}: unsupported feature-root directory: {rel}")
                continue
            if name not in allowed_files:
                errors.append(
                    f"{feat_id}: {unsupported_feature_root_file_error(rel, closed_root=is_closed)}"
                )
        if is_closed:
            summary_file = paths.feat_summary(feat_id, status=str(state.get("status") or ""))
            if not summary_file.exists():
                errors.append(f"{feat_id}: closed feat missing summary.md")

    receipt_path = paths.feat_owner_receipt(feat_id, status=str(status or ""))
    receipt_required = has_reviewed_task_plan(tasks) or state.get("goal_contract") is not None
    if receipt_required and not receipt_path.exists():
        errors.append(f"{feat_id}: missing owner-receipt.json for canonical Feature control state")
    elif receipt_path.exists():
        try:
            load_current_owner_receipt(paths, state, tasks)
        except SystemExit as exc:
            errors.append(normalize_error_text(exc))

    return errors


def validate_runtime_relation_consistency(paths: HarnessPaths, feat_ids: list[str]) -> list[str]:
    errors: list[str] = []
    statuses: dict[str, str] = {}
    relations_by_feat: dict[str, list[dict[str, str]]] = {}
    roles_by_feat: dict[str, str] = {}

    for feat_id in feat_ids:
        state, _tasks = load_feat(paths, feat_id)
        statuses[feat_id] = str(state.get("status") or "")
        try:
            roles_by_feat[feat_id] = canonical_runtime_role(state.get("runtime_role"), feat_id=feat_id)
            relations_by_feat[feat_id] = canonical_runtime_relations(state.get("runtime_relations"), feat_id=feat_id)
        except SystemExit:
            continue

    relation_lookup = {
        (feat_id, rel["relation"], rel["feat_id"])
        for feat_id, relations in relations_by_feat.items()
        for rel in relations
    }

    for feat_id, relations in relations_by_feat.items():
        for rel in relations:
            target = rel["feat_id"]
            relation = rel["relation"]
            if target not in statuses:
                errors.append(f"{feat_id}: runtime relation target missing from tracker index: {target}")
                continue
            expected_reverse = RUNTIME_RELATION_REVERSE[relation]
            if (target, expected_reverse, feat_id) not in relation_lookup:
                errors.append(
                    f"{feat_id}: runtime relation `{relation}` to {target} is missing reverse `{expected_reverse}` relation"
                )
            target_role = roles_by_feat.get(target)
            if relation == "frontdoor_for" and target_role not in {"execution_owner", "foreground_owner", "standalone"}:
                errors.append(
                    f"{feat_id}: frontdoor_for target {target} must stay execution_owner, foreground_owner, or standalone, found {target_role or '<missing>'}"
                )
            if relation == "handoff_from" and target_role != "frontdoor_context":
                errors.append(
                    f"{feat_id}: handoff_from target {target} must stay frontdoor_context, found {target_role or '<missing>'}"
                )

    return errors


def cmd_validate(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    ensure_git_repo(root)

    errors: list[str] = []
    if not paths.index_file.exists():
        errors.append(f"missing index file: {paths.index_file}")
    if not paths.runtime_policy_file.exists():
        if paths.legacy_config_file.exists():
            errors.append(
                "legacy policy file is not supported: "
                f"{paths.legacy_config_file}. "
                "migrate manually to runtime-policy.json."
            )
        else:
            errors.append(f"missing runtime policy file: {paths.runtime_policy_file}")

    if paths.index_file.exists():
        try:
            index_data = load_index(paths)
        except SystemExit as exc:
            errors.append(str(exc))
        else:
            issuance = index_data.get("feature_id_issuance", {})
            if not isinstance(issuance, dict):
                errors.append("feature_id_issuance missing or invalid in features.json")
            else:
                if str(issuance.get("scheme") or "") != FEATURE_ID_SCHEME:
                    errors.append("feature_id_issuance.scheme drift from runtime")
                next_cursor = issuance.get("next_cursor")
                if not isinstance(next_cursor, int) or next_cursor < 0:
                    errors.append("feature_id_issuance.next_cursor must be a non-negative integer")

    legacy_dirs = [
        paths.harness_dir / "feats",
        paths.harness_dir / "feats-archived",
        paths.harness_dir / "feats-discarded",
    ]
    for legacy_dir in legacy_dirs:
        if legacy_dir.exists():
            errors.append(legacy_runtime_path_error(root, legacy_dir))

    feats: list[str] = []
    feat_status_by_id: dict[str, str] = {}
    if paths.index_file.exists():
        try:
            index_data = load_index(paths)
            for item in index_data.get("features", []):
                feat_id = str(item.get("feat_id", ""))
                if not feat_id:
                    continue
                feats.append(feat_id)
                feat_status_by_id[feat_id] = str(item.get("status") or "")
        except SystemExit as exc:
            errors.append(str(exc))

    harness_gitignore = paths.harness_dir / ".gitignore"
    if harness_gitignore.exists():
        ignored_lines = {line.strip() for line in harness_gitignore.read_text(encoding="utf-8").splitlines() if line.strip()}
        for rule in ("artifacts/*.log", "local/"):
            if rule not in ignored_lines:
                errors.append(f"tracker .gitignore missing rule: {rule}")
    else:
        errors.append(f"missing tracker .gitignore: {harness_gitignore}")

    tracked_local = tracked_paths_under(root, Path(".bagakit/feature-tracker/local"))
    if tracked_local:
        errors.append(
            "local issuer state must not be tracked: " + ", ".join(sorted(tracked_local))
        )

    if paths.issuer_file.exists():
        try:
            issuer_payload = load_local_issuer(paths)
        except SystemExit as exc:
            errors.append(str(exc))
        else:
            if not isinstance(issuer_payload, dict):
                errors.append(f"invalid local issuer payload: {paths.issuer_file}")
            else:
                if int(issuer_payload.get("version", 0)) != LOCAL_ISSUER_VERSION:
                    errors.append(f"local issuer version drift: {paths.issuer_file}")
                if str(issuer_payload.get("scheme") or "") != FEATURE_ID_SCHEME:
                    errors.append(f"local issuer scheme drift: {paths.issuer_file}")
                namespace = str(issuer_payload.get("namespace") or "")
                if not is_public_token(namespace, width=FEAT_NAMESPACE_WIDTH):
                    errors.append(f"local issuer namespace invalid: {paths.issuer_file}")
                if str(issuer_payload.get("guard_key_source") or "") != f"git-config:{LOCAL_GUARD_KEY_CONFIG}":
                    errors.append(f"local issuer guard source drift: {paths.issuer_file}")

    for feat_id in feats:
        errors.extend(validate_feat(paths, root, feat_id))
    if feats:
        errors.extend(validate_runtime_relation_consistency(paths, feats))

    # Validate physical archive layout.
    for feat_id, status in feat_status_by_id.items():
        active_dir = paths.feat_dir(feat_id)
        archived_dir = paths.feat_dir(feat_id, status="archived")
        discarded_dir = paths.feat_dir(feat_id, status="discarded")
        if status in CLOSED_FEAT_STATUS:
            if active_dir.exists():
                errors.append(
                    f"{feat_id}: closed feat dir must not exist in features directory: "
                    f"{relative_display(root, active_dir)}"
                )
            closed_dir = archived_dir if status == "archived" else discarded_dir
            if not closed_dir.exists():
                errors.append(
                    f"{feat_id}: {status} feat dir missing: {relative_display(root, closed_dir)}"
                )
        else:
            if not active_dir.exists():
                errors.append(
                    f"{feat_id}: feat dir missing: {relative_display(root, active_dir)}"
                )
            if archived_dir.exists():
                errors.append(
                    f"{feat_id}: non-archived feat dir must not exist in features-archived directory: "
                    f"{relative_display(root, archived_dir)}"
                )
            if discarded_dir.exists():
                errors.append(
                    f"{feat_id}: non-discarded feat dir must not exist in features-discarded directory: "
                    f"{relative_display(root, discarded_dir)}"
                )

    # Detect feat directories missing from index (active + archived).
    if paths.feats_dir.exists():
        for child in sorted(paths.feats_dir.iterdir()):
            if child.is_dir() and child.name not in feats:
                errors.append(f"feature directory not indexed: {child.name}")
    if paths.feats_archived_dir.exists():
        for child in sorted(paths.feats_archived_dir.iterdir()):
            if child.is_dir() and child.name not in feats:
                errors.append(f"archived feature directory not indexed: {child.name}")
    if paths.feats_discarded_dir.exists():
        for child in sorted(paths.feats_discarded_dir.iterdir()):
            if child.is_dir() and child.name not in feats:
                errors.append(f"discarded feature directory not indexed: {child.name}")

    try:
        active_states, _ = load_non_archived_feats(paths)
        families: dict[str, list[str]] = {}
        for feat_id, state in active_states.items():
            family_slug = str(state.get("slug") or "")
            if family_slug:
                families.setdefault(family_slug, []).append(feat_id)
        for family_slug, family_ids in sorted(families.items()):
            if len(family_ids) > 1:
                errors.append(
                    "active feature family is not unique: "
                    f"slug={family_slug}; features={','.join(sorted(family_ids, key=feat_sort_key))}"
                )
        build_dag_projection_payload(active_states, all_status_by_feat=feat_status_by_id)
    except SystemExit as exc:
        errors.append(normalize_error_text(exc))

    if errors:
        for err in errors:
            eprint(f"error: {err}")
        eprint(f"failed: {len(errors)} validation error(s)")
        return 1

    print("ok: validation passed")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    val_code = cmd_validate(
        argparse.Namespace(
            root=str(root),
        )
    )
    if val_code != 0:
        eprint("doctor: validation failed; continuing read-only diagnostics")

    config = load_runtime_policy(paths)
    thresholds = config.get("stop_thresholds", {}) if isinstance(config, dict) else {}
    gate_fail_limit = int(thresholds.get("gate_fail_streak", 3))
    no_progress_limit = int(thresholds.get("no_progress_rounds", 2))
    max_round = int(thresholds.get("max_round_count", 8))

    index_data = load_index(paths)
    warnings: list[str] = []

    for item in index_data.get("features", []):
        feat_id = str(item.get("feat_id", ""))
        state, tasks = load_feat(paths, feat_id)
        counters = state.get("counters", {})
        fail_streak = int(counters.get("gate_fail_streak", 0))
        no_progress = int(counters.get("no_progress_rounds", 0))
        rounds = int(counters.get("round_count", 0))
        status = str(state.get("status") or "")

        if status in CLOSED_FEAT_STATUS:
            summary_file = paths.feat_summary(feat_id, status=status)
            if not summary_file.exists():
                warnings.append(f"{feat_id}: {status} feat missing summary.md")
            continue

        if status == "done":
            warnings.append(f"{feat_id}: status=done remains active; run closeout-feature")

        if fail_streak >= gate_fail_limit:
            warnings.append(
                f"{feat_id}: gate_fail_streak={fail_streak} reached threshold {gate_fail_limit}"
            )
        if no_progress >= no_progress_limit:
            warnings.append(
                f"{feat_id}: no_progress_rounds={no_progress} reached threshold {no_progress_limit}"
            )
        if rounds >= max_round:
            warnings.append(
                f"{feat_id}: round_count={rounds} reached threshold {max_round}"
            )

        if status == "in_progress" and count_tasks(tasks, "in_progress") == 0:
            warnings.append(f"{feat_id}: feature status in_progress but no task in_progress")

    print("== doctor report ==")
    if warnings:
        for w in warnings:
            print(f"warn: {w}")
    else:
        print("no warnings")

    print("\nrecommended next steps:")
    print("1) Address threshold warnings before starting next task.")
    print("2) Run feature-tracker.sh run-task-gate before finishing every task.")
    print("3) Close completed or superseded feats explicitly with archive-feature or discard-feature.")
    if getattr(args, "closeout_plan", False):
        print("\ncloseout plan:")
        plan_lines = active_closeout_plan_lines(root, paths)
        if plan_lines:
            for line in plan_lines:
                print(f"- {line}")
        else:
            print("- no active closeout candidates")
    return val_code


def parse_dependency_spec(raw: str) -> tuple[str, list[str]]:
    if ":" not in raw:
        raise SystemExit(
            "error: invalid dependency spec. expected '<feat-id>:<dep-id>[,<dep-id>...]'"
        )
    feat_id, dep_blob = raw.split(":", 1)
    feat_id = feat_id.strip()
    if not is_valid_feat_id(feat_id):
        raise SystemExit(f"error: invalid feat id in dependency spec: {feat_id}")

    deps: list[str] = []
    seen: set[str] = set()
    dep_blob = dep_blob.strip()
    if dep_blob:
        for raw_dep in dep_blob.split(","):
            dep = raw_dep.strip()
            if not dep:
                continue
            if not is_valid_feat_id(dep):
                raise SystemExit(f"error: invalid dependency feat id: {dep}")
            if dep == feat_id:
                raise SystemExit(f"error: feat cannot depend on itself: {feat_id}")
            if dep in seen:
                continue
            seen.add(dep)
            deps.append(dep)
    return feat_id, deps


def build_layered_dag(
    feat_ids: list[str],
    deps_by_feat: dict[str, set[str]],
) -> list[list[str]]:
    remaining: set[str] = set(feat_ids)
    unresolved: dict[str, set[str]] = {
        feat_id: set(deps_by_feat.get(feat_id, set())) for feat_id in feat_ids
    }
    dependents: dict[str, set[str]] = {feat_id: set() for feat_id in feat_ids}
    for feat_id, deps in unresolved.items():
        for dep in deps:
            dependents.setdefault(dep, set()).add(feat_id)

    layers: list[list[str]] = []
    while remaining:
        ready = sorted(
            (feat_id for feat_id in remaining if not unresolved.get(feat_id, set())),
            key=feat_sort_key,
        )
        if not ready:
            cycle_nodes = sorted(remaining, key=feat_sort_key)
            raise SystemExit(
                "error: dependency cycle detected among feats: " + ", ".join(cycle_nodes)
            )

        layers.append(ready)
        for feat_id in ready:
            remaining.remove(feat_id)
        for feat_id in ready:
            for child in dependents.get(feat_id, set()):
                if child in remaining:
                    unresolved[child].discard(feat_id)

    return layers


def feature_status_by_id(paths: HarnessPaths) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for item in load_index(paths).get("features", []):
        feat_id = str(item.get("feat_id", ""))
        if feat_id:
            statuses[feat_id] = str(item.get("status") or "")
    return statuses


def load_non_archived_feats(paths: HarnessPaths) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    index_data = load_index(paths)
    states: dict[str, dict[str, Any]] = {}
    tasks_by_feat: dict[str, dict[str, Any]] = {}
    for item in index_data.get("features", []):
        feat_id = str(item.get("feat_id", ""))
        if not feat_id:
            continue
        status = str(item.get("status") or "")
        if status in CLOSED_FEAT_STATUS:
            continue
        state, tasks = load_feat(paths, feat_id)
        states[feat_id] = state
        tasks_by_feat[feat_id] = tasks
    return states, tasks_by_feat


def build_dag_projection_payload(
    states: dict[str, dict[str, Any]],
    *,
    all_status_by_feat: dict[str, str],
) -> dict[str, Any]:
    feat_ids = sorted(states.keys(), key=feat_sort_key)
    if not feat_ids:
        return {
            "version": 1,
            "generated_by": "bagakit-feature-tracker",
            "features": [],
            "layers": [],
            "notes": [],
        }

    notes: list[str] = []
    deps_by_feat: dict[str, set[str]] = {}
    for feat_id, state in states.items():
        deps: set[str] = set()
        for dep in canonical_depends_on(state, feat_id=feat_id):
            dep_status = all_status_by_feat.get(dep, "")
            if dep_status == "archived":
                notes.append(f"{feat_id} depends on archived feat {dep}; treated as already satisfied")
                continue
            if dep_status == "discarded":
                raise SystemExit(f"error: {feat_id} depends on discarded feat {dep}; update dependencies before replanning")
            if dep not in states:
                notes.append(f"{feat_id} dependency missing from active DAG set: {dep}")
                continue
            deps.add(dep)
        deps_by_feat[feat_id] = deps

    layers = build_layered_dag(feat_ids, deps_by_feat)
    layer_by_feat: dict[str, int] = {}
    for i, layer in enumerate(layers):
        for feat_id in layer:
            layer_by_feat[feat_id] = i

    dependents_by_feat: dict[str, list[str]] = {feat_id: [] for feat_id in feat_ids}
    for feat_id, deps in deps_by_feat.items():
        for dep in sorted(deps, key=feat_sort_key):
            dependents_by_feat.setdefault(dep, []).append(feat_id)

    return {
        "version": 1,
        "generated_by": "bagakit-feature-tracker",
        "features": [
            {
                "feat_id": feat_id,
                "depends_on": sorted(deps_by_feat.get(feat_id, set()), key=feat_sort_key),
                "dependents": sorted(dependents_by_feat.get(feat_id, []), key=feat_sort_key),
                "layer": layer_by_feat.get(feat_id),
            }
            for feat_id in feat_ids
        ],
        "layers": [
            {
                "layer": i,
                "feat_ids": layer,
            }
            for i, layer in enumerate(layers)
        ],
        "notes": sorted(set(notes)),
    }


def compute_dag_projection(paths: HarnessPaths) -> dict[str, Any]:
    states, _ = load_non_archived_feats(paths)
    return build_dag_projection_payload(states, all_status_by_feat=feature_status_by_id(paths))


def cmd_replan_feats(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)

    states, tasks_by_feat = load_non_archived_feats(paths)
    proposed_states = {feat_id: copy.deepcopy(state) for feat_id, state in states.items()}
    all_status_by_feat = feature_status_by_id(paths)

    clear_ids = {str(item).strip() for item in (args.clear_dependencies or []) if str(item).strip()}
    for feat_id in clear_ids:
        if not is_valid_feat_id(feat_id):
            eprint(f"error: invalid feat id in --clear-dependencies: {feat_id}")
            return 1
        if feat_id not in states:
            eprint(f"error: feat not found (non-archived): {feat_id}")
            return 1

    set_deps: dict[str, list[str]] = {}
    for raw in args.dependency or []:
        feat_id, deps = parse_dependency_spec(str(raw))
        if feat_id not in states:
            eprint(f"error: feat not found (non-archived): {feat_id}")
            return 1
        set_deps[feat_id] = deps

    changed_feats: set[str] = set()
    for feat_id in clear_ids:
        state = proposed_states[feat_id]
        if state.get("depends_on") != []:
            state["depends_on"] = []
            state.setdefault("history", []).append(
                history_event("dag_dependencies_updated", "depends_on=none")
            )
            changed_feats.add(feat_id)

    for feat_id, deps in set_deps.items():
        state = proposed_states[feat_id]
        if state.get("depends_on") != deps:
            state["depends_on"] = deps
            state.setdefault("history", []).append(
                history_event(
                    "dag_dependencies_updated",
                    "depends_on=" + (",".join(deps) if deps else "none"),
                )
            )
            changed_feats.add(feat_id)

    try:
        payload = build_dag_projection_payload(proposed_states, all_status_by_feat=all_status_by_feat)
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    for feat_id in sorted(changed_feats, key=feat_sort_key):
        save_feat(paths, feat_id, proposed_states[feat_id], tasks_by_feat[feat_id])

    print(f"updated_feature_count: {len(changed_feats)}")
    print(f"feature_count: {len(payload.get('features', []))}")
    print(f"layer_count: {len(payload.get('layers', []))}")

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_show_feat_dag(args: argparse.Namespace) -> int:
    root = Path(args.root).resolve()
    paths = HarnessPaths(root)
    ensure_harness_exists(paths)
    try:
        payload = compute_dag_projection(paths)
    except SystemExit as exc:
        eprint(str(exc))
        return 1

    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    print("projection: on-demand")
    features = payload.get("features", [])
    layers = payload.get("layers", [])
    print(f"feature_count: {len(features) if isinstance(features, list) else 0}")
    print(f"layer_count: {len(layers) if isinstance(layers, list) else 0}")
    if not isinstance(layers, list) or not layers:
        print("layers: none")
    else:
        print("layers:")
        for layer in layers:
            if not isinstance(layer, dict):
                continue
            layer_id = layer.get("layer")
            feat_ids = layer.get("feat_ids", [])
            print(f"- L{layer_id}: {' '.join(str(fid) for fid in feat_ids)}")

    if isinstance(features, list) and features:
        print("features:")
        for feature in features:
            if not isinstance(feature, dict):
                continue
            feat_id = str(feature.get("feat_id", ""))
            depends_on = feature.get("depends_on", [])
            dependents = feature.get("dependents", [])
            layer = feature.get("layer")
            print(
                f"- {feat_id} | layer={layer} | depends_on={','.join(str(item) for item in depends_on) or 'none'} | "
                f"dependents={','.join(str(item) for item in dependents) or 'none'}"
            )

    notes = payload.get("notes", [])
    if isinstance(notes, list) and notes:
        print("notes:")
        for note in notes:
            print(f"- {note}")
    return 0


def query_list(paths: HarnessPaths, *, scopes: set[str] | None = None) -> list[dict[str, Any]]:
    selected_scopes = scopes or set(DEFAULT_FEATURE_SCOPES)
    index_data = load_index(paths)
    out: list[dict[str, Any]] = []
    for item in index_data.get("features", []):
        feat_id = str(item.get("feat_id", ""))
        try:
            state, tasks = load_feat(paths, feat_id)
        except SystemExit:
            continue
        scope = feature_scope_for_status(str(state.get("status") or ""))
        if scope not in selected_scopes:
            continue
        out.append(
            {
                "feat_id": feat_id,
                "title": state.get("title", ""),
                "status": state.get("status", ""),
                "scope": scope,
                "workspace_mode": state.get("workspace_mode", ""),
                "branch": state.get("branch", ""),
                "worktree": state.get("worktree_path", ""),
                "task_stats": {
                    "todo": count_tasks(tasks, "todo"),
                    "in_progress": count_tasks(tasks, "in_progress"),
                    "done": count_tasks(tasks, "done"),
                    "blocked": count_tasks(tasks, "blocked"),
                },
            }
        )
    return out


def query_one(paths: HarnessPaths, feat_id: str) -> dict[str, Any]:
    state, tasks = load_feat(paths, feat_id)
    return {"state": state, "tasks": tasks}


def query_filter(
    paths: HarnessPaths,
    *,
    scopes: set[str],
    feat_status: str | None,
    task_status: str | None,
    contains: str | None,
) -> list[dict[str, Any]]:
    items = query_list(paths, scopes=scopes)
    out: list[dict[str, Any]] = []
    needle = contains.lower() if contains else None

    for item in items:
        if feat_status and item.get("status") != feat_status:
            continue
        if task_status and int(item.get("task_stats", {}).get(task_status, 0)) == 0:
            continue
        if needle:
            hay = (
                f"{item.get('feat_id','')} "
                f"{item.get('title','')} "
                f"{item.get('branch','')} "
                f"{item.get('workspace_mode','')}"
            ).lower()
            if needle not in hay:
                continue
        out.append(item)
    return out


def cmd_query_list(args: argparse.Namespace) -> int:
    paths = HarnessPaths(Path(args.root).resolve())
    ensure_harness_exists(paths)
    scopes = parse_feature_scopes(args.scope)
    print(json.dumps({"features": query_list(paths, scopes=scopes)}, ensure_ascii=False, indent=2))
    return 0


def cmd_query_get(args: argparse.Namespace) -> int:
    paths = HarnessPaths(Path(args.root).resolve())
    ensure_harness_exists(paths)
    print(json.dumps(query_one(paths, args.feat), ensure_ascii=False, indent=2))
    return 0


def cmd_query_filter(args: argparse.Namespace) -> int:
    paths = HarnessPaths(Path(args.root).resolve())
    ensure_harness_exists(paths)
    scopes = parse_feature_scopes(args.scope)
    print(
        json.dumps(
            {
                "features": query_filter(
                    paths,
                    scopes=scopes,
                    feat_status=args.status,
                    task_status=args.task_status,
                    contains=args.contains,
                )
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="bagakit feature tracker")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument("--root", default=".")
        sp.add_argument("--skill-dir", default=str(Path(__file__).resolve().parent.parent))

    def add_closeout_review(sp: argparse.ArgumentParser) -> None:
        sp.add_argument(
            "--documentation-disposition",
            choices=sorted(CLOSEOUT_DOCUMENTATION_DISPOSITIONS),
            default="",
        )
        sp.add_argument("--documentation-rationale", default="")
        sp.add_argument("--documentation-ref", action="append", default=[])
        sp.add_argument(
            "--learning-disposition",
            choices=sorted(CLOSEOUT_LEARNING_DISPOSITIONS),
            default="",
        )
        sp.add_argument("--learning-rationale", default="")
        sp.add_argument("--learning-ref", action="append", default=[])
        sp.add_argument(
            "--promotion-disposition",
            choices=sorted(CLOSEOUT_PROMOTION_DISPOSITIONS),
            default="",
        )
        sp.add_argument("--promotion-rationale", default="")
        sp.add_argument("--promotion-ref", action="append", default=[])

    sp = sub.add_parser("initialize-tracker", help="apply tracker files into project")
    add_common(sp)
    sp.set_defaults(func=cmd_apply)

    sp = sub.add_parser("rekey-local-issuer", help="rotate the local issuer namespace and git-local guard key")
    add_common(sp)
    sp.set_defaults(func=cmd_rekey_local_issuer)

    sp = sub.add_parser("materialize-feature-artifact", help="write an optional feature helper file from the canonical template")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--kind", choices=["proposal", "spec-delta", "verification"], required=True)
    sp.add_argument("--overwrite", action="store_true")
    sp.set_defaults(func=cmd_materialize_feature_artifact)

    sp = sub.add_parser("create-feature", help="create feature with explicit workspace mode")
    add_common(sp)
    sp.add_argument("--title", required=True)
    sp.add_argument("--slug", default="")
    sp.add_argument("--goal", required=True)
    sp.add_argument("--workspace-mode", choices=sorted(WORKSPACE_MODES), default=None)
    sp.add_argument("--branch-prefix", default=None)
    sp.add_argument("--tasks-file", default="")
    sp.set_defaults(func=cmd_feat_new)

    sp = sub.add_parser(
        "create-feature-from-planning-entry-handoff",
        help="create feature from an approved planning-entry handoff",
    )
    add_common(sp)
    sp.add_argument("--handoff", required=True)
    sp.add_argument("--slug", default="")
    sp.add_argument("--workspace-mode", choices=sorted(WORKSPACE_MODES), default=None)
    sp.add_argument("--branch-prefix", default=None)
    sp.set_defaults(func=cmd_feat_new_from_planning_entry_handoff)

    sp = sub.add_parser("set-task-plan", help="materialize or replace one reviewed semantic task plan")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--tasks-file", required=True)
    sp.add_argument("--expected-revision", type=int, required=True)
    sp.set_defaults(func=cmd_set_task_plan)

    sp = sub.add_parser(
        "repair-reviewed-task-plan",
        help="replace a damaged reviewed tasks.json under exact content guards",
    )
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--tasks-file", required=True)
    sp.add_argument("--expected-state-sha256", required=True)
    sp.add_argument("--expected-tasks-sha256", required=True)
    sp.add_argument("--expected-goal-sha256", required=True)
    sp.add_argument("--expected-receipt-sha256", required=True)
    sp.set_defaults(func=cmd_repair_reviewed_task_plan)

    sp = sub.add_parser("validate-feature-goal", help="validate a candidate or installed feature-owned goal.md")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--goal-file", default="")
    sp.set_defaults(func=cmd_validate_feature_goal)

    sp = sub.add_parser("set-feature-goal", help="install or revise one feature-owned goal.md with revision guard")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--goal-file", required=True)
    sp.add_argument("--expected-revision", required=True)
    sp.set_defaults(func=cmd_set_feature_goal)

    sp = sub.add_parser("assign-feature-workspace", help="assign current_tree/worktree to an existing feature")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--workspace-mode", choices=["current_tree", "worktree"], required=True)
    sp.add_argument("--branch-prefix", default=None)
    sp.set_defaults(func=cmd_assign_feat_workspace)

    sp = sub.add_parser("show-feature-status", help="show feature status")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", default=None)
    status_output = sp.add_mutually_exclusive_group()
    status_output.add_argument("--json", action="store_true")
    status_output.add_argument("--format", choices=["text", "html"], default="text")
    sp.set_defaults(func=cmd_feat_status)

    sp = sub.add_parser("get-owner-receipt", help="read the current feature execution-owner receipt")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=cmd_get_owner_receipt)

    sp = sub.add_parser("start-task", help="start a task")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--task", required=True)
    sp.set_defaults(func=cmd_task_start)

    sp = sub.add_parser("unstart-task", help="return an evidence-free active task to todo")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--task", required=True)
    sp.add_argument("--expected-head", required=True)
    sp.set_defaults(func=cmd_task_unstart)

    sp = sub.add_parser("run-task-gate", help="execute gate checks")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--task", required=True)
    sp.set_defaults(func=cmd_task_gate)

    sp = sub.add_parser("finish-task", help="finish task with result")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--task", required=True)
    sp.add_argument("--result", choices=["done", "blocked"], required=True)
    sp.add_argument(
        "--blocked-reason-class",
        choices=sorted(BLOCKED_REASON_CLASSES - {"none"}),
        default=None,
    )
    sp.add_argument("--blocked-reason", default=None)
    sp.set_defaults(func=cmd_task_finish)

    sp = sub.add_parser("closeout-feature", help="plan or execute feature closeout")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--task", default="")
    sp.add_argument("--result", choices=["done", "blocked"], default=None)
    sp.add_argument(
        "--blocked-reason-class",
        choices=sorted(BLOCKED_REASON_CLASSES - {"none"}),
        default=None,
    )
    sp.add_argument("--blocked-reason", default=None)
    sp.add_argument("--mode", choices=["archive", "discard"], default="archive")
    sp.add_argument("--reason", choices=["stale", "superseded", "cancelled", "invalid"], default="")
    sp.add_argument("--replacement", default="")
    sp.add_argument("--archive-blocked", action="store_true")
    sp.add_argument("--execute", action="store_true")
    add_closeout_review(sp)
    sp.set_defaults(func=cmd_feat_closeout)

    sp = sub.add_parser("archive-feature", help="archive feature metadata without changing Git workspace")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    add_closeout_review(sp)
    sp.set_defaults(func=cmd_feat_archive)

    sp = sub.add_parser("discard-feature", help="discard feature metadata without changing Git workspace")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.add_argument("--reason", choices=["stale", "superseded", "cancelled", "invalid"], required=True)
    sp.add_argument("--replacement", default="")
    add_closeout_review(sp)
    sp.set_defaults(func=cmd_feat_discard)

    sp = sub.add_parser("validate-tracker", help="validate tracker consistency")
    add_common(sp)
    sp.set_defaults(func=cmd_validate)

    sp = sub.add_parser("diagnose-tracker", help="run doctor checks")
    add_common(sp)
    sp.add_argument("--closeout-plan", action="store_true")
    sp.set_defaults(func=cmd_doctor)

    sp = sub.add_parser("replan-features", help="update dependencies after validating the resulting active graph")
    add_common(sp)
    sp.add_argument(
        "--dependency",
        action="append",
        default=[],
        help="dependency override in '<feature-id>:<dep1>,<dep2>' format",
    )
    sp.add_argument("--clear-dependencies", action="append", default=[])
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=cmd_replan_feats)

    sp = sub.add_parser("show-feature-dag", help="compute and show the current feature dependency graph")
    add_common(sp)
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=cmd_show_feat_dag)

    sp = sub.add_parser("list-features", help="query features list")
    add_common(sp)
    sp.add_argument(
        "--scope",
        action="append",
        default=None,
        help="feature lifecycle scope: active, archived, discarded; repeat or comma-separate values; default active",
    )
    sp.set_defaults(func=cmd_query_list)

    sp = sub.add_parser("get-feature", help="query one feature")
    add_common(sp)
    sp.add_argument("--feature", dest="feat", required=True)
    sp.set_defaults(func=cmd_query_get)

    sp = sub.add_parser("filter-features", help="query features with filters")
    add_common(sp)
    sp.add_argument(
        "--scope",
        action="append",
        default=None,
        help="feature lifecycle scope: active, archived, discarded; repeat or comma-separate values; default active",
    )
    sp.add_argument("--status", default=None)
    sp.add_argument("--task-status", choices=["todo", "in_progress", "done", "blocked"], default=None)
    sp.add_argument("--contains", default=None)
    sp.set_defaults(func=cmd_query_filter)

    return p


def command_requires_global_tracker_lock(args: argparse.Namespace) -> bool:
    command = str(getattr(args, "cmd", "") or "")
    # Gate stages its own short tracker locks around long-running external
    # commands so unrelated tracker readers and writers are not blocked.
    return command in {
        "initialize-tracker",
        "rekey-local-issuer",
        "materialize-feature-artifact",
        "create-feature",
        "create-feature-from-planning-entry-handoff",
        "set-task-plan",
        "repair-reviewed-task-plan",
        "set-feature-goal",
        "assign-feature-workspace",
        "start-task",
        "unstart-task",
        "finish-task",
        "closeout-feature",
        "archive-feature",
        "discard-feature",
        "replan-features",
        "get-owner-receipt",
    }


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    if command_requires_global_tracker_lock(args):
        root = Path(args.root).resolve()
        with tracker_state_lock(root, allow_create=str(args.cmd) == "initialize-tracker"):
            return int(args.func(args))
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
