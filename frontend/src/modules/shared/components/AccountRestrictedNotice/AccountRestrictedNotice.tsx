import { Card } from '@softwareone-platform/sdk-react-ui-v0/card';
import { Icon } from '@softwareone-platform/sdk-react-ui-v0/icon';
import { MediumText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import './AccountRestrictedNotice.scss';

interface AccountRestrictedNoticeProps {
  title: string;
  message: string;
}

export function AccountRestrictedNotice({ title, message }: AccountRestrictedNoticeProps) {
  return (
    <div className="account-restricted-notice">
      <Card className="account-restricted-notice__card">
        <Icon name="release_alert" size={64} aria-hidden />
        <MediumText as="h2" size={4}>
          {title}
        </MediumText>
        <RegularText as="p" size={2} color="grey-5">
          {message}
        </RegularText>
      </Card>
    </div>
  );
}
