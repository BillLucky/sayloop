"""Keep release scanning strict without reading anyone's personal files."""

import pytest

from scripts.privacy_check import inspect


@pytest.mark.parametrize("name", ["data/story.md", ".env.local", "voice.MP3", "bundle.tar.gz"])
def test_private_artifacts_rejected(name):
    assert inspect(name, "synthetic") == "private/generated artifact"


def test_example_configuration_allowed():
    assert inspect(".env.example", "SAYLOOP_PORT=8765") is None


def test_sensitive_text_rejected():
    assert inspect("sample.txt", "ghp_" + "x" * 30)


def test_only_reviewed_synthetic_images_allowed():
    assert inspect("docs/images/practice.jpg", "synthetic") is None
    assert inspect("docs/images/private.jpg", "synthetic") == "private/generated artifact"
