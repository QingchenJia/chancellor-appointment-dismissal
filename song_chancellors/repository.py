from __future__ import annotations

from pathlib import Path
from typing import Any

from .db import connect


def search_events(
    db_path: str | Path,
    year_from: int | None = None,
    year_to: int | None = None,
    month: int | str | None = None,
    person: str | None = None,
    office: str | None = None,
    event_type: str | None = None,
    emperor: str | None = None,
    era: str | None = None,
    keyword: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    where, params = _event_filters(year_from, year_to, month, person, office, event_type, emperor, era, keyword)
    joins = _event_joins(office)
    where_sql = f"where {' and '.join(where)}" if where else ""

    conn = connect(db_path)
    total = conn.execute(
        f"""
        select count(distinct e.id)
        from appointment_events e
        join persons p on p.id = e.person_id
        join time_points t on t.id = e.time_point_id
        {joins}
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
            e.source_cell,
            coalesce(group_concat(distinct o.name), '') as office_summary
        from appointment_events e
        join persons p on p.id = e.person_id
        join time_points t on t.id = e.time_point_id
        left join event_offices eo_all on eo_all.event_id = e.id
        left join offices o on o.id = eo_all.office_id
        {joins}
        {where_sql}
        group by e.id
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
    offices = conn.execute(
        """
        select o.id, o.name, eo.relation_type, eo.raw_fragment
        from event_offices eo
        join offices o on o.id = eo.office_id
        where eo.event_id = ?
        order by eo.id
        """,
        (event_id,),
    ).fetchall()
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
    detail["offices"] = [_row_dict(row) for row in offices]
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
    offices = conn.execute(
        """
        select distinct o.id, o.name
        from event_offices eo
        join offices o on o.id = eo.office_id
        join appointment_events e on e.id = eo.event_id
        where e.person_id = ?
        order by o.name
        """,
        (person_id,),
    ).fetchall()
    conn.close()
    result = _row_dict(person)
    result["events"] = [_row_dict(row) for row in events]
    result["offices"] = [_row_dict(row) for row in offices]
    return result


def search_offices(db_path: str | Path, q: str = "") -> list[dict[str, Any]]:
    conn = connect(db_path)
    pattern = f"%{q}%"
    rows = conn.execute(
        """
        select o.id, o.name, count(eo.event_id) as event_count
        from offices o
        left join event_offices eo on eo.office_id = o.id
        where ? = '' or o.name like ?
        group by o.id
        order by event_count desc, o.name
        limit 30
        """,
        (q, pattern),
    ).fetchall()
    conn.close()
    return [_row_dict(row) for row in rows]


def list_facets(db_path: str | Path) -> dict[str, Any]:
    conn = connect(db_path)
    emperors = [row[0] for row in conn.execute("select distinct emperor from time_points where emperor is not null order by source_row")]
    eras = [row[0] for row in conn.execute("select distinct era_name from time_points where era_name is not null order by source_row")]
    years = conn.execute("select min(gregorian_year), max(gregorian_year) from time_points").fetchone()
    conn.close()
    return {
        "emperors": emperors,
        "eras": eras,
        "event_types": ["appointment", "dismissal", "death", "tenure"],
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


def _event_joins(office: str | None) -> str:
    if not office:
        return ""
    return """
        join event_offices eo_filter on eo_filter.event_id = e.id
        join offices o_filter on o_filter.id = eo_filter.office_id
    """


def _event_filters(
    year_from: int | None,
    year_to: int | None,
    month: int | str | None,
    person: str | None,
    office: str | None,
    event_type: str | None,
    emperor: str | None,
    era: str | None,
    keyword: str | None,
) -> tuple[list[str], list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if year_from is not None:
        where.append("t.gregorian_year >= ?")
        params.append(year_from)
    if year_to is not None:
        where.append("t.gregorian_year <= ?")
        params.append(year_to)
    if month not in (None, ""):
        where.append("(t.month_index = ? or t.month_label = ?)")
        params.extend([month, str(month)])
    if person:
        where.append("(p.canonical_name like ? or p.raw_name like ? or p.aliases like ?)")
        pattern = f"%{person}%"
        params.extend([pattern, pattern, pattern])
    if office:
        where.append("o_filter.name like ?")
        params.append(f"%{office}%")
    if event_type:
        where.append("e.event_type = ?")
        params.append(event_type)
    if emperor:
        where.append("t.emperor like ?")
        params.append(f"%{emperor}%")
    if era:
        where.append("t.era_name like ?")
        params.append(f"%{era}%")
    if keyword:
        where.append("e.raw_text like ?")
        params.append(f"%{keyword}%")
    return where, params


def _row_dict(row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}
