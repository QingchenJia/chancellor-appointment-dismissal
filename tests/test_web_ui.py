from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_page_uses_two_column_workbench_and_filter_groups():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")

    assert 'class="workspace"' in html
    assert html.count('class="filter-section"') == 3
    assert 'id="toggleFilters"' in html
    assert 'id="filterSummary"' in html
    assert 'id="resultsStatus"' in html


def test_detail_drawer_has_accessible_dialog_controls():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")

    assert 'id="detailDrawer"' in html
    assert 'role="dialog"' in html
    assert 'aria-modal="true"' in html
    assert 'aria-labelledby="detailTitle"' in html
    assert 'id="closeDetail"' in html
    assert 'id="detailBackdrop"' in html


def test_scripts_load_as_modules_after_the_document_markup():
    html = (ROOT / "web" / "index.html").read_text(encoding="utf-8")

    assert '<script type="module" src="/static/app.js"></script>' in html
