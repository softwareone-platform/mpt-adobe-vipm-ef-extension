import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';
import { ReactNode } from 'react';

import { InfoCard, InfoCardItem } from '../../info-card/InfoCard';
import { InfoCardPopover } from '../../info-card-popover/InfoCardPopover';

import './PopoverCell.scss';

export interface PopoverCellProps {
  title: string;
  text?: string;
  secondaryContent?: ReactNode;
  items: InfoCardItem[];
}

export function PopoverCell({ title, text, secondaryContent, items }: PopoverCellProps) {
  const infoCard = <InfoCard title={title} items={items} />;

  return (
    <div className="popover-cell">
      <EntityReference
        primaryContent={<InfoCardPopover card={infoCard}>{text}</InfoCardPopover>}
        secondaryContent={secondaryContent}
      />
    </div>
  );
}
