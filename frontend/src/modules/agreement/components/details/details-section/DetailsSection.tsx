import { ReactNode } from 'react';

import './DetailsSection.scss';

interface DetailsSectionProps {
  label: string;
  content?: string;
  testid?: string;
  children?: ReactNode;
}

export function DetailsSection({
  label,
  content,
  testid,
  children,
}: DetailsSectionProps) {
  return (
    <div className="details-section" data-testid={testid}>
      <div className="details-section__label">{label}</div>
      <div className="details-section__content">{content ?? '—'}</div>
      {children}
    </div>
  );
}
