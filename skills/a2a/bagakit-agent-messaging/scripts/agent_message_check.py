#!/usr/bin/env python3
"""Validate or emit one portable Bagakit Agent message envelope."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT_ATTRIBUTES = {"type", "name", "time"}
MESSAGE_TYPES = {
    "agent-v1",
    "agent-set-v1",
    "supervisor-v1",
    "worker-v1",
    "reviewer-v1",
    "tester-v1",
    "auditor-v1",
    "researcher-v1",
}
CITE_ATTRIBUTES = {"from", "ref"}
CITE_SOURCES = {"user", "supervisor", "worker", "host", "reviewer", "tester", "evidence"}


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def valid_time(value: str) -> bool:
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = dt.datetime.fromisoformat(normalized)
    except ValueError:
        return False
    return "T" in value and parsed.tzinfo is not None


def validate_cite(element: ET.Element, index: int) -> list[dict[str, str]]:
    path = f"$.cite[{index}]"
    issues: list[dict[str, str]] = []
    actual_attributes = set(element.attrib)
    for name in sorted({"from"} - actual_attributes):
        issues.append(issue("cite.attribute.missing", f"{path}.@{name}", "required cite attribute is missing"))
    for name in sorted(actual_attributes - CITE_ATTRIBUTES):
        issues.append(issue("cite.attribute.unknown", f"{path}.@{name}", "unknown cite attribute is forbidden"))
    for name in sorted(CITE_ATTRIBUTES & actual_attributes):
        if not element.attrib[name].strip():
            issues.append(issue("cite.attribute.empty", f"{path}.@{name}", "cite attribute must be non-empty"))
    source = element.attrib.get("from")
    if source and source not in CITE_SOURCES:
        issues.append(issue("cite.from.invalid", f"{path}.@from", f"unsupported cite source: {source}"))
    if list(element):
        issues.append(issue("cite.nested", path, "cite content must be plain text without nested elements"))
    if not "".join(element.itertext()).strip():
        issues.append(issue("cite.content.empty", path, "cite content must be non-empty"))
    return issues


def validate(text: str) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    upper = text.upper()
    if any(token in upper for token in ("<!DOCTYPE", "<!ENTITY", "<![CDATA[")) or "<!--" in text:
        return [issue("xml.forbidden_construct", "$", "DTD, entity declarations, CDATA, and comments are forbidden")]
    without_declaration = re.sub(r"^\s*<\?xml\s+[^?]*\?>", "", text, count=1, flags=re.IGNORECASE)
    if "<?" in without_declaration:
        return [issue("xml.forbidden_construct", "$", "processing instructions are forbidden")]

    try:
        root = ET.fromstring(text)
    except ET.ParseError as error:
        return [issue("xml.parse", "$", str(error))]

    if root.tag != "bagakit-msg":
        issues.append(issue("root.invalid", "$", "root element must be bagakit-msg"))

    actual_attributes = set(root.attrib)
    for name in sorted(ROOT_ATTRIBUTES - actual_attributes):
        issues.append(issue("attribute.missing", f"$.@{name}", "required root attribute is missing"))
    for name in sorted(actual_attributes - ROOT_ATTRIBUTES):
        issues.append(issue("attribute.unknown", f"$.@{name}", "unknown root attribute is forbidden"))
    for name in sorted(ROOT_ATTRIBUTES & actual_attributes):
        if not root.attrib[name].strip():
            issues.append(issue("attribute.empty", f"$.@{name}", "attribute must be non-empty"))

    message_type = root.attrib.get("type")
    if message_type and message_type not in MESSAGE_TYPES:
        issues.append(issue("type.invalid", "$.@type", f"unsupported Agent message type: {message_type}"))
    if "time" in root.attrib and not valid_time(root.attrib["time"]):
        issues.append(issue("time.invalid", "$.@time", "time must be an ISO 8601 timestamp with a timezone"))

    cite_index = 0
    for child_index, child in enumerate(root):
        if child.tag != "cite":
            issues.append(issue("content.element", f"$[{child_index}]", "only direct cite elements are allowed in the message body"))
            continue
        issues.extend(validate_cite(child, cite_index))
        cite_index += 1

    if not "".join(root.itertext()).strip():
        issues.append(issue("content.empty", "$", "message body must be non-empty"))

    return issues


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate one Bagakit Agent message envelope.")
    parser.add_argument("--input", required=True, help="Path to one bagakit-msg XML file, or - for stdin.")
    output = parser.add_mutually_exclusive_group()
    output.add_argument("--json", action="store_true", help="Emit structured validation JSON.")
    output.add_argument("--emit", action="store_true", help="Emit the exact input only when it is valid.")
    args = parser.parse_args()
    try:
        text = sys.stdin.read() if args.input == "-" else Path(args.input).read_text(encoding="utf-8")
    except OSError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    issues = validate(text)
    payload = {"schema": "bagakit/agent-message-validation/v1", "valid": not issues, "issues": issues}
    if args.emit:
        if issues:
            for item in issues:
                print(f"{item['code']}: {item['path']} {item['message']}", file=sys.stderr)
        else:
            sys.stdout.write(text)
    elif args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("valid" if not issues else "invalid")
        for item in issues:
            print(f"{item['code']}: {item['path']} {item['message']}")
    return 0 if not issues else 1


if __name__ == "__main__":
    raise SystemExit(main())
