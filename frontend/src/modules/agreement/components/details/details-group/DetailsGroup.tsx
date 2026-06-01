import { ReactElement } from 'react';

import './DetailsGroup.scss';

interface DetailsGroupProps {
  title: string;
  children?: ReactElement | ReactElement[];
}

export function DetailsGroup({ title, children }: DetailsGroupProps) {
  return (
    <div className="details-group">
      <div className="details-group__label">{title}</div>
      <div className="details-group__content">{children}</div>
    </div>
  );
}
