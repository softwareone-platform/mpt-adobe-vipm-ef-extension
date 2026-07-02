import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

export function UpgradeFromStep() {
  return (
    <div className="upgrade-from-step">
      <MediumText as="h2" size={4}>
        Upgrade from
      </MediumText>
      <RegularText as="p" size={2} color="grey-5">
        Upgrade from.
      </RegularText>
    </div>
  );
}
