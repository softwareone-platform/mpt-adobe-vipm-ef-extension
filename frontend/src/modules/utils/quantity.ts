export function formatQuantityDelta(delta: number | null | undefined): string {
  if (delta == null) return '—';
  return delta > 0 ? `+${delta}` : String(delta);
}
