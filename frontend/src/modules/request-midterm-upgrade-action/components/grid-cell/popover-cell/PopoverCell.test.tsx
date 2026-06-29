import { render } from '@testing-library/react';

import { PopoverCell } from './PopoverCell';

const items = [
  { title: 'ID', content: 'ITM-0520-2723-0405' },
  { title: 'Name', content: 'Illustrator for Teams' },
];

describe('PopoverCell', () => {
  it('renders the primary text', () => {
    const { getByText } = render(<PopoverCell title="Item" text="Illustrator" items={items} />);

    expect(getByText('Illustrator')).toBeTruthy();
  });

  it('renders the secondary content', () => {
    const { getByText } = render(
      <PopoverCell title="Item" text="Illustrator" secondaryContent="ITM | 30002000CB" items={items} />
    );

    expect(getByText('ITM | 30002000CB')).toBeTruthy();
  });

  it('renders inside an entity reference', () => {
    const { getByTestId } = render(<PopoverCell title="Item" text="Illustrator" items={items} />);

    expect(getByTestId('entityReferenceContainer')).toBeTruthy();
    expect(getByTestId('popover')).toBeTruthy();
  });
});
