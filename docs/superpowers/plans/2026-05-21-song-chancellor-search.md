# Song Chancellor Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local FastAPI + SQLite web app that imports `宋代宰辅编年录.xlsx` and lets users search Song dynasty chancellor appointment and dismissal records by time, person, office, ruler, era, event type, and keyword.

**Architecture:** A Python package `song_chancellors` owns database schema, import parsing, query services, and FastAPI routes. Static frontend files live under `web/` and call JSON APIs. Tests use pytest, temporary SQLite databases, and small synthetic workbooks for TDD.

**Tech Stack:** Python 3 in conda env `document`, `openpyxl`, FastAPI, SQLite, pytest, vanilla HTML/CSS/JS.

---

## File Structure

- Create `requirements.txt`: runtime and test dependencies for the conda environment.
- Create `.gitignore`: ignore caches, SQLite build artifacts, visual brainstorming cache, and local virtual environment files.
- Create `song_chancellors/__init__.py`: package marker.
- Create `song_chancellors/db.py`: SQLite connection, schema creation, rebuild support, row factory.
- Create `song_chancellors/models.py`: typed dictionaries/dataclasses for parsed records and search parameters.
- Create `song_chancellors/parsing.py`: month normalization, person-name splitting, event type classification, office extraction.
- Create `song_chancellors/importer.py`: read Excel via `openpyxl`, populate normalized tables, write import audit.
- Create `song_chancellors/repository.py`: SQL query functions for events, details, people, offices, facets, timeline.
- Create `song_chancellors/api.py`: FastAPI application and routes.
- Create `scripts/import_excel.py`: CLI wrapper for rebuilding/importing the SQLite database.
- Create `scripts/inspect_excel.py`: CLI for workbook statistics.
- Create `web/index.html`: app shell.
- Create `web/styles.css`: deep archive visual theme.
- Create `web/app.js`: search UI state, API calls, result table, detail panel, autocomplete.
- Create `tests/conftest.py`: temp DB and sample workbook helpers.
- Create `tests/test_parsing.py`: parser unit tests.
- Create `tests/test_importer.py`: import integration tests.
- Create `tests/test_repository.py`: query tests.
- Create `tests/test_api.py`: FastAPI route tests.

## Task 1: Project Scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `.gitignore`
- Create: `song_chancellors/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Write the dependency and test scaffold**

Create `requirements.txt`:

```txt
fastapi>=0.115
uvicorn[standard]>=0.30
openpyxl>=3.1
pytest>=8.0
httpx>=0.27
```

Create `.gitignore`:

```gitignore
__pycache__/
*.py[cod]
.pytest_cache/
.ruff_cache/
.mypy_cache/
.venv/
venv/
data/*.db
data/*.sqlite
.superpowers/
```

Create `song_chancellors/__init__.py`:

```python
"""Song dynasty chancellor appointment and dismissal search."""
```

Create `tests/conftest.py` with helpers that later tests can import:

```python
from pathlib import Path

import openpyxl
import pytest


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    return tmp_path / "song_chancellors.db"


@pytest.fixture
def sample_workbook_path(tmp_path: Path) -> Path:
    workbook_path = tmp_path / "sample.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "宋代宰辅编年录"
    ws.append([])
    ws.append(["公元", "皇帝", "年号", "月份", "范质", "赵普（赵韩王）"])
    ws.append([960, "太祖赵匡胤", "建隆元年", "正月", None, None])
    ws.append([None, None, None, "二月", "本月乙亥日，自守司徒兼门下侍郎、同中书门下平章事，依前守司徒加兼侍中", None])
    ws.append([None, None, None, "三月", "侍中、同中书门下平章事", "本月甲申日，自右谏议大夫、枢密直学士升兵部侍郎，除枢密副使"])
    ws["F5"].comment = openpyxl.comments.Comment("《长编》日期有异文。", "tester")
    wb.create_sheet("说明")
    wb.save(workbook_path)
    return workbook_path
```

- [ ] **Step 2: Run the scaffold tests**

Run:

```bash
conda run -n document python -m pytest -q
```

Expected: pytest starts successfully and reports no tests collected or passes once tests are added.

- [ ] **Step 3: Commit scaffold**

Run:

```bash
git add .gitignore requirements.txt song_chancellors tests
git commit -m "chore: scaffold project"
```

## Task 2: Parsing Utilities

**Files:**
- Create: `song_chancellors/models.py`
- Create: `song_chancellors/parsing.py`
- Test: `tests/test_parsing.py`

- [ ] **Step 1: Write failing parser tests**

Create `tests/test_parsing.py`:

```python
from song_chancellors.parsing import (
    classify_event_type,
    extract_office_fragments,
    normalize_month,
    split_person_name,
)


def test_normalize_month_handles_lunar_labels():
    assert normalize_month("正月") == 1
    assert normalize_month("闰二月") == 2
    assert normalize_month("十二月") == 12


def test_split_person_name_preserves_raw_alias():
    person = split_person_name("张旻（张耆）", "BQ")
    assert person.canonical_name == "张旻"
    assert person.aliases == "张耆"
    assert person.raw_name == "张旻（张耆）"
    assert person.source_column == "BQ"


def test_classify_event_type_distinguishes_common_actions():
    assert classify_event_type("本月除枢密副使") == "appointment"
    assert classify_event_type("本月罢签书枢密院事") == "dismissal"
    assert classify_event_type("本月，死难") == "death"
    assert classify_event_type("侍中、同中书门下平章事") == "tenure"


def test_extract_office_fragments_marks_unclear_without_action():
    fragments = extract_office_fragments("侍中、同中书门下平章事")
    assert [fragment.relation_type for fragment in fragments] == ["current", "current"]
    assert [fragment.name for fragment in fragments] == ["侍中", "同中书门下平章事"]
```

- [ ] **Step 2: Verify RED**

Run:

```bash
conda run -n document python -m pytest tests/test_parsing.py -q
```

Expected: FAIL because `song_chancellors.parsing` does not exist.

- [ ] **Step 3: Implement parsing models and utilities**

Create `song_chancellors/models.py`:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ParsedPerson:
    canonical_name: str
    raw_name: str
    aliases: str
    source_column: str


@dataclass(frozen=True)
class OfficeFragment:
    name: str
    relation_type: str
    raw_fragment: str
```

Create `song_chancellors/parsing.py`:

```python
from __future__ import annotations

import re

from .models import OfficeFragment, ParsedPerson

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


def extract_office_fragments(text: str) -> list[OfficeFragment]:
    value = str(text).strip("。；; ")
    relation = "current"
    if "自" in value:
        relation = "from"
        value = value.split("自", 1)[1]
    if "除" in value:
        before, after = value.rsplit("除", 1)
        value = after or before
        relation = "to"
    elif "罢" in value:
        before, after = value.rsplit("罢", 1)
        value = before or after
        relation = "removed"
    elif any(word in value for word in ("加", "兼", "充", "为")):
        relation = "to"

    value = re.sub(r"^本月[，,]?[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]*日?[，,]?", "", value)
    pieces = [piece.strip(" ，,。；;") for piece in re.split(r"[、，,。；;]", value)]
    ignored = {"本月", "依前", "寻召还", "不知何时罢", ""}
    return [
        OfficeFragment(name=piece, relation_type=relation, raw_fragment=piece)
        for piece in pieces
        if piece and piece not in ignored and len(piece) <= 30
    ]
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
conda run -n document python -m pytest tests/test_parsing.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit parser**

Run:

```bash
git add song_chancellors/models.py song_chancellors/parsing.py tests/test_parsing.py
git commit -m "feat: add parsing utilities"
```

## Task 3: SQLite Schema and Importer

**Files:**
- Create: `song_chancellors/db.py`
- Create: `song_chancellors/importer.py`
- Create: `scripts/import_excel.py`
- Create: `scripts/inspect_excel.py`
- Test: `tests/test_importer.py`

- [ ] **Step 1: Write failing importer tests**

Create `tests/test_importer.py`:

```python
import sqlite3

from song_chancellors.importer import import_workbook


def test_import_workbook_normalizes_people_time_events_and_comments(sample_workbook_path, temp_db_path):
    summary = import_workbook(sample_workbook_path, temp_db_path, rebuild=True)

    assert summary["person_count"] == 2
    assert summary["record_count"] == 3
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

    assert [dict(row) for row in people] == [
        {"canonical_name": "范质", "aliases": ""},
        {"canonical_name": "赵普", "aliases": "赵韩王"},
    ]
    assert events[0]["gregorian_year"] == 960
    assert events[0]["month_label"] == "二月"
    assert events[0]["source_cell"] == "E4"
    assert events[1]["event_type"] == "tenure"
    assert events[2]["source_cell"] == "F5"
    assert comment["source_cell"] == "F5"
```

- [ ] **Step 2: Verify RED**

Run:

```bash
conda run -n document python -m pytest tests/test_importer.py -q
```

Expected: FAIL because importer and schema do not exist.

- [ ] **Step 3: Implement schema and importer**

Create `song_chancellors/db.py` with `connect()`, `create_schema()`, and `rebuild_database()` functions. The schema must create `persons`, `time_points`, `appointment_events`, `offices`, `event_offices`, `annotations`, and `import_audit`.

Create `song_chancellors/importer.py` with `import_workbook(path, db_path, rebuild=False)`. It should use `openpyxl.load_workbook`, read the first sheet, map row 2 person headers from column 5 onward, inherit blank year/emperor/era values, write non-empty person cells as records, attach comments by cell coordinate, call parser functions, and return audit summary.

Create `scripts/import_excel.py`:

```python
import argparse

from song_chancellors.importer import import_workbook


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook")
    parser.add_argument("--db", default="data/song_chancellors.db")
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()
    summary = import_workbook(args.workbook, args.db, rebuild=args.rebuild)
    for key, value in summary.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
```

Create `scripts/inspect_excel.py` to print workbook sheet name, dimensions, person columns, non-empty person records, and comment count.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
conda run -n document python -m pytest tests/test_importer.py -q
```

Expected: PASS.

- [ ] **Step 5: Run real workbook import smoke test**

Run:

```bash
conda run -n document python scripts/import_excel.py 宋代宰辅编年录.xlsx --db data/song_chancellors.db --rebuild
```

Expected: summary includes approximately `person_count: 495`, `record_count: 1943`, and `comment_count: 113`.

- [ ] **Step 6: Commit importer**

Run:

```bash
git add song_chancellors/db.py song_chancellors/importer.py scripts tests/test_importer.py
git commit -m "feat: import workbook into sqlite"
```

## Task 4: Repository Queries

**Files:**
- Create: `song_chancellors/repository.py`
- Test: `tests/test_repository.py`

- [ ] **Step 1: Write failing repository tests**

Create `tests/test_repository.py`:

```python
from song_chancellors.importer import import_workbook
from song_chancellors.repository import (
    get_event_detail,
    list_facets,
    search_events,
    search_people,
)


def test_search_events_filters_by_person_and_keyword(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)

    result = search_events(temp_db_path, person="赵普", keyword="枢密副使")

    assert result["total"] == 1
    assert result["items"][0]["person_name"] == "赵普"
    assert result["items"][0]["source_cell"] == "F5"


def test_event_detail_includes_annotations_and_offices(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    event = search_events(temp_db_path, person="赵普")["items"][0]

    detail = get_event_detail(temp_db_path, event["id"])

    assert detail["annotations"][0]["comment_text"] == "《长编》日期有异文。"
    assert any(office["name"] == "枢密副使" for office in detail["offices"])


def test_people_and_facets_support_filter_ui(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)

    assert search_people(temp_db_path, q="赵")[0]["canonical_name"] == "赵普"
    facets = list_facets(temp_db_path)
    assert "太祖赵匡胤" in facets["emperors"]
    assert "建隆元年" in facets["eras"]
```

- [ ] **Step 2: Verify RED**

Run:

```bash
conda run -n document python -m pytest tests/test_repository.py -q
```

Expected: FAIL because repository functions do not exist.

- [ ] **Step 3: Implement repository functions**

Create `song_chancellors/repository.py` with:

- `search_events(db_path, year_from=None, year_to=None, month=None, person=None, office=None, event_type=None, emperor=None, era=None, keyword=None, limit=50, offset=0)`
- `get_event_detail(db_path, event_id)`
- `search_people(db_path, q="")`
- `search_offices(db_path, q="")`
- `list_facets(db_path)`
- `timeline(db_path)`

Use parameterized SQL only. Return plain dictionaries suitable for JSON serialization.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
conda run -n document python -m pytest tests/test_repository.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit repository**

Run:

```bash
git add song_chancellors/repository.py tests/test_repository.py
git commit -m "feat: add search repository"
```

## Task 5: FastAPI Application

**Files:**
- Create: `song_chancellors/api.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write failing API tests**

Create `tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from song_chancellors.api import create_app
from song_chancellors.importer import import_workbook


def test_search_events_route_returns_results(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get("/api/search/events", params={"person": "赵普"})

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["source_cell"] == "F5"


def test_event_detail_route_returns_404_for_missing_event(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get("/api/events/999")

    assert response.status_code == 404


def test_facets_route_returns_filter_options(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get("/api/facets")

    assert response.status_code == 200
    assert "太祖赵匡胤" in response.json()["emperors"]
```

- [ ] **Step 2: Verify RED**

Run:

```bash
conda run -n document python -m pytest tests/test_api.py -q
```

Expected: FAIL because `song_chancellors.api` does not exist.

- [ ] **Step 3: Implement FastAPI app**

Create `song_chancellors/api.py` with:

- `create_app(db_path="data/song_chancellors.db")`
- static file mount for `/` from `web/`
- `/api/health`
- `/api/search/events`
- `/api/events/{event_id}`
- `/api/people`
- `/api/people/{person_id}`
- `/api/offices`
- `/api/facets`
- `/api/timeline`

Routes should call repository functions and raise `HTTPException(status_code=404)` when details are missing.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
conda run -n document python -m pytest tests/test_api.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit API**

Run:

```bash
git add song_chancellors/api.py tests/test_api.py
git commit -m "feat: expose search api"
```

## Task 6: Frontend Single Page App

**Files:**
- Create: `web/index.html`
- Create: `web/styles.css`
- Create: `web/app.js`

- [ ] **Step 1: Create the app shell and deep archive theme**

Create `web/index.html` with a three-column layout: sidebar filters, center results, right detail panel.

Create `web/styles.css` using a dark archive theme: charcoal background, warm ivory text, muted gold accents, readable table spacing, non-overlapping responsive rules.

Create `web/app.js` with:

- state object for filters, pagination, selected event
- `loadFacets()`
- `searchEvents()`
- `selectEvent(id)`
- `renderResults(data)`
- `renderDetail(data)`
- CSV export

- [ ] **Step 2: Manual frontend smoke test**

Run:

```bash
conda run -n document python scripts/import_excel.py 宋代宰辅编年录.xlsx --db data/song_chancellors.db --rebuild
conda run -n document python -m uvicorn song_chancellors.api:create_app --factory --reload --port 8000
```

Expected: `http://localhost:8000` loads the UI, search by `赵普` returns results, clicking a result fills the detail panel.

- [ ] **Step 3: Commit frontend**

Run:

```bash
git add web
git commit -m "feat: add search frontend"
```

## Task 7: Final Verification and Documentation

**Files:**
- Create: `README.md`
- Modify: any files needed for clean verification.

- [ ] **Step 1: Create README**

Create `README.md` with:

- project purpose
- environment setup using conda env `document`
- dependency install command
- import command
- run command
- test command
- query capabilities

- [ ] **Step 2: Run full test suite**

Run:

```bash
conda run -n document python -m pytest -q
```

Expected: all tests PASS.

- [ ] **Step 3: Run real import**

Run:

```bash
conda run -n document python scripts/import_excel.py 宋代宰辅编年录.xlsx --db data/song_chancellors.db --rebuild
```

Expected: import completes and audit counts are close to known workbook inspection: 495 person columns, 1943 position-change records, 113 comments.

- [ ] **Step 4: Run API health check**

Run:

```bash
conda run -n document python -m uvicorn song_chancellors.api:create_app --factory --port 8000
```

Open `http://localhost:8000/api/health`.

Expected: JSON reports database loaded.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add README.md docs/superpowers
git commit -m "docs: add implementation plan"
```

## Self-Review

Spec coverage:

- Database normalization is covered by Tasks 2 and 3.
- Excel import, comments, source cells, audit counts, and warning-tolerant parsing are covered by Task 3.
- Search APIs are covered by Tasks 4 and 5.
- Three-column deep archive frontend is covered by Task 6.
- Verification and local run instructions are covered by Task 7.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified future work remains in the plan.

Type consistency:

- Parser dataclasses are defined before importer and repository tasks use them.
- Repository function names match API route usage.
- Test fixtures match importer expectations.
