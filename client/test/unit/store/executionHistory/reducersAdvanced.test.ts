import {
  setExecutionHistoryEntries,
  addExecutionHistoryEntry,
  removeExecutionHistoryEntry,
  removeEntriesForDT,
  setSelectedExecutionId,
  clearEntries,
} from 'model/backend/state/executionHistory.slice';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import { setupStore } from './testSetup';

describe('executionHistory slice - reducers (advanced)', () => {
  let store: ReturnType<typeof setupStore>['store'];

  beforeEach(() => {
    ({ store } = setupStore());
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

  it('should not remove entries when id does not match in removeExecutionHistoryEntry', () => {
    const entry1 = {
      id: '1',
      dtName: 'test-dt',
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.COMPLETED,
      jobLogs: [],
    };

    store.dispatch(addExecutionHistoryEntry(entry1));
    store.dispatch(removeExecutionHistoryEntry('non-existent-id'));

    expect(store.getState().executionHistory.entries).toEqual([entry1]);
  });
});
