from __future__ import annotations

import re

from .models import ParsedPerson

MONTHS = {
    "正月": 1,
    "一月": 1,
    "二月": 2,
    "三月": 3,
    "四月": 4,
    "五月": 5,
    "六月": 6,
    "七月": 7,
    "八月": 8,
    "九月": 9,
    "十月": 10,
    "十一月": 11,
    "十二月": 12,
}

DISMISSAL_WORDS = ("罢", "免", "落")
DEATH_WORDS = ("卒", "死难", "赴水死", "宋亡")
APPOINTMENT_WORDS = ("除", "拜", "以", "充", "加")


def normalize_month(label: str | None) -> int | None:
    if not label:
        return None
    cleaned = str(label).strip()
    cleaned = cleaned.removeprefix("闰")
    return MONTHS.get(cleaned)


def split_person_name(raw_name: str, source_column: str) -> ParsedPerson:
    raw = str(raw_name).strip()
    match = re.match(r"^(.+?)[（(](.+?)[）)]$", raw)
    if match:
        return ParsedPerson(
            canonical_name=match.group(1).strip(),
            raw_name=raw,
            aliases=match.group(2).strip(),
            source_column=source_column,
        )
    return ParsedPerson(canonical_name=raw, raw_name=raw, aliases="", source_column=source_column)


def classify_event_type(text: str) -> str:
    value = str(text)
    if any(word in value for word in DEATH_WORDS):
        return "death"
    if any(word in value for word in DISMISSAL_WORDS):
        return "dismissal"
    if any(word in value for word in APPOINTMENT_WORDS) or "本月" in value:
        return "appointment"
    return "tenure"
