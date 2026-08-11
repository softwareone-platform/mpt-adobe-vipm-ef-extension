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

  it('keeps a zero secondary content, such as a new quantity of none', () => {
    const { getByText } = render(<TextCell text="-10" secondaryContent={0} />);

    expect(getByText('0')).toBeTruthy();
  });

  it('omits the secondary content when not provided', () => {
    const { queryByText } = render(<TextCell text="7" />);

    expect(queryByText('user/year')).toBeNull();
  });

  it('omits an empty secondary paragraph for a boolean secondary content', () => {
    const { container } = render(<TextCell text="7" secondaryContent={false} />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
  });
});
