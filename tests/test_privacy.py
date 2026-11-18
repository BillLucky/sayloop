"""Keep release scanning strict without reading anyone's personal files."""

import pytest

from scripts.privacy_check import REVIEWED_IMAGE_BLOBS, inspect


@pytest.mark.parametrize(
    "name",
    [
        "data/story.md",
        ".env.local",
        "voice.MP3",
        "bundle.tar.gz",
        "accounts.sqlite3",
        "OWNER_LOGIN.txt",
        "llm.json",
        "network.json",
        "docs/private/feedback.md",
        "capture.har",
        "personal.key",
    ],
)
def test_private_artifacts_rejected(name):
    assert inspect(name, "synthetic") == "private/generated artifact"


def test_example_configuration_allowed():
    assert inspect(".env.example", "SAYLOOP_PORT=8765") is None


def test_sensitive_text_rejected():
    assert inspect("sample.txt", "ghp_" + "x" * 30)


def test_only_reviewed_synthetic_images_allowed():
    path = "docs/images/practice.jpg"
    blob = next(iter(REVIEWED_IMAGE_BLOBS[path]))
    assert inspect(path, "synthetic", blob) is None
    assert inspect(path, "changed image", "unreviewed")
    assert inspect("docs/images/private.jpg", "synthetic") == "private/generated artifact"


def test_private_tailnet_hostname_rejected():
    domain = "workstation." + "tail-example." + "ts.net"
    assert inspect("README.md", domain)
    assert inspect("README.md", "https://YOUR_TAILSCALE_HOST/#practice") is None


@pytest.mark.parametrize(
    "address",
    [
        ".".join(["192", "168", "99", "20"]),
        ".".join(["100", "96", "10", "30"]),
        ".".join(["10", "8", "4", "6"]),
        ".".join(["172", "25", "4", "6"]),
        ":".join(["fd7a", "115c", "a1e0", "", "1234"]),
    ],
)
def test_private_networks_blocked_without_printing_the_address(address):
    issue = inspect("README.md", f"Access {address}")
    assert issue == "private LAN, tailnet, or IPv6 address"
    assert address not in issue


def test_only_exact_protocol_constants_and_documentation_addresses_allowed():
    assert inspect("app/network.py", 'network = "100.64.0.0/10"') is None
    assert inspect("README.md", "http://203.0.113.20/ http://127.0.0.1:8765/") is None
    assert inspect("README.md", "https://" + "private-computer" + ".local/")
    assert inspect("tests/fixture.py", 'filename = ".env.local"') is None


def test_historical_fixture_exemption_cannot_allow_a_modified_blob():
    blob = "8c9e9a34c6b1ca68e3fe3e911f8c1971bcac3313"
    text = ".".join(["100", "64", "0", "1"])
    assert inspect("tests/test_network.py", text, blob) is None
    assert inspect("tests/test_network.py", text, "new-revision")


def test_fine_grained_token_rejected():
    assert inspect("notes.md", "github_" + "pat_" + "x" * 30)
