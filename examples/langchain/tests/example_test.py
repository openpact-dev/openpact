"""
Pytest exercising the Python loader against a real daemon. The Node-side
smoke.test.ts boots the daemon, sets OPENPACT_URL in the env, then
invokes pytest as a subprocess.
"""
from __future__ import annotations

import hashlib
import os
import sys
import time
from pathlib import Path

import pytest

# Make sibling openpact_tools.py importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from openpact_tools import OpenPactClient, OpenPactError  # noqa: E402


@pytest.fixture
def client() -> OpenPactClient:
    base = os.environ.get("OPENPACT_URL")
    assert base, "OPENPACT_URL must be set by the test harness"
    return OpenPactClient(base_url=base)


def wait_for(predicate, timeout: float = 3.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError("waitFor timeout")


def test_ping(client: OpenPactClient) -> None:
    assert client.call("ping") == {"ok": True}


def test_record_then_recall(client: OpenPactClient) -> None:
    created = client.call(
        "record_knowledge", topic="pytest", content="from python", confidence=0.7
    )
    assert created["id"]

    listed: list = []

    def has_entry() -> bool:
        nonlocal listed
        page = client.call("recall_knowledge", topic="pytest", limit=10)
        listed = page["entries"]
        return any(e["payload"]["content"] == "from python" for e in listed)

    wait_for(has_entry)


def test_task_lifecycle(client: OpenPactClient) -> None:
    created = client.call("create_task", title="pytest-task")
    task_id = created["id"]
    wait_for(
        lambda: any(
            t["id"] == task_id
            for t in client.call("list_tasks", status="open")["entries"]
        )
    )
    claimed = client.call("claim_task", id=task_id)
    assert claimed["task"]["status"] == "claimed"
    completed = client.call("complete_task", id=task_id, result="shipped")
    assert completed["task"]["status"] == "complete"
    assert completed["task"]["result"] == "shipped"


def test_lost_claim_race_raises(client: OpenPactClient) -> None:
    created = client.call("create_task", title="race")
    task_id = created["id"]
    wait_for(
        lambda: any(
            t["id"] == task_id
            for t in client.call("list_tasks", status="open")["entries"]
        )
    )
    client.call("claim_task", id=task_id)
    with pytest.raises(OpenPactError) as exc_info:
        client.call("claim_task", id=task_id)
    assert exc_info.value.code == "TASK_NOT_OPEN"


def test_skill_checksum_matters(client: OpenPactClient) -> None:
    content = "verified content"
    checksum = "sha256:" + hashlib.sha256(content.encode()).hexdigest()
    created = client.call(
        "share_skill",
        name="from-python",
        version="1.0.0",
        format="generic",
        content=content,
        checksum=checksum,
    )
    assert created["id"]

    # Wrong checksum is rejected.
    with pytest.raises(OpenPactError) as exc_info:
        client.call(
            "share_skill",
            name="bad",
            version="1.0.0",
            format="generic",
            content=content,
            checksum="sha256:" + "0" * 64,
        )
    assert exc_info.value.code == "SKILL_CHECKSUM_MISMATCH"
