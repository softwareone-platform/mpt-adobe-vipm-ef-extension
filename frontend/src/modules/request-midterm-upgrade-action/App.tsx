import { useCallback, useState } from 'react';

import { useMPTModal } from '@mpt-extension/sdk-react';
import { Wizard } from '@softwareone-platform/sdk-react-ui-v0/wizard';
import type { StepProps } from '@softwareone-platform/sdk-react-ui-v0/wizard';

import { relativeScreenHeight, relativeScreenWidth } from '../utils/window';
import { UpgradeFromStep } from './UpgradeFromStep';

import './App.scss';

const steps: StepProps[] = [{ title: 'Upgrade from' }];

export default function App() {
  const { close } = useMPTModal();
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const wizardHeight = relativeScreenHeight();
  const wizardWidth = relativeScreenWidth();

  const onClose = useCallback(() => {
    close();
  }, [close]);

  return (
    <div className="request-midterm-upgrade__wizard" style={{ height: wizardHeight, width: wizardWidth }}>
      <Wizard
        stepsProps={steps}
        activeStepIndex={activeStepIndex}
        onActiveStepIndexChange={setActiveStepIndex}
        onClose={onClose}
      >
        <Wizard.Header>Request mid-term upgrade</Wizard.Header>
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
  );
}
