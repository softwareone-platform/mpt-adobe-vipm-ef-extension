import { i18n } from '../../../../i18n/translations';
import { TextCell } from '../../../shared/components/GridCell/TextCell/TextCell';

const EMPTY_VALUE = '—';

export interface CurrentQuantityCellProps {
  quantity: number | null;
  renewedQuantity: number | null;
  remainingQuantity: number | null;
}

/**
 * How much of the held quantity is already early-renewed, or nothing when none is.
 *
 * A partially-renewed line also names the seats a further renewal can still
 * carry; a fully-renewed one only the renewed total, which exceeds the held
 * quantity once an increase has been placed.
 */
export function describeRenewedQuantity(
  renewedQuantity: number | null,
  remainingQuantity: number | null,
): string | undefined {
  if (!renewedQuantity) return undefined;
  return remainingQuantity
    ? i18n.t('Renewal:Grid:Renewed remaining', {
        renewed: renewedQuantity,
        remaining: remainingQuantity,
      })
    : i18n.t('Renewal:Grid:Renewed', { renewed: renewedQuantity });
}

export function CurrentQuantityCell({
  quantity,
  renewedQuantity,
  remainingQuantity,
}: CurrentQuantityCellProps) {
  return (
    <TextCell
      text={quantity ?? EMPTY_VALUE}
      secondaryContent={describeRenewedQuantity(renewedQuantity, remainingQuantity)}
    />
  );
}
