import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { ThreeYearCommitment } from '.';
import type { AdobeCustomerData } from '../../shared/model';

const mockOpen = jest.fn();
const mockUpdate = jest.fn();
const mockRefresh = jest.fn();

const COMMITTED_CUSTOMER: AdobeCustomerData = {
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT',
      commitment: {
        status: 'COMMITTED',
        startDate: '2026-09-29',
        endDate: '2029-09-28',
        minimumQuantities: [{ offerType: 'LICENSE', quantity: 10 }],
      },
    },
  ],
};

// What Adobe answers to a commitment request: the new request only.
const SEND_RESPONSE: AdobeCustomerData = {
  benefits: [
    {
      type: 'THREE_YEAR_COMMIT',
      commitmentRequest: {
        status: 'REQUESTED',
        minimumQuantities: [{ offerType: 'LICENSE', quantity: 50 }],
      },
    },
  ],
};

jest.mock('@mpt-extension/sdk-react', () => ({
  useMPTContext: () => ({
    auth: { account: { type: 'Operations' } },
    data: { agreement: { product: { id: 'PRD-1' } } },
  }),
  useMPTModal: () => ({ open: mockOpen, close: jest.fn() }),
}), { virtual: true });

jest.mock('../../shared/hooks/useSettings', () => ({
  useSettings: () => ({ products: [{ id: 'PRD-1', segment: 'COM' }] }),
}));

jest.mock('../../shared/hooks/useAgreementId', () => ({
  useAgreementId: () => 'AGR-1234-5678-9012',
}));

jest.mock('../../shared/hooks/useAdobeCustomer', () => ({
  useAdobeCustomer: () => ({
    status: 'success',
    error: null,
    data: COMMITTED_CUSTOMER,
    update: mockUpdate,
    refresh: mockRefresh,
  }),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () =>
  jest
    .requireActual<typeof import('../../shared/testing/sdkUiMocks')>(
      '../../shared/testing/sdkUiMocks',
    )
    .createButtonMock(),
);

function closeRequestModal(data?: { customer?: AdobeCustomerData }) {
  fireEvent.click(screen.getByRole('button', { name: 'Request commitment' }));
  const [, options] = mockOpen.mock.calls[0];
  options.onClose(data);
}

describe('ThreeYearCommitment', () => {
  beforeEach(() => {
    mockOpen.mockReset();
    mockUpdate.mockReset();
    mockRefresh.mockReset();
  });

  it('reads the customer again after a send instead of keeping the send response', () => {
    render(<ThreeYearCommitment />);

    closeRequestModal({ customer: SEND_RESPONSE });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps the customer when the modal closes without a send', () => {
    render(<ThreeYearCommitment />);

    closeRequestModal();

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
