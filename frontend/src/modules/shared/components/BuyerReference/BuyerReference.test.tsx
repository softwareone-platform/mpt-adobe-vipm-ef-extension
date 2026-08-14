import { render } from '@testing-library/react';

import { BuyerReference } from './BuyerReference';
import type { AgreementSplitAllocation } from '../../model';

interface EntityReferenceProps {
  primaryContent?: string;
  secondaryContent?: string;
  chipLabel?: string;
}

let entityProps: EntityReferenceProps;

jest.mock('@softwareone-platform/sdk-react-ui-v0/entity-reference', () => ({
  EntityReference: (props: EntityReferenceProps) => {
    entityProps = props;
    return <div data-testid="entity-reference" />;
  },
}));

const allocation: AgreementSplitAllocation = {
  buyer: { id: 'BUY-1', name: 'Buyer One' },
  externalIds: { client: 'US-SCU-1' },
  percentage: 80,
  price: { currency: 'USD', SPxY: 1, SPxM: 1 },
};

describe('BuyerReference', () => {
  it('shows the buyer name and "id | external id" secondary line', () => {
    render(<BuyerReference allocation={allocation} isOwner={false} />);

    expect(entityProps.primaryContent).toBe('Buyer One');
    expect(entityProps.secondaryContent).toBe('BUY-1 | US-SCU-1');
    expect(entityProps.chipLabel).toBeUndefined();
  });

  it('shows the Owner chip for the owner', () => {
    render(<BuyerReference allocation={allocation} isOwner />);

    expect(entityProps.chipLabel).toBe('Owner');
  });

  it('falls back to just the buyer id when there is no external id', () => {
    render(<BuyerReference allocation={{ ...allocation, externalIds: undefined }} isOwner={false} />);

    expect(entityProps.secondaryContent).toBe('BUY-1');
  });
});
