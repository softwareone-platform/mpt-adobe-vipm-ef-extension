import { Fragment, ReactNode } from 'react';

import { Button } from '@softwareone-platform/sdk-react-ui-v0/button';

import './InfoCard.scss';

export type InfoCardItem =
  | { type?: 'value'; title: string; content: ReactNode }
  | { type: 'divider' };

export interface InfoCardProps {
  title: string;
  items: InfoCardItem[];
  onClose?: () => void;
}

export function InfoCard({ title, items, onClose }: InfoCardProps) {
  return (
    <div className="info-card" onClick={e => e.stopPropagation()}>
      <div className="info-card__header">
        <div className="info-card__header__title">{title}</div>
        {onClose && (
          <Button type='text' onClick={onClose}>
            Close
          </Button>
        )}
      </div>
      <div className="info-card__section">
        {items.map((item, index) =>
          item.type === 'divider' ? (
            <div key={index} className="info-card__section-divider" />
          ) : (
            <Fragment key={index}>
              <div className="info-card__section__item__title">{item.title}</div>
              <div className="info-card__section__item__content">{item.content}</div>
            </Fragment>
          )
        )}
      </div>
    </div>
  );
}
