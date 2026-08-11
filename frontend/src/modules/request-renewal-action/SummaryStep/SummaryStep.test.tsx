import { render } from '@testing-library/react';

import { SummaryStep } from './SummaryStep';
import type { Agreement } from '../../shared/model';

let highlightsProps: { order?: { id?: string | null } | null };

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: (props: { order?: { id?: string | null } | null }) => {
    highlightsProps = props;
    return <div data-testid="wizard-highlights" />;
  },
}));

const AGREEMENT: Agreement = {
  id: 'AGR-1',
  name: 'Agreement Name',
};

const ORDER = {
  id: 'ORD-1',
  status: 'Processing',
  type: 'Change',
};

describe('SummaryStep', () => {
  it('confirms the placed renewal order', () => {
    const { getByTestId } = render(<SummaryStep agreement={AGREEMENT} order={ORDER} />);

    const step = getByTestId('summary-step');
    expect(step.textContent).toContain('Summary');
    expect(step.textContent).toContain('Your renewal order is being processed');
    expect(step.textContent).toContain('What happens next');
    expect(step.textContent).toContain('Need help?');
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(highlightsProps.order).toEqual(ORDER);
  });

  it('renders nothing until an order has been placed', () => {
    const { queryByTestId } = render(<SummaryStep agreement={AGREEMENT} order={null} />);

    expect(queryByTestId('summary-step')).toBeNull();
  });
});
