"""Tests for the repository import wait (gitlab_common/project_import.py)."""

from unittest.mock import MagicMock

import pytest
from gitlab_common import project_import
from gitlab_common.project_import import (
    IMPORT_NOT_SCHEDULED,
    await_import,
    import_state,
)

PROJECT_ID = 42


def _project(import_status, import_error=""):
    """A project mock reporting *import_status*."""
    project = MagicMock()
    project.id = PROJECT_ID
    project.import_status = import_status
    project.import_error = import_error
    return project


@pytest.mark.parametrize(
    "status,expected",
    [("finished", ""), ("scheduled", None), ("started", None)],
)
def test_import_state_reads_the_status(status, expected):
    """A finished import is ready, a running one is neither ready nor failed."""
    assert import_state(_project(status)) == expected


def test_import_state_reports_a_failed_import_with_gitlabs_detail():
    """GitLab's own reason is what an admin needs, so it is passed through."""
    state = import_state(_project("failed", "could not reach the template URL"))
    assert "could not reach the template URL" in state


def test_import_state_reports_a_failed_import_without_detail():
    """A failure GitLab gives no reason for still reads as a failure."""
    assert "no detail reported" in import_state(_project("failed"))


def test_import_state_treats_an_unscheduled_import_as_an_error():
    """Every project polled here was created with an import_url, so status
    'none' means the import never started, the usual cause being a disabled
    import source. Reporting it as ready would blame the branch name."""
    assert import_state(_project("none")) == IMPORT_NOT_SCHEDULED
    assert "Repository by URL" in IMPORT_NOT_SCHEDULED


def test_await_import_polls_until_the_import_finishes():
    """The status only changes server side, so the project is re fetched."""
    gl = MagicMock()
    statuses = iter(["started", "started", "finished"])
    gl.projects.get.side_effect = lambda _id: _project(next(statuses))
    project, error = await_import(gl, PROJECT_ID)
    assert error == ""
    assert project.import_status == "finished"
    assert gl.projects.get.call_count == 3


def test_await_import_gives_up_on_a_stuck_import(monkeypatch):
    """An import that never finishes fails instead of hanging forever."""
    monkeypatch.setattr(project_import, "IMPORT_POLL_ATTEMPTS", 2)
    gl = MagicMock()
    gl.projects.get.return_value = _project("started")
    _project_obj, error = await_import(gl, PROJECT_ID)
    assert "timed out" in error
    assert gl.projects.get.call_count == 3
