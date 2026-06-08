import { AgreementParameter, ProductSegments, readParameter, resolveAgreementId } from './model';

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

describe('readParameter', () => {
  const parameters: AgreementParameter[] = [
    { externalId: '3YCEnrollStatus', value: 'Enrolled' },
    { externalId: '3YCMinLicenses', value: 100 },
  ];

  it('returns the value of the matching parameter', () => {
    expect(readParameter(parameters, '3YCMinLicenses')).toBe(100);
  });

  it('returns undefined when no parameter matches', () => {
    expect(readParameter(parameters, 'missing')).toBeUndefined();
  });

  it('returns undefined when parameters are not provided', () => {
    expect(readParameter(undefined, '3YCEnrollStatus')).toBeUndefined();
  });
});

describe('ProductSegments', () => {
  it('maps each segment to its string value', () => {
    expect(ProductSegments.COM).toBe('COM');
    expect(ProductSegments.EDU).toBe('EDU');
    expect(ProductSegments.GOV).toBe('GOV');
    expect(ProductSegments.LGA).toBe('LGA');
  });
});
