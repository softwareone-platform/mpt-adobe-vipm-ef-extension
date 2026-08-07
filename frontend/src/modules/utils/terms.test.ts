import type { TFunction } from 'i18next';

import { termLabel } from './terms';

const t = ((key: string, options?: { defaultValue?: string }) =>
  key === 'Common:Terms:1y' ? '1 year' : options?.defaultValue) as unknown as TFunction;

describe('termLabel', () => {
  it('translates a known term', () => {
    expect(termLabel(t, '1y')).toBe('1 year');
  });

  it('falls back to the term itself when it has no translation', () => {
    expect(termLabel(t, '7y')).toBe('7y');
  });

  it('renders a dash without a term', () => {
    expect(termLabel(t, undefined)).toBe('—');
    expect(termLabel(t, null)).toBe('—');
  });
});
