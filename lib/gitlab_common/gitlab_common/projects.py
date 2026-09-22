"""Creates one GitLab project for a user, seeded from a template branch.

The project counterpart of users.py, and shaped like it: the GitLab API work
for a single resource, taking explicit arguments and doing no console
output, config reading or persistence. Which projects a user gets is
user_projects.py's answer; where the template comes from is each consumer's.

The project is created in the user's own namespace with GitLab's import by
URL feature, which copies every branch of the template repository, and is
then reduced to the single branch the caller asked for: that branch becomes
the default branch and the other imported branches are deleted.

The import runs asynchronously and has instance side prerequisites, both of
which project_import.py handles: the project exists before its repository
does, so the import is awaited before the branches are touched.
"""

import logging
from dataclasses import dataclass

import gitlab
import gitlab.exceptions

from .project_import import await_import

logger = logging.getLogger(__name__)

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
    """Outcome of :func:`create_user_project`, shaped like users.py's
    CreateUserResult: *ok* means the project is there now, whether or not
    this call created it, and *already_exists* tells the two apart.

    ``warnings`` carries non fatal problems (a leftover template branch that
    could not be deleted), so a caller can report them without treating the
    project itself as failed.
    """

    ok: bool
    project_id: int | None = None
    error: str = ""
    already_exists: bool = False
    warnings: tuple[str, ...] = ()


def _existing_project(gl: gitlab.Gitlab, namespace: str, name: str):
    """The project ``namespace/name`` when it already exists, else None."""
    try:
        return gl.projects.get(f"{namespace}/{name}")
    except gitlab.exceptions.GitlabGetError:
        return None


def _is_empty(project) -> bool:
    """True when *project* has no repository content yet, which is what an
    import that is still running, failed or never started leaves behind."""
    empty = bool(getattr(project, "empty_repo", False))
    return empty or not getattr(project, "default_branch", "")


def _off_template_warning(project, branch: str) -> tuple[str, ...]:
    """A warning when an adopted project's default branch is not *branch*.

    That is either the user's own choice or a run that died between the
    import and the branch switch; the two look the same from here, so the
    project is left alone and the way to reseed it is named instead.
    """
    default = getattr(project, "default_branch", "")
    if default == branch:
        return ()
    return (
        f"its default branch is '{default}', not the template branch "
        f"'{branch}'; delete the project in GitLab and re-run to reseed it",
    )


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
    project, error = await_import(gl, project_id)
    if not error:
        error = _set_default_branch(project, spec.branch)
    if error:
        return ProjectResult(False, project_id=project_id, error=error)
    return ProjectResult(
        True, project_id=project_id, warnings=_prune_branches(project, spec.branch)
    )


def _adopt_existing(gl: gitlab.Gitlab, project, spec: ProjectSpec) -> ProjectResult:
    """Report a project the user already owns, or finish seeding it.

    Only a project with no repository is seeded: that is what a run leaves
    when it stopped waiting on an import, and reporting it as ready would
    mark the user done with an empty repository. A project with any content
    is never touched, since pruning branches could delete the user's work;
    one left off the template branch is reported with a warning instead.
    """
    if not _is_empty(project):
        logger.info("GitLab project exists: %s", project.path_with_namespace)
        return ProjectResult(
            True,
            project_id=project.id,
            already_exists=True,
            warnings=_off_template_warning(project, spec.branch),
        )
    logger.info("Resuming the seeding of %s", project.path_with_namespace)
    return _seed_project(gl, project.id, spec)


def _user_project(gl: gitlab.Gitlab, user_id: int, spec: ProjectSpec):
    """The project *spec* asks for in *user_id*'s namespace, creating it when
    it is not there yet.

    Returns:
        Tuple of (project, created, error); *created* tells a fresh import
        from a project that was already in the namespace, and *error* is set
        when GitLab refused the lookup or the creation.
    """
    try:
        user = gl.users.get(user_id)
        existing = _existing_project(gl, user.username, spec.name)
        if existing is not None:
            return existing, False, ""
        created = user.projects.create(
            {
                "name": spec.name,
                "import_url": spec.import_url,
                "visibility": PROJECT_VISIBILITY,
            }
        )
    except gitlab.exceptions.GitlabError as exc:
        return None, False, f"could not create project '{spec.name}': {exc}"
    return created, True, ""


def create_user_project(
    gl: gitlab.Gitlab, user_id: int, spec: ProjectSpec
) -> ProjectResult:
    """Create *spec*'s project in *user_id*'s namespace, seeded from its branch.

    Idempotent: a project of that name already in the user's namespace keeps
    its contents, so a repeated run never overwrites a user's work. An empty
    one, left by an earlier run whose import had not finished, is waited on
    and seeded here rather than reported as ready; an import that failed is
    reported with the way to retry it, since GitLab does not rerun it.

    Args:
        gl: Authenticated gitlab.Gitlab client with admin rights.
        user_id: GitLab id of the account the project is created for.
        spec: Project name, template URL, and template branch to keep.

    Returns:
        A :class:`ProjectResult`. A project whose repository imported but
        could not be reduced to *spec.branch* is not ok, with its id set, so
        the caller can report which project needs attention.
    """
    project, created, error = _user_project(gl, user_id, spec)
    if project is None:
        return ProjectResult(False, error=error)
    if created:
        return _seed_project(gl, project.id, spec)
    return _adopt_existing(gl, project, spec)
