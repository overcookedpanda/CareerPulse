import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import Database


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_path = app.state.db_path
    os.makedirs(os.path.dirname(db_path) or "data", exist_ok=True)
    app.state.db = Database(db_path)
    await app.state.db.init()
    yield
    await app.state.db.close()


def create_app(db_path: str = "data/jobfinder.db", testing: bool = False) -> FastAPI:
    app = FastAPI(title="JobFinder", lifespan=lifespan)
    app.state.db_path = db_path

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/jobs")
    async def list_jobs(
        sort: str = Query("score"),
        limit: int = Query(50),
        offset: int = Query(0),
        min_score: int | None = Query(None),
        search: str | None = Query(None),
        source: str | None = Query(None),
    ):
        jobs = await app.state.db.list_jobs(
            sort_by=sort, limit=limit, offset=offset,
            min_score=min_score, search=search, source=source,
        )
        return {"jobs": jobs}

    @app.get("/api/jobs/{job_id}")
    async def get_job(job_id: int):
        job = await app.state.db.get_job(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        score = await app.state.db.get_score(job_id)
        sources = await app.state.db.get_sources(job_id)
        application = await app.state.db.get_application(job_id)
        return {**job, "score": score, "sources": sources, "application": application}

    @app.post("/api/jobs/{job_id}/dismiss")
    async def dismiss_job(job_id: int):
        await app.state.db.dismiss_job(job_id)
        return {"ok": True}

    @app.post("/api/jobs/{job_id}/prepare")
    async def prepare_application(job_id: int):
        job = await app.state.db.get_job(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        return {"job_id": job_id, "status": "not_implemented_yet"}

    @app.post("/api/jobs/{job_id}/application")
    async def update_application(job_id: int, status: str = Query(...), notes: str = Query("")):
        app_row = await app.state.db.get_application(job_id)
        if not app_row:
            await app.state.db.insert_application(job_id, status)
        else:
            await app.state.db.update_application(app_row["id"], status=status, notes=notes)
        return {"ok": True}

    @app.get("/api/stats")
    async def get_stats():
        return await app.state.db.get_stats()

    @app.post("/api/scrape")
    async def trigger_scrape():
        return {"status": "triggered"}

    if not testing:
        static_dir = os.path.join(os.path.dirname(__file__), "static")
        if os.path.exists(static_dir):
            app.mount("/static", StaticFiles(directory=static_dir), name="static")

            @app.get("/")
            async def index():
                return FileResponse(os.path.join(static_dir, "index.html"))

    return app
