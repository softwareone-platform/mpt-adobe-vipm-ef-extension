function toDate(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDate(value?: string): string | undefined {
  return toDate(value)?.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatTime(value?: string): string | undefined {
  return toDate(value)?.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
