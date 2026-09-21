"""Fixtures shared by the GitLab project tests."""

import pytest
from gitlab_common import project_import


@pytest.fixture(autouse=True)
def _no_poll_delay(monkeypatch):
    """Keep the import poll loop instant; the wait itself is not under test."""
    monkeypatch.setattr(project_import, "IMPORT_POLL_SECONDS", 0)
