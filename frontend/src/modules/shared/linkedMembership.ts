import type { AccountType } from './threeYearCommitment';

export type { AccountType };

export type LinkedMembershipType = 'STANDARD' | 'CONSORTIUM';

export interface LinkedMembershipRequestInput {
  name: string;
  type: LinkedMembershipType;
}
