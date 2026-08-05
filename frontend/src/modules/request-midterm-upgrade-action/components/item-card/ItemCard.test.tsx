import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { SubscriptionItem } from '../../model';
import { ItemCard } from './ItemCard';

const item: SubscriptionItem = {
  id: 'ITM-0000-0000-0001',
  name: 'Dummy Item',
  externalId: 'SKU0000001',
  status: 'Published',
  terms: { period: '1y', commitment: '1y' },
  audit: { created: { at: '2000-01-01T00:00:00.000Z' }, updated: { at: '2000-01-02T00:00:00.000Z' } },
  product: { id: 'PRD-0000-0001', name: 'Dummy Product' },
  vendor: { id: 'ACC-0000-0001', name: 'Dummy Vendor' },
};

const renderWithRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ItemCard', () => {
  it('links the item name to its catalog page', () => {
    const { getByRole } = renderWithRouter(<ItemCard item={item} />);

    expect(getByRole('link', { name: 'Dummy Item' })).toHaveAttribute(
      'href',
      `${window.location.origin}/catalog/items/ITM-0000-0000-0001`
    );
  });

  it('shows the catalog details of the item', () => {
    const { getByText } = renderWithRouter(<ItemCard item={item} />);

    expect(getByText('Published')).toBeTruthy();
    expect(getByText('Dummy Vendor')).toBeTruthy();
    expect(getByText('SKU0000001')).toBeTruthy();
    expect(getByText('Dummy Product')).toBeTruthy();
  });

  it('renders a dash for the details the item does not carry', () => {
    const { getAllByText } = renderWithRouter(
      <ItemCard item={{ id: 'ITM-0000-0000-0001', name: 'Dummy Item', externalId: '' }} />
    );

    expect(getAllByText('—').length).toBeGreaterThan(0);
  });
});
