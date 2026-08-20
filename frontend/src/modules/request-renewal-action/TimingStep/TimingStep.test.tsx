import { ChangeEvent, ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

import { TimingStep } from './TimingStep';
import type { Agreement, RenewalPathState } from '../../shared/model';

interface SelectionBoxProps {
  value?: string;
  selectedValue?: string;
  isDisabled?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/selection-box', () => ({
  SelectionBox: ({
    value,
    selectedValue,
    isDisabled,
    title,
    children,
    onChange,
  }: SelectionBoxProps) => (
    <button
      data-testid={`box-${value}`}
      data-selected={value === selectedValue}
      data-disabled={isDisabled === true}
      onClick={() => onChange?.({ target: { value } } as ChangeEvent<HTMLInputElement>)}
    >
      <span>{title}</span>
      <span>{children}</span>
    </button>
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

const agreement: Agreement = { id: 'AGR-1111-1111', name: 'Agreement Name' };

function dateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const pathState: RenewalPathState = {
  anniversaryDate: dateInDays(7),
  windowOpen: true,
  windowOpensDays: 30,
  windowClosesDays: 3,
  hasActiveSubscriptions: true,
  lockedPath: null,
};

const renderStep = (props: Partial<Parameters<typeof TimingStep>[0]> = {}) =>
  render(
    <TimingStep
      agreement={agreement}
      renewalDate={dateInDays(7)}
      path="anniversary"
      onPathChange={jest.fn()}
      pathState={pathState}
      {...props}
    />,
  );

describe('TimingStep', () => {
  it('renders the heading and the wizard highlights', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Timing')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
  });

  it('states the renewal date and how far away it is', () => {
    const { getByText } = renderStep();

    expect(getByText(/Your renewal date is/)).toBeTruthy();
    expect(getByText(/\(7 days away\)/)).toBeTruthy();
  });

  it('counts a renewal date one day out in the singular', () => {
    const { getByText } = renderStep({ renewalDate: dateInDays(1) });

    expect(getByText(/\(1 day away\)/)).toBeTruthy();
  });

  it('asks for the timing without a date when the renewal date is unknown', () => {
    const { getByText, queryByText } = renderStep({ renewalDate: undefined });

    expect(getByText('When would you like your renewal to occur?')).toBeTruthy();
    expect(queryByText(/Your renewal date is/)).toBeNull();
  });

  it('warns that the choice applies to the whole renewal', () => {
    const { getByText } = renderStep();

    expect(getByText(/This choice applies to the whole renewal/)).toBeTruthy();
  });

  it('offers both renewal paths with the selected one marked', () => {
    const { getByTestId, getByText } = renderStep();

    expect(getByText('Renew at your anniversary date (recommended)')).toBeTruthy();
    expect(getByText('Renew now')).toBeTruthy();
    expect(getByTestId('box-anniversary').getAttribute('data-selected')).toBe('true');
    expect(getByTestId('box-now').getAttribute('data-selected')).toBe('false');
  });

  it('reports the path the customer picks', () => {
    const onPathChange = jest.fn();
    const { getByTestId } = renderStep({ onPathChange });

    fireEvent.click(getByTestId('box-now'));

    expect(onPathChange).toHaveBeenCalledWith('now');
  });

  it('presents an early renewal already in place as the only path', () => {
    const { getByText, getByTestId, queryByTestId, queryByText } = renderStep({
      pathState: { ...pathState, lockedPath: 'now' },
    });

    expect(getByText('Renew now (confirmed)')).toBeTruthy();
    expect(getByText(/Your renewal is already in place/)).toBeTruthy();
    expect(getByText(/Your early renewal has already taken effect/)).toBeTruthy();
    expect(getByTestId('box-now').getAttribute('data-selected')).toBe('true');
    expect(getByTestId('box-now').getAttribute('data-disabled')).toBe('true');
    expect(queryByTestId('box-anniversary')).toBeNull();
    expect(queryByText(/This choice applies to the whole renewal/)).toBeNull();
  });

  it('presents a staged at-anniversary renewal as the only path', () => {
    const { getByText, getByTestId, queryByTestId } = renderStep({
      pathState: { ...pathState, lockedPath: 'anniversary' },
    });

    expect(getByText('Renew at your anniversary date (confirmed)')).toBeTruthy();
    expect(getByText(/Your renewal is set up/)).toBeTruthy();
    expect(getByText(/\(7 days away\)/)).toBeTruthy();
    expect(getByText(/You can keep making changes/)).toBeTruthy();
    expect(getByTestId('box-anniversary').getAttribute('data-disabled')).toBe('true');
    expect(queryByTestId('box-now')).toBeNull();
  });

  it('offers no path outside the renewal window', () => {
    const { getByText, queryByTestId } = renderStep({
      pathState: { ...pathState, windowOpen: false },
    });

    expect(getByText(/only plan your renewal within 30 to 3 days/)).toBeTruthy();
    expect(queryByTestId('box-anniversary')).toBeNull();
    expect(queryByTestId('box-now')).toBeNull();
  });

  it('offers no path without an active subscription', () => {
    const { getByText, queryByTestId } = renderStep({
      pathState: { ...pathState, hasActiveSubscriptions: false },
    });

    expect(getByText(/has no active subscriptions/)).toBeTruthy();
    expect(queryByTestId('box-now')).toBeNull();
  });

  it('keeps the established path over the window notice', () => {
    const { getByText, queryByText } = renderStep({
      pathState: { ...pathState, windowOpen: false, lockedPath: 'now' },
    });

    expect(getByText('Renew now (confirmed)')).toBeTruthy();
    expect(queryByText(/only plan your renewal within/)).toBeNull();
  });
});
