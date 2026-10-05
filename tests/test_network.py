import json

import pytest

from app import network


def test_network_defaults_and_private_config(tmp_path, monkeypatch):
    monkeypatch.setattr(network, "DATA", tmp_path)
    monkeypatch.delenv("SAYLOOP_ALLOWED_HOSTS", raising=False)
    assert network.settings()["allowed_hosts"] == ["localhost", "127.0.0.1", "testserver"]
    (tmp_path / "network.json").write_text(
        json.dumps({"allowed_hosts": ["phone.example.test"], "lan_ip": "192.168.1.2"})
    )
    assert "phone.example.test" in network.settings()["allowed_hosts"]
    assert "192.168.1.2" in network.settings()["allowed_hosts"]


@pytest.mark.parametrize("host", ["*", "https://example.test", "example.test:443", "a..b"])
def test_reject_broad_or_invalid_hosts(tmp_path, monkeypatch, host):
    monkeypatch.setattr(network, "DATA", tmp_path)
    monkeypatch.setenv("SAYLOOP_ALLOWED_HOSTS", host)
    with pytest.raises(ValueError):
        network.settings()


def test_lan_rejects_public_address(tmp_path, monkeypatch):
    monkeypatch.setattr(network, "DATA", tmp_path)
    (tmp_path / "network.json").write_text('{"lan_ip": "203.0.113.1"}')
    with pytest.raises(ValueError):
        network.settings()


@pytest.mark.parametrize(
    "config",
    [
        {"AllowFunnel": {"example.test:443": True}},
        {"TCP": {"443": {"TCPForward": "localhost:22"}}},
        {"Web": {"example.test:443": {"Handlers": {"/": {"Proxy": "http://localhost:8000"}}}}},
    ],
)
def test_serve_preserves_existing_routes(config):
    from scripts.network import check_serve_config

    with pytest.raises(ValueError):
        check_serve_config(config, "http://127.0.0.1:8765")


def test_serve_configuration_is_repeatable():
    from scripts.network import check_serve_config

    target = "http://127.0.0.1:8765"
    check_serve_config({}, target)
    check_serve_config(
        {
            "TCP": {"443": {"HTTPS": True}},
            "Web": {"example.test:443": {"Handlers": {"/": {"Proxy": target}}}},
        },
        target,
    )
