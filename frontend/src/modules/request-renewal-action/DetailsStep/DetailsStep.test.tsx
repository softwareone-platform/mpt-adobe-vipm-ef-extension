import { fireEvent, render } from '@testing-library/react';

import { DetailsStep } from './DetailsStep';
import type { Agreement } from '../../shared/model';
import type { OrderDetails } from '../model';

interface MockInputProps {
  value: string;
  label?: string;
  placeholder?: string;
  testId?: string;
  onChange?: (event: { target: { value: string } }) => void;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/input', () => ({
  Input: ({ value, label, placeholder, testId, onChange }: MockInputProps) => (
    <input
      aria-label={label}
      placeholder={placeholder}
      data-testid={testId}
      value={value}
      onChange={onChange}
    />
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

const AGREEMENT: Agreement = {
  id: 'AGR-1',
  name: 'Agreement Name',
};

const renderStep = ({
  details = { externalId: '', notes: '' } as OrderDetails,
  onDetailsChange = jest.fn(),
} = {}) =>
  render(
    <DetailsStep agreement={AGREEMENT} details={details} onDetailsChange={onDetailsChange} />,
  );

describe('DetailsStep', () => {
  it('renders the order heading, the highlights and both inputs', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Order')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByTestId('order-additional-id')).toBeTruthy();
    expect(getByTestId('order-notes')).toBeTruthy();
  });

  it('shows the details already captured', () => {
    const { getByTestId } = renderStep({
      details: { externalId: 'PO-1', notes: 'Renew everything' },
    });

    expect(getByTestId('order-additional-id').getAttribute('value')).toBe('PO-1');
    expect(getByTestId('order-notes').getAttribute('value')).toBe('Renew everything');
  });

  it('reports the typed additional ID', () => {
    const onDetailsChange = jest.fn();
    const { getByTestId } = renderStep({ onDetailsChange });

    fireEvent.change(getByTestId('order-additional-id'), { target: { value: 'PO-1' } });

    expect(onDetailsChange).toHaveBeenCalledWith({ externalId: 'PO-1', notes: '' });
  });

  it('reports the typed notes', () => {
    const onDetailsChange = jest.fn();
    const { getByTestId } = renderStep({ onDetailsChange });

    fireEvent.change(getByTestId('order-notes'), { target: { value: 'Renew everything' } });

    expect(onDetailsChange).toHaveBeenCalledWith({ externalId: '', notes: 'Renew everything' });
  });
});
