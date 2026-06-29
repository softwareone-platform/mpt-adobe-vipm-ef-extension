import { installSafeStorage } from './safe-storage';

type StorageName = 'localStorage' | 'sessionStorage';

function getDescriptor(name: StorageName) {
  return Object.getOwnPropertyDescriptor(window, name);
}

function setStorage(name: StorageName, value: Storage | undefined): void {
  Object.defineProperty(window, name, { configurable: true, value });
}

const brokenStorage = {
  setItem() {
    throw new Error('storage blocked');
  },
} as unknown as Storage;

describe('installSafeStorage', () => {
  let originalSession: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalSession = getDescriptor('sessionStorage');
  });

  afterEach(() => {
    if (originalSession) {
      Object.defineProperty(window, 'sessionStorage', originalSession);
    }
  });

  it('keeps the existing storage when it is accessible', () => {
    const native = window.sessionStorage;

    installSafeStorage('sessionStorage');

    expect(window.sessionStorage).toBe(native);
  });

  it('installs a working fallback when the storage throws on write', () => {
    setStorage('sessionStorage', brokenStorage);

    installSafeStorage('sessionStorage');

    expect(window.sessionStorage).not.toBe(brokenStorage);
    expect(() => window.sessionStorage.setItem('key', 'value')).not.toThrow();
    expect(window.sessionStorage.getItem('key')).toBe('value');
  });

  it('keeps a full but readable storage that throws a quota error on write', () => {
    const fullStorage = {
      setItem() {
        throw new DOMException('full', 'QuotaExceededError');
      },
    } as unknown as Storage;
    setStorage('sessionStorage', fullStorage);

    installSafeStorage('sessionStorage');

    expect(window.sessionStorage).toBe(fullStorage);
  });

  it('installs a working fallback when the storage is missing', () => {
    setStorage('sessionStorage', undefined);

    installSafeStorage('sessionStorage');

    window.sessionStorage.setItem('key', 'value');
    expect(window.sessionStorage.getItem('key')).toBe('value');
  });

  describe('the fallback memory storage', () => {
    let storage: Storage;

    beforeEach(() => {
      setStorage('sessionStorage', brokenStorage);
      installSafeStorage('sessionStorage');
      storage = window.sessionStorage;
    });

    it('stores and retrieves values, coercing them to strings', () => {
      storage.setItem('count', 5 as unknown as string);

      expect(storage.getItem('count')).toBe('5');
    });

    it('returns null for a missing key', () => {
      expect(storage.getItem('missing')).toBeNull();
    });

    it('tracks the number of stored entries', () => {
      storage.setItem('a', '1');
      storage.setItem('b', '2');

      expect(storage.length).toBe(2);
    });

    it('removes an entry', () => {
      storage.setItem('a', '1');
      storage.removeItem('a');

      expect(storage.getItem('a')).toBeNull();
      expect(storage.length).toBe(0);
    });

    it('clears all entries', () => {
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      storage.clear();

      expect(storage.length).toBe(0);
    });

    it('returns the key at a given index, and null when out of range', () => {
      storage.setItem('a', '1');

      expect(storage.key(0)).toBe('a');
      expect(storage.key(1)).toBeNull();
    });
  });
});
