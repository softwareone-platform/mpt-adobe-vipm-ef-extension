import { SCREEN_HEIGHT_FACTOR, SCREEN_WIDTH_FACTOR } from '../shared/constants';
import { relativeScreenHeight, relativeScreenWidth } from './window';

function setScreen(availHeight: number, availWidth: number): void {
  Object.defineProperty(window.screen, 'availHeight', { value: availHeight, configurable: true });
  Object.defineProperty(window.screen, 'availWidth', { value: availWidth, configurable: true });
}

describe('relativeScreenHeight', () => {
  it('defaults to the shared height factor of the available screen height', () => {
    setScreen(1000, 1000);
    expect(relativeScreenHeight()).toBe(Math.round(1000 * SCREEN_HEIGHT_FACTOR));
  });

  it('applies a custom factor', () => {
    setScreen(1000, 1000);
    expect(relativeScreenHeight(0.5)).toBe(500);
  });

  it('rounds to the nearest pixel', () => {
    setScreen(101, 101);
    expect(relativeScreenHeight(0.5)).toBe(51);
  });
});

describe('relativeScreenWidth', () => {
  it('defaults to the shared width factor of the available screen width', () => {
    setScreen(1000, 1000);
    expect(relativeScreenWidth()).toBe(Math.round(1000 * SCREEN_WIDTH_FACTOR));
  });

  it('applies a custom factor', () => {
    setScreen(1000, 1000);
    expect(relativeScreenWidth(0.5)).toBe(500);
  });

  it('rounds to the nearest pixel', () => {
    setScreen(101, 101);
    expect(relativeScreenWidth(0.5)).toBe(51);
  });
});
