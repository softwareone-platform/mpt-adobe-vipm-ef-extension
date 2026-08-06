import { render } from '@testing-library/react';

import { ChipCell } from './ChipCell';

describe('ChipCell', () => {
  it('renders the label', () => {
    const { getByText } = render(<ChipCell label="Active" />);

    expect(getByText('Active')).toBeTruthy();
  });

  it('renders a chip inside a grid cell', () => {
    const { getByTestId } = render(<ChipCell label="Active" />);

    expect(getByTestId('grid-cell-simple')).toBeTruthy();
    expect(getByTestId('chip')).toBeTruthy();
  });

  it('renders with an optional color', () => {
    const { getByText } = render(<ChipCell label="Terminated" color="danger" />);

    expect(getByText('Terminated')).toBeTruthy();
  });
});
