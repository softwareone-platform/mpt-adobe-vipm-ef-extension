import { ReactNode } from 'react';

import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

interface FieldProps {
  children: ReactNode;
  label: string;
}

export function Field({ label, children }: FieldProps) {
  return (
    <div className="playground__field">
      <RegularText as="dt" size={2} color="grey-5" className="playground__field-label">
        {label}
      </RegularText>
      <dd className="playground__field-value">
        {typeof children === 'string' ? (
          <RegularText as="span" size={2}>
            {children}
          </RegularText>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}
