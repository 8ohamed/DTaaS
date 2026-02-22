import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

export interface WorkbenchService {
  name: string;
  description: string;
  endpoint: string;
}

export interface WorkbenchServicesState {
  services: Record<string, WorkbenchService>;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
}

const initialState: WorkbenchServicesState = {
  services: {},
  status: 'idle',
};

export const fetchWorkbenchServices = createAsyncThunk(
  'workbench/fetchServices',
  async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch services: ${response.statusText}`);
    }
    return (await response.json()) as Record<string, WorkbenchService>;
  },
);

const workbenchSlice = createSlice({
  name: 'workbench',
  initialState,
  reducers: {
    setWorkbenchServices: (state, action) => {
      state.services = action.payload as Record<string, WorkbenchService>;
      state.status = 'succeeded';
    },
    resetWorkbench: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkbenchServices.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchWorkbenchServices.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.services = action.payload;
      })
      .addCase(fetchWorkbenchServices.rejected, (state) => {
        state.status = 'failed';
      });
  },
});

export const { setWorkbenchServices, resetWorkbench } = workbenchSlice.actions;
export default workbenchSlice.reducer;
