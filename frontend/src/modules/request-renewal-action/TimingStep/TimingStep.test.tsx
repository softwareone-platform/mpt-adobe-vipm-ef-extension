/**
 * @jest-environment ./test/timezone-environment.cjs
 */
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

declare const setTimeZone: (timeZone: string | undefined) => void;

const agreement: Agreement = { id: 'AGR-1111-1111', name: 'Agreement Name' };

const pathState: RenewalPathState = {
  anniversaryDate: '2026-10-28',
  window: 'open',
  windowOpensDays: 30,
  windowClosesDays: 2,
  hasActiveSubscriptions: true,
  lockedPath: null,
};

const renderStep = (props: Partial<Parameters<typeof TimingStep>[0]> = {}) =>
  render(
    <TimingStep
      agreement={agreement}
      renewalDate="2026-10-28"
      path="anniversary"
      onPathChange={jest.fn()}
      pathState={pathState}
      {...props}
    />,
  );

describe('TimingStep', () => {
  const browserTimeZone = process.env.TZ;

  beforeEach(() => {
    // UTC is October 22, but the Pacific calendar date is still October 21.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-22T05:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    setTimeZone(browserTimeZone);
  });

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
    const { getByText } = renderStep({
      pathState: { ...pathState, anniversaryDate: '2026-10-22' },
    });

    expect(getByText(/\(1 day away\)/)).toBeTruthy();
  });

  describe('with the browser in another time zone', () => {
    it.each([
      ['Australia/Perth', '2026-09-30T17:00:00Z', 15],
      ['Pacific/Honolulu', '2026-10-01T09:30:00Z', 14],
      ['UTC', '2026-10-01T06:59:59Z', 15],
      ['UTC', '2026-10-01T07:00:00Z', 14],
    ])('counts the days away from the Pacific date in %s at %s', (timeZone, now, days) => {
      setTimeZone(timeZone);
      jest.setSystemTime(new Date(now));

      const { getByText } = renderStep({
        pathState: { ...pathState, anniversaryDate: '2026-10-15' },
      });

      expect(getByText(new RegExp(`\\(${days} days away\\)`))).toBeTruthy();
    });
  });

  it('states the anniversary Adobe reports, not the stored agreement parameter', () => {
    const { getByText } = renderStep({
      renewalDate: '2026-11-20',
      pathState: { ...pathState, anniversaryDate: '2026-10-28' },
    });

    expect(getByText(/\(7 days away\)/)).toBeTruthy();
  });

  it('asks for the timing without a date when the renewal date is unknown', () => {
    const { getByText, queryByText } = renderStep({
      renewalDate: undefined,
      pathState: { ...pathState, anniversaryDate: '' },
    });

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

  it('notes that further orders after an early renewal renew now', () => {
    const { getByText } = renderStep({
      pathState: { ...pathState, lockedPath: 'now' },
    });

    expect(
      getByText(
        "You've already renewed early, so any further renewal orders renew now. " +
          'You can place them until 2 days before your renewal date.',
      ),
    ).toBeTruthy();
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

  it.each([
    ['tooEarly', /You can plan your renewal from 30 days until 2 days before your renewal date/],
    ['tooLate', /It's too late to plan this renewal/],
    ['unknown', /Your renewal date is unknown/],
  ] as const)('offers no path when the window is %s', (window, message) => {
    const { getByText, queryByTestId } = renderStep({
      pathState: { ...pathState, window },
    });

    expect(getByText(message)).toBeTruthy();
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

  it('offers no path after an early renewal once the window has closed', () => {
    const { getByText, queryByTestId } = renderStep({
      pathState: { ...pathState, window: 'tooLate', lockedPath: 'now' },
    });

    expect(getByText(/It's too late to plan this renewal/)).toBeTruthy();
    expect(queryByTestId('box-now')).toBeNull();
  });
});
