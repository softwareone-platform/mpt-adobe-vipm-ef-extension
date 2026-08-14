import { fireEvent, render } from '@testing-library/react';

import { InfoCard, InfoCardItem } from './InfoCard';

const items: InfoCardItem[] = [
  { title: 'ID', content: 'ITM-0520-2723-0405' },
  { title: 'Name', content: 'Illustrator for Teams' },
];

describe('InfoCard', () => {
  it('renders the item titles with content', () => {
    const { getByText } = render(<InfoCard items={items} />);

    expect(getByText('ID')).toBeTruthy();
    expect(getByText('ITM-0520-2723-0405')).toBeTruthy();
    expect(getByText('Name')).toBeTruthy();
    expect(getByText('Illustrator for Teams')).toBeTruthy();
  });

  it('renders a divider item', () => {
    const { container } = render(
      <InfoCard items={[items[0], { type: 'divider' }, items[1]]} />
    );

    expect(container.querySelectorAll('.info-card__section-divider')).toHaveLength(1);
  });

  it('stops click propagation', () => {
    const onParentClick = jest.fn();
    const { getByText } = render(
      <div onClick={onParentClick}>
        <InfoCard items={items} />
      </div>
    );

    fireEvent.click(getByText('ID'));

    expect(onParentClick).not.toHaveBeenCalled();
  });
});
