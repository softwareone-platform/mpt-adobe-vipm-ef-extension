import { renderHook } from '@testing-library/react';

import { AdobeCustomer } from '../model';
import { useAdobeCustomer } from './useAdobeCustomer';

const EXPECTED_ADOBE_CUSTOMER: AdobeCustomer = {
  status: 'active',
  error: null,
};

describe('useAdobeCustomer', () => {
  it('returns the hardcoded Adobe customer', () => {
    const { result } = renderHook(() => useAdobeCustomer());

    expect(result.current).toEqual(EXPECTED_ADOBE_CUSTOMER);
  });
});
