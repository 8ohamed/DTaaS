"""Picks the users a 'user add' run attempts GitLab provisioning for.

The selection half of users_gitlab.py, which does the provisioning itself:
which registry users are in scope this run, and what the registry already
records about each of them. Kept apart so each module stays within a
reasonable line count, mirroring the users.py / users_compose.py split.
"""

from dataclasses import dataclass


@dataclass
class GitlabCandidate:
    """One registry user queued for GitLab provisioning this run."""

    username: str
    email: str
    existing_user_id: object
    password: object
    pat_issued: bool = False
    projects_created: bool = False


def target_usernames(ctx, start_only, passwords):
    """Registry users to attempt GitLab provisioning for this run.

    Mirrors _provision_users' start_only scoping, plus any already-registered
    user named again this run (a key of *passwords*, with or without a
    password) even though their container isn't being (re)started: the
    explicit retry path after a prior GitLab failure, without touching
    anyone else.
    """
    if start_only is None:
        started = ctx.user_list
    else:
        started = [name for name in start_only if name in ctx.user_list]
    retries = [
        name for name in passwords if name in ctx.user_list and name not in started
    ]
    return started + retries


def gitlab_candidates(ctx, start_only, passwords):
    """A GitlabCandidate for every user targeted for GitLab provisioning.

    Scoping mirrors target_usernames; a target with no password keeps a None
    password here, and users_gitlab skips only the account half for them, so
    a user whose account exists still has their projects attempted.
    """
    candidates = []
    for username in target_usernames(ctx, start_only, passwords):
        details = ctx.users_section.get(username) or {}
        candidates.append(
            GitlabCandidate(
                username,
                details.get("email", ""),
                details.get("gitlab_user_id"),
                passwords.get(username),
                bool(details.get("gitlab_pat_issued")),
                bool(details.get("gitlab_projects_created")),
            )
        )
    return candidates
