import { GridCellSimple } from '@softwareone-platform/sdk-react-ui-v0/grid';
import { HTMLInputType, Input } from '@softwareone-platform/sdk-react-ui-v0/input';

export interface TextInputCellProps {
  value: string;
  enabled?: boolean;
  htmlInputType?: HTMLInputType;
  onChange?: (value: string) => void;
}

export function TextInputCell({ value, enabled = true, htmlInputType, onChange }: TextInputCellProps) {
  return (
    <GridCellSimple>
      <Input
        value={value}
        isDisabled={!enabled}
        htmlInputType={htmlInputType}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value)}
      />
    </GridCellSimple>
  );
}
