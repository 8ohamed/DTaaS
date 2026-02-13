import workspaceServicesReducer, {
  setServices,
  fetchWorkspaceServices,
  WorkspaceServicesState,
} from 'store/workspaceServices.slice';
import { configureStore } from '@reduxjs/toolkit';

describe('workspaceServicesSlice', () => {
  const initialState: WorkspaceServicesState = {
    services: {},
    loading: false,
    error: null,
  };

  const mockServices = {
    desktop: {
      name: 'Desktop',
      description: 'Virtual Desktop',
      endpoint: 'tools/vnc',
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

  it('should return the initial state', () => {
    const state = workspaceServicesReducer(undefined, { type: 'unknown' });
    expect(state).toEqual(initialState);
  });

  it('should handle setServices', () => {
    const state = workspaceServicesReducer(
      initialState,
      setServices(mockServices),
    );
    expect(state.services).toEqual(mockServices);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should handle fetchWorkspaceServices.pending', () => {
    const action = { type: fetchWorkspaceServices.pending.type };
    const state = workspaceServicesReducer(initialState, action);
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  it('should handle fetchWorkspaceServices.fulfilled', () => {
    const action = {
      type: fetchWorkspaceServices.fulfilled.type,
      payload: mockServices,
    };
    const state = workspaceServicesReducer(
      { ...initialState, loading: true },
      action,
    );
    expect(state.loading).toBe(false);
    expect(state.services).toEqual(mockServices);
    expect(state.error).toBeNull();
  });

  it('should handle fetchWorkspaceServices.rejected', () => {
    const action = {
      type: fetchWorkspaceServices.rejected.type,
      error: { message: 'Network error' },
    };
    const state = workspaceServicesReducer(
      { ...initialState, loading: true },
      action,
    );
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Network error');
  });

  it('should handle fetchWorkspaceServices.rejected without error message', () => {
    const action = {
      type: fetchWorkspaceServices.rejected.type,
      error: {},
    };
    const state = workspaceServicesReducer(
      { ...initialState, loading: true },
      action,
    );
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Failed to fetch services');
  });

  describe('fetchWorkspaceServices thunk', () => {
    const createTestStore = () =>
      configureStore({
        reducer: { workspaceServices: workspaceServicesReducer },
      });

    it('should fetch and store services on success', async () => {
      const testStore = createTestStore();
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockServices,
      });

      await testStore.dispatch(
        fetchWorkspaceServices('http://example.com/user1/services'),
      );

      const state = testStore.getState().workspaceServices;
      expect(state.services).toEqual(mockServices);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        'http://example.com/user1/services',
      );
    });

    it('should set error on non-ok response', async () => {
      const testStore = createTestStore();
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await testStore.dispatch(
        fetchWorkspaceServices('http://example.com/user1/services'),
      );

      const state = testStore.getState().workspaceServices;
      expect(state.loading).toBe(false);
      expect(state.error).toContain('Failed to fetch workspace services: 404');
    });

    it('should set error on fetch failure', async () => {
      const testStore = createTestStore();
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));

      await testStore.dispatch(
        fetchWorkspaceServices('http://example.com/user1/services'),
      );

      const state = testStore.getState().workspaceServices;
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
    });
  });
});
