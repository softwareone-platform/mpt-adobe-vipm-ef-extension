import { ReactNode, useMemo } from 'react';

import { Chip, ChipColor } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { Ellipsis } from '@softwareone-platform/sdk-react-ui-v0/ellipsis';

import { getPortalOrigin } from '../../../utils/link';
import { InfoCardPopover } from '../info-card-popover/InfoCardPopover';

import './ReferenceWithChip.scss';

export interface ReferenceWithChipProps {
  text?: string;
  url?: string | null;
  statusLabel: string;
  statusColor?: ChipColor;
  infoCard?: ReactNode;
}

export function ReferenceWithChip({ text, url, statusLabel, statusColor, infoCard }: ReferenceWithChipProps) {
  const href = url ? `${getPortalOrigin()}${url}` : undefined;

  const referenceElement = (
    <span className="entity-reference-with-chip__text">
      <Ellipsis isToHideTooltip={!!infoCard}>{text}</Ellipsis>
    </span>
  );

  const className = useMemo(() => {
    const result = ['entity-reference-with-chip'];
    if (infoCard) {
      result.push('entity-reference-with-chip--with-info-card');
    }
    return result.join(' ');
  }, [infoCard]);

  const reference = (
    <div className={className}>
      {!!text && (href ? <a href={href} target="_top" rel="noopener noreferrer">{referenceElement}</a> : referenceElement)}
      <Chip label={statusLabel} color={statusColor} />
    </div>
  );

  if (!infoCard) {
    return reference;
  }

  return <InfoCardPopover card={infoCard}>{reference}</InfoCardPopover>;
}
