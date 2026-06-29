function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function isStorageAccessible(storage: () => Storage | undefined): boolean {
  try {
    const instance = storage();
    if (!instance) return false;
    const probe = '__swo_probe__';
    instance.setItem(probe, '1');
    instance.removeItem(probe);
    return true;
  } catch (error) {
    return isQuotaExceededError(error);
  }
}

export function installSafeStorage(name: 'localStorage' | 'sessionStorage'): void {
  if (isStorageAccessible(() => (window as unknown as Record<string, Storage>)[name])) return;

  try {
    Object.defineProperty(window, name, {
      configurable: true,
      value: createMemoryStorage(),
    });
  } catch {
    // ignore
  }
}

installSafeStorage('localStorage');
installSafeStorage('sessionStorage');
