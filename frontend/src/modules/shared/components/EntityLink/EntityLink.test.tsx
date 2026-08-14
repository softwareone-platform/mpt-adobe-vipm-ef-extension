import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { EntityDomain, EntityType } from '../../constants';
import { EntityLink } from './EntityLink';

const renderWithRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('EntityLink', () => {
  it('links the entity name to its portal page', () => {
    const { getByRole } = renderWithRouter(
      <EntityLink
        entityDomain={EntityDomain.Catalog}
        entityType={EntityType.Products}
        entity={{ id: 'PRD-1', name: 'Dummy Product' }}
      />
    );

    const link = getByRole('link', { name: 'Dummy Product' });
    expect(link).toHaveAttribute('href', `${window.location.origin}/catalog/products/PRD-1`);
  });

  it('renders the icon of the entity', () => {
    const icon = 'https://api.dummy.test/public/v1/accounts/accounts/ACC-1/icon';
    const { getByTestId } = renderWithRouter(
      <EntityLink
        entityDomain={EntityDomain.Accounts}
        entityType={EntityType.Sellers}
        entity={{ id: 'SEL-1', name: 'Dummy Seller', icon }}
      />
    );

    expect(getByTestId('avatar').querySelector('img')).toHaveAttribute('src', icon);
  });

  it('renders nothing linkable without an entity', () => {
    const { queryByRole } = renderWithRouter(
      <EntityLink entityDomain={EntityDomain.Accounts} entityType={EntityType.Sellers} />
    );

    expect(queryByRole('link')).toBeNull();
  });
});
