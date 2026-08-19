import { ChangeEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { SelectionBox } from '@softwareone-platform/sdk-react-ui-v0/selection-box';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { WizardHighlights } from '../../shared/components/WizardHighlights/WizardHighlights';
import { RENEWAL_LEARN_MORE_URL } from '../../shared/constants';
import { Agreement, canPlanRenewal, RenewalPathState } from '../../shared/model';
import { daysUntil, formatDate } from '../../utils/date';
import { RenewalPath } from '../model';

import './TimingStep.scss';

interface TimingStepProps {
  agreement: Agreement;
  renewalDate?: string;
  path: RenewalPath;
  onPathChange: (path: RenewalPath) => void;
  pathState: RenewalPathState | null;
}

const PATH_KEYS: Record<RenewalPath, string> = {
  anniversary: 'Anniversary',
  now: 'Now',
};

export function TimingStep({
  agreement,
  renewalDate,
  path,
  onPathChange,
  pathState,
}: TimingStepProps) {
  const { t } = useTranslation();
  const formattedRenewalDate = formatDate(renewalDate);
  const days = daysUntil(renewalDate);
  const lockedPath = pathState?.lockedPath ?? null;
  const selectedPath = lockedPath ?? path;
  const canPlan = canPlanRenewal(pathState);

  const learnMore = (
    <a href={RENEWAL_LEARN_MORE_URL} target="_blank" rel="noreferrer">
      {t('Renewal:Timing:Learn more')}
    </a>
  );

  const pathDescription = (option: RenewalPath) => (
    <>
      <RegularText as="p" size={2}>
        {t(`Renewal:Timing:${PATH_KEYS[option]}:Summary`)}
      </RegularText>
      <RegularText as="p" size={2}>
        {t(`Renewal:Timing:${PATH_KEYS[option]}:Detail`)}
      </RegularText>
      {learnMore}
    </>
  );

  return (
    <div className="timing-step">
      <div className="timing-step__header">
        <MediumText as="h2" size={4}>
          {t('Renewal:Steps:Timing')}
        </MediumText>
      </div>
      <div className="timing-step__highlights">
        <WizardHighlights agreement={agreement} />
      </div>
      <RegularText as="p" size={2} className="timing-step__prompt">
        {formattedRenewalDate && days != null ? (
          <Trans
            i18nKey="Renewal:Timing:Prompt"
            values={{ date: formattedRenewalDate, count: days }}
            components={{ b: <strong /> }}
          />
        ) : (
          t('Renewal:Timing:PromptWithoutDate')
        )}
      </RegularText>
      {canPlan ? (
        <InlineNotification status="warning" isStandalone>
          {t('Renewal:Timing:Lock notice')} {learnMore}
        </InlineNotification>
      ) : (
        <InlineNotification status="error" isStandalone>
          {pathState?.hasActiveSubscriptions === false
            ? t('Renewal:Timing:No subscriptions')
            : t('Renewal:Timing:Window closed', {
                opens: pathState?.windowOpensDays,
                closes: pathState?.windowClosesDays,
              })}{' '}
          {learnMore}
        </InlineNotification>
      )}
      <div className="timing-step__options">
        {(canPlan ? (Object.keys(PATH_KEYS) as RenewalPath[]) : []).map((option) => (
          <div className="timing-step__option" key={option}>
            <SelectionBox
              name="renewal-path"
              value={option}
              selectedValue={selectedPath}
              isDisabled={lockedPath != null}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onPathChange(event.target.value as RenewalPath)
              }
              title={
                <div className="timing-step__option__title">
                  <MediumText as="span" size={2}>
                    {t(`Renewal:Timing:${PATH_KEYS[option]}:Title`)}
                  </MediumText>
                  {lockedPath === option && (
                    <Chip label={t('Renewal:Timing:Confirmed')} color="success" />
                  )}
                </div>
              }
            >
              {pathDescription(option)}
            </SelectionBox>
          </div>
        ))}
      </div>
    </div>
  );
}
