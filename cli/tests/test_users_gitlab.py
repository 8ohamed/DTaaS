"""Tests for the optional GitLab account/PAT/project provisioning in
users_gitlab.py.

Driven through users.add_users (the public entry point), so the fixtures
mirror test_users.py's. The project step is mocked here; its own behaviour
is covered by test_pkg_gitlab/test_projects.py.
"""

from unittest.mock import patch, MagicMock
import pytest
from src.pkg import users
from src.pkg import users_gitlab
from src.pkg import gitlab as gitlabPkg
from src.pkg.gitlab.provisioner import ProvisionResult

TEMPLATE_KEYS = {
    "templates_url": "https://github.com/into-cps-association/DTaaS-Examples",
    "common_branch": "common-template",
    "user_branch": "user-template",
}
TEMPLATES = gitlabPkg.ProjectTemplates(
    TEMPLATE_KEYS["templates_url"],
    TEMPLATE_KEYS["common_branch"],
    TEMPLATE_KEYS["user_branch"],
)
# pylint: disable=redefined-outer-name,unused-argument,protected-access


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


def _run_add(mock_config, mock_registry, details, start_only=("alice",)):
    """Run add_users for the single registry user 'alice' with *details*."""
    mock_registry["load"].return_value = {"alice": details}
    return users.add_users(
        mock_config, start_only=list(start_only), passwords={"alice": "S3cur3-p4ss"}
    )


def test_gitlab_target_usernames_start_only_none_means_all_registry_users():
    """start_only=None (config reconcile --fix) targets every registry user."""
    ctx = MagicMock(user_list=["alice", "bob"])
    assert users_gitlab._gitlab_target_usernames(ctx, None, {}) == ["alice", "bob"]


def test_add_users_skips_gitlab_when_provision_disabled(
    mock_config, mock_registry, mock_utils, mock_user_operations
):
    """No GitLab client is built when [gitlab].provision is False, even with
    passwords supplied."""
    mock_registry["load"].return_value = {"alice": {"email": "a@x.io"}}

    with patch("src.pkg.users_gitlab.gitlabPkg.resolve_client") as mock_resolve:
        err = users.add_users(
            mock_config, start_only=["alice"], passwords={"alice": "pw"}
        )

    assert err is None
    mock_resolve.assert_not_called()


def test_add_users_provisions_gitlab_persists_new_user_id(
    mock_config, mock_registry, mock_utils, mock_user_operations
):
    """A freshly created account's user_id is persisted to the registry, so
    a later retry can reissue a PAT without going through create_user again."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    mock_registry["load"].return_value = {"alice": {"email": "alice@x.io"}}
    gl = MagicMock()

    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client", return_value=(gl, None)
    ), patch(
        "src.pkg.users_gitlab.gitlabPkg.ensure_user_resources",
        return_value=ProvisionResult(
            "alice", True, "created", "glpat-token", user_id=42
        ),
    ), patch("src.pkg.users_gitlab_records.utils.write_secret_file"), patch(
        "src.pkg.users_gitlab_records.set_gitlab_pat_issued"
    ), patch(
        "src.pkg.users_gitlab_records.set_gitlab_user_ids"
    ) as mock_set_ids:
        err = users.add_users(
            mock_config, start_only=["alice"], passwords={"alice": "S3cur3-p4ss"}
        )

    assert err is None
    mock_set_ids.assert_called_once_with({"alice": 42})


def test_add_users_gitlab_skips_user_with_no_password(
    mock_config, mock_registry, mock_utils, mock_user_operations, capsys
):
    """A targeted user missing from the passwords map is skipped with a
    warning, not silently ignored or fatal."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    mock_registry["load"].return_value = {
        "alice": {"email": "a@x.io"},
        "bob": {"email": "b@x.io"},
    }
    gl = MagicMock()

    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client", return_value=(gl, None)
    ), patch(
        "src.pkg.users_gitlab.gitlabPkg.ensure_user_resources",
        return_value=ProvisionResult("alice", True, "created", "glpat-token"),
    ) as mock_ensure, patch("src.pkg.users_gitlab_records.utils.write_secret_file"), patch(
        "src.pkg.users_gitlab_records.set_gitlab_pat_issued"
    ):
        err = users.add_users(
            mock_config,
            start_only=["alice", "bob"],
            passwords={"alice": "S3cur3-p4ss"},
        )

    assert err is None
    mock_ensure.assert_called_once()
    assert "no password supplied" in capsys.readouterr().out


def test_add_users_gitlab_client_failure_fails_the_command(
    mock_config, mock_registry, mock_utils, mock_user_operations, capsys
):
    """A GitLab client/PAT resolution failure is reported and surfaces as a
    command failure (non-zero exit), even though container provisioning
    already succeeded by this point and is left in place."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    mock_registry["load"].return_value = {"alice": {"email": "a@x.io"}}

    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client",
        return_value=(None, Exception("no PAT configured")),
    ):
        err = users.add_users(
            mock_config, start_only=["alice"], passwords={"alice": "pw"}
        )

    assert err is not None
    assert "alice" in str(err)
    assert "GitLab provisioning skipped" in capsys.readouterr().out


def test_add_users_gitlab_provisioning_failure_fails_the_command(
    mock_config, mock_registry, mock_utils, mock_user_operations, capsys
):
    """A per-user GitLab provisioning failure is reported, surfaces as a
    command failure, and no token is saved for that user."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    mock_registry["load"].return_value = {"alice": {"email": "a@x.io"}}
    gl = MagicMock()

    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client", return_value=(gl, None)
    ), patch(
        "src.pkg.users_gitlab.gitlabPkg.ensure_user_resources",
        return_value=ProvisionResult("alice", False, "GitLab unreachable"),
    ), patch("src.pkg.users_gitlab_records.utils.write_secret_file") as mock_write:
        err = users.add_users(
            mock_config, start_only=["alice"], passwords={"alice": "pw"}
        )

    assert err is not None
    assert "alice" in str(err)
    mock_write.assert_not_called()
    assert "GitLab provisioning failed for 'alice'" in capsys.readouterr().out


def test_add_users_gitlab_skips_user_whose_pat_was_already_issued(
    mock_config, mock_registry, mock_utils, mock_user_operations, capsys
):
    """A re-run for an already-registered user whose registry entry is marked
    gitlab_pat_issued issues no new token: ensure_user_resources is never
    called, nothing is written, and it is not a command failure (H1)."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    mock_registry["load"].return_value = {
        "alice": {"email": "a@x.io", "gitlab_user_id": 42, "gitlab_pat_issued": True}
    }
    gl = MagicMock()

    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client", return_value=(gl, None)
    ), patch(
        "src.pkg.users_gitlab.gitlabPkg.ensure_user_resources"
    ) as mock_ensure, patch(
        "src.pkg.users_gitlab_records.utils.write_secret_file"
    ) as mock_write, patch(
        "src.pkg.users_gitlab_records.set_gitlab_pat_issued"
    ) as mock_set_issued:
        err = users.add_users(
            mock_config, start_only=[], passwords={"alice": "S3cur3-p4ss"}
        )

    assert err is None
    mock_ensure.assert_not_called()
    mock_write.assert_not_called()
    mock_set_issued.assert_not_called()
    assert "already issued" in capsys.readouterr().out


def test_add_users_gitlab_already_exists_warns_but_is_not_a_command_failure(
    mock_config, mock_registry, mock_utils, mock_user_operations, capsys
):
    """An account that already existed before this run is echoed as an
    unconditional warning -- not silently treated as an unremarkable success
    -- but does not fail the command, since this run changed nothing."""
    mock_config.get_gitlab_provision.return_value = (True, None)
    mock_registry["load"].return_value = {"alice": {"email": "a@x.io"}}
    gl = MagicMock()

    with patch(
        "src.pkg.users_gitlab.gitlabPkg.resolve_client", return_value=(gl, None)
    ), patch(
        "src.pkg.users_gitlab.gitlabPkg.ensure_user_resources",
        return_value=ProvisionResult(
            "alice", True, "account already exists", already_exists=True
        ),
    ), patch("src.pkg.users_gitlab_records.utils.write_secret_file") as mock_write:
        err = users.add_users(
            mock_config, start_only=["alice"], passwords={"alice": "pw"}
        )

    assert err is None
    mock_write.assert_not_called()
    out = capsys.readouterr().out
    assert "Warning" in out
    assert "alice" in out


def test_add_users_creates_projects_from_the_configured_template(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects
):
    """A newly provisioned user gets both projects, from the configured
    template, under the account id this run created, and is recorded as done."""
    err = _run_add(mock_config, mock_registry, {"email": "a@x.io"})

    assert err is None
    target, templates = mock_gitlab_projects.call_args.args[1:]
    assert (target.username, target.user_id) == ("alice", 42)
    assert templates == TEMPLATES
    gitlab_env["projects_created"].assert_called_once_with(["alice"])


def test_add_users_skips_projects_already_created(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects
):
    """A user marked gitlab_projects_created keeps the repositories they have."""
    details = {"email": "a@x.io", "gitlab_projects_created": True}
    err = _run_add(mock_config, mock_registry, details)

    assert err is None
    mock_gitlab_projects.assert_not_called()


def test_add_users_creates_projects_although_the_pat_was_issued(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects
):
    """A PAT issued on an earlier run must not skip a user whose projects are
    still missing: the account step is skipped, the project step is not."""
    details = {"email": "a@x.io", "gitlab_user_id": 42, "gitlab_pat_issued": True}
    err = _run_add(mock_config, mock_registry, details, start_only=[])

    assert err is None
    gitlab_env["ensure"].assert_not_called()
    assert mock_gitlab_projects.call_args.args[1].user_id == 42


def test_add_users_creates_projects_for_a_pre_existing_account(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects
):
    """An account this run did not create still gets its projects; with no id
    to hand, the project step is left to resolve it by username."""
    gitlab_env["ensure"].return_value = ProvisionResult(
        "alice", True, "account already exists", already_exists=True
    )
    err = _run_add(mock_config, mock_registry, {"email": "a@x.io"})

    assert err is None
    assert mock_gitlab_projects.call_args.args[1].user_id is None


def test_add_users_project_failure_fails_the_command(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects
):
    """Projects that could not be created fail the command and are not
    recorded, while the token this run really did issue still is: the next
    run must retry the projects alone, not mint a second token."""
    mock_gitlab_projects.return_value = False
    err = _run_add(mock_config, mock_registry, {"email": "a@x.io"})

    assert err is not None
    assert "alice" in str(err)
    gitlab_env["projects_created"].assert_not_called()
    gitlab_env["pat_issued"].assert_called_once_with(["alice"])


def test_add_users_skips_projects_when_the_account_failed(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects
):
    """No account means no namespace to create projects in."""
    gitlab_env["ensure"].return_value = ProvisionResult(
        "alice", False, "GitLab unreachable"
    )
    err = _run_add(mock_config, mock_registry, {"email": "a@x.io"})

    assert err is not None
    mock_gitlab_projects.assert_not_called()


def test_add_users_without_a_template_still_provisions_accounts(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects, capsys
):
    """A dtaas.toml that configures no project template is not a failure: the
    account and its token are provisioned and only the projects are skipped."""
    mock_config.get_gitlab_templates.return_value = (None, None)
    err = _run_add(mock_config, mock_registry, {"email": "a@x.io"})

    assert err is None
    gitlab_env["ensure"].assert_called_once()
    mock_gitlab_projects.assert_not_called()
    assert "no project template in dtaas.toml" in capsys.readouterr().out


def test_add_users_with_a_half_configured_template_names_the_gap(
    mock_config, mock_registry, gitlab_env, mock_gitlab_projects, capsys
):
    """Only some of the template keys set is reported as the mistake it is,
    without taking the account step down with it."""
    mock_config.get_gitlab_templates.return_value = (
        None,
        Exception("Config file error: gitlab project template is incomplete"),
    )
    err = _run_add(mock_config, mock_registry, {"email": "a@x.io"})

    assert err is None
    gitlab_env["ensure"].assert_called_once()
    mock_gitlab_projects.assert_not_called()
    assert "template is incomplete" in capsys.readouterr().out
