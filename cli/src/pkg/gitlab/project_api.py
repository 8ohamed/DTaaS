"""Creates one GitLab project for a user, seeded from a template branch.

The project half of provisioner.py, and shaped like it: the GitLab API work
for a single resource, with no console output, config reading or persistence.
Those live in projects.py and users_gitlab.py.

The project is created in the user's own namespace with GitLab's import by
URL feature, which copies every branch of the template repository, and is
then reduced to the single branch the caller asked for: that branch becomes
the default branch and the other imported branches are deleted.

Two instance side prerequisites follow from using import by URL: the
"Repository by URL" import source must be enabled (Admin Area, Settings,
General, Import and export settings) and the GitLab server itself must be
able to reach the template URL. The import runs asynchronously, so the
project exists before its repository does and the import status is polled
before the branches are touched.
"""

import logging
import time
from dataclasses import dataclass

import gitlab
import gitlab.exceptions

logger = logging.getLogger(__name__)

# Poll budget for the asynchronous repository import: 300 attempts, 2 seconds
# apart, so a slow template clone has 10 minutes before it is given up on.
IMPORT_POLL_SECONDS = 2
IMPORT_POLL_ATTEMPTS = 300

# Created projects are private: they hold one user's workspace, and the
# template's own visibility is not inherited by an import.
PROJECT_VISIBILITY = "private"


@dataclass(frozen=True)
class ProjectSpec:
    """One project to create: its name, the template repository to import,
    and the single branch of that template to keep."""

    name: str
    import_url: str
    branch: str


@dataclass(frozen=True)
class ProjectResult:
    """Outcome of :func:`create_user_project`, shaped like provisioner.py's
    ProvisionResult: *ok* means the project is there now, whether or not this
    call created it, and *already_exists* tells the two apart.

    ``warnings`` carries non fatal problems (a leftover template branch that
    could not be deleted), so a caller can report them without treating the
    project itself as failed.
    """

    ok: bool
    project_id: int | None = None
    error: str = ""
    already_exists: bool = False
    warnings: tuple[str, ...] = ()


def _existing_project_id(gl: gitlab.Gitlab, namespace: str, name: str) -> int | None:
    """Id of ``namespace/name`` when that project already exists, else None."""
    try:
        return gl.projects.get(f"{namespace}/{name}").id
    except gitlab.exceptions.GitlabGetError:
        return None


def _import_state(project) -> str | None:
    """Empty string once the repository is in place, an error string when the
    import failed, or None while it is still running.

    A project created without an import_url reports status ``none``, which is
    "nothing to wait for" rather than a failure.
    """
    status = getattr(project, "import_status", "none")
    if status in ("none", "finished"):
        return ""
    if status == "failed":
        detail = getattr(project, "import_error", "") or "no detail reported"
        return f"repository import failed: {detail}"
    return None


def _await_import(gl: gitlab.Gitlab, project_id: int):
    """Poll *project_id* until its repository import finishes.

    Returns:
        Tuple of (project, error); *error* is empty when the repository is
        ready. The project is re fetched on every attempt because its import
        status only changes server side.
    """
    project = gl.projects.get(project_id)
    for _ in range(IMPORT_POLL_ATTEMPTS):
        state = _import_state(project)
        if state is not None:
            return project, state
        time.sleep(IMPORT_POLL_SECONDS)
        project = gl.projects.get(project_id)
    return project, "timed out waiting for the repository import to finish"


def _set_default_branch(project, branch: str) -> str:
    """Point *project*'s default branch at *branch*; empty string on success.

    The branch is read back first so a template that has no such branch (a
    misconfigured branch name) is reported as that, not as a failed update.
    """
    try:
        project.branches.get(branch)
        project.default_branch = branch
        project.save()
    except gitlab.exceptions.GitlabGetError:
        return f"branch '{branch}' is not in the imported template"
    except gitlab.exceptions.GitlabError as exc:
        return f"could not set the default branch to '{branch}': {exc}"
    return ""


def _delete_branch(project, name: str) -> str:
    """Delete branch *name*; empty string when it is gone, else a warning.

    Branch protection is dropped first: GitLab protects an imported
    repository's default branch, and a protected branch cannot be deleted.
    """
    try:
        project.protectedbranches.delete(name)
    except gitlab.exceptions.GitlabError:
        logger.debug("Branch '%s' was not protected", name)
    try:
        project.branches.delete(name)
    except gitlab.exceptions.GitlabError as exc:
        return f"could not delete template branch '{name}': {exc}"
    return ""


def _prune_branches(project, keep: str) -> tuple[str, ...]:
    """Delete every branch except *keep*, returning one warning per failure."""
    try:
        names = [b.name for b in project.branches.list(iterator=True) if b.name != keep]
    except gitlab.exceptions.GitlabError as exc:
        return (f"could not list the imported branches: {exc}",)
    return tuple(w for w in (_delete_branch(project, n) for n in names) if w)


def _seed_project(gl: gitlab.Gitlab, project_id: int, spec: ProjectSpec):
    """Reduce the freshly imported *project_id* to *spec*'s single branch."""
    project, error = _await_import(gl, project_id)
    if not error:
        error = _set_default_branch(project, spec.branch)
    if error:
        return ProjectResult(False, project_id=project_id, error=error)
    return ProjectResult(
        True, project_id=project_id, warnings=_prune_branches(project, spec.branch)
    )


def create_user_project(
    gl: gitlab.Gitlab, user_id: int, spec: ProjectSpec
) -> ProjectResult:
    """Create *spec*'s project in *user_id*'s namespace, seeded from its branch.

    Idempotent: a project of that name already in the user's namespace is
    reported with ``already_exists`` and left untouched, contents included,
    so a repeated run never overwrites a user's work.

    Args:
        gl: Authenticated gitlab.Gitlab client with admin rights.
        user_id: GitLab id of the account the project is created for.
        spec: Project name, template URL, and template branch to keep.

    Returns:
        A :class:`ProjectResult`. A project whose repository imported but
        could not be reduced to *spec.branch* is not ok, with its id set, so
        the caller can report which project needs attention.
    """
    try:
        user = gl.users.get(user_id)
        existing = _existing_project_id(gl, user.username, spec.name)
        if existing is not None:
            logger.info("GitLab project exists: %s/%s", user.username, spec.name)
            return ProjectResult(True, project_id=existing, already_exists=True)
        project = user.projects.create(
            {
                "name": spec.name,
                "import_url": spec.import_url,
                "visibility": PROJECT_VISIBILITY,
            }
        )
    except gitlab.exceptions.GitlabError as exc:
        message = f"could not create project '{spec.name}': {exc}"
        return ProjectResult(False, error=message)
    return _seed_project(gl, project.id, spec)
