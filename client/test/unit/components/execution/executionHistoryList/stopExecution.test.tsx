import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ExecutionHistoryList from 'components/execution/ExecutionHistoryList';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import { createTestStore, TestStore } from './testSetup';

jest.mock('route/digitaltwins/execution/executionButtonHandlers');
jest.mock('model/backend/util/digitalTwinAdapter', () => {
  const adapterMocks = jest.requireActual('test/__mocks__/adapterMocks');
  const actual = jest.requireActual('model/backend/util/digitalTwinAdapter');
  return {
    ...adapterMocks.ADAPTER_MOCKS,
    extractDataFromDigitalTwin: actual.extractDataFromDigitalTwin,
  };
});

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('database/executionHistoryDB', () => ({
  __esModule: true,
  default: {
    getByDTName: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    add: jest.fn(),
    getAll: jest.fn(),
  },
}));

describe('ExecutionHistoryList - stop execution', () => {
  const dtName = 'test-dt';
  const mockOnViewLogs = jest.fn();
  const mockDispatch = jest.fn();
  let testStore: TestStore;

  beforeEach(() => {
    (useDispatch as jest.MockedFunction<typeof useDispatch>).mockReturnValue(
      mockDispatch,
    );
    testStore = createTestStore();
    (useSelector as jest.MockedFunction<typeof useSelector>).mockReset();
  });

  afterEach(async () => {
    mockOnViewLogs.mockClear();
    testStore = createTestStore([]);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  });

  it('handles stop execution correctly', async () => {
    mockDispatch.mockClear();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const adapter = require('model/backend/util/digitalTwinAdapter');
    adapter.createDigitalTwinFromData.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (digitalTwinData: any, name: any) => ({
        DTName: name || digitalTwinData.DTName || 'test-dt',
        delete: jest.fn().mockResolvedValue('Deleted successfully'),
        execute: jest.fn().mockResolvedValue(123),
        stop: jest.fn().mockResolvedValue(undefined),
        getFullDescription: jest
          .fn()
          .mockResolvedValue('Test Digital Twin Description'),
        reconfigure: jest.fn().mockResolvedValue(undefined),
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pipelineHandler = require('route/digitaltwins/execution/executionButtonHandlers');
    const handleStopSpy = jest
      .spyOn(pipelineHandler, 'handleStop')
      .mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_digitalTwin, _setButtonText, dispatch: any, executionId) => {
          dispatch({ type: 'mock/stopExecution', payload: executionId });
          return Promise.resolve();
        },
      );

    const mockRunningExecution = {
      id: 'exec3',
      dtName: 'test-dt',
      pipelineId: 1003,
      timestamp: 1620600000000,
      status: ExecutionStatus.RUNNING,
      jobLogs: [],
    };

    testStore = createTestStore([mockRunningExecution]);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );
    (useDispatch as jest.MockedFunction<typeof useDispatch>).mockReturnValue(
      mockDispatch,
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    expect(screen.getByText(/Running/i)).toBeInTheDocument();
    const stopButton = screen.getByLabelText('stop');
    expect(stopButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(stopButton);
    });

    await waitFor(() => {
      expect(handleStopSpy).toHaveBeenCalledWith(
        expect.objectContaining({ DTName: expect.any(String) }),
        expect.any(Function),
        mockDispatch,
        'exec3',
      );
    });

    expect(mockDispatch).toHaveBeenCalled();
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    });

    handleStopSpy.mockRestore();
  });
});
