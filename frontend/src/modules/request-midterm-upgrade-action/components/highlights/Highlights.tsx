import { ReactNode, useMemo } from 'react';

import { Ellipsis } from '@softwareone-platform/sdk-react-ui-v0/ellipsis';

import './Highlights.scss';

export interface HighlightsProps {
  children?: ReactNode;
}

export interface HighlightsItemProps {
  label: string;
  children?: ReactNode;
  className?: string;
}

export function Highlights({ children }: HighlightsProps) {
  return (
    <div className="highlights">
      <div className="highlights__content">{children}</div>
    </div>
  );
}

function HighlightsItem({ label, children, className }: HighlightsItemProps) {
  const processedClassName = useMemo(
    () => (className ? `highlights__item ${className}` : 'highlights__item'),
    [className]
  );

  return (
    <div className={processedClassName}>
      <div className="highlights__item__title">
        <Ellipsis>{label}</Ellipsis>
      </div>
      <div className="highlights__item__content">{children}</div>
    </div>
  );
}

Highlights.Item = HighlightsItem;
