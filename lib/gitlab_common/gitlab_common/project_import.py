"""Waits for the asynchronous repository import behind a new GitLab project.

Split out of project_api.py, which uses it: a project created with an
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

import gitlab

logger = logging.getLogger(__name__)

# Poll budget for the asynchronous repository import: 300 attempts, 2 seconds
# apart, so a slow template clone has 10 minutes before it is given up on.
IMPORT_POLL_SECONDS = 2
IMPORT_POLL_ATTEMPTS = 300

IMPORT_NOT_SCHEDULED = (
    "GitLab did not schedule the repository import; check that the "
    "'Repository by URL' import source is enabled on the instance and that "
    "the server can reach the template URL"
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
        return f"repository import failed: {detail}"
    return IMPORT_NOT_SCHEDULED if status == "none" else None


def await_import(gl: gitlab.Gitlab, project_id: int):
    """Poll *project_id* until its repository import finishes.

    Returns:
        Tuple of (project, error); *error* is empty when the repository is
        ready. The project is re fetched on every attempt because its import
        status only changes server side.
    """
    project = gl.projects.get(project_id)
    for _ in range(IMPORT_POLL_ATTEMPTS):
        state = import_state(project)
        if state is not None:
            return project, state
        time.sleep(IMPORT_POLL_SECONDS)
        project = gl.projects.get(project_id)
    return project, "timed out waiting for the repository import to finish"
