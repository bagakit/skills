"""Mask common credential shapes without printing original values.

The helper is intentionally conservative and local. It is a candidate detector,
not a complete PII scanner: callers must still review the delivery gate.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from typing import Match


MASK = "[已脱敏]"

PRIVATE_KEY = re.compile(
    r"-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----",
    re.IGNORECASE,
)
LABELED_VALUE = re.compile(
    r"(?ix)(?P<label>\b(?:api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|token|secret|password|passwd|session[-_ ]?id|pat|private[-_ ]?key)\b\s*[:=]\s*[\"']?)(?P<value>[^\s\"'`,;)\]}]+)"
)
BEARER = re.compile(r"(?i)(?P<label>\bBearer\s+)(?P<value>[A-Za-z0-9._~+/=-]{12,})")
URL_PARAMETER = re.compile(
    r"(?i)(?P<label>[?&](?:token|api[-_]?key|access[-_]?token|secret|password)=)(?P<value>[^&#\s]+)"
)
KNOWN_PREFIX = re.compile(
    r"(?<![A-Za-z0-9])(?:"
    r"sk-[A-Za-z0-9]{16,}|rk-[A-Za-z0-9]{16,}|"
    r"github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9_]{16,}|"
    r"xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}"
    r")(?![A-Za-z0-9])"
)


def _mask_group(match: Match[str], rule: str, counts: Counter[str]) -> str:
    counts[rule] += 1
    return f"{match.group('label')}{MASK}"


def mask_text(text: str) -> tuple[str, Counter[str]]:
    counts: Counter[str] = Counter()

    def mask_private(match: Match[str]) -> str:
        counts["private-key-block"] += 1
        return MASK

    text = PRIVATE_KEY.sub(mask_private, text)
    text = LABELED_VALUE.sub(lambda m: _mask_group(m, "labeled-value", counts), text)
    text = BEARER.sub(lambda m: _mask_group(m, "bearer", counts), text)
    text = URL_PARAMETER.sub(lambda m: _mask_group(m, "url-parameter", counts), text)

    def mask_prefix(match: Match[str]) -> str:
        counts["known-prefix"] += 1
        return MASK

    text = KNOWN_PREFIX.sub(mask_prefix, text)
    return text, counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Mask common credential shapes from stdin; never print original values in reports."
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="report candidate counts as JSON and leave input unchanged (exit 1 when candidates exist)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit a JSON report; only meaningful with --check-only",
    )
    args = parser.parse_args()
    source = sys.stdin.read()
    masked, counts = mask_text(source)
    if args.check_only:
        report = {
            "has_sensitive_candidates": bool(counts),
            "match_count": sum(counts.values()),
            "rule_counts": dict(sorted(counts.items())),
        }
        if args.json or args.check_only:
            sys.stdout.write(json.dumps(report, ensure_ascii=False, sort_keys=True) + "\n")
        return 1 if counts else 0
    sys.stdout.write(masked)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
