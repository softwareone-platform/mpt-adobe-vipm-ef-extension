import { Chip, ChipColor } from '@softwareone-platform/sdk-react-ui-v0/chip';
import { GridCellSimple } from '@softwareone-platform/sdk-react-ui-v0/grid';

export interface ChipCellProps {
  label: string;
  color?: ChipColor;
}

export function ChipCell({ label, color }: ChipCellProps) {
  return (
    <GridCellSimple>
      <Chip label={label} color={color} />
    </GridCellSimple>
  );
}
