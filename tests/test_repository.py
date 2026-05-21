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


def test_search_events_excludes_tenure_records_by_default(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)

    default_result = search_events(temp_db_path, person="范质")
    tenure_result = search_events(temp_db_path, person="范质", event_type="tenure")

    assert default_result["total"] == 1
    assert default_result["items"][0]["event_type"] == "appointment"
    assert tenure_result["total"] == 1
    assert tenure_result["items"][0]["event_type"] == "tenure"


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
