export function parsePrice(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

export function formatPrice(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseUnitPrice(value: string): number | null {
  return value === '' ? null : parsePrice(value);
}

export function getYearlyPrice(unitPrice: number | null | undefined, quantity: number): string {
  return unitPrice == null ? '' : formatPrice(unitPrice * quantity);
}

export function getMonthlyPrice(unitPrice: number | null | undefined, quantity: number): string {
  return unitPrice == null ? '' : formatPrice((unitPrice * quantity) / 12);
}

export function sumPrices(values: (string | undefined)[]): string {
  return formatPrice(values.reduce((total, value) => total + parsePrice(value ?? ''), 0));
}
