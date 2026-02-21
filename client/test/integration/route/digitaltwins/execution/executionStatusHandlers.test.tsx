import * as PipelineUtils from 'route/digitaltwins/execution/executionStatusHandlers';
import cleanLog from 'model/backend/gitlab/cleanLog';
import {
  setDigitalTwin,
  DigitalTwinData,
} from 'model/backend/state/digitalTwin.slice';
import {
  dispatchAddExecHistoryEntry,
  previewStore,
  previewStore as store,
} from 'test/integration/integration.testUtil';
import { JobSchema } from '@gitbeaker/rest';
import DigitalTwin from 'model/backend/digitalTwin';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import { extractDataFromDigitalTwin } from 'model/backend/util/digitalTwinAdapter';
import { mockBackendInstance } from 'test/__mocks__/global_mocks';

describe('PipelineUtils', () => {
  let digitalTwin: DigitalTwin;

  beforeEach(() => {
    digitalTwin = new DigitalTwin('mockedDTName', mockBackendInstance);
    (mockBackendInstance.getProjectId as jest.Mock).mockReturnValue(1234);

    const digitalTwinData: DigitalTwinData =
      extractDataFromDigitalTwin(digitalTwin);
    store.dispatch(
      setDigitalTwin({
        assetName: 'mockedDTName',
        digitalTwin: digitalTwinData,
      }),
    );

    digitalTwin.execute = jest.fn().mockImplementation(async () => {
      digitalTwin.lastExecutionStatus = ExecutionStatus.SUCCESS;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts pipeline and handle success', async () => {
    await PipelineUtils.startPipeline(digitalTwin, store.dispatch, jest.fn());
    const snackbarState = store.getState().snackbar;
    const expectedSnackbarState = {
      open: true,
      message: 'Execution success for MockedDTName',
      severity: 'error',
    };
    expect(snackbarState).toEqual(expectedSnackbarState);
  });

  it('updates pipeline state on completion', async () => {
    await PipelineUtils.updatePipelineStateOnCompletion(
      digitalTwin,
      [{ jobName: 'job1', log: 'log1' }],
      jest.fn(),
      jest.fn(),
      store.dispatch,
    );
    const state = store.getState().digitalTwin.digitalTwin;
    expect(state.mockedDTName.jobLogs).toEqual([
      { jobName: 'job1', log: 'log1' },
    ]);
    expect(state.mockedDTName.pipelineCompleted).toBe(true);
    expect(state.mockedDTName.pipelineLoading).toBe(false);
  });

  it('fetches job logs', async () => {
    const mockJob = { id: 1, name: 'job1' } as JobSchema;

    (mockBackendInstance.getPipelineJobs as jest.Mock).mockResolvedValue([
      mockJob,
    ]);
    (mockBackendInstance.getJobTrace as jest.Mock).mockResolvedValue('log1');

    const result = await PipelineUtils.fetchJobLogs(mockBackendInstance, 1);

    expect(mockBackendInstance.getPipelineJobs).toHaveBeenCalledWith(1234, 1);
    expect(mockBackendInstance.getJobTrace).toHaveBeenCalledWith(1234, 1);
    expect(result).toEqual([{ jobName: 'job1', log: 'log1' }]);
  });

  // Test integration with fetchJobLogs
  it('properly cleans logs when fetched from GitLab', async () => {
    const rawLog =
      '\u001b[32mRunning job\u001b[0m\nsection_start:1234:setup\nSetting up environment\nsection_end:1234:setup';

    const mockJob = { id: 123, name: 'test-job' } as JobSchema;

    (mockBackendInstance.getPipelineJobs as jest.Mock).mockResolvedValue([
      mockJob,
    ]);

    (mockBackendInstance.getJobTrace as jest.Mock).mockResolvedValue(rawLog);

    const logs = await PipelineUtils.fetchJobLogs(mockBackendInstance, 456);

    expect(logs).toHaveLength(1);
    expect(logs[0].jobName).toBe('test-job');
    expect(logs[0].log).toBe('Running job\nSetting up environment');
  });

  it('handles realistic GitLab CI logs', () => {
    const realWorldLog = `Running with gitlab-runner 15.6.0
section_start:1678901234:prepare_environment
Preparing environment
section_end:1678901234:prepare_environment
section_start:1678901235:get_sources
Getting source from Git repository
\u001b[32mFetching changes...\u001b[0m
section_end:1678901235:get_sources
section_start:1678901236:build
Building project...
\u001b[33mWarning: Deprecated feature used\u001b[0m
\u001b[32mBuild completed successfully\u001b[0m
section_end:1678901236:build`;

    const cleaned = cleanLog(realWorldLog);

    expect(cleaned).not.toContain('\u001b');
    expect(cleaned).not.toContain('section_start');
    expect(cleaned).not.toContain('section_end');
    expect(cleaned).toContain('Preparing environment');
    expect(cleaned).toContain('Getting source from Git repository');
    expect(cleaned).toContain('Fetching changes');
    expect(cleaned).toContain('Warning: Deprecated feature used');
    expect(cleaned).toContain('Build completed successfully');
  });

  it('starts pipeline with valid execution ID and updates state', async () => {
    const mockExecutionId = 'exec-123';
    const mockPipelineId = 456;

    digitalTwin.execute = jest.fn().mockResolvedValue(mockPipelineId);
    digitalTwin.currentExecutionId = mockExecutionId;

    const setLogButtonDisabled = jest.fn();

    const result = await PipelineUtils.startPipeline(
      digitalTwin,
      previewStore.dispatch,
      setLogButtonDisabled,
    );

    expect(result).toBe(mockExecutionId);
    expect(setLogButtonDisabled).toHaveBeenCalledWith(false);

    const snackbarState = previewStore.getState().snackbar;
    expect(snackbarState.open).toBe(true);
    expect(snackbarState.message).toContain('Execution started successfully');
    expect(snackbarState.message).toContain('MockedDTName');
    expect(snackbarState.severity).toBe('success');

    const executionHistoryState = previewStore.getState().executionHistory;
    expect(executionHistoryState.selectedExecutionId).toBe(mockExecutionId);
  });

  it('updates pipeline state with executionId', async () => {
    const mockExecutionId = 'exec-456';

    await dispatchAddExecHistoryEntry(previewStore, {
      id: mockExecutionId,
      dtName: 'mockedDTName',
      status: ExecutionStatus.TIMEOUT,
    });

    PipelineUtils.updatePipelineState(
      digitalTwin,
      previewStore.dispatch,
      mockExecutionId,
    );

    const digitalTwinState = previewStore.getState().digitalTwin.digitalTwin;
    expect(digitalTwinState.mockedDTName.pipelineCompleted).toBe(false);
    expect(digitalTwinState.mockedDTName.pipelineLoading).toBe(true);

    const executionHistoryState = previewStore.getState().executionHistory;
    const execution = executionHistoryState.entries.find(
      (e) => e.id === mockExecutionId,
    );
    expect(execution?.status).toBe(ExecutionStatus.RUNNING);
  });

  it('updates pipeline state on completion with executionId', async () => {
    const mockExecutionId = 'exec-789';
    const mockJobLogs = [
      { jobName: 'job1', log: 'log1' },
      { jobName: 'job2', log: 'log2' },
    ];

    await dispatchAddExecHistoryEntry(previewStore, {
      id: mockExecutionId,
      dtName: 'mockedDTName',
      status: ExecutionStatus.RUNNING,
    });

    digitalTwin.updateExecutionLogs = jest.fn().mockResolvedValue(undefined);
    digitalTwin.updateExecutionStatus = jest.fn().mockResolvedValue(undefined);

    await PipelineUtils.updatePipelineStateOnCompletion(
      digitalTwin,
      mockJobLogs,
      jest.fn(),
      jest.fn(),
      previewStore.dispatch,
      mockExecutionId,
      ExecutionStatus.COMPLETED,
    );

    expect(digitalTwin.updateExecutionLogs).toHaveBeenCalledWith(
      mockExecutionId,
      mockJobLogs,
    );
    expect(digitalTwin.updateExecutionStatus).toHaveBeenCalledWith(
      mockExecutionId,
      ExecutionStatus.COMPLETED,
    );

    const executionHistoryState = previewStore.getState().executionHistory;
    const execution = executionHistoryState.entries.find(
      (e) => e.id === mockExecutionId,
    );
    expect(execution?.jobLogs).toEqual(mockJobLogs);
    expect(execution?.status).toBe(ExecutionStatus.COMPLETED);
  });

  it('handles fetchLogsAndUpdateExecution error gracefully', async () => {
    const mockExecutionId = 'exec-error';
    const mockPipelineId = 999;

    (mockBackendInstance.getPipelineJobs as jest.Mock).mockRejectedValue(
      new Error('Network error'),
    );

    const result = await PipelineUtils.fetchLogsAndUpdateExecution(
      digitalTwin,
      mockPipelineId,
      mockExecutionId,
      ExecutionStatus.FAILED,
      previewStore.dispatch,
    );

    expect(result).toBe(false);
  });

  it('returns false when all logs are empty in fetchLogsAndUpdateExecution', async () => {
    const mockExecutionId = 'exec-empty';
    const mockPipelineId = 888;
    const mockJob = { id: 1, name: 'empty-job' } as JobSchema;

    (mockBackendInstance.getPipelineJobs as jest.Mock).mockResolvedValue([
      mockJob,
    ]);
    (mockBackendInstance.getJobTrace as jest.Mock).mockResolvedValue('   ');

    const result = await PipelineUtils.fetchLogsAndUpdateExecution(
      digitalTwin,
      mockPipelineId,
      mockExecutionId,
      ExecutionStatus.COMPLETED,
      previewStore.dispatch,
    );

    expect(result).toBe(false);
  });

  it('successfully fetches and updates execution with valid logs', async () => {
    const mockExecutionId = 'exec-success';
    const mockPipelineId = 777;
    const mockJob = { id: 1, name: 'success-job' } as JobSchema;

    await dispatchAddExecHistoryEntry(previewStore, {
      id: mockExecutionId,
      dtName: 'mockedDTName',
      status: ExecutionStatus.RUNNING,
    });

    (mockBackendInstance.getPipelineJobs as jest.Mock).mockResolvedValue([
      mockJob,
    ]);
    (mockBackendInstance.getJobTrace as jest.Mock).mockResolvedValue(
      'Valid log content',
    );

    digitalTwin.updateExecutionLogs = jest.fn().mockResolvedValue(undefined);
    digitalTwin.updateExecutionStatus = jest.fn().mockResolvedValue(undefined);

    const result = await PipelineUtils.fetchLogsAndUpdateExecution(
      digitalTwin,
      mockPipelineId,
      mockExecutionId,
      ExecutionStatus.COMPLETED,
      previewStore.dispatch,
    );

    expect(result).toBe(true);
    expect(digitalTwin.updateExecutionLogs).toHaveBeenCalledWith(
      mockExecutionId,
      [{ jobName: 'success-job', log: 'Valid log content' }],
    );
    expect(digitalTwin.updateExecutionStatus).toHaveBeenCalledWith(
      mockExecutionId,
      ExecutionStatus.COMPLETED,
    );
  });
});
