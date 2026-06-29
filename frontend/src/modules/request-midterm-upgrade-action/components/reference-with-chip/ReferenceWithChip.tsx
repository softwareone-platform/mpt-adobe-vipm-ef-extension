import { ReactNode, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Chip, ChipColor } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { Ellipsis } from '@softwareone-platform/sdk-react-ui-v0/ellipsis';

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
      {!!text && (url ? <Link to={url}>{referenceElement}</Link> : referenceElement)}
      <Chip label={statusLabel} color={statusColor} />
    </div>
  );

  if (!infoCard) {
    return reference;
  }

  return <InfoCardPopover card={infoCard}>{reference}</InfoCardPopover>;
}
