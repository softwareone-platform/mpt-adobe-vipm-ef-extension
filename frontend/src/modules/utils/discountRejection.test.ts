import { toRejectionMessage, toRejectionReason } from './discountRejection';

const ADOBE_REASONS = [
  'NOT_FOUND',
  'INELIGIBLE_COMMITMENT_STATUS',
  'INELIGIBLE_COMMITMENT_STATUS_OR_PERCENT_SEATS',
  'INELIGIBLE_COMMITMENT_STATUS_OR_COMMIT_QUANTITY',
  'SEAT_UPGRADE_PERCENTAGE_NOT_MET',
];

const QUALIFICATION_REASONS = [
  'OWNED_ENTITLEMENT_NOT_MET',
  'NEW_TO_PRODUCT_NOT_MET',
  'CUSTOMER_SEGMENT_NOT_MET',
  'CUSTOMER_STATUS_NOT_MET',
  'QUALIFICATION_EVENT_NOT_MET',
  'MUST_MAINTAIN_QUANTITY_NOT_MET',
  'PURCHASE_QUANTITY_NOT_MET',
  'CURRENT_LICENSE_QUANTITY_NOT_MET',
  'RENEWAL_LICENSE_QUANTITY_NOT_MET',
];

const GENERIC = 'This discount is not valid for this line.';

describe('toRejectionReason', () => {
  it.each([...ADOBE_REASONS, ...QUALIFICATION_REASONS])('has its own copy for %s', (reason) => {
    const message = toRejectionReason(reason);

    expect(message).not.toContain(GENERIC);
    expect(message).not.toContain(reason);
    expect(message.length).toBeGreaterThan(0);
  });

  it.each(['SOMETHING_ADOBE_ADDED_LATER', '2141', ''])(
    'falls back to the generic message for %s',
    (reason) => {
      expect(toRejectionReason(reason)).toContain(GENERIC);
    },
  );
});

describe('toRejectionMessage', () => {
  it('names the code, the item and the reason', () => {
    const message = toRejectionMessage(
      { pointer: 'adobe-sub-1', detail: 'NOT_FOUND' },
      'Photoshop for Enterprise',
      'BADCODE1',
    );

    expect(message).toContain('BADCODE1');
    expect(message).toContain('Photoshop for Enterprise');
    expect(message).toContain('is not known');
  });
});
