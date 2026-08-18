import {
  MAX_MODAL_HEIGHT,
  MAX_MODAL_WIDTH,
  SCREEN_HEIGHT_FACTOR,
  SCREEN_WIDTH_FACTOR,
} from '../shared/constants';

export function relativeScreenHeight(factor: number = SCREEN_HEIGHT_FACTOR): number {
  return Math.min(Math.round(window.screen.availHeight * factor), MAX_MODAL_HEIGHT);
}

export function relativeScreenWidth(factor: number = SCREEN_WIDTH_FACTOR): number {
  return Math.min(Math.round(window.screen.availWidth * factor), MAX_MODAL_WIDTH);
}
