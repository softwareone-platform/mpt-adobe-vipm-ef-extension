import type { DesignSystemOptions } from '@softwareone-platform/sdk-react-ui-v0/utils';

import type { Status } from './model';

export const SCREEN_HEIGHT_FACTOR = 0.85;
export const SCREEN_WIDTH_FACTOR = 0.90;

export const MS_PER_DAY = 86400000;

export const RENEWAL_LEARN_MORE_URL = 'https://docs.softwareone.com';

export const COTERM_DATE_PARAM = 'cotermDate';

export const WIZARD_GRID_PAGE_SIZE = 10;
export const DISCOUNTS_FETCH_SIZE = 100;

export const INITIAL_REQUEST_STATE: { error: string; status: Status } = {
  error: '',
  status: 'idle',
};

export const DESIGN_SYSTEM_OPTIONS: Partial<DesignSystemOptions> = {
  dateFormat: 'dd MMM yyyy',
  inputDateFormat: 'P',
  languageCode: 'en-US',
  timeFormat: 'HH:mm',
};

export enum EntityDomain {
  Commerce = 'commerce',
  Catalog = 'catalog',
  Accounts = 'accounts',
}

export enum EntityType {
  Agreements = 'agreements',
  Orders = 'orders',
  Products = 'products',
  Items = 'items',
  Subscriptions = 'subscriptions',
  Accounts = 'accounts',
  Sellers = 'sellers',
  Buyers = 'buyers',
  Licensees = 'licensees',
}

export const BILLING_MODEL_LABELS: Record<string, string> = {
  'quantity': 'Quantity',
  'one-time': 'One-time',
};

export const TERM_PERIOD_LABELS: Record<string, string> = {
  '1m': 'Monthly billing',
  '1y': 'Yearly billing',
  '3y': '3-yearly billing',
  'one-time': 'One-time',
};

export const TERM_COMMITMENT_LABELS: Record<string, string> = {
  '1m': '1 month commitment',
  '1y': '1 year commitment',
  '2y': '2 year commitment',
  '3y': '3 year commitment',
  '4y': '4 year commitment',
  '5y': '5 year commitment',
};
