import { render } from '@testing-library/react';

import { UpgradeFromStep } from './UpgradeFromStep';

jest.mock('../components/current-subscription-grid/CurrentSubscriptionGrid', () => ({
  CurrentSubscriptionGrid: () => <div data-testid="current-subscription-grid" />,
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

describe('UpgradeFromStep', () => {
  it('renders the heading', () => {
    const { getByText } = render(<UpgradeFromStep subscription={{ id: 'SUB-1' }} />);

    expect(getByText('Upgrade from')).toBeTruthy();
  });

  it('renders the wizard highlights and the current subscription grid', () => {
    const { getByTestId } = render(<UpgradeFromStep subscription={{ id: 'SUB-1' }} />);

    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('current-subscription-grid')).toBeTruthy();
  });

  it('explains the upgrade and termination behavior', () => {
    const { getByText } = render(<UpgradeFromStep subscription={{ id: 'SUB-1' }} />);

    expect(getByText(/will be upgraded/)).toBeTruthy();
    expect(getByText(/will be terminated/)).toBeTruthy();
  });

  it('renders the estimated price disclaimer', () => {
    const { getByText } = render(<UpgradeFromStep subscription={{ id: 'SUB-1' }} />);

    expect(getByText(/These estimated prices/)).toBeTruthy();
  });

  it.each([
    ['early', /early renewal has already been placed/],
    ['staged', /renewal has been set up/],
  ] as const)('explains a %s renewal in place', (renewalInPlace, message) => {
    const { getByTestId } = render(
      <UpgradeFromStep subscription={{ id: 'SUB-1' }} renewalInPlace={renewalInPlace} />,
    );

    expect(getByTestId('upgrade-from-step-renewal-in-place').textContent).toMatch(message);
  });

  it('shows no renewal notice when none is in place', () => {
    const { queryByTestId } = render(<UpgradeFromStep subscription={{ id: 'SUB-1' }} />);

    expect(queryByTestId('upgrade-from-step-renewal-in-place')).toBeNull();
    expect(queryByTestId('upgrade-from-step-renewal-check-error')).toBeNull();
  });

  it('shows a failed renewal check', () => {
    const { getByTestId } = render(
      <UpgradeFromStep subscription={{ id: 'SUB-1' }} renewalCheckError="Adobe service request failed" />,
    );

    expect(getByTestId('upgrade-from-step-renewal-check-error').textContent).toBe(
      'Adobe service request failed',
    );
  });
});
