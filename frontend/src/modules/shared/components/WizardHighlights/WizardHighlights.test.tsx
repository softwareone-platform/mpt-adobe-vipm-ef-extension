import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { WizardHighlights } from './WizardHighlights';
import type { Agreement, Order, Subscription } from '../../model';

jest.mock('@softwareone-platform/sdk-react-ui-v0/avatar', () => ({
  Avatar: ({ jdenticonValue }: { jdenticonValue?: string }) => (
    <span data-testid="avatar" data-jdenticon-value={jdenticonValue} />
  ),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/link-popover', () => ({
  LinkPopover: ({ target }: { target: ReactNode }) => <div data-testid="link-popover">{target}</div>,
}));

const agreement: Agreement = {
  id: 'AGR-1111-1111',
  name: 'Agreement Name',
  status: 'Active',
  price: { currency: 'USD', billingCurrency: 'EUR' },
  licensee: { id: 'LIC-9999-9999', name: 'Agreement Licensee' },
  buyer: { id: 'BUY-9999-9999', name: 'Agreement Buyer' },
  seller: { id: 'SEL-9999-9999', name: 'Agreement Seller' },
};

const subscription: Subscription = {
  id: 'SUB-1',
  agreement,
  licensee: { id: 'LIC-1111-1111', name: 'Licensee Name' },
  buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' },
  seller: { id: 'SEL-1111-1111', name: 'Seller Name' },
  price: { currency: 'USD' },
};

const renderHighlights = (order?: Order | null) =>
  render(
    <MemoryRouter>
      <WizardHighlights agreement={agreement} parties={subscription} order={order} />
    </MemoryRouter>
  );

describe('WizardHighlights', () => {
  it('renders a highlight item for each label', () => {
    const { getByText } = renderHighlights();

    ['Order', 'Agreement', 'Licensee', 'Buyer', 'Seller', 'Base currency', 'Billing currency'].forEach(
      (label) => expect(getByText(label)).toBeTruthy()
    );
  });

  it('renders the agreement and account references', () => {
    const { getByText } = renderHighlights();

    expect(getByText('Agreement Name')).toBeTruthy();
    expect(getByText('AGR-1111-1111')).toBeTruthy();
    expect(getByText('Licensee Name')).toBeTruthy();
    expect(getByText('Buyer Name')).toBeTruthy();
    expect(getByText('Seller Name')).toBeTruthy();
  });

  it('falls back to the accounts of the agreement when no parties are given', () => {
    const { getByText } = render(
      <MemoryRouter>
        <WizardHighlights agreement={agreement} />
      </MemoryRouter>
    );

    expect(getByText('Agreement Licensee')).toBeTruthy();
    expect(getByText('Agreement Buyer')).toBeTruthy();
    expect(getByText('Agreement Seller')).toBeTruthy();
  });

  it('renders a person avatar keyed on the id for the licensee, buyer, and seller', () => {
    const { getAllByTestId } = renderHighlights();

    const avatarValues = getAllByTestId('avatar').map((el) => el.getAttribute('data-jdenticon-value'));
    expect(avatarValues).toEqual(['LIC-1111-1111', 'BUY-1111-1111', 'SEL-1111-1111']);
  });

  it('links the agreement and account references to their routes', () => {
    const { getAllByRole } = renderHighlights();

    const hrefs = getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      `${window.location.origin}/commerce/agreements/AGR-1111-1111`,
      `${window.location.origin}/accounts/licensees/LIC-1111-1111`,
      `${window.location.origin}/accounts/buyers/BUY-1111-1111`,
      `${window.location.origin}/accounts/sellers/SEL-1111-1111`,
    ]);
  });

  it('renders the base and the billing currency of the agreement', () => {
    const { getByText } = renderHighlights();

    const highlightContent = (label: string) =>
      getByText(label).closest('.highlights__item')?.querySelector('.highlights__item__content')
        ?.textContent;

    expect(highlightContent('Base currency')).toBe('USD');
    expect(highlightContent('Billing currency')).toBe('EUR');
  });

  it('shows the order status without a link before the order is created', () => {
    const { getByText, queryByText } = renderHighlights({ id: null, status: 'New', type: 'Change' });

    expect(getByText('New')).toBeTruthy();
    expect(getByText('Change order')).toBeTruthy();
    expect(queryByText(/^ORD-/)).toBeNull();
  });

  it('links the created order id to the order route', () => {
    const { getByText } = renderHighlights({
      id: 'ORD-2222-2222',
      status: 'Processing',
      type: 'Change',
    });

    const orderLink = getByText('ORD-2222-2222').closest('a');
    expect(orderLink?.getAttribute('href')).toBe(
      `${window.location.origin}/commerce/orders/ORD-2222-2222`,
    );
    expect(getByText('Processing')).toBeTruthy();
  });
});
