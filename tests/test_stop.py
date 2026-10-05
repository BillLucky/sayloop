"""Stop reporting must reflect process state without touching real servers."""

import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import config, storage


@pytest.mark.parametrize("state,stopped", [("", True), ("Z", True), ("S", False)])
def test_stop_reports_actual_exit(tmp_path, monkeypatch, capsys, state, stopped):
    monkeypatch.setattr(config, "DATA", tmp_path)
    monkeypatch.setattr(storage, "list_jobs", lambda: [])
    (tmp_path / "server.pid").write_text("12345")
    signals = []
    monkeypatch.setattr("os.kill", lambda *args: signals.append(args))
    monkeypatch.setattr("time.sleep", lambda _: None)
    monkeypatch.setattr(
        "subprocess.run",
        lambda args, **kwargs: SimpleNamespace(
            stdout=f"{config.ROOT}/.venv/bin/python -m uvicorn app.main:app"
            if args[-1] == "command="
            else state
        ),
    )
    script = Path(__file__).resolve().parents[1] / "scripts" / "stop.py"
    if stopped:
        runpy.run_path(str(script))
        assert "Stopped Sayloop" in capsys.readouterr().out
    else:
        with pytest.raises(SystemExit, match="still running"):
            runpy.run_path(str(script))
        assert "Stopped Sayloop" not in capsys.readouterr().out
    assert len(signals) == 1
