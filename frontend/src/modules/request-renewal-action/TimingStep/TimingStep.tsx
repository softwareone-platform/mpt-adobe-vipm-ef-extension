import { ChangeEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

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
  const anniversaryDate = pathState?.anniversaryDate || renewalDate;
  const formattedRenewalDate = formatDate(anniversaryDate);
  const days = daysUntil(anniversaryDate);
  const lockedPath = pathState?.lockedPath ?? null;
  const selectedPath = lockedPath ?? path;
  const canPlan = canPlanRenewal(pathState);
  const availablePaths = lockedPath ? [lockedPath] : (Object.keys(PATH_KEYS) as RenewalPath[]);
  const options = canPlan ? availablePaths : [];
  const promptKey = lockedPath
    ? `Renewal:Timing:${PATH_KEYS[lockedPath]}:Locked:Prompt`
    : 'Renewal:Timing:Prompt';
  const promptValues =
    lockedPath === 'now'
      ? { date: formattedRenewalDate }
      : { date: formattedRenewalDate, count: days };

  const learnMore = (
    <a href={RENEWAL_LEARN_MORE_URL} target="_blank" rel="noreferrer">
      {t('Renewal:Timing:Learn more')}
    </a>
  );

  const optionKey = (option: RenewalPath) =>
    `Renewal:Timing:${PATH_KEYS[option]}${lockedPath ? ':Locked' : ''}`;

  const pathDescription = (option: RenewalPath) => {
    const note = lockedPath ? t(`${optionKey(option)}:Note`, { defaultValue: '' }) : '';
    return (
      <>
        <RegularText as="p" size={2}>
          {t(`${optionKey(option)}:Summary`)}
        </RegularText>
        <RegularText as="p" size={2}>
          {t(`${optionKey(option)}:Detail`)}
        </RegularText>
        {note && (
          <RegularText as="p" size={2}>
            {note}
          </RegularText>
        )}
        {learnMore}
      </>
    );
  };

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
        {formattedRenewalDate && (lockedPath === 'now' || days != null) ? (
          <Trans i18nKey={promptKey} values={promptValues} components={{ b: <strong /> }} />
        ) : (
          t('Renewal:Timing:PromptWithoutDate')
        )}
      </RegularText>
      {!lockedPath &&
        (canPlan ? (
          <InlineNotification status="warning">
            {t('Renewal:Timing:Lock notice')} {learnMore}
          </InlineNotification>
        ) : (
          <InlineNotification status="error">
            {pathState?.hasActiveSubscriptions === false
              ? t('Renewal:Timing:No subscriptions')
              : t('Renewal:Timing:Window closed', {
                  opens: pathState?.windowOpensDays,
                  closes: pathState?.windowClosesDays,
                })}{' '}
            {learnMore}
          </InlineNotification>
        ))}
      <div className="timing-step__options">
        {options.map((option) => (
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
                    {t(`${optionKey(option)}:Title`)}
                  </MediumText>
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
