import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { z } from 'zod';

const WorkbenchServiceSchema = z.object({
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
});

const WorkbenchServicesSchema = z.record(z.string(), WorkbenchServiceSchema);

export type WorkbenchService = z.infer<typeof WorkbenchServiceSchema>;

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
    const data: unknown = await response.json();
    return WorkbenchServicesSchema.parse(data);
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
