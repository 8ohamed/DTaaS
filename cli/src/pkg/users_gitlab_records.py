"""Persists the outcome of GitLab provisioning for 'user add'.

The disk half of users_gitlab.py: the issued Personal Access Tokens, which
go to a 0600 credentials file, and the per user registry markers that make a
re-run skip the work it already did. Kept apart from the provisioning flow
itself so each module stays within a reasonable line count, mirroring the
users.py / users_compose.py split.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
import click
from . import utils
from .constants import GITLAB_USER_TOKENS_FILE
from .registry import (
    set_gitlab_pat_issued,
    set_gitlab_projects_created,
    set_gitlab_user_ids,
)


def _keep_superseded(existing, username, token):
    """Park any different token already saved for *username* under a
    timestamped key, and warn, rather than dropping it silently."""
    prior = existing.get(username)
    if prior and prior != token:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        existing[f"{username} (superseded {stamp})"] = prior
        click.echo(
            f"Warning: replaced the saved GitLab token for '{username}'; the "
            "previous token is still valid on GitLab and must be revoked "
            "manually."
        )


def _save_gitlab_tokens(tokens):
    """Persist newly issued GitLab PATs, merging with any already saved.

    A username should not already be present, the gitlab_pat_issued guard
    in users_gitlab._account_step stops a re-run from reaching here. If one
    is (e.g. a prior run saved a token then died before recording it in the
    registry), keep the old value under a timestamped key and warn, rather
    than dropping it silently: the old token is still live on GitLab and
    needs manual revocation.
    """
    path = Path(GITLAB_USER_TOKENS_FILE)
    existing = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    for username, token in tokens.items():
        _keep_superseded(existing, username, token)
        existing[username] = token
    utils.write_secret_file(path, json.dumps(existing, indent=2))


def _persist_gitlab_tokens(results):
    """Save newly issued PATs and record that they were issued."""
    tokens = {r.username: r.token for r in results if r.token}
    if tokens:
        _save_gitlab_tokens(tokens)
        set_gitlab_pat_issued(list(tokens))


def persist_gitlab_results(results):
    """Persist changed GitLab user ids, issued PATs, and created projects.

    Recording gitlab_pat_issued alongside the saved token is what stops a
    later re-run from minting a second PAT for the same account;
    gitlab_projects_created does the same job for the template projects,
    separately, so each half is retried only while it is still missing.
    """
    new_user_ids = {r.username: r.new_id for r in results if r.new_id is not None}
    if new_user_ids:
        set_gitlab_user_ids(new_user_ids)
    _persist_gitlab_tokens(results)
    provisioned = [r.username for r in results if r.projects_done]
    if provisioned:
        set_gitlab_projects_created(provisioned)
