"""Tests for one user's GitLab project creation (gitlab_common/projects.py)."""

from types import SimpleNamespace
from unittest.mock import MagicMock, Mock

from gitlab.exceptions import GitlabCreateError, GitlabDeleteError, GitlabGetError
from gitlab_common.project_import import IMPORT_RETRY_HINT
from gitlab_common.projects import ProjectSpec, create_user_project

PROJECT_ID = 42
USER_ID = 7
NAMESPACE = "alice"
TEMPLATE_URL = "https://github.com/into-cps-association/DTaaS-Examples"
BRANCH = "user-template"
OTHER_BRANCHES = ("main", "common-template")

SPEC = ProjectSpec("user", TEMPLATE_URL, BRANCH)


def _project(import_status="finished", branches=(BRANCH,) + OTHER_BRANCHES):
    """A project mock whose repository holds *branches*, as a fresh import
    leaves it: no default branch of its own yet."""
    project = MagicMock()
    project.id = PROJECT_ID
    project.import_status = import_status
    project.empty_repo = False
    project.default_branch = None
    project.branches.list.return_value = [SimpleNamespace(name=n) for n in branches]
    return project


def _owned(default_branch=BRANCH, empty_repo=False):
    """A project mock as it is found in the namespace on a later run: seeded
    by default, or left behind unseeded by a run that failed."""
    project = _project()
    project.default_branch = default_branch
    project.empty_repo = empty_repo
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


def test_create_user_project_seeded_project_is_untouched():
    """A project already seeded from the template is reported, never
    re-imported, so a repeated run keeps the user's work; being on the
    template branch, it carries no warning."""
    gl, user, project = _client(project=_owned(), existing=True)
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.already_exists is True
    assert result.ok is True
    assert result.project_id == PROJECT_ID
    assert not result.warnings
    user.projects.create.assert_not_called()
    project.branches.delete.assert_not_called()


def test_create_user_project_never_touches_a_project_with_content():
    """A project with content whose default branch is not the template branch
    may hold the user's work on it (they pushed a branch and made it the
    default, the template branch still present), so it is neither switched
    nor pruned: it is reported with the way to reseed it instead."""
    project = _owned(default_branch="my-work")
    gl, _, _ = _client(project=project, existing=True)
    result = create_user_project(gl, USER_ID, SPEC)
    assert (result.ok, result.already_exists) == (True, True)
    assert project.default_branch == "my-work"
    project.save.assert_not_called()
    project.branches.delete.assert_not_called()
    assert "delete the project in GitLab and re-run" in result.warnings[0]


def test_create_user_project_resumes_an_empty_project_from_a_failed_run():
    """A run that created the project and then failed to seed it leaves an
    empty repository behind. Reporting that as ready would mark the user done
    with nothing in it, so the seeding is finished instead."""
    gl, user, project = _client(
        project=_owned(default_branch=None, empty_repo=True), existing=True
    )
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is True
    assert result.already_exists is False
    assert project.default_branch == BRANCH
    user.projects.create.assert_not_called()
    assert sorted(_deleted_branches(project)) == sorted(OTHER_BRANCHES)


def test_create_user_project_names_the_retry_for_a_dead_import():
    """GitLab never reruns a failed import, so an empty project left by one
    fails on every run; the error says how to get past it."""
    project = _owned(default_branch=None, empty_repo=True)
    project.import_status = "failed"
    gl, _, _ = _client(project=project, existing=True)
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert IMPORT_RETRY_HINT in result.error


def test_create_user_project_reports_an_unscheduled_import():
    """An import GitLab never started fails, naming the import source, rather
    than blaming the branch name for the missing repository."""
    gl, _, _ = _client(project=_project(import_status="none"))
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert "Repository by URL" in result.error


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


def test_create_user_project_reports_a_failed_import():
    """A failed import is reported with GitLab's own detail, not as success."""
    project = _project(import_status="failed")
    project.import_error = "could not reach the template URL"
    gl, _, _ = _client(project=project)
    result = create_user_project(gl, USER_ID, SPEC)
    assert result.ok is False
    assert "could not reach the template URL" in result.error
    assert result.project_id == PROJECT_ID


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
