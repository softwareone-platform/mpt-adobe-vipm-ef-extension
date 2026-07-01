export function parsePrice(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

export function formatPrice(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
