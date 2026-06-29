import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';

import { InfoCardPopover } from '../info-card-popover/InfoCardPopover';

export interface LinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
  url?: string | null;
  icon?: ReactNode;
  infoCard?: ReactNode;
}

export function LinkReference({ text, secondaryContent, url, icon, infoCard }: LinkReferenceProps) {
  const primaryContent = url ? <Link to={url}>{text}</Link> : text;

  const reference = (
    <EntityReference primaryContent={primaryContent} secondaryContent={secondaryContent} icon={icon} />
  );

  if (!infoCard) {
    return reference;
  }

  return <InfoCardPopover card={infoCard}>{reference}</InfoCardPopover>;
}
