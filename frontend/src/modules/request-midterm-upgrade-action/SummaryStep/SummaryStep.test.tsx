import { render, screen, waitFor } from '@testing-library/react';

import { SummaryStep } from './SummaryStep';
import { useOrderTemplate } from '../../shared/hooks/useOrderTemplate';
import { Order } from '../model';

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

jest.mock('@softwareone-platform/sdk-react-ui-v0/markdown/inline', () => ({
  InlineMarkdown: ({ value }: { value: string }) => <div data-testid="markdown">{value}</div>,
}));

jest.mock('../../shared/hooks/useOrderTemplate', () => ({
  useOrderTemplate: jest.fn(),
}));

const mockUseOrderTemplate = jest.mocked(useOrderTemplate);

const order: Order = { id: 'ORD-1111-1111' };

describe('SummaryStep', () => {
  beforeEach(() => {
    mockUseOrderTemplate.mockReturnValue({
      status: 'success',
      error: null,
      template: 'Your order is being processed',
    });
  });

  it('renders the heading and highlights', () => {
    render(<SummaryStep subscription={{ id: 'SUB-1' }} order={order} />);

    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByTestId('wizard-highlights')).toBeTruthy();
  });

  it('renders the product template of the placed order', async () => {
    render(<SummaryStep subscription={{ id: 'SUB-1' }} order={order} />);

    await waitFor(() =>
      expect(screen.getByTestId('markdown').textContent).toBe('Your order is being processed'),
    );
    expect(mockUseOrderTemplate).toHaveBeenCalledWith('ORD-1111-1111');
  });

  it('omits the template until the platform has rendered it', () => {
    mockUseOrderTemplate.mockReturnValue({ status: 'loading', error: null, template: '' });

    render(<SummaryStep subscription={{ id: 'SUB-1' }} order={order} />);

    expect(screen.queryByTestId('markdown')).toBeNull();
  });
});
