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

const card = <div data-testid="card">Illustrator for Teams</div>;

describe('PopoverCell', () => {
  it('renders the primary text', () => {
    const { getByText } = render(<PopoverCell title="Item" text="Illustrator" card={card} />);

    expect(getByText('Illustrator')).toBeTruthy();
  });

  it('renders the secondary content', () => {
    const { getByText } = render(
      <PopoverCell title="Item" text="Illustrator" secondaryContent="ITM | 30002000CB" card={card} />
    );

    expect(getByText('ITM | 30002000CB')).toBeTruthy();
  });

  it('renders inside an entity reference and a link popover titled after the cell', () => {
    const { getByTestId } = render(<PopoverCell title="Item" text="Illustrator" card={card} />);

    expect(getByTestId('entityReferenceContainer')).toBeTruthy();
    expect(getByTestId('link-popover')).toBeTruthy();
    expect(getByTestId('link-popover-title').textContent).toBe('Item');
  });

  it('links the primary text to the portal page of the entity', () => {
    const { getByText } = render(
      <PopoverCell title="Item" text="Illustrator" url="/catalog/items/ITM-1" card={card} />
    );

    const link = getByText('Illustrator').closest('a');
    expect(link?.getAttribute('href')).toContain('/catalog/items/ITM-1');
    expect(link?.getAttribute('target')).toBe('_top');
  });

  it('does not render a link without a url', () => {
    const { getByText } = render(<PopoverCell title="Item" text="Illustrator" card={card} />);

    expect(getByText('Illustrator').closest('a')).toBeNull();
  });

  it('does not render a popover when there is no text', () => {
    const { getByTestId, queryByTestId } = render(
      <PopoverCell title="Subscription" secondaryContent="SUB-1" card={card} />
    );

    expect(getByTestId('entityReferenceContainer')).toBeTruthy();
    expect(queryByTestId('link-popover')).toBeNull();
  });
});
