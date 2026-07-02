import { useEffect, useState } from 'react';

import { http } from '@mpt-extension/sdk';

export interface ProductSegment {
  id: string;
  segment: string;
}

export interface Settings {
  products: ProductSegment[];
}

export function useSettings(): Settings | undefined {
  const [settings, setSettings] = useState<Settings>();

  useEffect(() => {
    http
      .get<{ data: Settings }>('/api/v2/settings')
      .then((response) => setSettings(response.data.data))
      .catch(() => setSettings(undefined));
  }, []);

  return settings;
}
