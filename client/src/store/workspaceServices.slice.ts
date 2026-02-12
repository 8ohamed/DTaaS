import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface WorkspaceService {
  name: string;
  description: string;
  endpoint: string;
}

export interface WorkspaceServicesState {
  services: Record<string, WorkspaceService>;
  loading: boolean;
  error: string | null;
}

const initialState: WorkspaceServicesState = {
  services: {},
  loading: false,
  error: null,
};

export const fetchWorkspaceServices = createAsyncThunk(
  'workspaceServices/fetch',
  async (servicesUrl: string) => {
    const response = await fetch(servicesUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch workspace services: ${response.status}`);
    }
    const data: Record<string, WorkspaceService> = await response.json();
    return data;
  },
);

const workspaceServicesSlice = createSlice({
  name: 'workspaceServices',
  initialState,
  reducers: {
    setServices: (
      state,
      action: PayloadAction<Record<string, WorkspaceService>>,
    ) => {
      state.services = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaceServices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkspaceServices.fulfilled, (state, action) => {
        state.loading = false;
        state.services = action.payload;
      })
      .addCase(fetchWorkspaceServices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to fetch services';
      });
  },
});

export const { setServices } = workspaceServicesSlice.actions;
export default workspaceServicesSlice.reducer;
