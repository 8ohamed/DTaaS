"""Fixtures shared by the tests of users_gitlab.py, which drive it through
users.add_users (the public entry point) and so mirror test_users.py's."""

from unittest.mock import patch, MagicMock
import pytest
from src.gitlab_common import ProjectTemplates
from src.pkg.gitlab.provisioner import ProvisionResult

TEMPLATE_KEYS = {
    "templates_url": "https://github.com/into-cps-association/DTaaS-Examples",
    "common_branch": "common-template",
    "user_branch": "user-template",
}
TEMPLATES = ProjectTemplates(
    TEMPLATE_KEYS["templates_url"],
    TEMPLATE_KEYS["common_branch"],
    TEMPLATE_KEYS["user_branch"],
)
# pylint: disable=redefined-outer-name,unused-argument


@pytest.fixture
def mock_config():
    """Mock config object providing deployment settings from dtaas.toml."""
    mock = MagicMock()
    mock.get_server_dns.return_value = ("foo.example.com", None)
    mock.get_path.return_value = ("/test/path", None)
    mock.get_resource_limits.return_value = (
        {"cpus": 4, "mem_limit": "4G", "pids_limit": 4960, "shm_size": "512m"},
        None,
    )
    mock.get_tls.return_value = (False, None)
    mock.get_set_limits.return_value = (True, None)
    mock.get_gitlab_provision.return_value = (False, None)
    mock.get_gitlab_templates.return_value = (dict(TEMPLATE_KEYS), None)
    mock.get_gitlab_import_timeout.return_value = (None, None)
    mock.get_gitlab_import_deadline.return_value = (None, None)
    return mock


@pytest.fixture(autouse=True)
def mock_gitlab_projects():
    """Stub the project step, which every successful account run reaches, and
    the registry write that follows it, so no test in this module writes a
    real dtaas.users.registry.json into the working directory."""
    with patch(
        "src.pkg.users_gitlab.gitlabPkg.provision_user_projects", return_value=True
    ) as mock_projects, patch(
        "src.pkg.users_gitlab_records.set_gitlab_projects_created"
    ):
        yield mock_projects


@pytest.fixture
def mock_registry():
    """Patch the registry store functions add_users uses."""
    with patch("src.pkg.users.load_registry") as mock_load, patch(
        "src.pkg.users.remove_from_registry"
    ) as mock_remove:
        mock_load.return_value = {"user1": {"email": "user1@x.io"}}
        yield {"load": mock_load, "remove": mock_remove}


@pytest.fixture
def mock_utils():
    """Mock the utils functions add_users calls directly."""
    with patch("src.pkg.users.utils.import_yaml") as mi, patch(
        "src.pkg.users.utils.export_yaml"
    ) as me:
        mi.return_value = ({"version": "3", "services": {}}, None)
        me.return_value = None
        yield {"import": mi, "export": me}


@pytest.fixture
def mock_user_operations():
    """Mock the users_compose functions imported into users.py"""
    with patch("src.pkg.users.create_user_files") as mc, patch(
        "src.pkg.users.add_users_to_compose"
    ) as ma, patch("src.pkg.users.finalize_compose") as mf, patch(
        "src.pkg.users.stop_user_containers"
    ) as mst, patch("src.pkg.users.write_state") as mw:
        mc.return_value = ma.return_value = mf.return_value = None
        mst.return_value = None
        mw.return_value = {}
        yield {"create": mc, "add": ma, "finalize": mf, "stop": mst, "state": mw}


@pytest.fixture
def gitlab_env(mock_config, mock_utils, mock_user_operations):
    """Enable provisioning and patch the client, the account step, the
    container work and every persistence call, so a test can drive add_users
    and assert on the project step alone."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    account = ProvisionResult("alice", True, "created", "glpat-token", user_id=42)
    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client",
        return_value=(MagicMock(), None),
    ), patch(
        "src.pkg.users_gitlab.gitlabPkg.ensure_user_resources", return_value=account
    ) as ensure, patch(
        "src.pkg.users_gitlab_records.utils.write_secret_file"
    ), patch(
        "src.pkg.users_gitlab_records.set_gitlab_pat_issued"
    ) as pat_issued, patch(
        "src.pkg.users_gitlab_records.set_gitlab_user_ids"
    ), patch(
        "src.pkg.users_gitlab_records.set_gitlab_projects_created"
    ) as projects_created:
        yield {
            "ensure": ensure,
            "pat_issued": pat_issued,
            "projects_created": projects_created,
        }
