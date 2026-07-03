import { act, render, screen, waitFor } from '@testing-library/react';

import { SummaryStep, getTemplateForOrder } from './SummaryStep';
import { Order } from '../model';

jest.mock('../shared/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

const order: Order = { id: 'ORD-1111-1111' };

describe('getTemplateForOrder', () => {
  it('returns an empty string when there is no order id', async () => {
    expect(await getTemplateForOrder()).toBe('');
    expect(await getTemplateForOrder(null)).toBe('');
  });

  it('returns the processing template for an order id', async () => {
    const template = await getTemplateForOrder('ORD-1111-1111');

    expect(template).toContain('Your order is being processed');
    expect(template).toContain('Need help?');
  });
});

describe('SummaryStep', () => {
  it('renders the heading and highlights', async () => {
    await act(async () => {
      render(<SummaryStep order={order} />);
    });

    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByTestId('wizard-highlights')).toBeTruthy();
  });

  it('renders the order template once resolved', async () => {
    render(<SummaryStep order={order} />);

    await waitFor(() => expect(screen.getByText('Your order is being processed')).toBeTruthy());
  });
});
