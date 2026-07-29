import { render } from '@testing-library/react';

import { UpgradeFromStep } from './UpgradeFromStep';

jest.mock('../components/current-subscription-grid/CurrentSubscriptionGrid', () => ({
  CurrentSubscriptionGrid: () => <div data-testid="current-subscription-grid" />,
}));

jest.mock('../shared/WizardHighlights/WizardHighlights', () => ({
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
});
