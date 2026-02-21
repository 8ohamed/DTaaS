import * as PipelineChecks from 'route/digitaltwins/execution/executionStatusManager';
import * as PipelineCore from 'model/backend/gitlab/execution/pipelineCore';
import { mockDigitalTwin } from 'test/__mocks__/global_mocks';
import { PipelineStatusParams } from 'route/digitaltwins/execution/executionStatusManager';
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

describe('ExecutionStatusManager - parentPipeline', () => {
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

  it('starts pipeline status check', async () => {
    const checkParentPipelineStatus = jest
      .spyOn(PipelineChecks, 'checkParentPipelineStatus')
      .mockResolvedValue(undefined);

    jest.spyOn(globalThis.Date, 'now').mockReturnValue(startTime);

    spyOnGetPipelineStatus('success');
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

  it('checks parent pipeline status with executionId and retrieves pipelineId from execution history', async () => {
    const executionId = 'test-execution-id';
    const mockExecution = {
      id: executionId,
      pipelineId: 999,
      dtName: 'testName',
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
});
