import { EntityReference } from '@softwareone-platform/sdk-react-ui-v0/entity-reference';
import { LinkPopover } from '@softwareone-platform/sdk-react-ui-v0/link-popover';
import { ReactNode } from 'react';

import { InfoCard, InfoCardItem } from '../../info-card/InfoCard';

import './PopoverCell.scss';

export interface PopoverCellProps {
  title: string;
  text?: string;
  secondaryContent?: ReactNode;
  items: InfoCardItem[];
}

export function PopoverCell({ title, text, secondaryContent, items }: PopoverCellProps) {
  return (
    <div className="popover-cell">
      <EntityReference
        primaryContent={
          text ? (
            <LinkPopover title={title} target={<span className="popover-cell__trigger">{text}</span>}>
              <InfoCard items={items} />
            </LinkPopover>
          ) : (
            text
          )
        }
        secondaryContent={secondaryContent}
      />
    </div>
  );
}
