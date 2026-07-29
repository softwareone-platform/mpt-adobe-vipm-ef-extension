import { useCallback, useEffect, useRef, useState } from 'react';

import { http } from '@mpt-extension/sdk';

export interface ProductSegment {
  id: string;
  segment: string;
}

export interface Settings {
  products: ProductSegment[];
}

export type SettingsStatus = 'loading' | 'error' | 'success';

export interface SettingsResult {
  data: Settings | undefined;
  status: SettingsStatus;
  refetch: () => void;
}

export function useSettingsResult(): SettingsResult {
  const [data, setData] = useState<Settings>();
  const [status, setStatus] = useState<SettingsStatus>('loading');
  const requestGeneration = useRef(0);

  const refetch = useCallback(() => {
    const generation = ++requestGeneration.current;
    setStatus('loading');
    http
      .get<{ data: Settings }>('/api/v2/settings')
      .then((response) => {
        if (generation !== requestGeneration.current) return;
        setData(response.data.data);
        setStatus('success');
      })
      .catch(() => {
        if (generation !== requestGeneration.current) return;
        setData(undefined);
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    refetch();
    return () => {
      requestGeneration.current += 1;
    };
  }, [refetch]);

  return { data, status, refetch };
}

export function useSettings(): Settings | undefined {
  return useSettingsResult().data;
}
