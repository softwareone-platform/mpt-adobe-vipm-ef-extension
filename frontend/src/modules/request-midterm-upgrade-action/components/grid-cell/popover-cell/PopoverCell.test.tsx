import { ReactNode } from 'react';

import { render } from '@testing-library/react';

import { PopoverCell } from './PopoverCell';

jest.mock('@softwareone-platform/sdk-react-ui-v0/link-popover', () => ({
  LinkPopover: ({ title, target, children }: { title: string; target: ReactNode; children: ReactNode }) => (
    <div data-testid="link-popover">
      <div data-testid="link-popover-title">{title}</div>
      <div>{target}</div>
      {children}
    </div>
  ),
}));

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

  it('renders inside an entity reference and a link popover titled after the cell', () => {
    const { getByTestId } = render(<PopoverCell title="Item" text="Illustrator" items={items} />);

    expect(getByTestId('entityReferenceContainer')).toBeTruthy();
    expect(getByTestId('link-popover')).toBeTruthy();
    expect(getByTestId('link-popover-title').textContent).toBe('Item');
  });

  it('does not render a popover when there is no text', () => {
    const { getByTestId, queryByTestId } = render(
      <PopoverCell title="Subscription" secondaryContent="SUB-1" items={items} />
    );

    expect(getByTestId('entityReferenceContainer')).toBeTruthy();
    expect(queryByTestId('link-popover')).toBeNull();
  });
});
