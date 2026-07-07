import { GridCellSimple } from '@softwareone-platform/sdk-react-ui-v0/grid';
import { HTMLInputType, Input } from '@softwareone-platform/sdk-react-ui-v0/input';

import './TextInputCell.scss';

export interface TextInputCellProps {
  value: string;
  enabled?: boolean;
  htmlInputType?: HTMLInputType;
  errorMessage?: string;
  onChange?: (value: string) => void;
}

export function TextInputCell({ value, enabled = true, htmlInputType, errorMessage, onChange }: TextInputCellProps) {
  return (
    <GridCellSimple className="text-input-cell">
      <Input
        value={value}
        isDisabled={!enabled}
        htmlInputType={htmlInputType}
        variant={errorMessage ? 'error' : 'default'}
        errorMessage={errorMessage}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value)}
      />
    </GridCellSimple>
  );
}
