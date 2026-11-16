import os
import tempfile

# Test data must never mix with the personal library.
os.environ["LLH_DATA_DIR"] = tempfile.mkdtemp(prefix="llh-tests-")

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import config, jobs, main

    for module in [config, storage, main, jobs]:
        monkeypatch.setattr(module, "DATA", tmp_path)
    with TestClient(app) as client:
        from app import accounts

        with accounts.database() as db:
            db.execute(
                "UPDATE users SET password=? WHERE username='owner'",
                (accounts.password_hash("test-password-only"),),
            )
        assert (
            client.post(
                "/api/auth/login", json={"username": "owner", "password": "test-password-only"}
            ).status_code
            == 200
        )
        yield client
