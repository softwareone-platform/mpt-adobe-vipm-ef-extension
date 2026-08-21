import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';
import { LoadingSpinner } from '@softwareone-platform/sdk-react-ui-v0/loading-spinner';
import { Modal } from '@softwareone-platform/sdk-react-ui-v0/modal';
import { MediumText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { useTranslation } from 'react-i18next';

import './ProgressModal.scss';

interface ProgressModalProps {
  isOpen: boolean;
  label: string;
  onCancel: () => void;
  testId?: string;
}

/** Holds the customer while a request they started is in flight, with a way out. */
export function ProgressModal({ isOpen, label, onCancel, testId }: ProgressModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      width={320}
      isToShowCloseButton={false}
      closeOnEsc={false}
      isToCloseOnClickOutside={false}
      testId={testId ?? 'progress-modal'}
    >
      <div className="progress-modal">
        <LoadingSpinner size="small" />
        <MediumText as="p" size={4}>
          {label}
        </MediumText>
        <Button onClick={onCancel} testId="progress-modal-cancel">
          {t('Common:Cancel')}
        </Button>
      </div>
    </Modal>
  );
}
