import sqlite3
import subprocess
import sys

from song_chancellors.importer import import_workbook


def test_import_workbook_normalizes_people_time_events_and_comments(sample_workbook_path, temp_db_path):
    summary = import_workbook(sample_workbook_path, temp_db_path, rebuild=True)

    assert summary["person_count"] == 2
    assert summary["record_count"] == 2
    assert summary["comment_count"] == 1

    conn = sqlite3.connect(temp_db_path)
    conn.row_factory = sqlite3.Row
    people = conn.execute("select canonical_name, aliases from persons order by id").fetchall()
    events = conn.execute(
        """
        select p.canonical_name, t.gregorian_year, t.month_label, e.event_type, e.source_cell, e.raw_text
        from appointment_events e
        join persons p on p.id = e.person_id
        join time_points t on t.id = e.time_point_id
        order by e.id
        """
    ).fetchall()
    comment = conn.execute("select source_cell, comment_text from annotations").fetchone()
    office_tables = conn.execute(
        """
        select name
        from sqlite_master
        where type = 'table' and name in ('offices', 'event_offices')
        """
    ).fetchall()
    conn.close()

    assert [dict(row) for row in people] == [
        {"canonical_name": "范质", "aliases": ""},
        {"canonical_name": "赵普", "aliases": "赵韩王"},
    ]
    assert events[0]["gregorian_year"] == 960
    assert events[0]["month_label"] == "二月"
    assert events[0]["source_cell"] == "E4"
    assert len(events) == 2
    assert {event["event_type"] for event in events} == {"appointment"}
    assert events[1]["source_cell"] == "F5"
    assert comment["source_cell"] == "F5"
    assert office_tables == []


def test_import_excel_script_runs_from_project_root(sample_workbook_path, temp_db_path):
    result = subprocess.run(
        [
            sys.executable,
            "scripts/import_excel.py",
            str(sample_workbook_path),
            "--db",
            str(temp_db_path),
            "--rebuild",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "person_count: 2" in result.stdout
    assert "record_count: 2" in result.stdout
