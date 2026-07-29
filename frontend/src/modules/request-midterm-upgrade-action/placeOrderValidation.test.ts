import { getPlaceOrderValidationError } from './placeOrderValidation';
import { TargetSubscription } from './model';
import { AdobeOfferSwitchPath } from '../shared/model';

function makeTarget(overrides: Partial<TargetSubscription> = {}): TargetSubscription {
  return {
    id: null,
    name: null,
    status: '',
    item: { id: 'ITM-TARGET', name: 'Creative Cloud All Apps', externalId: '65322651CA' },
    targetBaseOfferId: '65322651CA02A12',
    recommended: false,
    currentQuantity: 0,
    newQuantity: 6,
    delta: 6,
    unitSP: '',
    spxM: '',
    spxY: '',
    terms: '',
    commitment: '',
    ...overrides,
  };
}

function makeOfferPaths(switchType: 'PARTIAL_ALLOWED' | 'FULL_ONLY'): AdobeOfferSwitchPath[] {
  return [
    {
      productUpgrades: [
        {
          targetList: [
            {
              targetBaseOfferId: '65322651CA02A12',
              sequence: 1,
              switchType,
            },
          ],
        },
      ],
    } as AdobeOfferSwitchPath,
  ];
}

describe('getPlaceOrderValidationError', () => {
  it('requires a selected target', () => {
    expect(getPlaceOrderValidationError(null, [], 10)).toBe(
      'Select an item to continue.',
    );
  });

  it('requires the Adobe offer id on the selected target', () => {
    const target = makeTarget({ targetBaseOfferId: undefined });

    expect(getPlaceOrderValidationError(target, [], 10)).toBe(
      'The selected item is missing its Adobe offer and cannot be ordered.',
    );
  });

  it('requires a positive new quantity', () => {
    const target = makeTarget({ newQuantity: null });

    expect(getPlaceOrderValidationError(target, [], 10)).toBe(
      'Enter a new quantity of at least 1 for the selected item.',
    );
  });

  it('rejects a partial quantity above the source quantity', () => {
    const target = makeTarget({ newQuantity: 11 });

    expect(getPlaceOrderValidationError(target, makeOfferPaths('PARTIAL_ALLOWED'), 10)).toBe(
      'Quantity cannot exceed 10',
    );
  });

  it('rejects a FULL_ONLY switch that does not move the whole source quantity', () => {
    const target = makeTarget({ newQuantity: 6 });

    expect(getPlaceOrderValidationError(target, makeOfferPaths('FULL_ONLY'), 10)).toBe(
      'Quantity must be 10',
    );
  });

  it('rejects a target that matches no available offer rule', () => {
    const target = makeTarget({ item: { id: 'ITM-TARGET', name: 'Unlisted', externalId: 'UNMATCHED01' } });

    expect(getPlaceOrderValidationError(target, makeOfferPaths('PARTIAL_ALLOWED'), 10)).toBe(
      'The selected item is not an available upgrade and cannot be ordered.',
    );
  });

  it('accepts a valid partial upgrade', () => {
    const target = makeTarget({ newQuantity: 6 });

    expect(getPlaceOrderValidationError(target, makeOfferPaths('PARTIAL_ALLOWED'), 10)).toBeNull();
  });

  it('accepts a full upgrade matching the source quantity', () => {
    const target = makeTarget({ newQuantity: 10 });

    expect(getPlaceOrderValidationError(target, makeOfferPaths('FULL_ONLY'), 10)).toBeNull();
  });

  describe('when the target subscription already exists on the agreement', () => {
    const existing = { id: 'SUB-1111-2222', name: 'Existing sub', currentQuantity: 20 };

    it('rejects a quantity that does not add seats to the existing subscription', () => {
      const target = makeTarget({ ...existing, newQuantity: 20 });

      expect(getPlaceOrderValidationError(target, makeOfferPaths('PARTIAL_ALLOWED'), 10)).toBe(
        'Quantity must be at least 21',
      );
    });

    it('rejects a quantity above the existing seats plus the source quantity', () => {
      const target = makeTarget({ ...existing, newQuantity: 31 });

      expect(getPlaceOrderValidationError(target, makeOfferPaths('PARTIAL_ALLOWED'), 10)).toBe(
        'Quantity cannot exceed 30',
      );
    });

    it('requires the whole source quantity on top of the existing seats for FULL_ONLY', () => {
      const target = makeTarget({ ...existing, newQuantity: 25 });

      expect(getPlaceOrderValidationError(target, makeOfferPaths('FULL_ONLY'), 10)).toBe(
        'Quantity must be 30',
      );
    });

    it('accepts a valid top-up of the existing subscription', () => {
      const target = makeTarget({ ...existing, newQuantity: 26 });

      expect(getPlaceOrderValidationError(target, makeOfferPaths('PARTIAL_ALLOWED'), 10)).toBeNull();
    });
  });
});
