import type { AccountType } from './three-year-commitment';

export type { AccountType };

export type LinkedMembershipType = 'STANDARD' | 'CONSORTIUM';

export interface LinkedMembershipRequestInput {
  name: string;
  type: LinkedMembershipType;
}
