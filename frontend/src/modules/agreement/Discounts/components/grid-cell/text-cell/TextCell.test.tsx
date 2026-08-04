import { render } from '@testing-library/react';

import { TextCell } from './TextCell';

describe('TextCell', () => {
  it('renders the text inside a grid cell', () => {
    const { getByText } = render(<TextCell text="15% off" />);

    expect(getByText('15% off')).toBeTruthy();
  });

  it('renders the secondary content when provided', () => {
    const { getByText } = render(
      <TextCell text="2026-02-01 - 2026-10-29" secondaryContent="Discount lock until: 2026-12-31" />,
    );

    expect(getByText('2026-02-01 - 2026-10-29')).toBeTruthy();
    expect(getByText('Discount lock until: 2026-12-31')).toBeTruthy();
  });

  it('omits the secondary content when not provided', () => {
    const { queryByText } = render(<TextCell text="Open" />);

    expect(queryByText('Discount lock until: 2026-12-31')).toBeNull();
  });
});
