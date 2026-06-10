import type { AccountType } from '../ThreeYearCommitment/model';

export type { AccountType };

export type LinkedMembershipType = 'STANDARD' | 'CONSORTIUM';

export interface LinkedMembershipRequestInput {
  name: string;
  type: LinkedMembershipType;
}
