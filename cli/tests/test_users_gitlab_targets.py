"""Tests for the GitLab provisioning target selection (users_gitlab_targets.py)."""

from unittest.mock import MagicMock
import pytest
from src.pkg.users_gitlab_targets import gitlab_candidates, target_usernames


def _ctx(details=None):
    """A users context holding one registry user, 'alice'."""
    return MagicMock(user_list=["alice"], users_section={"alice": details or {}})


def test_target_usernames_start_only_none_means_all_registry_users():
    """start_only=None (config reconcile --fix) targets every registry user."""
    ctx = MagicMock(user_list=["alice", "bob"])
    assert target_usernames(ctx, None, {}) == ["alice", "bob"]


@pytest.mark.parametrize("password", ["pw", None])
def test_target_usernames_adds_a_retry_for_a_user_not_being_started(password):
    """Naming a registered user again, with or without a password, is the
    explicit retry path for a user whose container is not being restarted,
    and picks up nobody else."""
    ctx = MagicMock(user_list=["alice", "bob"])
    named = {"alice": password, "carol": password}
    assert target_usernames(ctx, [], named) == ["alice"]


def test_gitlab_candidates_carry_what_the_registry_records():
    """Both markers reach the candidate, so each half is skipped on its own."""
    details = {
        "email": "a@x.io",
        "gitlab_user_id": 42,
        "gitlab_pat_issued": True,
        "gitlab_projects_created": True,
    }
    candidate = gitlab_candidates(_ctx(details), ["alice"], {"alice": "pw"})[0]
    assert (candidate.username, candidate.email) == ("alice", "a@x.io")
    assert (candidate.existing_user_id, candidate.password) == (42, "pw")
    assert (candidate.pat_issued, candidate.projects_created) == (True, True)


def test_gitlab_candidates_keep_a_missing_password_as_none():
    """A target with no password is still a candidate: their account half is
    skipped, but projects of an account that already exists are not."""
    candidate = gitlab_candidates(_ctx(), ["alice"], {})[0]
    assert candidate.password is None
    assert candidate.pat_issued is False
