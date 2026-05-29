import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { Chip } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { Divider } from '@softwareone-platform/sdk-react-ui-v0/divider';
import { InlineNotification } from '@softwareone-platform/sdk-react-ui-v0/notification';
import { BoldText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { DesignSystemOptionsProvider } from '@softwareone-platform/sdk-react-ui-v0/utils';

import { Field } from './components/Field';
import { useAgreementId } from './hooks/useAgreementId';
import { Status, useAgreementSync } from './hooks/useAgreementSync';

const STATUS_LABEL: Record<Status, string> = {
  idle: 'Idle',
  loading: 'Synchronising',
  success: 'Success',
  error: 'Error',
};

const STATUS_COLOR: Record<Status, 'gray' | 'primary' | 'success' | 'danger'> = {
  idle: 'gray',
  loading: 'primary',
  success: 'success',
  error: 'danger',
};

export default function App() {
  const agreementId = useAgreementId();
  const { error, lastCompleted, lastStatus, status, syncAgreement } = useAgreementSync(agreementId);

  return (
    <DesignSystemOptionsProvider
      value={{
        dateFormat: 'dd MMM yyyy',
        inputDateFormat: 'P',
        languageCode: 'en-GB',
        timeFormat: 'HH:mm',
      }}
    >
      <div className="playground">
        <aside className="playground__sidebar" aria-label="Playground sections">
          <RegularText
            as="h3"
            size={1}
            color="grey-5"
            className="playground__sidebar-heading"
          >
            Manage account
          </RegularText>
          <nav>
            <a
              href="#sync-account"
              aria-current="location"
              className="playground__sidebar-item playground__sidebar-item--active"
            >
              <BoldText as="span" size={2}>Sync account</BoldText>
            </a>
          </nav>
        </aside>

        <section className="playground__content" id="sync-account">
          <header className="playground__content-header">
            <BoldText as="h2" size={4} className="playground__content-title">
              Sync account
            </BoldText>
            <RegularText as="p" size={2} color="grey-5">
              The details of this customer&apos;s synchronisation status are below.
            </RegularText>
          </header>

          {!agreementId && (
            <InlineNotification status="warning" isStandalone>
              Agreement context was not provided by Marketplace.
            </InlineNotification>
          )}

          <InlineNotification status="info" isStandalone>
            If agreement synchronisation fails, please create a Helpdesk case.
          </InlineNotification>

          <section className="playground__section">
            <BoldText as="h3" size={3} className="playground__section-title">
              Synchronisation status
            </BoldText>
            <dl className="playground__fields">
              <Field label="Current status">
                <Chip color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />
              </Field>
              <Field label="Last sync status">
                {lastStatus ? STATUS_LABEL[lastStatus] : '—'}
              </Field>
              <Field label="Last sync completed">
                {lastCompleted ?? '—'}
              </Field>
              <Field label="Next sync available">Now</Field>
            </dl>
          </section>

          <Divider />

          <section className="playground__section">
            <BoldText as="h3" size={3} className="playground__section-title">
              Synchronise now
            </BoldText>
            <RegularText as="p" size={2} color="grey-5">
              To request a sync, click the &ldquo;Sync now&rdquo; button below.
            </RegularText>
            <Button
              isBusy={status === 'loading'}
              isDisabled={!agreementId}
              onClick={syncAgreement}
              type="primary"
            >
              Sync now
            </Button>
          </section>

          {status === 'error' && (
            <InlineNotification status="error" isStandalone>
              {error}
            </InlineNotification>
          )}
          {status === 'success' && (
            <InlineNotification status="warning" isStandalone>
              This is a demo playground. The agreement was not modified.
            </InlineNotification>
          )}
        </section>
      </div>
    </DesignSystemOptionsProvider>
  );
}
