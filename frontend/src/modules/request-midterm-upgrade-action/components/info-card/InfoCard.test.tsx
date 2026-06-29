import { fireEvent, render } from '@testing-library/react';

import { InfoCard, InfoCardItem } from './InfoCard';

const items: InfoCardItem[] = [
  { title: 'ID', content: 'ITM-0520-2723-0405' },
  { title: 'Name', content: 'Illustrator for Teams' },
];

describe('InfoCard', () => {
  it('renders the title and item titles with content', () => {
    const { getByText } = render(<InfoCard title="Item" items={items} />);

    expect(getByText('Item')).toBeTruthy();
    expect(getByText('ID')).toBeTruthy();
    expect(getByText('ITM-0520-2723-0405')).toBeTruthy();
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('Illustrator for Teams')).toBeTruthy();
  });

  it('renders a divider item', () => {
    const { container } = render(
      <InfoCard title="Item" items={[items[0], { type: 'divider' }, items[1]]} />
    );

    expect(container.querySelectorAll('.info-card__section-divider')).toHaveLength(1);
  });

  it('renders a close button and calls onClose when clicked', () => {
    const onClose = jest.fn();
    const { getByText } = render(<InfoCard title="Item" items={items} onClose={onClose} />);

    fireEvent.click(getByText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the close button when onClose is not provided', () => {
    const { queryByText } = render(<InfoCard title="Item" items={items} />);

    expect(queryByText('Close')).toBeNull();
  });

  it('stops click propagation', () => {
    const onParentClick = jest.fn();
    const { getByText } = render(
      <div onClick={onParentClick}>
        <InfoCard title="Item" items={items} />
      </div>
    );

    fireEvent.click(getByText('Item'));

    expect(onParentClick).not.toHaveBeenCalled();
  });
});
