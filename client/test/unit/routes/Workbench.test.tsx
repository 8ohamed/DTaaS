import { screen, render, cleanup, act } from '@testing-library/react';
import WorkBench from 'route/workbench/Workbench';
import { useDispatch } from 'react-redux';

describe('Workbench', () => {
  beforeEach(async () => {
    (useDispatch as jest.MockedFunction<typeof useDispatch>).mockReturnValue(
      jest.fn(),
    );
    await act(async () => {
      render(<WorkBench />);
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders', () => {
    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading).toHaveTextContent('Workbench Tools');
  });

  it('displays buttons', () => {
    const buttons = screen.getByRole('button');
    expect(buttons).toBeInTheDocument();
  });
});
