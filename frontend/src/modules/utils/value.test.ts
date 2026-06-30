import { isValueChanged } from './value';

describe('isValueChanged', () => {
  it('returns false when both values are equal', () => {
    expect(isValueChanged('abc', 'abc')).toBe(false);
  });

  it('returns true when the values differ', () => {
    expect(isValueChanged('abc', 'def')).toBe(true);
  });

  it('treats undefined and an empty string as unchanged', () => {
    expect(isValueChanged(undefined, '')).toBe(false);
    expect(isValueChanged('', undefined)).toBe(false);
    expect(isValueChanged(undefined, undefined)).toBe(false);
  });

  it('detects a change from empty/undefined to a value', () => {
    expect(isValueChanged('', 'abc')).toBe(true);
    expect(isValueChanged(undefined, 'abc')).toBe(true);
    expect(isValueChanged('abc', undefined)).toBe(true);
  });
});
