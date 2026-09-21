"""Tests for one user's GitLab project creation (pkg/gitlab/project_api.py)."""

from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

import pytest
from gitlab.exceptions import GitlabCreateError, GitlabDeleteError, GitlabGetError
from src.pkg.gitlab import project_api
from src.pkg.gitlab.project_api import ProjectSpec, create_user_project

PROJECT_ID = 42
USER_ID = 7
NAMESPACE = "alice"
TEMPLATE_URL = "https://github.com/into-cps-association/DTaaS-Examples"
BRANCH = "user-template"
OTHER_BRANCHES = ("main", "common-template")

SPEC = ProjectSpec("user", TEMPLATE_URL, BRANCH)


@pytest.fixture(autouse=True)
def _no_poll_delay(monkeypatch):
    """Keep the import poll loop instant; the wait itself is not under test."""
    monkeypatch.setattr(project_api, "IMPORT_POLL_SECONDS", 0)


def _project(import_status="finished", branches=(BRANCH,) + OTHER_BRANCHES):
    """A project mock whose repository holds *branches*."""
    project = MagicMock()
    project.id = PROJECT_ID
    project.import_status = import_status
    project.branches.list.return_value = [SimpleNamespace(name=n) for n in branches]
    return project


def _client(project=None, existing=False):
    """A client mock. With *existing*, the user already owns the project;
    otherwise the namespace lookup misses and creation returns *project*."""
    gl = MagicMock()
    project = project if project is not None else _project()
    user = Mock()
    user.username = NAMESPACE
    user.projects.create.return_value = SimpleNamespace(id=PROJECT_ID)
    gl.users.get.return_value = user

    def _get(ref, **_kwargs):
        if isinstance(ref, str) and not existing:
            raise GitlabGetError("404 Project Not Found", response_code=404)
        return project

    gl.projects.get.side_effect = _get
    return gl, user, project


def _deleted_branches(project):
    """The branch names passed to branches.delete."""
    return [call.args[0] for call in project.branches.delete.call_args_list]


def test_create_user_project_creates_a_private_import():
    """The project is created in the user's namespace from the template URL."""
    gl, user, _ = _client()
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert result.project_id == PROJECT_ID
    assert user.projects.create.call_args.args[0] == {
        "name": "user",
        "import_url": TEMPLATE_URL,
        "visibility": "private",
    }


def test_create_user_project_seeds_the_configured_branch():
    """The configured branch becomes the default branch and is the only one left."""
    gl, _, project = _client()
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert not result.warnings
    assert project.default_branch == BRANCH
    project.save.assert_called_once()
    assert sorted(_deleted_branches(project)) == sorted(OTHER_BRANCHES)


def test_create_user_project_unprotects_before_deleting():
    """Protection is dropped first, since GitLab protects the default branch."""
    gl, _, project = _client()
    create_user_project(gl, USER_ID, SPEC)
    unprotected = [c.args[0] for c in project.protectedbranches.delete.call_args_list]
    assert sorted(unprotected) == sorted(OTHER_BRANCHES)


def test_create_user_project_existing_project_is_untouched():
    """A project already in the namespace is reported, never re-imported."""
    gl, user, project = _client(existing=True)
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.already_exists is True
    assert result.ok is True
    assert result.project_id == PROJECT_ID
    user.projects.create.assert_not_called()
    project.branches.delete.assert_not_called()


def test_create_user_project_reports_a_create_failure():
    """A GitLab error while creating is FAILED, with no seeding attempted."""
    gl, user, project = _client()
    user.projects.create.side_effect = GitlabCreateError(
        "403 Forbidden", response_code=403
    )
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert "could not create project 'user'" in result.error
    project.branches.delete.assert_not_called()


def test_create_user_project_waits_for_the_import():
    """The default branch is only set once the import reports finished."""
    gl, _, project = _client(project=_project(import_status="started"))
    statuses = iter(["started", "finished"])

    def _get(ref, **_kwargs):
        if isinstance(ref, str):
            raise GitlabGetError("404 Project Not Found", response_code=404)
        project.import_status = next(statuses, "finished")
        return project

    gl.projects.get.side_effect = _get
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert project.default_branch == BRANCH


def test_create_user_project_reports_a_failed_import():
    """A failed import is reported with GitLab's own detail, not as success."""
    project = _project(import_status="failed")
    project.import_error = "could not reach the template URL"
    gl, _, _ = _client(project=project)
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert "could not reach the template URL" in result.error
    assert result.project_id == PROJECT_ID


def test_create_user_project_times_out_on_a_stuck_import(monkeypatch):
    """An import that never finishes fails instead of hanging forever."""
    monkeypatch.setattr(project_api, "IMPORT_POLL_ATTEMPTS", 2)
    gl, _, project = _client(project=_project(import_status="started"))
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert "timed out" in result.error
    project.branches.delete.assert_not_called()


def test_create_user_project_reports_a_missing_template_branch():
    """A branch name that is not in the template is named as the problem."""
    gl, _, project = _client()
    project.branches.get.side_effect = GitlabGetError(
        "404 Branch Not Found", response_code=404
    )
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert f"branch '{BRANCH}' is not in the imported template" in result.error
    project.branches.delete.assert_not_called()


def test_create_user_project_warns_when_a_branch_survives():
    """A branch that cannot be deleted is a warning, not a failed project."""
    gl, _, project = _client()
    project.branches.delete.side_effect = GitlabDeleteError(
        "403 Forbidden", response_code=403
    )
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert result.already_exists is False
    assert len(result.warnings) == len(OTHER_BRANCHES)
    assert "could not delete template branch" in result.warnings[0]


def test_create_user_project_warns_when_branches_cannot_be_listed():
    """A branch listing failure leaves the seeded project in place, with a warning."""
    gl, _, project = _client()
    project.branches.list.side_effect = GitlabGetError("500", response_code=500)
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert "could not list the imported branches" in result.warnings[0]


def test_create_user_project_without_an_import_needs_no_wait():
    """import_status 'none' means there is nothing to wait for."""
    gl, _, project = _client(project=_project(import_status="none", branches=(BRANCH,)))
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert _deleted_branches(project) == []
