import { useCallback, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useMPTModal } from '@mpt-extension/sdk-react';
import { Wizard } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepProps } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { Loader } from './components/loader/Loader';
import { relativeScreenHeight, relativeScreenWidth } from '../utils/window';
import { UpgradeFromStep } from './UpgradeFromStep';
import { UpgradeToStep } from './UpgradeToStep';
import { SplitBillingStep } from './SplitBillingStep';
import { DetailsStep } from './DetailsStep';

import type {
  Order,
  SplitBillingAgreement,
  SplitBillingAgreementAllocation,
} from '../shared/midtermUpgrade';

import './App.scss';

const steps: StepProps[] = [
  { title: 'Upgrade from' },
  { title: 'Upgrade to' },
  { title: 'Split billing' },
  { title: 'Details' },
];

const agreement: SplitBillingAgreement = {
  id: 'AGR-1111-1111',
  buyer: {
    id: 'BUY-1111-1111',
    name: 'Buyer Name',
  },
  allocations: [
    {
      id: 'ALL-1111-1111',
      buyer: {
        id: 'BUY-1111-1111',
        name: 'Buyer Name',
      },
      percentage: 60,
      price: {
        currency: 'USD',
        SPxY: 1200,
        SPxM: 100,
        PPxY: 1000,
        PPxM: 83.33,
      },
    },
    {
      id: 'ALL-2222-2222',
      buyer: {
        id: 'BUY-2222-2222',
        name: 'Second Buyer Name',
      },
      percentage: 40,
      price: {
        currency: 'USD',
        SPxY: 800,
        SPxM: 66.67,
        PPxY: 666.67,
        PPxM: 55.56,
      },
    },
  ],
};

const initialOrder: Order = {
  id: 'ORD-1111-1111',
  status: 'New',
  type: 'Change',
  billTo: {
    id: 'BUY-1111-1111',
    name: 'Buyer Name',
  },
};

export default function App() {
  const { close } = useMPTModal();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBuyer, setSelectedBuyer] = useState<SplitBillingAgreementAllocation>({});
  const [order, setOrder] = useState<Order>(initialOrder);
  const wizardHeight = relativeScreenHeight();
  const wizardWidth = relativeScreenWidth();

  const onClose = useCallback(() => {
    close();
  }, [close]);

  const addBuyerToOrder = useCallback(
    async (buyer: { id?: string }) => {
      const selected = agreement.allocations?.find(a => a.buyer?.id === buyer.id)?.buyer;
      if (!selected) return;
      setOrder(prev => ({ ...prev, billTo: selected }));
    },
    []
  );

  useEffect(() => {
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return <Loader />;
  }

  return (
    <MemoryRouter>
      <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
        <Wizard
          stepsProps={steps}
          activeStepIndex={activeStepIndex}
          onActiveStepIndexChange={setActiveStepIndex}
          onClose={onClose}
        >
          <Wizard.Header>Upgrade subscription</Wizard.Header>
          <Wizard.Content>
            <Wizard.Content.Steps />
            <Wizard.Content.StepContent>
              {({ activeStepIndex }) => {
                switch (activeStepIndex) {
                  case 0:
                    return <UpgradeFromStep />;
                  case 1:
                    return <UpgradeToStep />;
                  case 2:
                    return (
                      <SplitBillingStep
                        agreement={agreement}
                        order={order}
                        addBuyerToOrder={addBuyerToOrder}
                        selectedBuyer={selectedBuyer}
                        onChange={setSelectedBuyer}
                      />
                    );
                  case 3:
                    return <DetailsStep order={order} setOrder={setOrder} />;
                  default:
                    return null;
                }
              }}
            </Wizard.Content.StepContent>
          </Wizard.Content>
          <Wizard.Actions />
        </Wizard>
      </div>
    </MemoryRouter>
  );
}
