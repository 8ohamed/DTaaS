"""Tests for a user's GitLab project provisioning (pkg/gitlab/projects.py)."""

from unittest.mock import MagicMock, patch
import pytest
from src.pkg.gitlab.project_api import ProjectResult
from src.pkg.gitlab.projects import (
    ProjectTarget,
    ProjectTemplates,
    ensure_user_projects,
    project_specs,
    provision_user_projects,
)

USERNAME = "alice"
USER_ID = 7
TEMPLATES = ProjectTemplates(
    "https://github.com/into-cps-association/DTaaS-Examples",
    "common-template",
    "user-template",
)
CREATED = ProjectResult(True, project_id=1)


@pytest.fixture
def mock_create():
    """Patch the shared create_user_project primitive."""
    with patch(
        "src.pkg.gitlab.projects.create_user_project", return_value=CREATED
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


def test_ensure_user_projects_passes_warnings_through(mock_create):
    """A leftover template branch is reported without failing the project."""
    mock_create.side_effect = [
        ProjectResult(True, project_id=1, warnings=("branch stayed",)),
        CREATED,
    ]
    ok, messages = ensure_user_projects(MagicMock(), USER_ID, TEMPLATES)
    assert ok is True
    assert messages == ("project 'common': branch stayed",)


def test_provision_user_projects_uses_a_known_id(mock_create, capsys):
    """A known account id is used directly, with no lookup."""
    with patch("src.pkg.gitlab.projects.find_user_id") as mock_find:
        ok = provision_user_projects(
            MagicMock(), ProjectTarget(USERNAME, USER_ID), TEMPLATES
        )
    assert ok is True
    mock_find.assert_not_called()
    assert mock_create.call_args.args[1] == USER_ID
    assert "GitLab projects ready for 'alice'" in capsys.readouterr().out


def test_provision_user_projects_looks_up_an_unknown_id(mock_create, capsys):
    """An account this CLI did not create is resolved by username, and the
    admin is told whose namespace is being written to."""
    with patch("src.pkg.gitlab.projects.find_user_id", return_value=99):
        ok = provision_user_projects(
            MagicMock(), ProjectTarget(USERNAME), TEMPLATES
        )
    assert ok is True
    assert mock_create.call_args.args[1] == 99
    assert "was not created by this CLI" in capsys.readouterr().out


def test_provision_user_projects_without_an_id_fails(mock_create, capsys):
    """An unresolvable account is a failure, not a silent skip."""
    with patch("src.pkg.gitlab.projects.find_user_id", return_value=None):
        ok = provision_user_projects(
            MagicMock(), ProjectTarget(USERNAME), TEMPLATES
        )
    assert ok is False
    mock_create.assert_not_called()
    assert "could not be resolved" in capsys.readouterr().out
