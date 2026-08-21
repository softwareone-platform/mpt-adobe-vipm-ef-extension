import { render, waitFor } from '@testing-library/react';

import { SummaryStep } from './SummaryStep';
import { useOrderTemplate } from '../../shared/hooks/useOrderTemplate';
import type { Agreement } from '../../shared/model';

let highlightsProps: { order?: { id?: string | null } | null };

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: (props: { order?: { id?: string | null } | null }) => {
    highlightsProps = props;
    return <div data-testid="wizard-highlights" />;
  },
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/markdown/inline', () => ({
  InlineMarkdown: ({ value }: { value: string }) => <div data-testid="markdown">{value}</div>,
}));

jest.mock('../../shared/hooks/useOrderTemplate', () => ({
  useOrderTemplate: jest.fn(),
}));

const mockUseOrderTemplate = jest.mocked(useOrderTemplate);

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
  beforeEach(() => {
    mockUseOrderTemplate.mockReturnValue({
      status: 'success',
      error: null,
      template: 'Your renewal order is being processed',
    });
  });

  it('confirms the placed renewal order with the product template', async () => {
    const { getByTestId } = render(<SummaryStep agreement={AGREEMENT} order={ORDER} />);

    const step = getByTestId('summary-step');
    expect(step.textContent).toContain('Summary');
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(highlightsProps.order).toEqual(ORDER);
    await waitFor(() =>
      expect(getByTestId('markdown').textContent).toBe('Your renewal order is being processed'),
    );
    expect(mockUseOrderTemplate).toHaveBeenCalledWith('ORD-1');
  });

  it('omits the template until the platform has rendered it', () => {
    mockUseOrderTemplate.mockReturnValue({ status: 'loading', error: null, template: '' });

    const { queryByTestId } = render(<SummaryStep agreement={AGREEMENT} order={ORDER} />);

    expect(queryByTestId('markdown')).toBeNull();
  });

  it('renders nothing until an order has been placed', () => {
    const { queryByTestId } = render(<SummaryStep agreement={AGREEMENT} order={null} />);

    expect(queryByTestId('summary-step')).toBeNull();
  });
});
