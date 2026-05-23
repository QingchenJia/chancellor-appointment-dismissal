from pathlib import Path

from fastapi.testclient import TestClient

from song_chancellors.api import DEFAULT_DB_PATH, create_app
from song_chancellors.importer import import_workbook


def test_default_database_path_points_to_project_root():
    project_root = Path(__file__).resolve().parents[1]
    assert DEFAULT_DB_PATH == project_root / "song_chancellors.db"


def test_search_events_route_returns_results(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get("/api/search/events", params={"person": "赵普"})

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["source_cell"] == "F5"


def test_search_events_route_accepts_repeated_emperor_params(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get(
        "/api/search/events",
        params=[("emperor", "太祖赵匡胤"), ("emperor", "宋高宗赵构")],
    )

    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_search_events_route_accepts_precise_year_month_boundary(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get(
        "/api/search/events",
        params={"year_to": 960, "month_to": 2},
    )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["month_label"] == "二月"


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


def test_offices_route_is_removed(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    client = TestClient(create_app(temp_db_path))

    response = client.get("/api/offices")

    assert response.status_code == 404
