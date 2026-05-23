from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from .db import connect


def search_events(
    db_path: str | Path,
    year_from: int | None = None,
    year_to: int | None = None,
    month_from: int | None = None,
    month_to: int | None = None,
    month: int | str | None = None,
    person: str | None = None,
    event_type: str | None = None,
    emperor: str | Sequence[str] | None = None,
    era: str | None = None,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    where, params = _event_filters(
        year_from,
        year_to,
        month_from,
        month_to,
        month,
        person,
        event_type,
        emperor,
        era,
        keyword,
    )
    where_sql = f"where {' and '.join(where)}" if where else ""

    conn = connect(db_path)
    total = conn.execute(
        f"""
        select count(distinct e.id)
        from appointment_events e
        join persons p on p.id = e.person_id
        join time_points t on t.id = e.time_point_id
        {where_sql}
        """,
        params,
    ).fetchone()[0]
    rows = conn.execute(
        f"""
        select distinct
            e.id,
            p.id as person_id,
            p.canonical_name as person_name,
            t.gregorian_year,
            t.month_index,
            t.month_label,
            t.emperor,
            t.era_name,
            e.event_type,
            e.raw_text,
            e.source_cell
        from appointment_events e
        join persons p on p.id = e.person_id
        join time_points t on t.id = e.time_point_id
        {where_sql}
        order by t.gregorian_year, t.source_row, e.id
        limit ? offset ?
        """,
        [*params, limit, offset],
    ).fetchall()
    conn.close()
    return {"total": total, "limit": limit, "offset": offset, "items": [_row_dict(row) for row in rows]}


def get_event_detail(db_path: str | Path, event_id: int) -> dict[str, Any] | None:
    conn = connect(db_path)
    event = conn.execute(
        """
        select
            e.id,
            p.id as person_id,
            p.canonical_name as person_name,
            p.raw_name,
            p.aliases,
            t.gregorian_year,
            t.month_index,
            t.month_label,
            t.emperor,
            t.era_name,
            e.event_type,
            e.raw_text,
            e.source_cell,
            e.is_event_text,
            e.is_tenure_state,
            e.parse_confidence
        from appointment_events e
        join persons p on p.id = e.person_id
        join time_points t on t.id = e.time_point_id
        where e.id = ?
        """,
        (event_id,),
    ).fetchone()
    if not event:
        conn.close()
        return None
    annotations = conn.execute(
        """
        select id, source_cell, comment_text
        from annotations
        where event_id = ?
        order by id
        """,
        (event_id,),
    ).fetchall()
    conn.close()
    detail = _row_dict(event)
    detail["annotations"] = [_row_dict(row) for row in annotations]
    return detail


def search_people(db_path: str | Path, q: str = "") -> list[dict[str, Any]]:
    conn = connect(db_path)
    pattern = f"%{q}%"
    rows = conn.execute(
        """
        select
            p.id,
            p.canonical_name,
            p.raw_name,
            p.aliases,
            count(e.id) as event_count,
            min(t.gregorian_year) as first_year,
            max(t.gregorian_year) as last_year
        from persons p
        left join appointment_events e on e.person_id = p.id
        left join time_points t on t.id = e.time_point_id
        where ? = '' or p.canonical_name like ? or p.raw_name like ? or p.aliases like ?
        group by p.id
        order by p.id
        limit 30
        """,
        (q, pattern, pattern, pattern),
    ).fetchall()
    conn.close()
    return [_row_dict(row) for row in rows]


def get_person_detail(db_path: str | Path, person_id: int) -> dict[str, Any] | None:
    conn = connect(db_path)
    person = conn.execute("select * from persons where id = ?", (person_id,)).fetchone()
    if not person:
        conn.close()
        return None
    events = conn.execute(
        """
        select
            e.id,
            t.gregorian_year,
            t.month_index,
            t.month_label,
            t.emperor,
            t.era_name,
            e.event_type,
            e.raw_text,
            e.source_cell
        from appointment_events e
        join time_points t on t.id = e.time_point_id
        where e.person_id = ?
        order by t.gregorian_year, t.source_row, e.id
        """,
        (person_id,),
    ).fetchall()
    conn.close()
    result = _row_dict(person)
    result["events"] = [_row_dict(row) for row in events]
    return result


def list_facets(db_path: str | Path) -> dict[str, Any]:
    conn = connect(db_path)
    emperors = [row[0] for row in conn.execute("select distinct emperor from time_points where emperor is not null order by source_row")]
    eras = [row[0] for row in conn.execute("select distinct era_name from time_points where era_name is not null order by source_row")]
    years = conn.execute("select min(gregorian_year), max(gregorian_year) from time_points").fetchone()
    conn.close()
    return {
        "emperors": emperors,
        "eras": eras,
        "event_types": ["appointment", "dismissal", "death"],
        "year_min": years[0],
        "year_max": years[1],
        "months": [
            {"value": 1, "label": "正月"},
            {"value": 2, "label": "二月"},
            {"value": 3, "label": "三月"},
            {"value": 4, "label": "四月"},
            {"value": 5, "label": "五月"},
            {"value": 6, "label": "六月"},
            {"value": 7, "label": "七月"},
            {"value": 8, "label": "八月"},
            {"value": 9, "label": "九月"},
            {"value": 10, "label": "十月"},
            {"value": 11, "label": "十一月"},
            {"value": 12, "label": "十二月"},
        ],
    }


def timeline(db_path: str | Path) -> list[dict[str, Any]]:
    conn = connect(db_path)
    rows = conn.execute(
        """
        select t.gregorian_year, t.month_index, t.month_label, count(e.id) as event_count
        from time_points t
        join appointment_events e on e.time_point_id = t.id
        group by t.id
        order by t.gregorian_year, t.source_row
        """
    ).fetchall()
    conn.close()
    return [_row_dict(row) for row in rows]


def _event_filters(
    year_from: int | None,
    year_to: int | None,
    month_from: int | None,
    month_to: int | None,
    month: int | str | None,
    person: str | None,
    event_type: str | None,
    emperor: str | Sequence[str] | None,
    era: str | None,
    keyword: str | None,
) -> tuple[list[str], list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if year_from is not None and month_from is not None:
        where.append("(t.gregorian_year > ? or (t.gregorian_year = ? and t.month_index >= ?))")
        params.extend([year_from, year_from, month_from])
    elif year_from is not None:
        where.append("t.gregorian_year >= ?")
        params.append(year_from)
    if year_to is not None and month_to is not None:
        where.append("(t.gregorian_year < ? or (t.gregorian_year = ? and t.month_index <= ?))")
        params.extend([year_to, year_to, month_to])
    elif year_to is not None:
        where.append("t.gregorian_year <= ?")
        params.append(year_to)
    if month not in (None, ""):
        where.append("(t.month_index = ? or t.month_label = ?)")
        params.extend([month, str(month)])
    if person:
        where.append("(p.canonical_name like ? or p.raw_name like ? or p.aliases like ?)")
        pattern = f"%{person}%"
        params.extend([pattern, pattern, pattern])
    if event_type:
        where.append("e.event_type = ?")
        params.append(event_type)
    else:
        where.append("e.event_type != ?")
        params.append("tenure")
    emperors = _normalize_filter_values(emperor)
    if emperors:
        where.append("(" + " or ".join("t.emperor like ?" for _ in emperors) + ")")
        params.extend(f"%{value}%" for value in emperors)
    if era:
        where.append("t.era_name like ?")
        params.append(f"%{era}%")
    if keyword:
        where.append("e.raw_text like ?")
        params.append(f"%{keyword}%")
    return where, params


def _row_dict(row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def _normalize_filter_values(value: str | Sequence[str] | None) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    return [str(item).strip() for item in value if str(item).strip()]
