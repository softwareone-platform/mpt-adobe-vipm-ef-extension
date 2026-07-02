import { useCallback, useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useMPTModal } from '@mpt-extension/sdk-react';
import { Wizard } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepProps } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { Loader } from './components/loader/Loader';
import { relativeScreenHeight, relativeScreenWidth } from '../utils/window';
import { UpgradeFromStep } from './UpgradeFromStep';

import './App.scss';

const steps: StepProps[] = [{ title: 'Upgrade from' }];

export default function App() {
  const { close } = useMPTModal();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const wizardHeight = relativeScreenHeight();
  const wizardWidth = relativeScreenWidth();

  const onClose = useCallback(() => {
    close();
  }, [close]);

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
