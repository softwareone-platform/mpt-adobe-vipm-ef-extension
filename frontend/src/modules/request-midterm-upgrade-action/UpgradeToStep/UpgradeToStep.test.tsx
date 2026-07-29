import { act, render } from '@testing-library/react';

import { UpgradeToStep } from './UpgradeToStep';
import type { TargetSubscription } from '../model';
import type { Subscription } from '../../shared/model';

type NavProps = { currentStepIndex: number; targetStepIndex: number };

let registeredOnNext: ((props: NavProps) => Promise<number>) | undefined;
const registerOnNextCallback = jest.fn((cb: (props: NavProps) => Promise<number>) => {
  registeredOnNext = cb;
});

let capturedOnSelectedTargetChange: ((target: TargetSubscription | null) => void) | undefined;

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({ registerOnNextCallback }),
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/notification', () => ({
  InlineNotification: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="validation-error">{children}</div>
  ),
}));

jest.mock('../components/target-subscription-grid/TargetSubscriptionGrid', () => ({
  ...jest.requireActual('../components/target-subscription-grid/TargetSubscriptionGrid'),
  TargetSubscriptionGrid: ({
    onSelectedTargetChange,
  }: {
    onSelectedTargetChange?: (target: TargetSubscription | null) => void;
  }) => {
    capturedOnSelectedTargetChange = onSelectedTargetChange;
    return <div data-testid="target-subscription-grid" />;
  },
}));

jest.mock('../shared/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

describe('UpgradeToStep', () => {
  it('renders the heading', () => {
    const { getByText } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} sourceQuantity={0} offerStatus="success" onSubscriptionsChange={() => {}} />);

    expect(getByText('Upgrade to')).toBeTruthy();
  });

  it('renders the wizard highlights and the target subscription grid', () => {
    const { getByTestId } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} sourceQuantity={0} offerStatus="success" onSubscriptionsChange={() => {}} />);

    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('target-subscription-grid')).toBeTruthy();
  });

  it('explains item selection and default auto-renewal', () => {
    const { getByText } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} sourceQuantity={0} offerStatus="success" onSubscriptionsChange={() => {}} />);

    expect(getByText(/Select the item to upgrade to/)).toBeTruthy();
    expect(getByText(/auto-renewal will be enabled by default/)).toBeTruthy();
  });

  it('renders the estimated price disclaimer', () => {
    const { getByText } = render(<UpgradeToStep subscription={{ id: 'SUB-1' }} subscriptions={[]} offerPaths={[]} sourceQuantity={0} offerStatus="success" onSubscriptionsChange={() => {}} />);

    expect(getByText(/These estimated prices/)).toBeTruthy();
  });

  describe('next-step gate', () => {
    const offerPaths = [
      {
        totalCount: 1,
        count: 1,
        offset: 0,
        limit: 1,
        productUpgrades: [
          {
            sourceBaseOfferId: 'AO03.25470.MN | 30002000CB',
            targetList: [
              { targetBaseOfferId: 'AO03.25470.MN | 30002000CB', sequence: 1, switchType: 'PARTIAL_ALLOWED' as const },
            ],
          },
        ],
      },
    ];

    const validTarget: TargetSubscription = {
      id: null,
      name: null,
      status: '',
      item: { id: 'ITM-1', name: 'Illustrator', externalId: 'AO03.25470' },
      targetBaseOfferId: 'AO03.25470.MN | 30002000CB',
      recommended: true,
      currentQuantity: 0,
      newQuantity: 5,
      delta: 5,
      unitSP: '',
      spxM: '',
      spxY: '',
      terms: '',
      commitment: '',
    };

    beforeEach(() => {
      registeredOnNext = undefined;
      capturedOnSelectedTargetChange = undefined;
      registerOnNextCallback.mockClear();
    });

    function renderStep() {
      return render(
        <UpgradeToStep
          subscription={{ id: 'SUB-1' } as Subscription}
          subscriptions={[]}
          offerPaths={offerPaths}
          sourceQuantity={7}
          offerStatus="success"
          onSubscriptionsChange={() => {}}
        />,
      );
    }

    it('blocks advancing and shows an error when no target is selected', async () => {
      const { getByTestId } = renderStep();

      let next = 0;
      await act(async () => {
        next = await registeredOnNext!({ currentStepIndex: 1, targetStepIndex: 2 });
      });

      expect(next).toBe(1);
      expect(getByTestId('validation-error').textContent).toMatch(/Select an item to continue/);
    });

    it('advances when the selected target passes validation', async () => {
      renderStep();

      act(() => capturedOnSelectedTargetChange!(validTarget));

      let next = 0;
      await act(async () => {
        next = await registeredOnNext!({ currentStepIndex: 1, targetStepIndex: 2 });
      });

      expect(next).toBe(2);
    });

    it('blocks advancing when the selected target quantity is invalid', async () => {
      const { getByTestId } = renderStep();

      act(() => capturedOnSelectedTargetChange!({ ...validTarget, newQuantity: 0 }));

      let next = 0;
      await act(async () => {
        next = await registeredOnNext!({ currentStepIndex: 1, targetStepIndex: 2 });
      });

      expect(next).toBe(1);
      expect(getByTestId('validation-error')).toBeTruthy();
    });

    it('clears a stale error when the selection changes', async () => {
      const { getByTestId, queryByTestId } = renderStep();

      await act(async () => {
        await registeredOnNext!({ currentStepIndex: 1, targetStepIndex: 2 });
      });
      expect(getByTestId('validation-error')).toBeTruthy();

      act(() => capturedOnSelectedTargetChange!(validTarget));

      expect(queryByTestId('validation-error')).toBeNull();
    });
  });
});
