import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { WizardHighlights } from './WizardHighlights';
import type { Subscription } from '../../../shared/model';

const subscription: Subscription = {
  id: 'SUB-1',
  agreement: { id: 'AGR-1111-1111', name: 'Agreement Name', status: 'Active' },
  licensee: { id: 'LIC-1111-1111', name: 'Licensee Name' },
  buyer: { id: 'BUY-1111-1111', name: 'Buyer Name' },
  seller: { id: 'SEL-1111-1111', name: 'Seller Name' },
  price: { currency: 'USD' },
};

const renderHighlights = () =>
  render(
    <MemoryRouter>
      <WizardHighlights subscription={subscription} />
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

  it('renders the base and billing currency', () => {
    const { getAllByText } = renderHighlights();

    expect(getAllByText('USD')).toHaveLength(2);
  });
});
