"""Shared test fixtures and constants."""

import pytest

CONF_SERVER_CONTENT = (
    "rule.libms.action=auth\n"
    "rule.libms.rule=PathPrefix(`/lib`)\n"
    "\n"
    "rule.onlyu1.action=auth\n"
    "rule.onlyu1.rule=PathPrefix(`/user1`)\n"
    "rule.onlyu1.whitelist=user1@example.com\n"
    "\n"
    "rule.onlyu2.action=auth\n"
    "rule.onlyu2.rule=PathPrefix(`/user2`)\n"
    "rule.onlyu2.whitelist=user2@example.com\n"
)


@pytest.fixture
def base(tmp_path):
    """A valid config whose path/certs-src point at an existing directory."""
    existing = str(tmp_path)
    return {
        "git-repo": "https://github.com/into-cps-association/DTaaS.git",
        "common": {
            "server-dns": "localhost",
            "path": existing,
            "security": {"certs-src": existing},
            "resources": {
                "cpus": 4,
                "pids_limit": 4960,
                "mem_limit": "4G",
                "shm_size": "512m",
            },
        },
        "users": [
            {
                "username": "u1",
                "email": "u1@intocps.org",
                "groups": ["default"],
                "load_balance": True,
            },
            {"username": "u2", "email": "u2@intocps.org"},
        ],
    }
