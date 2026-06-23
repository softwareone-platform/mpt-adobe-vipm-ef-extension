import { SCREEN_HEIGHT_FACTOR, SCREEN_WIDTH_FACTOR } from '../shared/constants';

export function relativeScreenHeight(factor: number = SCREEN_HEIGHT_FACTOR): number {
  return Math.round(window.screen.availHeight * factor);
}

export function relativeScreenWidth(factor: number = SCREEN_WIDTH_FACTOR): number {
  return Math.round(window.screen.availWidth * factor);
}
