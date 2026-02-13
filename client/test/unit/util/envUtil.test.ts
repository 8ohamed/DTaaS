import {
  useURLforDT,
  useURLforLIB,
  useWorkbenchLinkValues,
  cleanURL,
  useURLbasename,
  useServicesUrl,
} from 'util/envUtil';
import { useSelector } from 'react-redux';

jest.unmock('util/envUtil');

describe('envUtil', () => {
  const testDT = 'testDT';
  const testLIB = '';
  const testAppURL = 'https://example.com';
  const testBasename = 'testBasename';
  const testWorkbenchEndpoints = ['one', '/two', 'three/', '/four/postfix'];
  const testUsername = 'username';
  const testAppID = 'testAppID';
  const testAuthority = 'https://example.com';
  const testScopes = 'testScopes';
  const testRedirect = 'https://example.com/redirect';
  const testLogoutRedirect = 'https://example.com';

  const testServices = {
    desktop: {
      name: 'Desktop',
      description: 'Virtual Desktop',
      endpoint: testWorkbenchEndpoints[0],
    },
    vscode: {
      name: 'VS Code',
      description: 'VS Code IDE',
      endpoint: testWorkbenchEndpoints[1],
    },
    notebook: {
      name: 'Jupyter Notebook',
      description: 'Jupyter Notebook',
      endpoint: testWorkbenchEndpoints[2],
    },
    lab: {
      name: 'Jupyter Lab',
      description: 'Jupyter Lab IDE',
      endpoint: testWorkbenchEndpoints[3],
    },
  };

  globalThis.env = {
    REACT_APP_ENVIRONMENT: 'test',
    REACT_APP_URL: testAppURL,
    REACT_APP_URL_BASENAME: testBasename,
    REACT_APP_URL_DTLINK: testDT,
    REACT_APP_URL_LIBLINK: testLIB,

    REACT_APP_CLIENT_ID: testAppID,
    REACT_APP_AUTH_AUTHORITY: testAuthority,
    REACT_APP_GITLAB_SCOPES: testScopes,
    REACT_APP_REDIRECT_URI: testRedirect,
    REACT_APP_LOGOUT_REDIRECT_URI: testLogoutRedirect,
  };

  beforeEach(() => {
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector: (state: Record<string, unknown>) => unknown) => {
        const mockState = {
          auth: { userName: testUsername },
          workspaceServices: { services: testServices },
        };
        return selector(mockState);
      },
    );
  });

  test('GetURL should return the correct enviroment variables', () => {
    expect(useURLforDT()).toBe(
      `${testAppURL}/${testBasename}/${testUsername}/${testDT}`,
    );
    expect(useURLforLIB()).toBe(
      `${testAppURL}/${testBasename}/${testUsername}/${testLIB}`,
    );
    expect(useURLbasename()).toBe(testBasename);
  });

  test('GetWorkbenchLinkValues should return an array', () => {
    const result = useWorkbenchLinkValues();
    expect(Array.isArray(result)).toBe(true);
  });

  // Test that array elements have the expected shape
  test('GetWorkbenchLinkValues should return an array of objects with "key" and "link" properties', () => {
    const result = useWorkbenchLinkValues();
    expect(
      result.every(
        (el) => typeof el.key === 'string' && typeof el.link === 'string',
      ),
    ).toBe(true);
  });

  // Test that the service links are correctly constructed
  it('should construct the links correctly from services', () => {
    const result = useWorkbenchLinkValues();

    const serviceEntries = Object.values(testServices);
    const serviceLinks = result.filter(
      (el) => el.key !== 'LIBRARY_PREVIEW' && el.key !== 'DT_PREVIEW',
    );

    serviceLinks.forEach((el, i) => {
      expect(el.link).toEqual(
        `${testAppURL}/${testBasename}/${testUsername}/${cleanURL(
          serviceEntries[i].endpoint,
        )}`,
      );
    });
  });

  // Test that preview links are included
  it('should include preview links', () => {
    const result = useWorkbenchLinkValues();
    const previewLinks = result.filter(
      (el) => el.key === 'LIBRARY_PREVIEW' || el.key === 'DT_PREVIEW',
    );
    expect(previewLinks).toHaveLength(2);
    expect(previewLinks[0]).toEqual({
      key: 'LIBRARY_PREVIEW',
      link: '/preview/library',
    });
    expect(previewLinks[1]).toEqual({
      key: 'DT_PREVIEW',
      link: '/preview/digitaltwins',
    });
  });

  // Test key mapping from service keys to icon keys
  it('should map service keys to icon keys correctly', () => {
    const result = useWorkbenchLinkValues();
    const serviceLinks = result.filter(
      (el) => el.key !== 'LIBRARY_PREVIEW' && el.key !== 'DT_PREVIEW',
    );
    expect(serviceLinks[0].key).toBe('VNCDESKTOP');
    expect(serviceLinks[1].key).toBe('VSCODE');
    expect(serviceLinks[2].key).toBe('JUPYTERNOTEBOOK');
    expect(serviceLinks[3].key).toBe('JUPYTERLAB');
  });

  it('cleanURL should remove leading and trailing slashes', () => {
    expect(cleanURL('/test/')).toBe('test');
    expect(cleanURL('/test')).toBe('test');
    expect(cleanURL('test/')).toBe('test');
    expect(cleanURL('test')).toBe('test');
  });

  it('should return the services URL', () => {
    expect(useServicesUrl()).toBe(
      `${testAppURL}/${testBasename}/${testUsername}/services`,
    );
  });

  it('still handles if basename is set to empty string', () => {
    globalThis.env.REACT_APP_URL_BASENAME = '';
    expect(useURLforDT()).toBe(`${testAppURL}/${testUsername}/${testDT}`);
    expect(useURLforLIB()).toBe(`${testAppURL}/${testUsername}/${testLIB}`);
    expect(useURLbasename()).toBe('');
  });
});
