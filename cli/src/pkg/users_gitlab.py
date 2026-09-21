"""Optional GitLab account/PAT/project provisioning for 'user add'.

Split out of users.py to keep both files within a reasonable line count,
mirroring the users_compose.py / users_utils.py split. Driven by the
`[gitlab].provision` flag in dtaas.toml; a GitLab failure never undoes the
container provisioning users.py has already done.

Each user gets two steps, tracked independently in the registry: an account
with a Personal Access Token, and the common/user projects seeded from the
configured template. A run that completes one and fails the other retries
only the missing half.
"""

from dataclasses import dataclass
import click
from . import gitlab as gitlabPkg
from . import utils
from .constants import GITLAB_USER_TOKENS_FILE
from .users_gitlab_records import persist_gitlab_results


def _gitlab_target_usernames(ctx, start_only, passwords):
    """Registry users to attempt GitLab provisioning for this run.

    Mirrors _provision_users' start_only scoping, plus any already-registered
    user who supplied a password again this run even though their container
    isn't being (re)started the explicit retry path after a prior PAT-
    issuance failure, without touching anyone else.
    """
    if start_only is None:
        started = ctx.user_list
    else:
        started = [name for name in start_only if name in ctx.user_list]
    retries = [
        name for name in passwords if name in ctx.user_list and name not in started
    ]
    return started + retries


@dataclass
class _GitlabCandidate:
    """One registry user queued for GitLab provisioning this run."""

    username: str
    email: str
    existing_user_id: object
    password: object
    pat_issued: bool = False
    projects_created: bool = False


@dataclass
class _GitlabUserResult:
    """Outcome of provisioning one _GitlabCandidate."""

    username: str
    new_id: object
    token: object
    failed: bool
    projects_done: bool = False


def gitlab_candidates(ctx, start_only, passwords):
    """A _GitlabCandidate for every user targeted for GitLab provisioning.

    Scoping mirrors _gitlab_target_usernames; a target with no password keeps
    a None password here and is reported skipped by _provision_one_gitlab_user.
    """
    candidates = []
    for username in _gitlab_target_usernames(ctx, start_only, passwords):
        details = ctx.users_section.get(username) or {}
        candidates.append(
            _GitlabCandidate(
                username,
                details.get("email", ""),
                details.get("gitlab_user_id"),
                passwords.get(username),
                bool(details.get("gitlab_pat_issued")),
                bool(details.get("gitlab_projects_created")),
            )
        )
    return candidates


def _changed_user_id(result, existing_user_id):
    """result.user_id when GitLab returned a new or changed id, else None."""
    if result.user_id is not None and result.user_id != existing_user_id:
        return result.user_id
    return None


@dataclass(frozen=True)
class _GitlabRun:
    """What every candidate in this run shares: the GitLab client and the
    project template settings read from dtaas.toml."""

    gl: object
    templates: object


def _report_account(username, result):
    """Echo one account outcome; returns the token to persist, if any.

    An already-existing account is warned about but not failed, and yields no
    token: this run did not create it, so its credentials are unknown.
    """
    if not result.ok:
        click.echo(f"GitLab provisioning failed for '{username}': {result.message}")
        return None
    if result.already_exists:
        click.echo(f"Warning: GitLab provisioning for '{username}': {result.message}")
        return None
    return result.token


def _account_step(run, candidate):
    """Create one candidate's GitLab account and Personal Access Token.

    A candidate whose PAT was already issued is skipped rather than reissued
    (a second token would be live on GitLab with no record of it), but that
    is a skip, not a failure, so their projects can still be created.
    """
    if candidate.pat_issued:
        click.echo(
            f"GitLab provisioning skipped for '{candidate.username}': a Personal "
            "Access Token was already issued on an earlier run (see "
            f"{GITLAB_USER_TOKENS_FILE}). A re-run does not reissue one."
        )
        return _GitlabUserResult(candidate.username, None, None, False)
    result = gitlabPkg.ensure_user_resources(
        run.gl,
        gitlabPkg.GitlabUser(
            candidate.username,
            candidate.email,
            candidate.password,
            existing_user_id=candidate.existing_user_id,
        ),
    )
    return _GitlabUserResult(
        candidate.username,
        _changed_user_id(result, candidate.existing_user_id),
        _report_account(candidate.username, result),
        not result.ok,
    )


def _projects_step(run, candidate, account):
    """Create the candidate's template projects, updating *account* in place.

    Skipped when no template is configured, when the account step failed
    (there may be no account to own them) and when an earlier run already
    created them. The account id comes from this run or from the registry;
    with neither, provision_user_projects looks it up by username.
    """
    if run.templates is None or account.failed or candidate.projects_created:
        return account
    target = gitlabPkg.ProjectTarget(
        candidate.username, account.new_id or candidate.existing_user_id
    )
    account.projects_done = gitlabPkg.provision_user_projects(
        run.gl, target, run.templates
    )
    account.failed = not account.projects_done
    return account


def _provision_one_gitlab_user(run, candidate):
    """Provision one candidate's GitLab account, PAT and projects.

    A candidate with no password is reported skipped, not failed: without one
    there is no account to create, and an account from an earlier run is only
    retried when its password is supplied again.
    """
    if not candidate.password:
        click.echo(
            f"GitLab provisioning skipped for '{candidate.username}': "
            "no password supplied."
        )
        return _GitlabUserResult(candidate.username, None, None, False)
    return _projects_step(run, candidate, _account_step(run, candidate))


def _issue_gitlab_resources(run, candidates):
    """Provision every candidate, persist ids, tokens and projects, and return
    the usernames that failed."""
    results = [_provision_one_gitlab_user(run, candidate) for candidate in candidates]
    persist_gitlab_results(results)
    return [r.username for r in results if r.failed]


def _resolve_templates(config_obj):
    """The [gitlab] project template settings, or None when there are none.

    A dtaas.toml that configures no template is not a failure: accounts and
    tokens are still provisioned and only the project step is skipped, with
    one notice per run. A half configured template is reported the same way,
    naming what is missing.
    """
    values, err = config_obj.get_gitlab_templates()
    if err is not None:
        click.echo(f"GitLab project creation skipped: {err}")
        return None
    if values is None:
        click.echo(
            "GitLab project creation skipped: no project template in "
            "dtaas.toml. Set [gitlab] templates_url, common_branch and "
            "user_branch (the generated dtaas.toml ships the DTaaS values)."
        )
        return None
    return gitlabPkg.ProjectTemplates(
        values["templates_url"], values["common_branch"], values["user_branch"]
    )


def provision_gitlab_users(config_obj, candidates):
    """Create each candidate's GitLab account, PAT and projects, when
    provisioning is enabled.

    Container provisioning is unaffected by a GitLab failure. Returns the
    usernames that could not be provisioned, so add_users can surface a
    command failure (a missing password is not counted). A candidate with a
    registry-stored gitlab_user_id retries PAT issuance directly against it
    rather than calling create_user again; any new id is persisted. A
    candidate already marked gitlab_pat_issued is skipped, so re-running the
    command never mints a second token for the same account, and one already
    marked gitlab_projects_created keeps the projects it has.
    """
    provision, err = config_obj.get_gitlab_provision()
    utils.check_error(err)
    if not provision or not candidates:
        return []
    gl, err = gitlabPkg.resolve_client(config_obj)
    if err is not None:
        click.echo(f"GitLab provisioning skipped: {err}")
        return [c.username for c in candidates]
    run = _GitlabRun(gl, _resolve_templates(config_obj))
    return _issue_gitlab_resources(run, candidates)


def gitlab_failure_exc(failed):
    """An Exception naming the users whose GitLab provisioning failed, or None."""
    if not failed:
        return None
    return Exception(
        "GitLab provisioning failed for: "
        + ", ".join(failed)
        + " (their containers were still provisioned)"
    )
