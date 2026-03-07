import pytest
from httpx import AsyncClient, ASGITransport

from app.database import Database


@pytest.fixture
async def app(tmp_path):
    from app.main import create_app
    application = create_app(db_path=str(tmp_path / "test.db"), testing=True)
    db = Database(str(tmp_path / "test.db"))
    await db.init()
    application.state.db = db
    yield application
    await db.close()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_list_jobs_empty(client):
    resp = await client.get("/api/jobs")
    assert resp.status_code == 200
    assert resp.json()["jobs"] == []


@pytest.mark.asyncio
async def test_get_stats(client):
    resp = await client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_jobs" in data
    assert "total_scored" in data
    assert "total_applied" in data


@pytest.mark.asyncio
async def test_get_job_not_found(client):
    resp = await client.get("/api/jobs/999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_trigger_scrape(client):
    resp = await client.post("/api/scrape")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dismiss_job_not_found(client):
    resp = await client.post("/api/jobs/999/dismiss")
    assert resp.status_code in [200, 404]
