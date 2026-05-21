from __future__ import annotations

import sqlite3
from pathlib import Path


def connect(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("pragma foreign_keys = on")
    return conn


def rebuild_database(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    if path.exists():
        path.unlink()
    conn = connect(path)
    create_schema(conn)
    return conn


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        create table if not exists persons (
            id integer primary key,
            canonical_name text not null,
            raw_name text not null,
            aliases text not null default '',
            source_column text not null unique
        );

        create table if not exists time_points (
            id integer primary key,
            gregorian_year integer,
            month_index integer,
            month_label text,
            emperor text,
            era_name text,
            source_row integer not null unique
        );

        create table if not exists appointment_events (
            id integer primary key,
            person_id integer not null references persons(id),
            time_point_id integer not null references time_points(id),
            event_type text not null,
            raw_text text not null,
            source_cell text not null unique,
            is_event_text integer not null,
            is_tenure_state integer not null,
            parse_confidence real not null default 0.5
        );

        create table if not exists annotations (
            id integer primary key,
            event_id integer references appointment_events(id),
            source_cell text not null,
            comment_text text not null
        );

        create table if not exists import_audit (
            id integer primary key,
            source_file text not null,
            imported_at text not null default current_timestamp,
            row_count integer not null,
            column_count integer not null,
            person_count integer not null,
            record_count integer not null,
            comment_count integer not null,
            warning_count integer not null
        );

        create index if not exists idx_events_person on appointment_events(person_id);
        create index if not exists idx_events_time on appointment_events(time_point_id);
        create index if not exists idx_events_type on appointment_events(event_type);
        create index if not exists idx_time_year_month on time_points(gregorian_year, month_index);
        """
    )
    conn.commit()
