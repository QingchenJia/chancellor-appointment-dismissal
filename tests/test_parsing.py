from song_chancellors.parsing import (
    classify_event_type,
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
