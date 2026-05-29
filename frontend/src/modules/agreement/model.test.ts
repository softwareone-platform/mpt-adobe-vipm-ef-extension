import { resolveAgreementId } from './model';

describe('agreement model helpers', () => {
  it('resolves agreement id from the Marketplace context agreement', () => {
    const result = resolveAgreementId({
      data: {
        agreement: {
          id: 'AGR-1234-5678-9012',
        },
      },
    });

    expect(result).toBe('AGR-1234-5678-9012');
  });

  it('trims agreement id from the Marketplace context agreement', () => {
    const result = resolveAgreementId({
      data: {
        agreement: {
          id: ' AGR-9876-5432-1098 ',
        },
      },
    });

    expect(result).toBe('AGR-9876-5432-1098');
  });

  it('returns an empty agreement id when the context agreement is missing', () => {
    const result = resolveAgreementId({});

    expect(result).toBe('');
  });
});
