import openpyxl

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
    assert tenure_result["total"] == 0
    assert tenure_result["items"] == []


def test_event_detail_includes_annotations_without_office_parsing(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)
    event = search_events(temp_db_path, person="赵普")["items"][0]

    detail = get_event_detail(temp_db_path, event["id"])

    assert detail["annotations"][0]["comment_text"] == "《长编》日期有异文。"
    assert "offices" not in detail


def test_people_and_facets_support_filter_ui(sample_workbook_path, temp_db_path):
    import_workbook(sample_workbook_path, temp_db_path, rebuild=True)

    assert search_people(temp_db_path, q="赵")[0]["canonical_name"] == "赵普"
    facets = list_facets(temp_db_path)
    assert "太祖赵匡胤" in facets["emperors"]
    assert "建隆元年" in facets["eras"]


def test_search_events_accepts_multiple_emperors_for_dynasty_quick_filters(tmp_path, temp_db_path):
    workbook_path = tmp_path / "dynasty.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([])
    ws.append(["公元", "皇帝", "年号", "月份", "宰执"])
    ws.append([960, "太祖赵匡胤", "建隆元年", "正月", "太祖朝除官"])
    ws.append([1126, "钦宗赵桓", "靖康元年", "正月", "钦宗朝除官"])
    ws.append([1127, "高宗赵构", "建炎元年", "五月", "高宗朝除官"])
    wb.save(workbook_path)
    import_workbook(workbook_path, temp_db_path, rebuild=True)

    result = search_events(temp_db_path, emperor=["太祖赵匡胤", "钦宗赵桓"])

    assert result["total"] == 2
    assert {item["emperor"] for item in result["items"]} == {"太祖赵匡胤", "钦宗赵桓"}


def test_search_events_filters_by_precise_year_month_boundaries(tmp_path, temp_db_path):
    workbook_path = tmp_path / "boundary.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([])
    ws.append(["公元", "皇帝", "年号", "月份", "宰执"])
    ws.append([1127, "钦宗赵桓", "靖康二年", "四月", "四月除官"])
    ws.append([None, "高宗赵构", "建炎元年", "五月", "五月除官"])
    wb.save(workbook_path)
    import_workbook(workbook_path, temp_db_path, rebuild=True)

    north = search_events(temp_db_path, year_to=1127, month_to=4)
    south = search_events(temp_db_path, year_from=1127, month_from=5)

    assert [item["month_label"] for item in north["items"]] == ["四月"]
    assert [item["month_label"] for item in south["items"]] == ["五月"]
