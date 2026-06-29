import { GridCellSimple } from '@softwareone-platform/sdk-react-ui-v0/grid';
import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { ReactNode } from 'react';

import './TextCell.scss';

export interface TextCellProps {
  text: ReactNode;
  secondaryContent?: ReactNode;
}

export function TextCell({ text, secondaryContent }: TextCellProps) {
  return (
    <GridCellSimple>
      <div className="text-cell">
        <RegularText as="p" size={2}>
          {text}
        </RegularText>
        {secondaryContent && (
          <RegularText as="p" size={1} color="grey-4">
            {secondaryContent}
          </RegularText>
        )}
      </div>
    </GridCellSimple>
  );
}
