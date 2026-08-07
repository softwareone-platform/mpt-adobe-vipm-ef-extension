import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { Agreement } from '../../../shared/model';
import { SubscriptionCard } from './SubscriptionCard';

const agreement: Agreement = {
  id: 'AGR-0000-0001',
  vendor: { id: 'ACC-0000-0001', name: 'Dummy Vendor' },
  product: { id: 'PRD-0000-0001', name: 'Dummy Product' },
  client: { id: 'ACC-0000-0002', name: 'Dummy Client' },
  seller: { id: 'SEL-0000-0001', name: 'Dummy Seller' },
  buyer: { id: 'BUY-0000-0001', name: 'Dummy Buyer' },
  licensee: { id: 'LCE-0000-0001', name: 'Dummy Licensee' },
};

const renderWithRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SubscriptionCard', () => {
  it('links the subscription name to its commerce page', () => {
    const { getByRole } = renderWithRouter(
      <SubscriptionCard id="SUB-0000-0001" name="Dummy Subscription" />
    );

    expect(getByRole('link', { name: 'Dummy Subscription' })).toHaveAttribute(
      'href',
      `${window.location.origin}/commerce/subscriptions/SUB-0000-0001`
    );
  });

  it('shows the renewal date and the terms of the subscription', () => {
    const { getByText, getAllByText } = renderWithRouter(
      <SubscriptionCard
        id="SUB-0000-0001"
        name="Dummy Subscription"
        status="Active"
        commitmentDate="2000-01-01T12:00:00.000Z"
        terms={{ period: '1y', commitment: '1y' }}
      />
    );

    expect(getByText('Active')).toBeTruthy();
    expect(getByText(/2000/)).toBeTruthy();
    expect(getAllByText('1 year')).toHaveLength(2);
  });

  it('shows the accounts of the agreement the subscription belongs to', () => {
    const { getByText } = renderWithRouter(
      <SubscriptionCard id="SUB-0000-0001" name="Dummy Subscription" agreement={agreement} />
    );

    expect(getByText('Dummy Vendor')).toBeTruthy();
    expect(getByText('Dummy Client')).toBeTruthy();
    expect(getByText('Dummy Seller')).toBeTruthy();
    expect(getByText('Dummy Buyer')).toBeTruthy();
    expect(getByText('Dummy Licensee')).toBeTruthy();
  });
});
