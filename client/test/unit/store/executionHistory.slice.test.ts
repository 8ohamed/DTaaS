import executionHistoryReducer, {
  setLoading,
  setError,
  setExecutionHistoryEntries,
  setExecutionHistoryEntriesForDT,
  addExecutionHistoryEntry,
  updateExecutionHistoryEntry,
  updateExecutionStatus,
  updateExecutionLogs,
  removeExecutionHistoryEntry,
  removeEntriesForDT,
  setSelectedExecutionId,
  clearEntries,
  fetchExecutionHistory,
  removeExecution,
  setStorageService,
  fetchAllExecutionHistory,
  addExecution,
  updateExecution,
  clearExecutionHistoryForDT,
  checkRunningExecutions,
} from 'model/backend/state/executionHistory.slice';
import {
  selectExecutionHistoryEntries,
  selectExecutionHistoryByDTName,
  selectExecutionHistoryById,
  selectSelectedExecutionId,
  selectSelectedExecution,
  selectExecutionHistoryLoading,
  selectExecutionHistoryError,
} from 'model/backend/state/executionHistory.selectors';
import { DTExecutionResult } from 'model/backend/gitlab/types/executionHistory';
import { configureStore } from '@reduxjs/toolkit';
import { RootState } from 'store/store';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import { IExecutionHistoryStorage } from 'model/backend/interfaces/sharedInterfaces';

// Create a mock storage service
const createMockStorageService = (): jest.Mocked<IExecutionHistoryStorage> => ({
  init: jest.fn().mockResolvedValue(undefined),
  add: jest.fn().mockResolvedValue('mock-id'),
  update: jest.fn().mockResolvedValue(undefined),
  getById: jest.fn().mockResolvedValue(null),
  getByDTName: jest.fn().mockResolvedValue([]),
  getAll: jest.fn().mockResolvedValue([]),
  delete: jest.fn().mockResolvedValue(undefined),
  deleteByDTName: jest.fn().mockResolvedValue(undefined),
});

const createTestStore = () =>
  configureStore({
    reducer: {
      executionHistory: executionHistoryReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: [
            'executionHistory/addExecutionHistoryEntry',
            'executionHistory/updateExecutionHistoryEntry',
            'executionHistory/setExecutionHistoryEntries',
            'executionHistory/updateExecutionLogs',
            'executionHistory/updateExecutionStatus',
            'executionHistory/setLoading',
            'executionHistory/setError',
            'executionHistory/setSelectedExecutionId',
          ],
        },
      }),
  });

type TestStore = ReturnType<typeof createTestStore>;

describe('executionHistory slice', () => {
  let store: TestStore;
  let mockStorageService: jest.Mocked<IExecutionHistoryStorage>;

  beforeEach(() => {
    store = createTestStore();
    mockStorageService = createMockStorageService();
    setStorageService(mockStorageService);
  });

  it('should handle removeExecution when execution does not exist', async () => {
    await (store.dispatch as (action: unknown) => Promise<void>)(
      removeExecution('non-existent-id'),
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    store.getState().executionHistory;
    expect(mockStorageService.delete).not.toHaveBeenCalled();
  });

  it('should handle addExecution error', async () => {
    const entry = {
      id: '1',
      dtName: 'test-dt',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };

    const errorMessage = 'Add failed';
    mockStorageService.add.mockRejectedValue(new Error(errorMessage));

    await (store.dispatch as (action: unknown) => Promise<void>)(
      addExecution(entry),
    );

    const state = store.getState().executionHistory;
    expect(state.loading).toBe(false);
    expect(state.error).toBe(`Failed to add execution: Error: ${errorMessage}`);
  });

  it('should handle updateExecution error', async () => {
    const entry = {
      id: '1',
      dtName: 'test-dt',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };

    store.dispatch(addExecutionHistoryEntry(entry));

    const updatedEntry = {
      ...entry,
      status: ExecutionStatus.COMPLETED,
    };

    const errorMessage = 'Update failed';
    mockStorageService.update.mockRejectedValue(new Error(errorMessage));

    await (store.dispatch as (action: unknown) => Promise<void>)(
      updateExecution(updatedEntry),
    );

    const state = store.getState().executionHistory;
    expect(state.loading).toBe(false);
    expect(state.error).toBe(
      `Failed to update execution: Error: ${errorMessage}`,
    );
  });

  it('should handle clearExecutionHistoryForDT error', async () => {
    const entries = [
      {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.COMPLETED,
        jobLogs: [],
      },
    ];

    store.dispatch(setExecutionHistoryEntries(entries));

    const errorMessage = 'Delete failed';
    mockStorageService.deleteByDTName.mockRejectedValue(
      new Error(errorMessage),
    );

    await (store.dispatch as (action: unknown) => Promise<void>)(
      clearExecutionHistoryForDT('test-dt'),
    );

    const state = store.getState().executionHistory;
    expect(state.error).toBe(
      `Failed to clear execution history: Error: ${errorMessage}`,
    );
  });

  it('should handle checkRunningExecutions error', async () => {
    const entries = [
      {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      },
    ];

    store.dispatch(setExecutionHistoryEntries(entries));

    const errorMessage = 'Check status failed';
    jest.mock('model/backend/state/ExecutionStatusService', () => {
      throw new Error(errorMessage);
    });

    await (store.dispatch as (action: unknown) => Promise<void>)(
      checkRunningExecutions(),
    );

    const state = store.getState().executionHistory;
    expect(state.error).toBe(
      `Failed to check execution status: Error: ${errorMessage}`,
    );
  });

  describe('reducers', () => {
    it('should handle setLoading', () => {
      store.dispatch(setLoading(true));
      expect(store.getState().executionHistory.loading).toBe(true);

      store.dispatch(setLoading(false));
      expect(store.getState().executionHistory.loading).toBe(false);
    });

    it('should handle setError', () => {
      const errorMessage = 'Test error message';
      store.dispatch(setError(errorMessage));
      expect(store.getState().executionHistory.error).toBe(errorMessage);

      store.dispatch(setError(null));
      expect(store.getState().executionHistory.error).toBeNull();
    });

    it('should handle setExecutionHistoryEntries', () => {
      const entries = [
        {
          id: '1',
          dtName: 'test-dt',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
        {
          id: '2',
          dtName: 'test-dt',
          pipelineId: 456,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
      ];

      store.dispatch(setExecutionHistoryEntries(entries));
      expect(store.getState().executionHistory.entries).toEqual(entries);
    });

    it('should replace entries when using setExecutionHistoryEntries', () => {
      const entriesDT1 = [
        {
          id: '1',
          dtName: 'digital-twin-1',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
        {
          id: '2',
          dtName: 'digital-twin-1',
          pipelineId: 456,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
      ];

      // Set first entries
      store.dispatch(setExecutionHistoryEntries(entriesDT1));
      expect(store.getState().executionHistory.entries.length).toBe(2);

      const entriesDT2 = [
        {
          id: '3',
          dtName: 'digital-twin-2',
          pipelineId: 789,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
      ];

      store.dispatch(setExecutionHistoryEntries(entriesDT2));

      const stateEntries = store.getState().executionHistory.entries;
      expect(stateEntries.length).toBe(1);
      expect(stateEntries).toEqual(entriesDT2);
      expect(
        stateEntries.find((e: DTExecutionResult) => e.id === '1'),
      ).toBeUndefined();
      expect(
        stateEntries.find((e: DTExecutionResult) => e.id === '2'),
      ).toBeUndefined();
      expect(
        stateEntries.find((e: DTExecutionResult) => e.id === '3'),
      ).toBeDefined();
    });

    it('should handle addExecutionHistoryEntry', () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));
      expect(store.getState().executionHistory.entries).toEqual([entry]);
    });

    it('should handle updateExecutionHistoryEntry', () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));

      const updatedEntry = {
        ...entry,
        status: ExecutionStatus.COMPLETED,
        jobLogs: [{ jobName: 'test-job', log: 'test log' }],
      };

      store.dispatch(updateExecutionHistoryEntry(updatedEntry));
      expect(store.getState().executionHistory.entries).toEqual([updatedEntry]);
    });

    it('should handle updateExecutionStatus', () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));
      store.dispatch(
        updateExecutionStatus({ id: '1', status: ExecutionStatus.COMPLETED }),
      );

      const updatedEntry = store
        .getState()
        .executionHistory.entries.find((e: DTExecutionResult) => e.id === '1');
      expect(updatedEntry?.status).toBe(ExecutionStatus.COMPLETED);
    });

    it('should handle updateExecutionLogs', () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));

      const logs = [{ jobName: 'test-job', log: 'test log' }];
      store.dispatch(updateExecutionLogs({ id: '1', logs }));

      const updatedEntry = store
        .getState()
        .executionHistory.entries.find((e: DTExecutionResult) => e.id === '1');
      expect(updatedEntry?.jobLogs).toEqual(logs);
    });

    it('should handle removeExecutionHistoryEntry', () => {
      const entry1 = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.COMPLETED,
        jobLogs: [],
      };

      const entry2 = {
        id: '2',
        dtName: 'test-dt',
        pipelineId: 456,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      store.dispatch(setExecutionHistoryEntries([entry1, entry2]));
      store.dispatch(removeExecutionHistoryEntry('1'));

      expect(store.getState().executionHistory.entries).toEqual([entry2]);
    });

    it('should handle removeEntriesForDT', () => {
      const entries = [
        {
          id: '1',
          dtName: 'dt1',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
        {
          id: '2',
          dtName: 'dt2',
          pipelineId: 456,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
        {
          id: '3',
          dtName: 'dt1',
          pipelineId: 789,
          timestamp: Date.now(),
          status: ExecutionStatus.FAILED,
          jobLogs: [],
        },
      ];

      store.dispatch(setExecutionHistoryEntries(entries));
      store.dispatch(removeEntriesForDT('dt1'));

      const state = store.getState().executionHistory.entries;
      expect(state.length).toBe(1);
      expect(state).toEqual([entries[1]]);
      expect(state.find((e) => e.dtName === 'dt1')).toBeUndefined();
    });

    it('should handle setSelectedExecutionId', () => {
      store.dispatch(setSelectedExecutionId('1'));
      expect(store.getState().executionHistory.selectedExecutionId).toBe('1');

      store.dispatch(setSelectedExecutionId(null));
      expect(store.getState().executionHistory.selectedExecutionId).toBeNull();
    });

    it('should handle setExecutionHistoryEntriesForDT', () => {
      const initialEntries = [
        {
          id: '1',
          dtName: 'dt1',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
        {
          id: '2',
          dtName: 'dt2',
          pipelineId: 456,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
      ];
      store.dispatch(setExecutionHistoryEntries(initialEntries));

      const newEntriesForDT1 = [
        {
          id: '3',
          dtName: 'dt1',
          pipelineId: 789,
          timestamp: Date.now(),
          status: ExecutionStatus.FAILED,
          jobLogs: [],
        },
      ];

      store.dispatch(
        setExecutionHistoryEntriesForDT({
          dtName: 'dt1',
          entries: newEntriesForDT1,
        }),
      );

      const state = store.getState().executionHistory.entries;
      expect(state.length).toBe(2); // dt2 entry + new dt1 entry
      expect(state.find((e) => e.id === '1')).toBeUndefined(); // old dt1 entry removed
      expect(state.find((e) => e.id === '2')).toBeDefined(); // dt2 entry preserved
      expect(state.find((e) => e.id === '3')).toBeDefined(); // new dt1 entry added
    });

    it('should handle clearEntries', () => {
      const entries = [
        {
          id: '1',
          dtName: 'test-dt',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
      ];

      store.dispatch(setExecutionHistoryEntries(entries));
      expect(store.getState().executionHistory.entries.length).toBe(1);

      store.dispatch(clearEntries());
      expect(store.getState().executionHistory.entries).toEqual([]);
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      const entries = [
        {
          id: '1',
          dtName: 'dt1',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
        {
          id: '2',
          dtName: 'dt2',
          pipelineId: 456,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
        {
          id: '3',
          dtName: 'dt1',
          pipelineId: 789,
          timestamp: Date.now(),
          status: ExecutionStatus.FAILED,
          jobLogs: [],
        },
      ];
      store.dispatch(setExecutionHistoryEntries(entries));
      store.dispatch(setSelectedExecutionId('2'));
      store.dispatch(setLoading(true));
      store.dispatch(setError('Test error'));
    });

    it('should select all execution history entries', () => {
      const entries = selectExecutionHistoryEntries(
        store.getState() as unknown as RootState,
      );
      expect(entries.length).toBe(3);
    });

    it('should select execution history by DT name', () => {
      const dt1Entries = selectExecutionHistoryByDTName('dt1')(
        store.getState() as unknown as RootState,
      );
      expect(dt1Entries.length).toBe(2);
      expect(dt1Entries.every((e) => e.dtName === 'dt1')).toBe(true);
    });

    it('should select execution history by ID', () => {
      const entry = selectExecutionHistoryById('2')(
        store.getState() as unknown as RootState,
      );
      expect(entry?.id).toBe('2');
      expect(entry?.dtName).toBe('dt2');
    });

    it('should select selected execution ID', () => {
      const selectedId = selectSelectedExecutionId(
        store.getState() as unknown as RootState,
      );
      expect(selectedId).toBe('2');
    });

    it('should select selected execution', () => {
      const selectedExecution = selectSelectedExecution(
        store.getState() as unknown as RootState,
      );
      expect(selectedExecution?.id).toBe('2');
      expect(selectedExecution?.dtName).toBe('dt2');
    });

    it('should select loading state', () => {
      const loading = selectExecutionHistoryLoading(
        store.getState() as unknown as RootState,
      );
      expect(loading).toBe(true);
    });

    it('should select error state', () => {
      const error = selectExecutionHistoryError(
        store.getState() as unknown as RootState,
      );
      expect(error).toBe('Test error');
    });
  });

  describe('async thunks', () => {
    it('should handle fetchExecutionHistory success', async () => {
      const mockEntries = [
        {
          id: '1',
          dtName: 'test-dt',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
      ];

      mockStorageService.getByDTName.mockResolvedValue(mockEntries);

      await (store.dispatch as (action: unknown) => Promise<void>)(
        fetchExecutionHistory('test-dt'),
      );

      const state = store.getState().executionHistory;
      expect(state.entries).toEqual(mockEntries);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStorageService.getByDTName).toHaveBeenCalledWith('test-dt');
    });

    it('should handle fetchAllExecutionHistory success', async () => {
      const mockEntries = [
        {
          id: '1',
          dtName: 'test-dt-1',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
      ];

      mockStorageService.getAll.mockResolvedValue(mockEntries);

      await (store.dispatch as (action: unknown) => Promise<void>)(
        fetchAllExecutionHistory(),
      );

      const state = store.getState().executionHistory;
      expect(state.entries).toEqual(mockEntries);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStorageService.getAll).toHaveBeenCalled();
    });

    it('should handle fetchAllExecutionHistory success', async () => {
      const mockEntries = [
        {
          id: '1',
          dtName: 'test-dt-1',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
      ];

      mockStorageService.getAll.mockResolvedValue(mockEntries);

      await (store.dispatch as (action: unknown) => Promise<void>)(
        fetchAllExecutionHistory(),
      );

      const state = store.getState().executionHistory;
      expect(state.entries).toEqual(mockEntries);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStorageService.getAll).toHaveBeenCalled();
    });

    it('should handle addExecution success', async () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      mockStorageService.add.mockResolvedValue('1');

      await (store.dispatch as (action: unknown) => Promise<void>)(
        addExecution(entry),
      );

      const state = store.getState().executionHistory;
      expect(state.entries).toContainEqual(entry);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStorageService.add).toHaveBeenCalledWith(entry);
    });

    it('should handle updateExecution success', async () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.RUNNING,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));

      const updatedEntry = {
        ...entry,
        status: ExecutionStatus.COMPLETED,
      };

      mockStorageService.update.mockResolvedValue(undefined);

      await (store.dispatch as (action: unknown) => Promise<void>)(
        updateExecution(updatedEntry),
      );

      const state = store.getState().executionHistory;
      expect(state.entries[0]).toEqual(updatedEntry);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockStorageService.update).toHaveBeenCalledWith(updatedEntry);
    });

    it('should handle clearExecutionHistoryForDT success', async () => {
      const entries = [
        {
          id: '1',
          dtName: 'test-dt',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
        {
          id: '2',
          dtName: 'other-dt',
          pipelineId: 456,
          timestamp: Date.now(),
          status: ExecutionStatus.RUNNING,
          jobLogs: [],
        },
      ];

      store.dispatch(setExecutionHistoryEntries(entries));
      mockStorageService.deleteByDTName.mockResolvedValue(undefined);

      await (store.dispatch as (action: unknown) => Promise<void>)(
        clearExecutionHistoryForDT('test-dt'),
      );

      const state = store.getState().executionHistory;
      expect(state.entries.length).toBe(1);
      expect(state.entries[0].dtName).toBe('other-dt');
      expect(state.error).toBeNull();
      expect(mockStorageService.deleteByDTName).toHaveBeenCalledWith('test-dt');
    });

    it('should handle checkRunningExecutions with no running executions', async () => {
      const entries = [
        {
          id: '1',
          dtName: 'test-dt',
          pipelineId: 123,
          timestamp: Date.now(),
          status: ExecutionStatus.COMPLETED,
          jobLogs: [],
        },
      ];

      store.dispatch(setExecutionHistoryEntries(entries));

      await (store.dispatch as (action: unknown) => Promise<void>)(
        checkRunningExecutions(),
      );

      const state = store.getState().executionHistory;
      expect(state.entries).toEqual(entries);
    });

    it('should handle fetchExecutionHistory error', async () => {
      const errorMessage = 'Database error';
      mockStorageService.getByDTName.mockRejectedValue(new Error(errorMessage));

      await (store.dispatch as (action: unknown) => Promise<void>)(
        fetchExecutionHistory('test-dt'),
      );

      const state = store.getState().executionHistory;
      expect(state.loading).toBe(false);
      expect(state.error).toBe(
        `Failed to fetch execution history: Error: ${errorMessage}`,
      );
    });

    it('should handle removeExecution success', async () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.COMPLETED,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));
      mockStorageService.delete.mockResolvedValue(undefined);

      await (store.dispatch as (action: unknown) => Promise<void>)(
        removeExecution('1'),
      );

      const state = store.getState().executionHistory;
      expect(state.entries.find((e) => e.id === '1')).toBeUndefined();
      expect(state.error).toBeNull();
      expect(mockStorageService.delete).toHaveBeenCalledWith('1');
    });

    it('should handle removeExecution error', async () => {
      const entry = {
        id: '1',
        dtName: 'test-dt',
        pipelineId: 123,
        timestamp: Date.now(),
        status: ExecutionStatus.COMPLETED,
        jobLogs: [],
      };

      store.dispatch(addExecutionHistoryEntry(entry));
      const errorMessage = 'Delete failed';
      mockStorageService.delete.mockRejectedValue(new Error(errorMessage));

      await (store.dispatch as (action: unknown) => Promise<void>)(
        removeExecution('1'),
      );

      const state = store.getState().executionHistory;
      expect(state.entries.find((e) => e.id === '1')).toBeDefined();
      expect(state.error).toBe(
        `Failed to remove execution: Error: ${errorMessage}`,
      );
    });
  });
});
