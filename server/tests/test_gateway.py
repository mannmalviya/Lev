import pytest
from fastapi.testclient import TestClient

from gateway.app import create_app
from gateway.backends.fake import FakeBackend

FLAPPY_Q = {
    "type": "choice",
    "instructions": "What should the bird do now?",
    "criteria": {"flap": "Jump up", "wait": "Do nothing and fall"},
}
AUTH = {"Authorization": "Bearer test-token"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SYSTEM1_API_KEY", "test-token")
    monkeypatch.setenv("FAKE_DELAY_MS", "0")
    monkeypatch.setenv("RATE_LIMIT_RPS", "1000")
    return TestClient(create_app({"fake": FakeBackend()}))


def post(client, body, headers=AUTH):
    return client.post("/v1/systemone", json=body, headers=headers)


def test_choice_answer_shape(client):
    r = post(client, {"model": "fake", "state": "bird_y=120", "questions": {"action": FLAPPY_Q}})
    assert r.status_code == 200
    data = r.json()
    a = data["answers"]["action"]
    assert set(data["answers"]) == {"action"}
    assert set(a["probabilities"]) == {"flap", "wait"}
    assert abs(sum(a["probabilities"].values()) - 1) < 1e-4
    assert a["choice"] == max(a["probabilities"], key=a["probabilities"].get)
    assert a["confidence"] == a["probabilities"][a["choice"]]
    assert data["usage"]["output_tokens"] == 0
    assert data["latency_ms"] >= 0 and data["backend"] == "fake"


def test_noul_and_score(client):
    qs = {
        "danger": {"type": "noul", "instructions": "Is the bird about to hit a pipe?"},
        "risk": {"type": "score", "instructions": "How dangerous?", "criteria": ["Safe", "Risky", "About to die"]},
    }
    a = post(client, {"model": "fake", "state": {"bird_y": 120}, "questions": qs}).json()["answers"]
    assert 0 <= a["danger"]["noul"] <= 1
    assert a["risk"]["legend"] == {"0": "Safe", "1": "Risky", "2": "About to die"}
    assert 0 <= a["risk"]["score"] <= 2
    assert abs(sum(a["risk"]["probabilities"].values()) - 1) < 1e-4


def test_auth(client):
    r = post(client, {"model": "fake", "state": "x", "questions": {"action": FLAPPY_Q}}, headers={})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_unknown_model(client):
    r = post(client, {"model": "nope", "state": "x", "questions": {"action": FLAPPY_Q}})
    assert r.status_code == 404 and r.json()["error"]["code"] == "unknown_model"


@pytest.mark.parametrize(
    "body",
    [
        {"model": "fake", "state": "x", "questions": {}},
        {"model": "fake", "state": "x", "questions": {"a": {"type": "choice", "instructions": "?", "criteria": {"only": "one"}}}},
        {"model": "fake", "state": "x", "questions": {"a": {"type": "score", "instructions": "?", "criteria": {"a": 1}}}},
        {"model": "fake", "questions": {"action": FLAPPY_Q}},
    ],
)
def test_invalid_requests(client, body):
    r = post(client, body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_request"


def test_state_too_long(client):
    r = post(client, {"model": "fake", "state": "x" * 20_000, "questions": {"action": FLAPPY_Q}})
    assert r.status_code == 413


def test_models_and_health(client):
    assert client.get("/health").json() == {"ok": True}
    ids = [m["id"] for m in client.get("/v1/models", headers=AUTH).json()["models"]]
    assert ids == ["fake"]


def test_cors_preflight(client):
    r = client.options(
        "/v1/systemone",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"},
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_rate_limit(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_RPS", "1")
    monkeypatch.setenv("SYSTEM1_API_KEY", "")
    c = TestClient(create_app({"fake": FakeBackend()}))
    codes = [c.get("/v1/models").status_code for _ in range(5)]
    assert codes[:2] == [200, 200] and 429 in codes


def test_kill_switch(client, monkeypatch):
    monkeypatch.setenv("GATEWAY_DISABLED", "1")
    assert post(client, {"model": "fake", "state": "x", "questions": {"action": FLAPPY_Q}}).status_code == 503
