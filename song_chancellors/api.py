from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import repository


def create_app(db_path: str | Path = "data/song_chancellors.db") -> FastAPI:
    app = FastAPI(title="Song Chancellor Search")
    database = Path(db_path)

    @app.get("/api/health")
    def health():
        return {"database": str(database), "loaded": database.exists()}

    @app.get("/api/search/events")
    def search_events(
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
    ):
        _require_database(database)
        return repository.search_events(
            database,
            year_from=year_from,
            year_to=year_to,
            month=month,
            person=person,
            office=office,
            event_type=event_type,
            emperor=emperor,
            era=era,
            keyword=keyword,
            limit=limit,
            offset=offset,
        )

    @app.get("/api/events/{event_id}")
    def event_detail(event_id: int):
        _require_database(database)
        detail = repository.get_event_detail(database, event_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Event not found")
        return detail

    @app.get("/api/people")
    def people(q: str = ""):
        _require_database(database)
        return repository.search_people(database, q=q)

    @app.get("/api/people/{person_id}")
    def person_detail(person_id: int):
        _require_database(database)
        detail = repository.get_person_detail(database, person_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Person not found")
        return detail

    @app.get("/api/offices")
    def offices(q: str = ""):
        _require_database(database)
        return repository.search_offices(database, q=q)

    @app.get("/api/facets")
    def facets():
        _require_database(database)
        return repository.list_facets(database)

    @app.get("/api/timeline")
    def timeline():
        _require_database(database)
        return repository.timeline(database)

    web_dir = Path(__file__).resolve().parents[1] / "web"
    if web_dir.exists():
        app.mount("/static", StaticFiles(directory=web_dir), name="static")

        @app.get("/")
        def index():
            return FileResponse(web_dir / "index.html")

    return app


def _require_database(db_path: Path) -> None:
    if not db_path.exists():
        raise HTTPException(status_code=503, detail="Database not found. Run scripts/import_excel.py first.")
