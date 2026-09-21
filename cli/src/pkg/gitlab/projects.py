"""Creates a provisioned user's GitLab projects from the configured template.

Deployment specific glue over project_api.create_user_project: it turns the
[gitlab] template settings into the two repositories every DTaaS user gets
(common and user), resolves the GitLab account id to create them under, and
reports each outcome on the console. The GitLab API work itself stays in
project_api.py, the way users_gitlab.py stays out of provisioner.py.
"""

from dataclasses import dataclass

import click

from ..constants import COMMON_PROJECT_NAME, USER_PROJECT_NAME
from .project_api import ProjectSpec, create_user_project
from .provisioner import find_user_id


@dataclass(frozen=True)
class ProjectTemplates:
    """The [gitlab] template settings: one template repository, and the branch
    of it each of the two projects is seeded from."""

    url: str
    common_branch: str
    user_branch: str


@dataclass(frozen=True)
class ProjectTarget:
    """The user to create projects for. *user_id* is their GitLab account id
    when it is already known (the account was created this run, or its id is
    stored in the registry); None means it has to be looked up by username."""

    username: str
    user_id: int | None = None


def project_specs(templates):
    """The two projects every provisioned user gets, in creation order."""
    return [
        ProjectSpec(COMMON_PROJECT_NAME, templates.url, templates.common_branch),
        ProjectSpec(USER_PROJECT_NAME, templates.url, templates.user_branch),
    ]


def _describe(spec, result):
    """The report lines for one project's outcome: a cleanly created project
    says nothing here, since provision_user_projects summarises those."""
    if not result.ok:
        return (f"project '{spec.name}' failed: {result.error}",)
    if result.already_exists:
        return (f"project '{spec.name}' already exists and was left unchanged",)
    return tuple(f"project '{spec.name}': {warning}" for warning in result.warnings)


def ensure_user_projects(gl, user_id, templates):
    """Create the common and user projects for the account *user_id*.

    Idempotent through project_api.create_user_project: a project the user
    already owns is reported and left untouched, never re-imported. Both
    projects are attempted even when the first one fails, so a single bad
    branch name does not hide a second problem.

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


def _resolve_user_id(gl, target):
    """*target*'s GitLab id, looked up by username when it is not known.

    A looked up id belongs to an account this CLI did not create (see
    provisioner.py), so the admin is told whose namespace is being written to.
    """
    if target.user_id is not None:
        return target.user_id
    user_id = find_user_id(gl, target.username)
    if user_id is not None:
        click.echo(
            f"Warning: the GitLab account '{target.username}' was not created by "
            "this CLI; its projects are created in that account's namespace."
        )
    return user_id


def provision_user_projects(gl, target, templates):
    """Create *target*'s two GitLab projects, reporting each outcome.

    Returns:
        True when both projects exist afterwards, so the caller can record
        the user as done and skip them on a later run.
    """
    user_id = _resolve_user_id(gl, target)
    if user_id is None:
        click.echo(
            f"GitLab project creation failed for '{target.username}': "
            "their GitLab user id could not be resolved."
        )
        return False
    ok, messages = ensure_user_projects(gl, user_id, templates)
    for message in messages:
        click.echo(f"GitLab projects for '{target.username}': {message}")
    if ok:
        click.echo(
            f"GitLab projects ready for '{target.username}': "
            f"{COMMON_PROJECT_NAME} and {USER_PROJECT_NAME}."
        )
    return ok
