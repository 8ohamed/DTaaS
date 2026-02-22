import workbenchReducer, {
  setWorkbenchServices,
  resetWorkbench,
  fetchWorkbenchServices,
  WorkbenchServicesState,
} from 'store/workbench.slice';

describe('workbench reducer', () => {
  const initialState: WorkbenchServicesState = {
    services: {},
    status: 'idle',
  };

  const mockServices = {
    desktop: {
      name: 'Desktop',
      description: 'Virtual Desktop Environment',
      endpoint: 'tools/vnc',
    },
    vscode: {
      name: 'VS Code',
      description: 'VS Code IDE',
      endpoint: 'tools/vscode',
    },
    lab: {
      name: 'Jupyter Lab',
      description: 'Jupyter Lab IDE',
      endpoint: 'lab',
    },
    notebook: {
      name: 'Jupyter Notebook',
      description: 'Jupyter Notebook',
      endpoint: '',
    },
  };

  it('should return the initial state for unknown actions', () => {
    expect(workbenchReducer(undefined, { type: 'unknown' })).toEqual(
      initialState,
    );
  });

  it('should handle setWorkbenchServices', () => {
    const newState = workbenchReducer(
      initialState,
      setWorkbenchServices(mockServices),
    );
    expect(newState.status).toBe('succeeded');
    expect(newState.services).toEqual(mockServices);
  });

  it('should handle resetWorkbench', () => {
    const loadedState: WorkbenchServicesState = {
      services: mockServices,
      status: 'succeeded',
    };
    const newState = workbenchReducer(loadedState, resetWorkbench());
    expect(newState).toEqual(initialState);
  });

  it('should set status to loading when fetchWorkbenchServices is pending', () => {
    const action = { type: fetchWorkbenchServices.pending.type };
    const newState = workbenchReducer(initialState, action);
    expect(newState.status).toBe('loading');
  });

  it('should set services and status to succeeded when fetchWorkbenchServices is fulfilled', () => {
    const action = {
      type: fetchWorkbenchServices.fulfilled.type,
      payload: mockServices,
    };
    const newState = workbenchReducer(initialState, action);
    expect(newState.status).toBe('succeeded');
    expect(newState.services).toEqual(mockServices);
  });

  it('should set status to failed when fetchWorkbenchServices is rejected', () => {
    const action = { type: fetchWorkbenchServices.rejected.type };
    const newState = workbenchReducer(initialState, action);
    expect(newState.status).toBe('failed');
  });
});
