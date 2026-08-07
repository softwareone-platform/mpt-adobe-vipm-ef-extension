import { ReactNode } from 'react';

import { Avatar } from '@softwareone-platform/sdk-react-ui-v0/avatar';
import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';
import { LinkPopover } from '@softwareone-platform/sdk-react-ui-v0/link-popover';

import { getPortalOrigin } from '../../../utils/link';

export interface LinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
  url?: string | null;
  iconUrl?: string;
  icon?: ReactNode;
  cardTitle?: string;
  card?: ReactNode;
}

function entityIcon({
  text,
  secondaryContent,
  iconUrl,
}: Pick<LinkReferenceProps, 'text' | 'secondaryContent' | 'iconUrl'>) {
  const jdenticonValue = typeof secondaryContent === 'string' ? secondaryContent : '';
  if (!iconUrl && !jdenticonValue) {
    return undefined;
  }

  return (
    <Avatar
      type="logo"
      shape="circle"
      size={24}
      imageSrc={iconUrl ?? ''}
      text={text ?? null}
      isToUseJdenticon
      jdenticonValue={jdenticonValue}
    />
  );
}

export function LinkReference({
  text,
  secondaryContent,
  url,
  iconUrl,
  icon,
  cardTitle,
  card,
}: LinkReferenceProps) {
  const href = url ? `${getPortalOrigin()}${url}` : undefined;

  const primaryContent = href ? (
    <a href={href} target="_top" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    text
  );

  const resolvedIcon =
    icon !== undefined ? icon : entityIcon({ text, secondaryContent, iconUrl });

  const reference = (
    <EntityReference primaryContent={primaryContent} secondaryContent={secondaryContent} icon={resolvedIcon} />
  );

  if (!card) {
    return reference;
  }

  return <LinkPopover title={cardTitle ?? ''} target={reference}>{card}</LinkPopover>;
}
