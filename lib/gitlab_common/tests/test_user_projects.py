"""Tests for a DTaaS user's two projects (gitlab_common/user_projects.py)."""

from unittest.mock import MagicMock, patch

import pytest
from gitlab_common.projects import ProjectResult
from gitlab_common.user_projects import (
    ProjectTemplates,
    ensure_user_projects,
    project_specs,
)

USER_ID = 7
TEMPLATES = ProjectTemplates(
    "https://github.com/into-cps-association/DTaaS-Examples",
    "common-template",
    "user-template",
)
CREATED = ProjectResult(True, project_id=1)

# pylint: disable=redefined-outer-name,unused-argument


@pytest.fixture
def mock_create():
    """Patch the single project primitive this module is built on."""
    with patch(
        "gitlab_common.user_projects.create_user_project", return_value=CREATED
    ) as mock:
        yield mock


def test_project_specs_seed_each_project_from_its_branch():
    """Both projects come from one template, each from its own branch."""
    specs = project_specs(TEMPLATES)
    assert [(s.name, s.branch) for s in specs] == [
        ("common", "common-template"),
        ("user", "user-template"),
    ]
    assert {s.import_url for s in specs} == {TEMPLATES.url}


def test_ensure_user_projects_creates_both(mock_create):
    """Two clean creations report success and need no explaining."""
    ok, messages = ensure_user_projects(MagicMock(), USER_ID, TEMPLATES)
    assert ok is True
    assert not messages
    assert mock_create.call_count == 2


def test_ensure_user_projects_reports_an_existing_project(mock_create):
    """A project the user already owns is reported and left alone."""
    mock_create.side_effect = [
        ProjectResult(True, project_id=1, already_exists=True),
        CREATED,
    ]
    ok, messages = ensure_user_projects(MagicMock(), USER_ID, TEMPLATES)
    assert ok is True
    assert "already exists" in messages[0]
    assert "common" in messages[0]


def test_ensure_user_projects_attempts_both_after_a_failure(mock_create):
    """One bad branch name must not hide a second problem."""
    failed = ProjectResult(False, error="branch 'nope' is not there")
    mock_create.side_effect = [failed, failed]
    ok, messages = ensure_user_projects(MagicMock(), USER_ID, TEMPLATES)
    assert ok is False
    assert len(messages) == 2
    assert mock_create.call_count == 2


@pytest.mark.parametrize(
    "already_exists,lead",
    [(False, ()), (True, ("project 'common' already exists and was left unchanged",))],
)
def test_ensure_user_projects_passes_warnings_through(mock_create, already_exists, lead):
    """A warning is reported without failing the project, for a new project
    (a leftover template branch) and an existing one (left off the template
    branch) alike."""
    mock_create.side_effect = [
        ProjectResult(
            True, project_id=1, already_exists=already_exists, warnings=("w",)
        ),
        CREATED,
    ]
    ok, messages = ensure_user_projects(MagicMock(), USER_ID, TEMPLATES)
    assert ok is True
    assert messages == lead + ("project 'common': w",)


def test_ensure_user_projects_prints_nothing(mock_create, capsys):
    """Outcomes come back as values, so a consumer decides what reaches a
    console, a log, or nothing at all."""
    ensure_user_projects(MagicMock(), USER_ID, TEMPLATES)
    assert capsys.readouterr().out == ""
