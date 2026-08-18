export function Icon({ name }: { name?: string }) {
  return <span data-icon={name} />;
}

export const iconNames: string[] = [];

export function prefetchIcon() {
  return undefined;
}
