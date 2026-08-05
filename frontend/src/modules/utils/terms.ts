import type { TFunction } from 'i18next';

export function termLabel(t: TFunction, term?: string | null): string {
  return term ? t(`Common:Terms:${term}`, { defaultValue: term }) : '—';
}
