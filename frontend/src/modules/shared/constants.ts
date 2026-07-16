import type { AgreementSplitState } from './model';

export const SCREEN_HEIGHT_FACTOR = 0.85;
export const SCREEN_WIDTH_FACTOR = 0.90;

export enum EntityDomain {
  Commerce = 'commerce',
  Catalog = 'catalog',
  Accounts = 'accounts',
}

export enum EntityType {
  Agreements = 'agreements',
  Orders = 'orders',
  Products = 'products',
  Accounts = 'accounts',
  Sellers = 'sellers',
  Buyers = 'buyers',
  Licensees = 'licensees',
}

export const INITIAL_SPLIT_STATE: AgreementSplitState = {
  status: 'idle',
  error: null,
  data: null,
};
