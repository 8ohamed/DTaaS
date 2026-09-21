"""GitLab user provisioning for the DTaaS CLI.

Built on gitlab_common (vendored from lib/gitlab_common by src/pkg/build.py)
for the client and the user/PAT primitives, so no GitLab client or account
idempotency code is reimplemented here. Project provisioning is the CLI's own
(project_api.py): it is needed by this package alone, so it is not carried
into the shared module. Group provisioning is not implemented.

Deployment-specific glue (resolving the API URL/PAT and the project template
from dtaas.toml, and persisting issued tokens) lives in pkg/users_gitlab.py,
mirroring how dtaas_services keeps that glue out of the shared module.
"""

from .client import resolve_client
from .projects import (
    ProjectTarget,
    ProjectTemplates,
    ensure_user_projects,
    provision_user_projects,
)
from .provisioner import GitlabUser, ProvisionResult, ensure_user_resources

__all__ = [
    "resolve_client",
    "GitlabUser",
    "ProvisionResult",
    "ensure_user_resources",
    "ProjectTarget",
    "ProjectTemplates",
    "ensure_user_projects",
    "provision_user_projects",
]
