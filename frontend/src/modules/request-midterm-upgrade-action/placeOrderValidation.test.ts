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
      'Select the item to upgrade to before placing the order.',
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
});
