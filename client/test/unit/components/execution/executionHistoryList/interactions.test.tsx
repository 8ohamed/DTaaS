import {
  render,
  screen,
  fireEvent,
  act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import ExecutionHistoryList from 'components/execution/ExecutionHistoryList';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { ExecutionStatus } from 'model/backend/interfaces/execution';
import {
  mockExecutions,
  createTestStore,
  TestStore,
  waitForAccordionTransitions,
} from './testSetup';

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

describe('ExecutionHistoryList - interactions', () => {
  const dtName = 'test-dt';
  const mockOnViewLogs = jest.fn();
  const mockDispatch = jest.fn();
  let testStore: TestStore;

  const mockExecutionsWithSameTimestamp = [
    {
      id: 'exec6',
      dtName: 'test-dt',
      pipelineId: 1006,
      timestamp: 1620500000000,
      status: ExecutionStatus.COMPLETED,
      jobLogs: [],
    },
    {
      id: 'exec7',
      dtName: 'test-dt',
      pipelineId: 1007,
      timestamp: 1620500000000,
      status: ExecutionStatus.FAILED,
      jobLogs: [],
    },
  ];

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

  it('calls fetchExecutionHistory on mount', () => {
    testStore = createTestStore([]);
    mockDispatch.mockClear();
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    expect(mockDispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('handles delete execution correctly', () => {
    mockDispatch.mockClear();
    testStore = createTestStore(mockExecutions);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    fireEvent.click(screen.getAllByLabelText(/delete/i)[0]);
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('handles accordion expansion correctly', async () => {
    mockDispatch.mockClear();
    mockOnViewLogs.mockClear();
    testStore = createTestStore(mockExecutions);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    const timedOutAccordion = screen
      .getAllByRole('button')
      .find((button) =>
        button.getAttribute('aria-controls')?.includes('execution-'),
      );

    expect(timedOutAccordion).toBeDefined();

    if (timedOutAccordion) {
      fireEvent.click(timedOutAccordion);
      expect(timedOutAccordion).toBeInTheDocument();
      expect(timedOutAccordion.textContent).toContain('Timed out');

      fireEvent.click(timedOutAccordion);
      await waitForAccordionTransitions();
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 0);
      });

      expect(mockDispatch).toHaveBeenCalled();
      expect(mockOnViewLogs).toHaveBeenCalledWith('exec5');
    }
  });

  it('sorts executions by timestamp in descending order', () => {
    testStore = createTestStore(mockExecutions);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );
    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    const accordions = screen
      .getAllByRole('button')
      .filter((button) =>
        button.getAttribute('aria-controls')?.includes('execution-'),
      );

    const timeoutIndex = accordions.findIndex((accordion) =>
      accordion.textContent?.includes('Timed out'),
    );
    const completedIndex = accordions.findIndex((accordion) =>
      accordion.textContent?.includes('Completed'),
    );
    expect(timeoutIndex).toBeLessThan(completedIndex);
  });

  it('handles executions with the same timestamp correctly', () => {
    testStore = createTestStore(mockExecutionsWithSameTimestamp);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    const accordions = screen
      .getAllByRole('button')
      .filter((button) =>
        button.getAttribute('aria-controls')?.includes('execution-'),
      );
    expect(accordions.length).toBe(2);
    expect(screen.getByText(/Completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
  });

  it('dispatches removeExecution thunk when delete button is clicked', () => {
    mockDispatch.mockClear();
    testStore = createTestStore(mockExecutions);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    fireEvent.click(screen.getAllByLabelText(/delete/i)[0]);
    expect(mockDispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  it('dispatches setSelectedExecutionId when accordion is expanded', () => {
    mockDispatch.mockClear();
    mockOnViewLogs.mockClear();
    testStore = createTestStore(mockExecutions);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    const accordion = screen
      .getAllByRole('button')
      .find((button) =>
        button.getAttribute('aria-controls')?.includes('execution-'),
      );

    if (accordion) {
      fireEvent.click(accordion);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.stringContaining(
            'executionHistory/setSelectedExecutionId',
          ),
          payload: 'exec5',
        }),
      );
    }
  });

  it('prevents accordion expansion when clicking action buttons area', async () => {
    mockOnViewLogs.mockClear();
    testStore = createTestStore(mockExecutions);
    (useSelector as jest.MockedFunction<typeof useSelector>).mockImplementation(
      (selector) => selector(testStore.getState()),
    );

    render(
      <Provider store={testStore}>
        <ExecutionHistoryList dtName={dtName} onViewLogs={mockOnViewLogs} />
      </Provider>,
    );

    const actionContainers = screen.getAllByTestId('action-buttons-container');
    expect(actionContainers.length).toBeGreaterThan(0);

    fireEvent.click(actionContainers[0]);

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    });

    expect(mockOnViewLogs).not.toHaveBeenCalled();
  });
});
