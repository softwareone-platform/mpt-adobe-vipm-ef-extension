import { EntityDomain, EntityType } from '../shared/constants';
import { getEntityLink } from './link';

describe('getEntityLink', () => {
  it('nests an entity under its type', () => {
    expect(getEntityLink(EntityDomain.Commerce, EntityType.Agreements, 'AGR-1')).toBe(
      '/commerce/agreements/AGR-1'
    );
    expect(getEntityLink(EntityDomain.Accounts, EntityType.Sellers, 'SEL-1')).toBe(
      '/accounts/sellers/SEL-1'
    );
  });

  it('places an account directly under its domain', () => {
    expect(getEntityLink(EntityDomain.Accounts, EntityType.Accounts, 'ACC-1')).toBe('/accounts/ACC-1');
  });

  it('returns undefined without an id', () => {
    expect(getEntityLink(EntityDomain.Catalog, EntityType.Products, undefined)).toBeUndefined();
  });
});
