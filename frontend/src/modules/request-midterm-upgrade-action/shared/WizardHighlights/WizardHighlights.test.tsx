import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { WizardHighlights } from './WizardHighlights';

const renderHighlights = () => render(<MemoryRouter><WizardHighlights /></MemoryRouter>);

describe('WizardHighlights', () => {
  it('renders a highlight item for each label', () => {
    const { getByText } = renderHighlights();

    ['Order', 'Agreement', 'Licensee', 'Buyer', 'Seller', 'Base currency', 'Billing currency'].forEach(
      (label) => expect(getByText(label)).toBeTruthy()
    );
  });

  it('renders the order, agreement and account references', () => {
    const { getByText } = renderHighlights();

    expect(getByText('ORD-1111-1111')).toBeTruthy();
    expect(getByText('AGR-1111-1111')).toBeTruthy();
    expect(getByText('Licensee Name')).toBeTruthy();
    expect(getByText('Buyer Name')).toBeTruthy();
    expect(getByText('Seller Name')).toBeTruthy();
  });

  it('links each reference to its commerce/accounts route', () => {
    const { getAllByRole } = renderHighlights();

    const hrefs = getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual([
      '/commerce/orders/ORD-1111-1111',
      '/commerce/agreements/AGR-1111-1111',
      '/accounts/licensees/LIC-1111-1111',
      '/accounts/buyers/BUY-1111-1111',
      '/accounts/sellers/SEL-1111-1111',
    ]);
  });

  it('renders the base and billing currency', () => {
    const { getAllByText } = renderHighlights();

    expect(getAllByText('USD')).toHaveLength(2);
  });
});
