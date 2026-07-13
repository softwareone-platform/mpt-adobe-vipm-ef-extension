import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import './NoDataCard.scss';

interface NoDataCardProps {
  title: string;
  description: string;
}

export function NoDataCard({ title, description }: NoDataCardProps) {
  return (
    <div className="no-data-card">
      <svg
        className="no-data-card__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <ellipse cx="10" cy="5" rx="7" ry="2.6" />
        <path d="M3 5v9c0 1.4 3.1 2.6 7 2.6" />
        <path d="M17 9V5" />
        <circle cx="18" cy="17" r="4.4" fill="#7b93ff" stroke="none" />
        <path d="M16.4 15.4l3.2 3.2M19.6 15.4l-3.2 3.2" stroke="#fff" strokeWidth="1.4" />
      </svg>
      <RegularText as="p" size={3}>
        {title}
      </RegularText>
      <RegularText as="p" size={2}>
        {description}
      </RegularText>
    </div>
  );
}
