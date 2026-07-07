import { ReactNode } from 'react';

import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';

import { getPortalOrigin } from '../../../utils/link';
import { InfoCardPopover } from '../info-card-popover/InfoCardPopover';

export interface LinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
  url?: string | null;
  icon?: ReactNode;
  infoCard?: ReactNode;
}

export function LinkReference({ text, secondaryContent, url, icon, infoCard }: LinkReferenceProps) {
  const href = url ? `${getPortalOrigin()}${url}` : undefined;

  const primaryContent = href ? (
    <a href={href} target="_top" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    text
  );

  const reference = (
    <EntityReference primaryContent={primaryContent} secondaryContent={secondaryContent} icon={icon} />
  );

  if (!infoCard) {
    return reference;
  }

  return <InfoCardPopover card={infoCard}>{reference}</InfoCardPopover>;
}
