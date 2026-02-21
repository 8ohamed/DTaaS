import * as PipelineChecks from 'route/digitaltwins/execution/executionStatusManager';
import * as PipelineUtils from 'route/digitaltwins/execution/executionStatusHandlers';
import * as PipelineCore from 'model/backend/gitlab/execution/pipelineCore';
import { mockDigitalTwin } from 'test/__mocks__/global_mocks';
import { PipelineStatusParams } from 'route/digitaltwins/execution/executionStatusManager';
import indexedDBService from 'database/executionHistoryDB';
import { ExecutionStatus } from 'model/backend/interfaces/execution';

jest.mock('model/backend/digitalTwin', () => ({
  DigitalTwin: jest.fn().mockImplementation(() => mockDigitalTwin),
  formatName: jest.fn(),
}));

jest.mock('route/digitaltwins/execution/executionStatusHandlers', () => ({
  ...jest.requireActual('route/digitaltwins/execution/executionStatusHandlers'),
  fetchJobLogs: jest.fn(),
  updatePipelineStateOnCompletion: jest.fn(),
}));

jest.mock('model/backend/gitlab/execution/pipelineCore', () => ({
  delay: jest.fn(),
  hasTimedOut: jest.fn(),
  getPollingInterval: jest.fn(() => 5000),
}));

jest.useFakeTimers();

describe('ExecutionStatusManager', () => {
  const DTName = 'testName';
  const setButtonText = jest.fn();
  const setLogButtonDisabled = jest.fn();
  const dispatch = jest.fn();
  const startTime = Date.now();
  const digitalTwin = mockDigitalTwin;
  const params: PipelineStatusParams = {
    setButtonText,
    digitalTwin,
    setLogButtonDisabled,
    dispatch,
  };
  const paramsWithStartTime = { ...params, startTime };
  const pipelineId = 1;

  Object.defineProperty(AbortSignal, 'timeout', {
    value: jest.fn(),
    writable: false,
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper functions to reduce code duplication
  const spyOnGetPipelineJobs = () =>
    jest.spyOn(digitalTwin.backend, 'getPipelineJobs').mockResolvedValue([]);
  const spyOnHandleTimeout = () =>
    jest.spyOn(PipelineChecks, 'handleTimeout').mockResolvedValue(undefined);
  const spyOnGetPipelineStatus = (status: string) =>
    jest
      .spyOn(digitalTwin.backend, 'getPipelineStatus')
      .mockResolvedValue(status);
  const spyOnCheckPipelineStatus = () =>
    jest
      .spyOn(PipelineChecks, 'checkChildPipelineStatus')
      .mockResolvedValue(undefined);

  it('handles timeout', async () => {
    await PipelineChecks.handleTimeout(
      DTName,
      setButtonText,
      setLogButtonDisabled,
      dispatch,
    );

    expect(setButtonText).toHaveBeenCalled();
    expect(setLogButtonDisabled).toHaveBeenCalledWith(false);
  });

  it('handles timeout with executionId and updates IndexedDB', async () => {
    const executionId = 'test-execution-id';
    const mockExecution = {
      id: executionId,
      dtName: DTName,
      pipelineId: 123,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };

    const getByIdSpy = jest
      .spyOn(indexedDBService, 'getById')
      .mockResolvedValue(mockExecution);
    const updateSpy = jest
      .spyOn(indexedDBService, 'update')
      .mockResolvedValue(undefined);

    await PipelineChecks.handleTimeout(
      DTName,
      setButtonText,
      setLogButtonDisabled,
      dispatch,
      executionId,
    );

    expect(getByIdSpy).toHaveBeenCalledWith(executionId);
    expect(updateSpy).toHaveBeenCalledWith({
      ...mockExecution,
      status: ExecutionStatus.TIMEOUT,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringContaining('updateExecutionStatus'),
      }),
    );
    expect(setButtonText).toHaveBeenCalledWith('Start');
    expect(setLogButtonDisabled).toHaveBeenCalledWith(false);

    getByIdSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it('handles timeout with executionId when execution not found in IndexedDB', async () => {
    const executionId = 'test-execution-id';

    const getByIdSpy = jest
      .spyOn(indexedDBService, 'getById')
      .mockResolvedValue(null);
    const updateSpy = jest
      .spyOn(indexedDBService, 'update')
      .mockResolvedValue(undefined);

    await PipelineChecks.handleTimeout(
      DTName,
      setButtonText,
      setLogButtonDisabled,
      dispatch,
      executionId,
    );

    expect(getByIdSpy).toHaveBeenCalledWith(executionId);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringContaining('updateExecutionStatus'),
      }),
    );

    getByIdSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it('starts pipeline status check', async () => {
    const checkParentPipelineStatus = jest
      .spyOn(PipelineChecks, 'checkParentPipelineStatus')
      .mockResolvedValue(undefined);

    jest.spyOn(globalThis.Date, 'now').mockReturnValue(startTime);

    spyOnGetPipelineStatus('success');
    // Mock getPipelineJobs to return empty array to prevent fetchJobLogs from failing
    spyOnGetPipelineJobs();

    await PipelineChecks.startPipelineStatusCheck(params);

    expect(checkParentPipelineStatus).toHaveBeenCalled();
  });

  it('checks parent pipeline status and returns success', async () => {
    const checkChildPipelineStatus = spyOnCheckPipelineStatus();

    spyOnGetPipelineStatus('success');
    spyOnGetPipelineJobs();

    await PipelineChecks.checkParentPipelineStatus(paramsWithStartTime);

    expect(checkChildPipelineStatus).toHaveBeenCalled();
  });

  it('checks parent pipeline status and returns failed', async () => {
    const checkChildPipelineStatus = spyOnCheckPipelineStatus();

    spyOnGetPipelineStatus('failed');
    spyOnGetPipelineJobs();

    await PipelineChecks.checkParentPipelineStatus(paramsWithStartTime);

    expect(checkChildPipelineStatus).toHaveBeenCalled();
  });

  it('checks parent pipeline status and returns timeout', async () => {
    const handleTimeout = spyOnHandleTimeout();

    spyOnGetPipelineStatus('running');
    jest.spyOn(PipelineCore, 'hasTimedOut').mockReturnValue(true);

    await PipelineChecks.checkParentPipelineStatus(paramsWithStartTime);

    expect(handleTimeout).toHaveBeenCalled();
  });

  it('handles pipeline completion with failed status', async () => {
    spyOnGetPipelineJobs();

    const mockFetchJobLogs = jest.spyOn(PipelineUtils, 'fetchJobLogs');
    mockFetchJobLogs.mockResolvedValue([]);

    await PipelineChecks.handlePipelineCompletion(
      pipelineId,
      digitalTwin,
      setButtonText,
      setLogButtonDisabled,
      dispatch,
      'failed',
    );

    expect(dispatch).toHaveBeenCalled();
  });

  it('handles pipeline completion with executionId and updates execution when logs not updated', async () => {
    const executionId = 'test-execution-id';

    spyOnGetPipelineJobs();

    const mockFetchLogsAndUpdateExecution = jest.fn().mockResolvedValue(false);
    const updateExecutionStatusSpy = jest
      .spyOn(digitalTwin, 'updateExecutionStatus')
      .mockResolvedValue(undefined);

    jest.doMock('route/digitaltwins/execution/executionStatusHandlers', () => ({
      fetchLogsAndUpdateExecution: mockFetchLogsAndUpdateExecution,
    }));

    await PipelineChecks.handlePipelineCompletion(
      pipelineId,
      digitalTwin,
      setButtonText,
      setLogButtonDisabled,
      dispatch,
      'success',
      executionId,
    );

    expect(setButtonText).toHaveBeenCalledWith('Start');
    expect(setLogButtonDisabled).toHaveBeenCalledWith(false);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringContaining('setPipelineCompleted'),
      }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.stringContaining('setPipelineLoading'),
      }),
    );

    updateExecutionStatusSpy.mockRestore();
    jest.dontMock('route/digitaltwins/execution/executionStatusHandlers');
  });
  it('checks child pipeline status and returns timeout', async () => {
    const handleTimeout = spyOnHandleTimeout();
    spyOnGetPipelineStatus('running');
    jest.spyOn(PipelineCore, 'hasTimedOut').mockReturnValue(true);

    await PipelineChecks.checkChildPipelineStatus(paramsWithStartTime);

    expect(handleTimeout).toHaveBeenCalled();
  });

  it('checks parent pipeline status with executionId and retrieves pipelineId from execution history', async () => {
    const executionId = 'test-execution-id';
    const mockExecution = {
      id: executionId,
      pipelineId: 999,
      dtName: DTName,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };

    const getExecutionHistorySpy = jest
      .spyOn(digitalTwin, 'getExecutionHistoryById')
      .mockResolvedValue(mockExecution);
    const checkChildPipelineStatus = spyOnCheckPipelineStatus();
    spyOnGetPipelineStatus('success');
    spyOnGetPipelineJobs();

    await PipelineChecks.checkParentPipelineStatus({
      ...paramsWithStartTime,
      executionId,
    });

    expect(getExecutionHistorySpy).toHaveBeenCalledWith(executionId);
    expect(digitalTwin.backend.getPipelineStatus).toHaveBeenCalledWith(
      digitalTwin.backend.getProjectId(),
      999,
    );
    expect(checkChildPipelineStatus).toHaveBeenCalled();

    getExecutionHistorySpy.mockRestore();
  });

  it('checks parent pipeline status with executionId and falls back to digitalTwin.pipelineId', async () => {
    const executionId = 'test-execution-id';

    const getExecutionHistorySpy = jest
      .spyOn(digitalTwin, 'getExecutionHistoryById')
      .mockResolvedValue(undefined);
    const checkChildPipelineStatus = spyOnCheckPipelineStatus();
    spyOnGetPipelineStatus('success');
    spyOnGetPipelineJobs();

    digitalTwin.pipelineId = pipelineId;

    await PipelineChecks.checkParentPipelineStatus({
      ...paramsWithStartTime,
      executionId,
    });

    expect(getExecutionHistorySpy).toHaveBeenCalledWith(executionId);
    expect(digitalTwin.backend.getPipelineStatus).toHaveBeenCalledWith(
      digitalTwin.backend.getProjectId(),
      pipelineId,
    );
    expect(checkChildPipelineStatus).toHaveBeenCalled();

    getExecutionHistorySpy.mockRestore();
  });

  it('checks child pipeline status and returns running', async () => {
    const delay = jest.spyOn(PipelineCore, 'delay');
    delay.mockImplementation(() => Promise.resolve());

    const getPipelineStatusMock = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusMock
      .mockResolvedValueOnce('running')
      .mockResolvedValue('success');

    spyOnGetPipelineJobs();

    jest
      .spyOn(PipelineCore, 'hasTimedOut')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await PipelineChecks.checkChildPipelineStatus(paramsWithStartTime);

    expect(getPipelineStatusMock).toHaveBeenCalled();
  });

  it('checks child pipeline status with executionId and calculates child pipelineId', async () => {
    const executionId = 'test-execution-id';
    const mockExecution = {
      id: executionId,
      pipelineId: 500,
      dtName: DTName,
      timestamp: Date.now(),
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };

    const getExecutionHistorySpy = jest
      .spyOn(digitalTwin, 'getExecutionHistoryById')
      .mockResolvedValue(mockExecution);
    spyOnGetPipelineStatus('success');
    spyOnGetPipelineJobs();

    const handlePipelineCompletionSpy = jest
      .spyOn(PipelineChecks, 'handlePipelineCompletion')
      .mockResolvedValue(undefined);

    await PipelineChecks.checkChildPipelineStatus({
      ...paramsWithStartTime,
      executionId,
    });

    expect(getExecutionHistorySpy).toHaveBeenCalledWith(executionId);
    expect(digitalTwin.backend.getPipelineStatus).toHaveBeenCalledWith(
      digitalTwin.backend.getProjectId(),
      501, // execution.pipelineId + 1
    );
    expect(handlePipelineCompletionSpy).toHaveBeenCalled();

    getExecutionHistorySpy.mockRestore();
    handlePipelineCompletionSpy.mockRestore();
  });

  it('checks child pipeline status with executionId and falls back when execution is null', async () => {
    const executionId = 'test-execution-id';

    const getExecutionHistorySpy = jest
      .spyOn(digitalTwin, 'getExecutionHistoryById')
      .mockResolvedValue(undefined);
    spyOnGetPipelineStatus('success');
    spyOnGetPipelineJobs();

    const handlePipelineCompletionSpy = jest
      .spyOn(PipelineChecks, 'handlePipelineCompletion')
      .mockResolvedValue(undefined);

    digitalTwin.pipelineId = 100;

    await PipelineChecks.checkChildPipelineStatus({
      ...paramsWithStartTime,
      executionId,
    });

    expect(getExecutionHistorySpy).toHaveBeenCalledWith(executionId);
    expect(digitalTwin.backend.getPipelineStatus).toHaveBeenCalledWith(
      digitalTwin.backend.getProjectId(),
      101, // digitalTwin.pipelineId + 1
    );
    expect(handlePipelineCompletionSpy).toHaveBeenCalled();

    getExecutionHistorySpy.mockRestore();
    handlePipelineCompletionSpy.mockRestore();
  });
});
