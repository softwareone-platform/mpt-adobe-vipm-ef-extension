import { ReactNode } from 'react';

import { LinkReference } from '../../link-reference/LinkReference';

import './PopoverCell.scss';

export interface PopoverCellProps {
  title: string;
  text?: string;
  secondaryContent?: ReactNode;
  url?: string;
  card: ReactNode;
}

export function PopoverCell({ title, text, secondaryContent, url, card }: PopoverCellProps) {
  return (
    <div className="popover-cell">
      <LinkReference
        text={text}
        secondaryContent={secondaryContent}
        url={url}
        icon={null}
        cardTitle={title}
        card={text ? card : undefined}
      />
    </div>
  );
}
