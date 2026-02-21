import * as PipelineChecks from 'route/digitaltwins/execution/executionStatusManager';
import * as PipelineCore from 'model/backend/gitlab/execution/pipelineCore';
import {
  setDigitalTwin,
  DigitalTwinData,
} from 'model/backend/state/digitalTwin.slice';
import { extractDataFromDigitalTwin } from 'model/backend/util/digitalTwinAdapter';
import { mockDigitalTwin } from 'test/__mocks__/global_mocks';
import { previewStore as store } from 'test/integration/integration.testUtil';

jest.useFakeTimers();

jest.mock('model/backend/gitlab/execution/pipelineCore', () => ({
  delay: jest.fn(),
  hasTimedOut: jest.fn(),
  getPollingInterval: jest.fn(() => 5000),
}));

describe('PipelineChecks', () => {
  const digitalTwin = mockDigitalTwin;

  const setButtonText = jest.fn();
  const setLogButtonDisabled = jest.fn();
  const dispatch = jest.fn();
  const startTime = Date.now();
  const params: PipelineChecks.PipelineStatusParams = {
    setButtonText,
    digitalTwin,
    setLogButtonDisabled,
    dispatch,
  };

  Object.defineProperty(AbortSignal, 'timeout', {
    value: jest.fn(),
    writable: false,
  });

  beforeEach(() => {
    const digitalTwinData: DigitalTwinData =
      extractDataFromDigitalTwin(digitalTwin);
    store.dispatch(
      setDigitalTwin({
        assetName: 'mockedDTName',
        digitalTwin: digitalTwinData,
      }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles timeout', () => {
    PipelineChecks.handleTimeout(
      digitalTwin.DTName,
      jest.fn(),
      jest.fn(),
      store.dispatch,
    );

    const snackbarState = store.getState().snackbar;

    const expectedSnackbarState = {
      open: true,
      message: 'Execution timed out for MockedDTName',
      severity: 'error',
    };

    expect(snackbarState).toEqual(expectedSnackbarState);
  });

  it('starts pipeline status check', async () => {
    // Create spy after the module is imported
    const checkParentPipelineStatusSpy = jest.spyOn(
      PipelineChecks,
      'checkParentPipelineStatus',
    );
    checkParentPipelineStatusSpy.mockImplementation(() => Promise.resolve());

    jest.spyOn(globalThis.Date, 'now').mockReturnValue(startTime);

    await PipelineChecks.startPipelineStatusCheck(params);

    expect(checkParentPipelineStatusSpy).toHaveBeenCalled();

    checkParentPipelineStatusSpy.mockRestore();
  });

  it('checks parent pipeline status and returns success', async () => {
    const checkChildPipelineStatusSpy = jest.spyOn(
      PipelineChecks,
      'checkChildPipelineStatus',
    );
    checkChildPipelineStatusSpy.mockImplementation(() => Promise.resolve());

    const getPipelineStatusSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusSpy.mockResolvedValue('success');

    const getPipelineJobsSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineJobs',
    );
    getPipelineJobsSpy.mockResolvedValue([]);

    await PipelineChecks.checkParentPipelineStatus({
      setButtonText,
      digitalTwin,
      setLogButtonDisabled,
      dispatch: store.dispatch,
      startTime,
    });

    expect(checkChildPipelineStatusSpy).toHaveBeenCalledWith({
      setButtonText,
      digitalTwin,
      setLogButtonDisabled,
      dispatch: store.dispatch,
      startTime,
    });

    checkChildPipelineStatusSpy.mockRestore();
    getPipelineStatusSpy.mockRestore();
    getPipelineJobsSpy.mockRestore();
  });

  it('checks parent pipeline status and returns failed', async () => {
    const checkChildPipelineStatusSpy = jest.spyOn(
      PipelineChecks,
      'checkChildPipelineStatus',
    );
    checkChildPipelineStatusSpy.mockImplementation(() => Promise.resolve());

    const getPipelineStatusSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusSpy.mockResolvedValue('failed');

    const getPipelineJobsSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineJobs',
    );
    getPipelineJobsSpy.mockResolvedValue([]);

    await PipelineChecks.checkParentPipelineStatus({
      setButtonText,
      digitalTwin,
      setLogButtonDisabled,
      dispatch: store.dispatch,
      startTime,
    });

    expect(checkChildPipelineStatusSpy).toHaveBeenCalled();

    checkChildPipelineStatusSpy.mockRestore();
    getPipelineStatusSpy.mockRestore();
    getPipelineJobsSpy.mockRestore();
  });

  it('checks parent pipeline status and returns timeout', async () => {
    const handleTimeoutSpy = jest.spyOn(PipelineChecks, 'handleTimeout');
    handleTimeoutSpy.mockImplementation(() => Promise.resolve());

    const getPipelineStatusSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusSpy.mockResolvedValue('running');

    const hasTimedOutSpy = jest.spyOn(PipelineCore, 'hasTimedOut');
    hasTimedOutSpy.mockReturnValue(true);

    await PipelineChecks.checkParentPipelineStatus({
      setButtonText,
      digitalTwin,
      setLogButtonDisabled,
      dispatch: store.dispatch,
      startTime,
    });

    expect(handleTimeoutSpy).toHaveBeenCalled();
  });

  it('checks parent pipeline status and returns running', async () => {
    const delaySpy = jest.spyOn(PipelineCore, 'delay');
    delaySpy.mockImplementation(() => Promise.resolve());

    const getPipelineStatusSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusSpy.mockResolvedValue('running');

    const hasTimedOutSpy = jest.spyOn(PipelineCore, 'hasTimedOut');
    hasTimedOutSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const checkParentPipelineStatusSpy = jest.spyOn(
      PipelineChecks,
      'checkParentPipelineStatus',
    );

    checkParentPipelineStatusSpy
      .mockImplementationOnce(async (_params) => {
        // Call the original function for the first call
        checkParentPipelineStatusSpy.mockRestore();
        const result = await PipelineChecks.checkParentPipelineStatus(_params);
        // Re-mock for subsequent calls
        checkParentPipelineStatusSpy.mockImplementation(() =>
          Promise.resolve(),
        );
        return result;
      })
      .mockImplementation(() => Promise.resolve());

    await PipelineChecks.checkParentPipelineStatus({
      setButtonText,
      digitalTwin,
      setLogButtonDisabled,
      dispatch: store.dispatch,
      startTime,
    });

    expect(delaySpy).toHaveBeenCalled();

    delaySpy.mockRestore();
    getPipelineStatusSpy.mockRestore();
    hasTimedOutSpy.mockRestore();
    checkParentPipelineStatusSpy.mockRestore();
  });

  it('handles pipeline completion with failed status', async () => {
    const getPipelineJobsSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineJobs',
    );
    getPipelineJobsSpy.mockResolvedValue([]);

    const mockFetchJobLogs = jest.fn().mockResolvedValue([]);

    jest.doMock('model/backend/gitlab/execution/logFetching', () => ({
      fetchJobLogs: mockFetchJobLogs,
    }));

    await PipelineChecks.handlePipelineCompletion(
      1,
      digitalTwin,
      jest.fn(),
      jest.fn(),
      store.dispatch,
      'failed',
    );

    const snackbarState = store.getState().snackbar;

    const expectedSnackbarState = {
      open: true,
      message: 'Execution failed for MockedDTName',
      severity: 'error',
    };

    expect(snackbarState).toEqual(expectedSnackbarState);

    getPipelineJobsSpy.mockRestore();
    jest.dontMock('model/backend/gitlab/execution/logFetching');
  });

  it('checks child pipeline status and returns timeout', async () => {
    const completeParams = {
      setButtonText: jest.fn(),
      digitalTwin,
      setLogButtonDisabled: jest.fn(),
      dispatch: jest.fn(),
      startTime: Date.now(),
    };

    const handleTimeoutSpy = jest.spyOn(PipelineChecks, 'handleTimeout');
    handleTimeoutSpy.mockImplementation(() => Promise.resolve());

    const getPipelineStatusSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusSpy.mockResolvedValue('running');

    const hasTimedOutSpy = jest.spyOn(PipelineCore, 'hasTimedOut');
    hasTimedOutSpy.mockReturnValue(true);

    await PipelineChecks.checkChildPipelineStatus(completeParams);

    expect(handleTimeoutSpy).toHaveBeenCalled();

    handleTimeoutSpy.mockRestore();
    getPipelineStatusSpy.mockRestore();
    hasTimedOutSpy.mockRestore();
  });

  it('checks child pipeline status and returns running', async () => {
    const delaySpy = jest.spyOn(PipelineCore, 'delay');
    delaySpy.mockImplementation(() => Promise.resolve());

    const getPipelineStatusSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineStatus',
    );
    getPipelineStatusSpy
      .mockResolvedValueOnce('running')
      .mockResolvedValue('success');

    const getPipelineJobsSpy = jest.spyOn(
      digitalTwin.backend,
      'getPipelineJobs',
    );
    getPipelineJobsSpy.mockResolvedValue([]);

    const hasTimedOutSpy = jest.spyOn(PipelineCore, 'hasTimedOut');
    hasTimedOutSpy.mockReturnValueOnce(false).mockReturnValue(true);

    await PipelineChecks.checkChildPipelineStatus({
      setButtonText,
      digitalTwin,
      setLogButtonDisabled,
      dispatch,
      startTime,
    });

    expect(getPipelineStatusSpy).toHaveBeenCalled();
    expect(delaySpy).toHaveBeenCalled();

    delaySpy.mockRestore();
    getPipelineStatusSpy.mockRestore();
    getPipelineJobsSpy.mockRestore();
    hasTimedOutSpy.mockRestore();
  });
});
