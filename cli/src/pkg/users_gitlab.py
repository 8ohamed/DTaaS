"""Optional GitLab account/PAT/project provisioning for 'user add'.

Split out of users.py to keep both files within a reasonable line count,
mirroring the users_compose.py / users_utils.py split. Driven by the
`[gitlab].provision` flag in dtaas.toml; a GitLab failure never undoes the
container provisioning users.py has already done.

Each user gets two steps, tracked independently in the registry and persisted
as each one finishes: an account with a Personal Access Token, and the
common/user projects seeded from the configured template. A run that
completes one and fails the other retries only the missing half, and an
interrupted run keeps what it had already done. Who is provisioned is
decided in users_gitlab_targets.py, and the disk writes live in
users_gitlab_records.py.
"""

from dataclasses import dataclass
import click
from . import gitlab as gitlabPkg
from . import utils
from .constants import GITLAB_USER_TOKENS_FILE
from .users_gitlab_records import persist_account_result, persist_projects_result

PAT_ISSUED_NOTICE = (
    "a Personal Access Token was already issued on an earlier run (see "
    f"{GITLAB_USER_TOKENS_FILE}). A re-run does not reissue one."
)


@dataclass
class _GitlabUserResult:
    """Outcome of provisioning one GitlabCandidate.

    *has_account* is False only when the account step was skipped for want of
    a password and the candidate has no account from an earlier run: there is
    then no namespace for the projects to be created in.
    """

    username: str
    new_id: object
    token: object
    failed: bool
    projects_done: bool = False
    has_account: bool = True


def _changed_user_id(result, existing_user_id):
    """result.user_id when GitLab returned a new or changed id, else None."""
    if result.user_id is not None and result.user_id != existing_user_id:
        return result.user_id
    return None


@dataclass(frozen=True)
class _GitlabRun:
    """What every candidate in this run shares: the GitLab client and the
    project template settings read from dtaas.toml.

    *template_error* holds the complaint about a half configured [gitlab]
    block, which fails the users it affects instead of skipping them.
    """

    gl: object
    templates: object
    template_error: str = ""

    @property
    def wants_projects(self):
        """False only when dtaas.toml configures no template at all, the one
        case in which skipping the project step is what the admin asked for."""
        return self.templates is not None or bool(self.template_error)


def _has_gitlab_work(candidate):
    """True when this candidate has GitLab work left to attempt.

    A password means an account to create; without one there is still the
    project half to retry, but only for a user who has an account already.
    Neither leaves nothing to do, so a client that cannot be built is not
    their failure to carry.
    """
    if candidate.password:
        return True
    if candidate.projects_created:
        return False
    return bool(candidate.pat_issued or candidate.existing_user_id)


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


def _account_skipped(candidate, reason, has_account=True):
    """Report that this candidate's account step was not run, as a skip
    rather than a failure, and carry on to their projects."""
    click.echo(
        f"GitLab account provisioning skipped for '{candidate.username}': {reason}"
    )
    return _GitlabUserResult(
        candidate.username, None, None, False, has_account=has_account
    )


def _account_step(run, candidate):
    """Create one candidate's GitLab account and Personal Access Token.

    Skipped without a password (there is nothing to create an account with)
    and skipped when the PAT was already issued, since a second token would
    be live on GitLab with no record of it. Both are skips, not failures, so
    the projects of an account that already exists can still be created.
    """
    if not candidate.password:
        return _account_skipped(
            candidate,
            "no password supplied.",
            has_account=bool(candidate.pat_issued or candidate.existing_user_id),
        )
    if candidate.pat_issued:
        return _account_skipped(candidate, PAT_ISSUED_NOTICE)
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


def _skip_projects(run, candidate, account):
    """True when the project step has nothing to do for this candidate.

    No template configured, no account for the projects to belong to, an
    account step that failed, or projects an earlier run already created.
    """
    return (
        not run.wants_projects
        or not account.has_account
        or account.failed
        or candidate.projects_created
    )


def _projects_step(run, candidate, account):
    """Create the candidate's template projects, updating *account* in place.

    A half configured template fails the candidate here rather than skipping
    them: the complaint is already on the console, and passing it off as a
    successful run would leave the user without repositories. The account id
    comes from this run or from the registry; with neither,
    provision_user_projects looks it up by username.
    """
    if _skip_projects(run, candidate, account):
        return account
    if run.template_error:
        account.failed = True
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

    Each half is persisted as soon as it is done. The project step waits on
    a server side import that can take minutes, so a token held in memory
    until the end of the run is a token an interrupted run would lose while
    it stays live on GitLab.
    """
    account = _account_step(run, candidate)
    persist_account_result(account)
    result = _projects_step(run, candidate, account)
    persist_projects_result(result)
    return result


def _issue_gitlab_resources(run, candidates):
    """Provision every candidate and return the usernames that failed."""
    results = [_provision_one_gitlab_user(run, candidate) for candidate in candidates]
    return [r.username for r in results if r.failed]


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
    marked gitlab_projects_created keeps the projects it has. A password is
    needed by the account half alone, so retrying the projects of an account
    that already exists takes no credentials.
    """
    provision, err = config_obj.get_gitlab_provision()
    utils.check_error(err)
    if not provision or not candidates:
        return []
    gl, err = gitlabPkg.resolve_client(config_obj)
    if err is not None:
        click.echo(f"GitLab provisioning skipped: {err}")
        return [c.username for c in candidates if _has_gitlab_work(c)]
    templates, template_error = gitlabPkg.resolve_templates(config_obj)
    run = _GitlabRun(gl, templates, template_error)
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
