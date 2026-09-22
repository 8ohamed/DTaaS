"""Waits for the asynchronous repository import behind a new GitLab project.

Split out of projects.py, which uses it: a project created with an
import_url exists before its repository does, so the import status is polled
until the repository is there and only then are the branches touched.

The two instance side prerequisites of import by URL are reported from here.
The "Repository by URL" import source must be enabled (Admin Area, Settings,
General, Import and export settings) and the GitLab server itself must be
able to reach the template URL; neither is visible to the CLI, so a status
that says the import never started names them in the error.
"""

import logging
import time
from dataclasses import dataclass
from typing import Any

import gitlab
import gitlab.exceptions
import requests

logger = logging.getLogger(__name__)

# Poll budget for the asynchronous repository import: 300 attempts, 2 seconds
# apart, so a slow template clone has 10 minutes before it is given up on.
IMPORT_POLL_SECONDS = 2
IMPORT_POLL_ATTEMPTS = 300

# A poll that cannot reach GitLab is retried, so one transient error in a
# long wait does not fail the user; this many in a row ends the wait. A
# dropped connection is a requests error, which python-gitlab does not wrap.
IMPORT_POLL_MAX_ERRORS = 3
POLL_ERRORS = (gitlab.exceptions.GitlabError, requests.RequestException)

# GitLab never reruns an import that failed or never started, so the empty
# project it leaves behind has to go before a new import can be made.
IMPORT_RETRY_HINT = "delete the empty project in GitLab and re-run to import it again"

IMPORT_NOT_SCHEDULED = (
    "GitLab did not schedule the repository import; check that the "
    "'Repository by URL' import source is enabled on the instance and that "
    f"the server can reach the template URL, then {IMPORT_RETRY_HINT}"
)


def import_state(project) -> str | None:
    """Empty string once the repository is in place, an error string when the
    import failed or never started, or None while it is still running.

    Every project polled here is created with an import_url, so status
    ``none`` is not "nothing to wait for": it means GitLab never scheduled
    the import, the usual cause being a disabled import source.
    """
    status = getattr(project, "import_status", "none")
    if status == "finished":
        return ""
    if status == "failed":
        detail = getattr(project, "import_error", "") or "no detail reported"
        return f"repository import failed: {detail}; {IMPORT_RETRY_HINT}"
    return IMPORT_NOT_SCHEDULED if status == "none" else None


@dataclass
class _Poll:
    """What the import wait has seen so far: the latest project read, and how
    many reads in a row have failed."""

    project: Any = None
    errors: int = 0


def _poll_once(gl: gitlab.Gitlab, project_id: int, poll: _Poll) -> str | None:
    """Read the project once; the state to stop on, or None to keep waiting.

    A failed read counts towards IMPORT_POLL_MAX_ERRORS and a good one resets
    the count, so only an unreachable GitLab ends the wait on errors.
    """
    try:
        poll.project = gl.projects.get(project_id)
    except POLL_ERRORS as exc:
        poll.errors += 1
        logger.warning("Could not read the import status: %s", exc)
        if poll.errors < IMPORT_POLL_MAX_ERRORS:
            return None
        return f"could not read the import status {poll.errors} times in a row: {exc}"
    poll.errors = 0
    return import_state(poll.project)


def await_import(gl: gitlab.Gitlab, project_id: int):
    """Poll *project_id* until its repository import finishes.

    Returns:
        Tuple of (project, error); *error* is empty when the repository is
        ready. The project is re fetched on every attempt because its import
        status only changes server side, and is None only when no read ever
        succeeded. Nothing is raised: an unreachable GitLab is an error for
        this project, not for the rest of the caller's users.
    """
    poll = _Poll()
    for _ in range(IMPORT_POLL_ATTEMPTS):
        state = _poll_once(gl, project_id, poll)
        if state is not None:
            return poll.project, state
        time.sleep(IMPORT_POLL_SECONDS)
    return poll.project, "timed out waiting for the repository import to finish"
