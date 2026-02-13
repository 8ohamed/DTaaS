import { screen, within } from '@testing-library/react';
import {
  itShowsTheTooltipWhenHoveringButton,
  setupIntegrationTest,
} from 'test/integration/integration.testUtil';
import { testLayout } from 'test/integration/Routes/routes.testUtil';
import store from 'store/store';
import { setServices } from 'store/workspaceServices.slice';

globalThis.env = {
  ...globalThis.env,
  REACT_APP_URL: 'http://example.com/',
  REACT_APP_URL_BASENAME: 'basename',
};

jest.deepUnmock('util/envUtil');

const mockServices = {
  desktop: {
    name: 'Desktop',
    description: 'Virtual Desktop Environment',
    endpoint: 'tools/vnc?foo=bar',
  },
  vscode: {
    name: 'VS Code',
    description: 'VS Code IDE',
    endpoint: 'tools/vscode',
  },
  notebook: {
    name: 'Jupyter Notebook',
    description: 'Jupyter Notebook',
    endpoint: '',
  },
  lab: {
    name: 'Jupyter Lab',
    description: 'Jupyter Lab IDE',
    endpoint: 'lab',
  },
};

async function testTool(toolTipText: string, name: string) {
  const toolDiv = screen.getByLabelText(toolTipText);
  expect(toolDiv).toBeInTheDocument();
  const toolHeading = within(toolDiv).getByRole('heading', { level: 6 });
  expect(toolHeading).toBeInTheDocument();
  expect(toolHeading).toHaveTextContent(name);
  const toolButton = within(toolDiv).getByTitle(`${name}-btn`);
  expect(toolButton).toBeInTheDocument();
}

const setup = async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => mockServices,
  });
  store.dispatch(setServices(mockServices));
  await setupIntegrationTest('/workbench');
};

describe('Workbench', () => {
  const desktopLabel = 'http://example.com/basename/username/tools/vnc?foo=bar';
  const VSCodeLabel = 'http://example.com/basename/username/tools/vscode';
  const jupyterLabLabel = 'http://example.com/basename/username/lab';
  const jupyterNotebookLabel = 'http://example.com/basename/username/';
  beforeEach(async () => {
    await setup();
  });

  it('renders the Workbench and Layout correctly', async () => {
    await testLayout();

    const mainHeading = screen.getByRole('heading', { level: 4 });
    expect(mainHeading).toBeInTheDocument();
    expect(mainHeading).toHaveTextContent(/Workbench Tools/);

    await testTool(desktopLabel, 'Desktop');
    await testTool(VSCodeLabel, 'VSCode');
    await testTool(jupyterLabLabel, 'JupyterLab');
    await testTool(jupyterNotebookLabel, 'Jupyter Notebook');
  });

  it('shows the tooltip when hovering over the tools', async () => {
    await itShowsTheTooltipWhenHoveringButton(desktopLabel);
    await itShowsTheTooltipWhenHoveringButton(VSCodeLabel);
    await itShowsTheTooltipWhenHoveringButton(jupyterLabLabel);
    await itShowsTheTooltipWhenHoveringButton(jupyterNotebookLabel);
  });
});
