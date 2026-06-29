import { render } from '@testing-library/react';

import { TextCell } from './TextCell';

describe('TextCell', () => {
  it('renders the text inside a grid cell', () => {
    const { getByText, getByTestId } = render(<TextCell text="179.88" />);

    expect(getByText('179.88')).toBeTruthy();
    expect(getByTestId('grid-cell-simple')).toBeTruthy();
  });

  it('renders the secondary content when provided', () => {
    const { getByText } = render(<TextCell text="179.88" secondaryContent="user/year" />);

    expect(getByText('179.88')).toBeTruthy();
    expect(getByText('user/year')).toBeTruthy();
  });

  it('omits the secondary content when not provided', () => {
    const { queryByText } = render(<TextCell text="7" />);

    expect(queryByText('user/year')).toBeNull();
  });
});
