import { render } from '@testing-library/react';

import { UpgradeToStep } from './UpgradeToStep';

jest.mock('../components/target-subscription-grid/TargetSubscriptionGrid', () => ({
  TargetSubscriptionGrid: () => <div data-testid="target-subscription-grid" />,
}));

jest.mock('../shared/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

describe('UpgradeToStep', () => {
  it('renders the heading', () => {
    const { getByText } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} onSubscriptionsChange={() => {}} />);

    expect(getByText('Upgrade to')).toBeTruthy();
  });

  it('renders the wizard highlights and the target subscription grid', () => {
    const { getByTestId } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} onSubscriptionsChange={() => {}} />);

    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('target-subscription-grid')).toBeTruthy();
  });

  it('explains item selection and default auto-renewal', () => {
    const { getByText } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} onSubscriptionsChange={() => {}} />);

    expect(getByText(/Select the item to upgrade to/)).toBeTruthy();
    expect(getByText(/auto-renewal will be enabled by default/)).toBeTruthy();
  });

  it('renders the estimated price disclaimer', () => {
    const { getByText } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} onSubscriptionsChange={() => {}} />);

    expect(getByText(/These estimated prices/)).toBeTruthy();
  });
});
