import { ReactNode, useMemo } from 'react';

import { Chip, ChipColor } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { Ellipsis } from '@softwareone-platform/sdk-react-ui-v0/ellipsis';
import { LinkPopover } from '@softwareone-platform/sdk-react-ui-v0/link-popover';

import { getPortalOrigin } from '../../../utils/link';

import './ReferenceWithChip.scss';

export interface ReferenceWithChipProps {
  text?: string;
  url?: string | null;
  statusLabel: string;
  statusColor?: ChipColor;
  cardTitle?: string;
  card?: ReactNode;
}

export function ReferenceWithChip({ text, url, statusLabel, statusColor, cardTitle, card }: ReferenceWithChipProps) {
  const href = url ? `${getPortalOrigin()}${url}` : undefined;

  const referenceElement = (
    <span className="entity-reference-with-chip__text">
      <Ellipsis isToHideTooltip={!!card}>{text}</Ellipsis>
    </span>
  );

  const className = useMemo(() => {
    const result = ['entity-reference-with-chip'];
    if (card) {
      result.push('entity-reference-with-chip--with-info-card');
    }
    return result.join(' ');
  }, [card]);

  const reference = (
    <div className={className}>
      {!!text && (href ? <a href={href} target="_top" rel="noopener noreferrer">{referenceElement}</a> : referenceElement)}
      <Chip label={statusLabel} color={statusColor} />
    </div>
  );

  if (!card) {
    return reference;
  }

  return <LinkPopover title={cardTitle ?? ''} target={reference}>{card}</LinkPopover>;
}
