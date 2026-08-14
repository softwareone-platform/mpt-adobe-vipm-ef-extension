import { Fragment, ReactNode } from 'react';

import './InfoCard.scss';

export type InfoCardItem =
  | { type?: 'value'; title: string; content: ReactNode }
  | { type: 'divider' };

export interface InfoCardProps {
  items: InfoCardItem[];
}

export function InfoCard({ items }: InfoCardProps) {
  return (
    <div className="info-card__section" onClick={e => e.stopPropagation()}>
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
  );
}
