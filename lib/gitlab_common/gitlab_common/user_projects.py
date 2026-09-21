"""The two repositories every DTaaS user's workspace starts from.

A DTaaS user gets a ``common`` project and a ``user`` project in their own
GitLab namespace, each seeded from one branch of a single template
repository. That pairing is the same wherever users are provisioned from, so
it lives here rather than in one consumer, while where the template comes
from stays with each consumer: the CLI reads it from dtaas.toml.

Like the rest of this package the work is done through explicit arguments
and reported back as values: outcomes come out as message strings for the
caller to print, log or ignore.
"""

from dataclasses import dataclass

from .projects import ProjectSpec, create_user_project

COMMON_PROJECT_NAME = "common"
USER_PROJECT_NAME = "user"


@dataclass(frozen=True)
class ProjectTemplates:
    """One template repository, and the branch of it each of the two projects
    is seeded from."""

    url: str
    common_branch: str
    user_branch: str


def project_specs(templates: ProjectTemplates):
    """The two projects every provisioned user gets, in creation order."""
    return [
        ProjectSpec(COMMON_PROJECT_NAME, templates.url, templates.common_branch),
        ProjectSpec(USER_PROJECT_NAME, templates.url, templates.user_branch),
    ]


def _describe(spec, result):
    """The report lines for one project's outcome: a cleanly created project
    says nothing here, since the caller summarises those."""
    if not result.ok:
        return (f"project '{spec.name}' failed: {result.error}",)
    if result.already_exists:
        return (f"project '{spec.name}' already exists and was left unchanged",)
    return tuple(f"project '{spec.name}': {warning}" for warning in result.warnings)


def ensure_user_projects(gl, user_id: int, templates: ProjectTemplates):
    """Create the common and user projects for the account *user_id*.

    Idempotent through projects.create_user_project: a project the user
    already owns keeps its contents and is never re-imported, and one an
    earlier run left half seeded is finished. Both projects are attempted
    even when the first one fails, so a single bad branch name does not hide
    a second problem.

    Args:
        gl: Authenticated gitlab.Gitlab client with admin rights.
        user_id: GitLab id of the account the projects are created for.
        templates: The template repository and the branch for each project.

    Returns:
        Tuple of (ok, messages); *ok* is True when both projects exist
        afterwards, and *messages* are lines to report for this user.
    """
    outcomes = [
        (spec, create_user_project(gl, user_id, spec))
        for spec in project_specs(templates)
    ]
    messages = tuple(m for spec, result in outcomes for m in _describe(spec, result))
    return all(result.ok for _, result in outcomes), messages
