"""Script-backed de-AI-tone lint for Markdown prose."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
LEXICON_PATH = SKILL_DIR / "references/lexicon.json"

PROFILES = {
    "blog",
    "technical",
    "docs",
    "social",
    "business",
    "internal-share",
    "casual",
}

SCENES = {
    "auto",
    "chat",
    "status",
    "docs",
    "public-writing",
    "technical",
}

TECHNICAL_EXEMPT_PROFILES = {"technical", "docs"}
P0_ONLY_PROFILES = {"casual"}

SCENE_PRIORITY_CLASSES = {
    "chat": ["owner", "date", "issue_or_id", "url"],
    "status": ["owner", "metric", "date", "issue_or_id", "url"],
    "docs": ["code_block", "inline_code", "command", "file_path", "api_symbol", "version", "url", "product_ui_label"],
    "public-writing": ["url", "metric", "date", "quoted_source", "product_ui_label", "api_symbol"],
    "technical": ["code_block", "inline_code", "command", "file_path", "api_symbol", "version", "metric", "date"],
}

P0_PATTERNS = [
    ("P0_CHATBOT_ARTIFACT", r"\b(Certainly|Absolutely|Great question|I hope this helps)\b|希望对你有所帮助|欢迎随时沟通"),
    ("P0_CUTOFF_DISCLAIMER", r"as of my last update|截至我所知|截至我的知识"),
    ("P0_VAGUE_AUTHORITY", r"experts believe|studies show|业内人士指出|有分析认为|据了解"),
    ("P0_REASONING_ARTIFACT", r"let me think step by step|breaking this down|我们一步步分析|先来逐步分析"),
    ("P0_SIGNIFICANCE_INFLATION", r"具有里程碑式的意义|开创性的|引领行业|marking a pivotal moment|watershed moment"),
]

P1_PATTERNS = [
    ("P1_FORMULAIC_OPENING", r"随着[^。！？\n]{0,30}不断发展|In today'?s rapidly evolving|In an era where"),
    ("P1_PROCESS_FILLER", r"进行(分析|讨论|研究|优化|设计|处理|改进|探索|实践)"),
    ("P1_META_TRANSITION", r"值得(注意|一提)的是|需要指出的是|不难发现|众所周知|毋庸置疑|let'?s (explore|dive in|take a look)"),
    ("P1_FALSE_BREADTH", r"无论是[^。！？\n]{0,40}还是|不管是[^。！？\n]{0,40}还是|Whether you'?re [^,\n]{1,60} or"),
]

TRANSITION_RE = re.compile(r"此外|与此同时|除此之外|另外|然而|事实上|实际上|本质上|在此基础上|moreover|furthermore|additionally|notably|that said", re.I)
NEGATION_PAIR_RE = re.compile(r"不是[^\n。！？!?；;]{0,80}而是|并非[^\n。！？!?；;]{0,80}而是|与其说[^\n。！？!?；;]{0,80}不如说")
EN_NOT_X_Y_RE = re.compile(r"\b(?:it'?s|this is|this isn'?t|it is not|this is not)\b[^.!?\n]{0,80}\b(?:not|isn'?t)\b[^.!?\n]{0,80}\b(?:it'?s|it is|but)\b", re.I)
CONFLICT_BAIT_JOINER_RE = "|".join([r"vs\.?", "VS", re.escape(chr(47)), "对", "还是", "而不是"])
CONFLICT_BAIT_VS_RE = re.compile(
    r"[^。！？\n]{0,18}(?:" + CONFLICT_BAIT_JOINER_RE + r")[^。！？\n]{0,18}"
)
CONFLICT_BAIT_WORD_RE = re.compile(
    r"该做|不该做|塌方式|体面|赢面高|赢面低|老路|新路|正路|错路|正确|错误|"
    r"先进|落后|聪明|愚蠢|上桌|退场|站队|翻身|淘汰"
)
UNSUPPORTED_PEOPLE_RE = re.compile(
    r"(?:人们往往|大多数人|多数人|很多人|许多人|不少人|普通人|一般人|大部分人|"
    r"很多团队|多数团队|大多数团队|大家往往)[^。！？!?；;\n]{0,80}"
)
SUPPORT_SIGNAL_RE = re.compile(
    r"\d+(?:\.\d+)?\s*%|\d+\s*/\s*\d+|样本|调研|统计|问卷|访谈|日志|"
    r"survey|study|sample|according to|数据显示|报告显示|在这组|这次讨论|"
    r"这组三次|过去[一二三四五六七八九十0-9]+次"
    ,
    re.I,
)
FOUR_CHAR_RE = re.compile(r"[\u4e00-\u9fff]{4}")
STACKED_DE_RE = re.compile(r"的[^。！？\n]{0,8}的[^。！？\n]{0,8}的")
NOMINALIZED_ACTION_SHELL_RE = re.compile(
    r"(?:实现了?对[^。！？!?\n]{1,36}的(?:显著|全面|有效)?(?:提升|优化|改善)|"
    r"\b(?:conduct(?:ed|s|ing)?|perform(?:ed|s|ing)?|undert(?:ake|ook|aken|aking)|"
    r"carry(?:ing)? out|carried out)\s+(?:a\s+|an\s+)?"
    r"(?:comprehensive\s+|detailed\s+|systematic\s+)?"
    r"(?:analysis|evaluation|assessment|review|optimization)\b)",
    re.I,
)
LIST_RE = re.compile(r"^\s*(?:[-*+]\s+|\d+\.\s+)", re.M)
HEADING_RE = re.compile(r"^#{1,6}\s+", re.M)
BOLD_RE = re.compile(r"\*\*[^*\n]{1,80}\*\*")
DASH_RE = re.compile(r"——|—|--")
PATH_SEP_PATTERN = re.escape(chr(47))

PROTECTED_SPAN_PATTERNS = [
    ("code_block", re.compile(r"```[\s\S]*?```")),
    ("inline_code", re.compile(r"(?<!`)`([^`\n]{1,180})`(?!`)")),
    ("url", re.compile(r"https?://[^\s)>\]，。！？；、]+")),
    ("quoted_source", re.compile(r"(?m)^\s*>\s?.+$")),
    ("quoted_source", re.compile(r"(?m)^\s*(?:Source|Quote|Quoted|Vendor deck|来源|引用|原文)[:：]\s*[^\n]+", re.I)),
    ("owner", re.compile(r"(?<!\w)@[\w.-]{2,64}(?!\w)")),
    ("owner", re.compile(r"(?m)^\s*(?:Owner|DRI|Responsible|Assignee|负责人|责任人)[:：]\s*[^\n]+", re.I)),
    (
        "product_ui_label",
        re.compile(r"(?m)^\s*(?:Product|UI|Button|Menu|Label|Field|产品|界面|按钮|菜单|标签|字段)[:：]\s*[^\n]+", re.I),
    ),
    ("product_ui_label", re.compile(r"(?<![\w.])[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*(?![\w.])")),
    (
        "command",
        re.compile(
            r"(?m)^\s*(?:\$ )?(?:bash|sh|python3?|node|npm|pnpm|yarn|git|make|curl|"
            r"lark-cli|rg|sed|awk|jq)\b[^\n]{0,220}"
        ),
    ),
    (
        "file_path",
        re.compile(
            rf"(?<![\w{PATH_SEP_PATTERN}.-])(?:\.{{1,2}}{PATH_SEP_PATTERN}|[A-Za-z0-9_.-]+{PATH_SEP_PATTERN})"
            rf"[A-Za-z0-9_.{PATH_SEP_PATTERN}-]*[A-Za-z0-9_.-](?::\d+)?"
        ),
    ),
    ("version", re.compile(r"(?<![\w.])v?\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9._-]+)?(?![\w.])")),
    (
        "metric",
        re.compile(
            r"(?<!\w)\d+(?:\.\d+)?\s?(?:%|ms|sec|seconds|MB|GB|KB|tokens?|rows?|"
            r"requests?|QPS|RPS|fps|px|em|rem)(?!\w)",
            re.I,
        ),
    ),
    ("date", re.compile(r"20\d{2}(?:[-/年]\d{1,2}(?:[-/月]\d{1,2}日?)?)?")),
    ("api_symbol", re.compile(r"(?<![\w.])(?:[A-Za-z_][\w]*\.)+[A-Za-z_][\w]*(?:\(\))?")),
    ("issue_or_id", re.compile(r"(?<!\w)(?:[A-Z]{2,}-\d+|#[0-9]{2,}|[a-f0-9]{7,40})(?!\w)")),
]


@dataclass
class Finding:
    level: str
    severity: str
    code: str
    message: str
    meta: dict

    def as_dict(self) -> dict:
        return {
            "level": self.level,
            "severity": self.severity,
            "code": self.code,
            "message": self.message,
            "meta": self.meta,
        }


def load_lexicon() -> dict:
    try:
        return json.loads(LEXICON_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit("missing de-AI-tone lexicon") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid de-AI-tone lexicon: {exc.lineno}:{exc.colno}") from exc


def iter_input_files(paths: list[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(sorted(item for item in path.rglob("*.md") if item.is_file()))
        elif path.is_file():
            files.append(path)
        else:
            raise SystemExit(f"missing input: {path}")
    return files


def snippets(text: str, pattern: re.Pattern[str], limit: int = 8) -> list[str]:
    found: list[str] = []
    for match in pattern.finditer(text):
        excerpt = match.group(0).strip()
        if excerpt and excerpt not in found:
            found.append(excerpt[:140])
        if len(found) >= limit:
            break
    return found


def normalize_sample(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()[:160]


def word_count(text: str, term: str) -> int:
    if re.search(r"[A-Za-z]", term):
        return len(re.findall(rf"\b{re.escape(term)}\b", text, re.I))
    return text.count(term)


def protected_span_summary(text: str) -> dict:
    spans_by_class: dict[str, list[tuple[int, int, str]]] = {}

    for class_name, pattern in PROTECTED_SPAN_PATTERNS:
        for match in pattern.finditer(text):
            raw = match.group(1) if class_name == "inline_code" and match.groups() else match.group(0)
            sample = normalize_sample(raw)
            if class_name == "api_symbol" and re.search(r"\.(?:com|org|net|io|md|py|sh|toml|json|yaml|yml|ts|js)$", sample):
                continue
            if not sample:
                continue
            spans_by_class.setdefault(class_name, []).append((match.start(), match.end(), sample))

    classes: dict[str, dict] = {}
    total = 0

    for class_name, spans in spans_by_class.items():
        accepted: list[tuple[int, int, str]] = []
        for start, end, sample in sorted(spans, key=lambda item: (item[0], -(item[1] - item[0]))):
            if accepted and start < accepted[-1][1]:
                if end > accepted[-1][1]:
                    accepted[-1] = (accepted[-1][0], end, accepted[-1][2])
                continue
            accepted.append((start, end, sample))

        class_entry = classes.setdefault(class_name, {"count": 0, "samples": []})
        for _start, _end, sample in accepted:
            class_entry["count"] += 1
            total += 1
            if sample not in class_entry["samples"] and len(class_entry["samples"]) < 8:
                class_entry["samples"].append(sample)

    return {
        "total": total,
        "classes": classes,
    }


def merge_protected_span_summaries(summaries: list[dict]) -> dict:
    merged: dict[str, dict] = {}
    total = 0

    for summary in summaries:
        total += int(summary.get("total", 0))
        classes = summary.get("classes", {})
        if not isinstance(classes, dict):
            continue
        for class_name, data in classes.items():
            if not isinstance(data, dict):
                continue
            class_entry = merged.setdefault(str(class_name), {"count": 0, "samples": []})
            class_entry["count"] += int(data.get("count", 0))
            for raw_sample in data.get("samples", []):
                sample = normalize_sample(str(raw_sample))
                if sample and sample not in class_entry["samples"] and len(class_entry["samples"]) < 8:
                    class_entry["samples"].append(sample)

    return {"total": total, "classes": merged}


def mask_protected_spans(text: str) -> str:
    masked = list(text)
    for _class_name, pattern in PROTECTED_SPAN_PATTERNS:
        for match in pattern.finditer(text):
            for index in range(match.start(), match.end()):
                if masked[index] != "\n":
                    masked[index] = " "
    return "".join(masked)


def lexicon_findings(text: str, profile: str, lexicon: dict) -> list[Finding]:
    findings: list[Finding] = []
    hits_by_tier: dict[str, list[dict]] = {"always": [], "density": [], "high_density": []}

    for group in ("zh", "en"):
        entries = lexicon.get(group, [])
        if not isinstance(entries, list):
            raise SystemExit(f"invalid lexicon group: {group}")
        for entry in entries:
            if not isinstance(entry, dict) or not entry.get("term"):
                raise SystemExit(f"invalid lexicon entry in {group}")
            if not entry.get("lint", True):
                continue
            if entry.get("technical_exemption") and profile in TECHNICAL_EXEMPT_PROFILES:
                continue
            term = str(entry["term"])
            count = word_count(text, term)
            if count <= 0:
                continue
            tier = str(entry.get("tier", "always"))
            hits_by_tier.setdefault(tier, []).append(
                {
                    "term": term,
                    "count": count,
                    "suggestions": [str(item) for item in entry.get("suggestions", [])],
                }
            )

    if hits_by_tier["always"]:
        findings.append(
            Finding(
                "WARN",
                "P1",
                "P1_LEXICON_ALWAYS",
                "Always-rewrite AI-tone terms found",
                {"hits": hits_by_tier["always"][:20]},
            )
        )
    density_hits = [item for item in hits_by_tier["density"] if item["count"] >= 2]
    if density_hits:
        findings.append(
            Finding(
                "WARN",
                "P1",
                "P1_LEXICON_DENSITY",
                "Density-trigger AI-tone terms repeated",
                {"hits": density_hits[:20]},
            )
        )
    high_density_total = sum(item["count"] for item in hits_by_tier["high_density"])
    if high_density_total >= 5:
        findings.append(
            Finding(
                "ADVISORY",
                "P2",
                "P2_LEXICON_HIGH_DENSITY",
                "High-density polish words may be flattening the prose",
                {"hits": hits_by_tier["high_density"][:20], "total": high_density_total},
            )
        )
    return findings


def pattern_findings(text: str, profile: str) -> list[Finding]:
    findings: list[Finding] = []
    for code, raw_pattern in P0_PATTERNS:
        pattern = re.compile(raw_pattern, re.I)
        items = snippets(text, pattern)
        if items:
            findings.append(Finding("FAIL", "P0", code, "Credibility-killing AI artifact", {"items": items}))

    for code, raw_pattern in P1_PATTERNS:
        pattern = re.compile(raw_pattern, re.I)
        items = snippets(text, pattern)
        if items:
            findings.append(Finding("WARN", "P1", code, "Obvious AI-tone pattern", {"items": items}))

    negation_items = snippets(text, NEGATION_PAIR_RE)
    if negation_items:
        level = "WARN" if len(negation_items) > 1 else "ADVISORY"
        severity = "P1" if level == "WARN" else "P2"
        findings.append(
            Finding(
                level,
                severity,
                "P1_FAKE_CONTRAST",
                "Fake contrast pattern found; use direct positive claims unless the contrast is earned",
                {"count": len(negation_items), "items": negation_items},
            )
        )

    en_contrast = snippets(text, EN_NOT_X_Y_RE)
    if en_contrast:
        findings.append(
            Finding(
                "ADVISORY",
                "P2",
                "P2_EN_FAKE_CONTRAST",
                "English not-X-but-Y pattern may be pseudo-insight",
                {"items": en_contrast},
            )
        )

    conflict_items: list[str] = []
    for item in snippets(text, CONFLICT_BAIT_VS_RE, limit=12):
        if CONFLICT_BAIT_WORD_RE.search(item):
            conflict_items.append(item)
    if conflict_items:
        findings.append(
            Finding(
                "WARN",
                "P1",
                "P1_CONFLICT_BAIT_BINARY",
                "Binary conflict framing creates argument-bait tension; replace it with a decision boundary, trade-off, or concrete failure mode",
                {"count": len(conflict_items), "items": conflict_items[:8]},
            )
        )

    people_items = [
        item
        for item in snippets(text, UNSUPPORTED_PEOPLE_RE, limit=12)
        if not SUPPORT_SIGNAL_RE.search(item)
    ]
    if people_items:
        findings.append(
            Finding(
                "WARN",
                "P1",
                "P1_UNSUPPORTED_PEOPLE_GENERALIZATION",
                "Vague people-generalization can become self-serving dunking; name the sample, source, context, or concrete failure mode",
                {"count": len(people_items), "items": people_items[:8]},
            )
        )

    transition_count = len(TRANSITION_RE.findall(text))
    if transition_count >= 4:
        findings.append(
            Finding(
                "ADVISORY",
                "P2",
                "P2_TRANSITION_DENSITY",
                "Transition phrase density is high",
                {"count": transition_count},
            )
        )

    nominalized_action_items = snippets(text, NOMINALIZED_ACTION_SHELL_RE)
    if nominalized_action_items:
        findings.append(
            Finding(
                "ADVISORY",
                "P2",
                "P2_NOMINALIZED_ACTION_SHELL",
                "An abstract noun shell may be hiding the action; review whether a direct verb preserves the meaning more clearly",
                {"items": nominalized_action_items},
            )
        )

    dash_count = len(DASH_RE.findall(mask_protected_spans(text)))
    if dash_count > max(1, len(text) // 1000):
        findings.append(
            Finding("WARN", "P1", "P1_DASH_OVERUSE", "Dash insertions are overused", {"count": dash_count})
        )

    list_count = len(LIST_RE.findall(text))
    heading_count = len(HEADING_RE.findall(text))
    bold_count = len(BOLD_RE.findall(text))
    list_threshold = 14 if profile == "docs" else 8
    heading_threshold = 8 if profile == "docs" else 5
    bold_threshold = 10 if profile == "docs" else 5
    if list_count >= list_threshold:
        findings.append(Finding("ADVISORY", "P2", "P2_LIST_SCAFFOLDING", "List scaffolding may be replacing connected prose", {"count": list_count}))
    if heading_count >= heading_threshold and len(text) < 1200:
        findings.append(Finding("ADVISORY", "P2", "P2_OVER_STRUCTURED", "Too many headings for a short text", {"count": heading_count}))
    if bold_count >= bold_threshold:
        findings.append(Finding("ADVISORY", "P2", "P2_BOLD_OVERUSE", "Bold formatting may be doing the work of structure", {"count": bold_count}))

    four_char_count = len(FOUR_CHAR_RE.findall(text))
    if four_char_count >= 12:
        findings.append(Finding("ADVISORY", "P2", "P2_FOUR_CHAR_DENSITY", "Four-character phrase density is high", {"count": four_char_count}))
    stacked_items = snippets(text, STACKED_DE_RE)
    if stacked_items:
        findings.append(Finding("ADVISORY", "P2", "P2_STACKED_DE", "Stacked 的 phrases reduce human rhythm", {"items": stacked_items}))

    return findings


def apply_profile_semantics(findings: list[Finding], profile: str) -> list[Finding]:
    if profile not in P0_ONLY_PROFILES:
        return findings

    adjusted: list[Finding] = []
    for finding in findings:
        if finding.severity == "P0":
            adjusted.append(finding)
            continue
        adjusted.append(
            Finding(
                "ADVISORY",
                "P2",
                finding.code,
                f"{finding.message} (advisory under {profile} p0-only profile)",
                {**finding.meta, "profile_adjustment": "p0-only"},
            )
        )
    return adjusted


def infer_scene(text: str, requested_scene: str) -> tuple[str, bool]:
    if requested_scene != "auto":
        return requested_scene, False

    protected = protected_span_summary(text)
    classes = set(protected.get("classes", {}).keys())
    if {"command", "file_path", "api_symbol", "version"} & classes:
        return "technical", True
    if {"owner", "metric", "date"} <= classes or re.search(r"(?m)^#{1,3}\s*(本周|进展|Status|Update)", text, re.I):
        return "status", True
    if LIST_RE.search(text) and ({"inline_code", "file_path", "url"} & classes):
        return "docs", True
    if len(text.strip()) <= 320 and ("\n\n" not in text.strip()):
        return "chat", True
    return "public-writing", True


def lint_text(text: str, path: Path, profile: str, scene: str, lexicon: dict) -> dict:
    active_scene, inferred_scene = infer_scene(text, scene)
    masked_text = mask_protected_spans(text)
    findings = apply_profile_semantics(
        lexicon_findings(masked_text, profile, lexicon) + pattern_findings(masked_text, profile),
        profile,
    )
    return {
        "path": str(path),
        "profile": profile,
        "scene": active_scene,
        "scene_metadata": {
            "requested": scene,
            "active": active_scene,
            "inferred": inferred_scene,
            "priority_protected_classes": SCENE_PRIORITY_CLASSES.get(active_scene, []),
        },
        "protected_spans": protected_span_summary(text),
        "findings": [finding.as_dict() for finding in findings],
        "counts": {
            "fail": sum(1 for item in findings if item.level == "FAIL"),
            "warn": sum(1 for item in findings if item.level == "WARN"),
            "advisory": sum(1 for item in findings if item.level == "ADVISORY"),
        },
    }


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", help="Markdown file or directory")
    parser.add_argument("--profile", default="blog", choices=sorted(PROFILES))
    parser.add_argument("--scene", default="auto", choices=sorted(SCENES))
    parser.add_argument("--fail-on", default="warn", choices=("warn", "fail", "none"))
    args = parser.parse_args(argv[1:])

    lexicon = load_lexicon()
    files = iter_input_files([Path(item) for item in args.paths])
    reports = [
        lint_text(path.read_text(encoding="utf-8"), path, args.profile, args.scene, lexicon)
        for path in files
    ]

    summary = {
        "files": len(reports),
        "fail": sum(item["counts"]["fail"] for item in reports),
        "warn": sum(item["counts"]["warn"] for item in reports),
        "advisory": sum(item["counts"]["advisory"] for item in reports),
        "protected_spans": sum(item["protected_spans"]["total"] for item in reports),
    }
    findings = [
        {**finding, "path": report["path"]}
        for report in reports
        for finding in report["findings"]
    ]
    protected_spans = merge_protected_span_summaries([report["protected_spans"] for report in reports])
    active_scenes = sorted({str(report["scene"]) for report in reports})
    payload = {
        "schema": "bagakit.de_ai_tone_lint.v1",
        "profile": args.profile,
        "scene": active_scenes[0] if len(active_scenes) == 1 else "mixed",
        "scene_metadata": {
            "requested": args.scene,
            "active_scenes": active_scenes,
            "files": [
                {
                    "path": report["path"],
                    "active": report["scene"],
                    "inferred": report.get("scene_metadata", {}).get("inferred", False),
                    "priority_protected_classes": report.get("scene_metadata", {}).get("priority_protected_classes", []),
                }
                for report in reports
            ],
        },
        "summary": summary,
        "files": reports,
        "findings": findings,
        "protected_spans": protected_spans,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    if args.fail_on == "none":
        return 0
    if args.fail_on == "fail":
        return 2 if summary["fail"] else 0
    return 2 if summary["fail"] or summary["warn"] else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
