import {
  MAX_MODAL_HEIGHT,
  MAX_MODAL_WIDTH,
  SCREEN_HEIGHT_FACTOR,
  SCREEN_WIDTH_FACTOR,
} from '../shared/constants';
import { relativeScreenHeight, relativeScreenWidth, scrollStepToTop } from './window';

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

  it('never exceeds the modal height ceiling', () => {
    setScreen(4000, 4000);
    expect(relativeScreenHeight()).toBe(MAX_MODAL_HEIGHT);
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

  it('never exceeds the modal width ceiling', () => {
    setScreen(4000, 4000);
    expect(relativeScreenWidth()).toBe(MAX_MODAL_WIDTH);
  });
});

describe('scrollStepToTop', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the wizard step content to its top', () => {
    document.body.innerHTML = '<div class="_wizard__step-content_abc123"></div>';
    const stepContent = document.body.firstElementChild as HTMLElement;
    stepContent.scrollTop = 420;

    scrollStepToTop();

    expect(stepContent.scrollTop).toBe(0);
  });

  it('leaves anything else alone', () => {
    document.body.innerHTML = '<div class="grid"></div>';
    const other = document.body.firstElementChild as HTMLElement;
    other.scrollTop = 120;

    scrollStepToTop();

    expect(other.scrollTop).toBe(120);
  });
});
