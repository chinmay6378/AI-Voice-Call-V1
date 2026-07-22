"""
Integration-style tests for the call lifecycle.

Run:
    cd backend
    pytest tests/ -v

These tests use an in-memory SQLite database and mock all external services
(LiveKit) so they can run without credentials.
"""
from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from database.models.call import CallStatus


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(autouse=True)
def _set_env(monkeypatch):
    """Minimal env vars so Settings doesn't raise on import."""
    env_vars = {
        "LIVEKIT_URL": "wss://test.livekit.cloud",
        "LIVEKIT_API_KEY": "test-key",
        "LIVEKIT_API_SECRET": "test-secret",
        "DEEPGRAM_API_KEY": "test-deepgram",
        "GROQ_API_KEY": "test-groq",
        "ELEVENLABS_API_KEY": "test-eleven",
        "LIVEKIT_SIP_TRUNK_ID": "ST_test1234",
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        "APP_BASE_URL": "http://testserver",
        "AUTO_START_AGENT": "false",
    }
    for k, v in env_vars.items():
        monkeypatch.setenv(k, v)


@pytest.fixture()
async def app(_set_env):
    """Create the FastAPI app with a fresh in-memory DB and mocked externals."""
    # Clear settings cache so env vars take effect
    from config.settings import get_settings
    get_settings.cache_clear()

    with (
        patch(
            "services.livekit.room_manager.LiveKitRoomManager.create_room",
            new_callable=AsyncMock,
            return_value="call-test1234",
        ),
        patch(
            "services.livekit.room_manager.LiveKitRoomManager.dispatch_agent",
            new_callable=AsyncMock,
            return_value="dispatch-abc",
        ),
        patch(
            "services.livekit.room_manager.LiveKitRoomManager.delete_room",
            new_callable=AsyncMock,
        ),
        patch(
            "services.livekit.room_manager.LiveKitRoomManager.remove_participant",
            new_callable=AsyncMock,
        ),
    ):
        from main import app as fastapi_app, lifespan
        from database.repository import init_db, close_db

        await init_db("sqlite+aiosqlite:///:memory:")
        yield fastapi_app
        await close_db()


@pytest.fixture()
def client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.anyio
async def test_health(client):
    async with client as c:
        resp = await c.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.anyio
async def test_start_call_success(client):
    async with client as c:
        resp = await c.post(
            "/call/start",
            json={"customer_name": "John Doe", "phone_number": "+15551234567"},
        )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert "call_id" in data
    assert data["status"] == CallStatus.DIALING


@pytest.mark.anyio
async def test_start_call_invalid_phone(client):
    async with client as c:
        resp = await c.post(
            "/call/start",
            json={"customer_name": "Jane", "phone_number": "not-a-number"},
        )
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_get_call_status(client):
    async with client as c:
        start = await c.post(
            "/call/start",
            json={"customer_name": "Alice", "phone_number": "+15559876543"},
        )
        call_id = start.json()["call_id"]
        resp = await c.get(f"/call/status/{call_id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["call_id"] == call_id
    assert data["customer_name"] == "Alice"
    assert data["phone_number"] == "+15559876543"


@pytest.mark.anyio
async def test_get_transcript_empty(client):
    async with client as c:
        start = await c.post(
            "/call/start",
            json={"customer_name": "Bob", "phone_number": "+15550001111"},
        )
        call_id = start.json()["call_id"]
        resp = await c.get(f"/call/transcript/{call_id}")

    assert resp.status_code == 200
    assert resp.json()["transcript"] == []


@pytest.mark.anyio
async def test_one_active_call_limit(client):
    async with client as c:
        r1 = await c.post(
            "/call/start",
            json={"customer_name": "Alice", "phone_number": "+15551000001"},
        )
        assert r1.status_code == 201

        r2 = await c.post(
            "/call/start",
            json={"customer_name": "Bob", "phone_number": "+15551000002"},
        )
        assert r2.status_code == 409


@pytest.mark.anyio
async def test_end_call(client):
    async with client as c:
        start = await c.post(
            "/call/start",
            json={"customer_name": "Charlie", "phone_number": "+15551000003"},
        )
        call_id = start.json()["call_id"]
        end = await c.post(f"/call/end/{call_id}", json={"reason": "test"})

    assert end.status_code == 200
    assert end.json()["status"] == CallStatus.CANCELLED


@pytest.mark.anyio
async def test_404_on_unknown_call(client):
    async with client as c:
        resp = await c.get("/call/status/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_call_logs_populated(client):
    async with client as c:
        start = await c.post(
            "/call/start",
            json={"customer_name": "Grace", "phone_number": "+15551000007"},
        )
        call_id = start.json()["call_id"]
        resp = await c.get(f"/call/logs/{call_id}")

    assert resp.status_code == 200
    logs = resp.json()["logs"]
    assert len(logs) >= 1
    assert any(log["event"] == "call.created" for log in logs)
