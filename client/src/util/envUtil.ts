import { useSelector } from 'react-redux';
import { RootState } from 'store/store';
import { WorkspaceService } from 'store/workspaceServices.slice';

/**
 * @param url or endpoint to clean
 * @returns a `string` with no whitespaces, leading or trailing slashes
 */
export function cleanURL(url: string): string {
  return url?.trim().replace(/^\/|\/$/g, ''); // Remove leading and trailing slashes
}

/**
 * Injects the `username` into the `baseURL` and `endpoint` to create a link.
 * @param baseURL Example `https://foo.com` Any leading or trailing slashes will be removed.
 * @param endpoint (optional). Example `bar` Any leading or trailing slashes will be removed.
 * @returns a complete URL: `baseUrl` / `username` / `endpoint`
 */
const useUserLink = (baseURL: string, endpoint?: string): string => {
  const username = useSelector((state: RootState) => state.auth).userName;
  const cleanBaseURL = cleanURL(baseURL);
  const cleanEndpoint = cleanURL(endpoint ?? '');
  return `${cleanBaseURL}/${username}/${cleanEndpoint}`;
};

export function useURLforDT(): string {
  return useUserLink(useAppURL(), window.env.REACT_APP_URL_DTLINK);
}

export function useURLbasename(): string {
  return cleanURL(window.env.REACT_APP_URL_BASENAME);
}

export function useURLforLIB(): string {
  return useUserLink(useAppURL(), window.env.REACT_APP_URL_LIBLINK);
}

export function useAppURL(): string {
  return `${cleanURL(window.env.REACT_APP_URL)}/${useURLbasename()}`;
}

export interface KeyLinkPair {
  key: string;
  link: string;
}

const serviceKeyToIconKey: Record<string, string> = {
  desktop: 'VNCDESKTOP',
  vscode: 'VSCODE',
  notebook: 'JUPYTERNOTEBOOK',
  lab: 'JUPYTERLAB',
};

/**
 * @returns an array of `KeyLinkPair` objects derived from workspace services stored in Redux.
 *
 * The workspace services are fetched from the user's workspace `/services` endpoint
 * and stored in the Redux store. Each service has a key (e.g., "desktop", "vscode"),
 * a name, description, and endpoint.
 *
 * The `key` is mapped to the corresponding icon key used by LinkIcons
 * (e.g., "desktop" → "VNCDESKTOP", "vscode" → "VSCODE").
 *
 * The `link` is constructed by appending the `username` and service endpoint to the base URL.
 *
 * Additionally, preview links for Library and Digital Twins are included.
 */
export function getWorkbenchLinkValues(): KeyLinkPair[] {
  const services: Record<string, WorkspaceService> = useSelector(
    (state: RootState) => state.workspaceServices.services,
  );
  const workbenchLinkValues: KeyLinkPair[] = [];

  Object.entries(services).forEach(([serviceKey, service]) => {
    const iconKey = serviceKeyToIconKey[serviceKey] ?? serviceKey.toUpperCase();
    const link = useUserLink(useAppURL(), service.endpoint);
    workbenchLinkValues.push({
      key: iconKey,
      link,
    });
  });

  workbenchLinkValues.push({
    key: 'LIBRARY_PREVIEW',
    link: '/preview/library',
  });

  workbenchLinkValues.push({
    key: 'DT_PREVIEW',
    link: '/preview/digitaltwins',
  });

  return workbenchLinkValues;
}

export function useGetDTPagePreviewLink(): string {
  return useUserLink(useAppURL(), 'preview/digitaltwins');
}

export function getClientID(): string {
  return window.env.REACT_APP_CLIENT_ID;
}

export function getAuthority(): string {
  return window.env.REACT_APP_AUTH_AUTHORITY;
}

export function getRedirectURI(): string {
  return window.env.REACT_APP_REDIRECT_URI;
}

export function getLogoutRedirectURI(): string {
  return window.env.REACT_APP_LOGOUT_REDIRECT_URI;
}

export function getGitLabScopes(): string {
  return window.env.REACT_APP_GITLAB_SCOPES;
}

export function useServicesUrl(): string {
  return useUserLink(useAppURL(), 'services');
}
