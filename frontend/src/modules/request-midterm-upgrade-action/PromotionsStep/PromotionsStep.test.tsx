import { ReactNode } from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { PromotionsStep } from './PromotionsStep';
import type { Discount, DiscountsPage, Subscription } from '../../shared/model';
import type { TargetSubscription } from '../model';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    post: jest.fn(),
  },
}), { virtual: true });

const mockPost = jest.mocked(http.post);

interface NavProps {
  currentStepIndex: number;
  targetStepIndex: number;
}

let registeredOnNext: ((props: NavProps) => Promise<number> | number) | undefined;
const registerOnNextCallback = jest.fn((callback: (props: NavProps) => Promise<number> | number) => {
  registeredOnNext = callback;
});

jest.mock('@softwareone-platform/sdk-react-ui-v0/wizard', () => ({
  useStepActions: () => ({ registerOnNextCallback }),
}));

let capturedRows: TargetSubscription[] = [];

interface TestRow {
  rowId: string;
}

interface GridColumn {
  name: string;
  title?: string;
  cell?: (row: TestRow) => ReactNode;
}

interface GridConfig {
  id: string;
  columns: GridColumn[];
  paging: { page: number; pageSize: number; total: number };
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () => ({
  Grid: ({ data, config }: { data: TestRow[]; config: GridConfig }) => (
    <div data-testid="grid">
      {data.map((row) => (
        <div key={row.rowId} data-testid={`row-${row.rowId}`}>
          {config.columns.map((column) => (
            <div key={column.name}>{column.cell?.(row)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
  GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useGridInMemory: (data: TestRow[], config: GridConfig) => {
    capturedRows = data as unknown as TargetSubscription[];
    return { data, config };
  },
}));

interface MockButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  isDisabled?: boolean;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/button', () => ({
  Button: ({ children, onClick, isDisabled, testId }: MockButtonProps) => (
    <button data-testid={testId} disabled={isDisabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

interface MockComboboxProps {
  value?: string;
  options: { label: string; value: string; isDisabled?: boolean }[];
  placeholder?: string;
  testId?: string;
  onChange?: (value: string) => void;
}

jest.mock('../../shared/components/CodeCombobox/CodeCombobox', () => ({
  CodeCombobox: ({ value, options, placeholder, testId, onChange }: MockComboboxProps) => (
    <select
      data-testid={testId}
      data-placeholder={placeholder}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="" />
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.isDisabled}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

interface MockLinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
}

jest.mock('../../shared/components/LinkReference/LinkReference', () => ({
  LinkReference: ({ text, secondaryContent }: MockLinkReferenceProps) => (
    <div>
      <span>{text}</span>
      <span>{secondaryContent}</span>
    </div>
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

const SUBSCRIPTION: Subscription = {
  id: 'SUB-1',
  name: 'Source subscription',
  agreement: { id: 'AGR-1', name: 'Agreement Name' },
};

const TARGET: TargetSubscription = {
  id: null,
  name: null,
  status: '',
  item: { id: 'ITM-TARGET', name: 'Acrobat Studio', externalId: '65322651CA' },
  targetBaseOfferId: '65322651CA02A12',
  recommended: false,
  currentQuantity: 0,
  newQuantity: 6,
  delta: 6,
  unitSP: '100.00',
  spxM: '50.00',
  spxY: '600.00',
  terms: 'Yearly billing',
  commitment: '1 year commitment',
};

const DISCOUNTS: Discount[] = [
  {
    id: 'DSC-1',
    code: 'UPGRADE25',
    name: 'Upgrade promo',
    discountType: 'PERCENTAGE',
    values: [{ country: 'US', currency: 'USD', value: 25 }],
  },
  {
    id: 'DSC-2',
    code: 'USED10',
    discountType: 'PERCENTAGE',
    values: [{ country: 'US', currency: 'USD', value: 10 }],
    redeemedAt: '2026-03-04T10:00:00+00:00',
  },
];

const NAVIGATION = { currentStepIndex: 2, targetStepIndex: 3 };

const page = (overrides: Partial<DiscountsPage> = {}): DiscountsPage => ({
  status: 'success',
  error: null,
  data: DISCOUNTS,
  total: DISCOUNTS.length,
  ...overrides,
});

const renderStep = async ({
  target = TARGET as TargetSubscription | null,
  discounts = page(),
  discountCode = '' as string | null,
  onDiscountChange = jest.fn(),
  onPreview = jest.fn(),
} = {}) => {
  const result = render(
    <PromotionsStep
      subscription={SUBSCRIPTION}
      target={target}
      discounts={discounts}
      discountCode={discountCode}
      recommendationTrackerId="TRACKER-1"
      onDiscountChange={onDiscountChange}
      onPreview={onPreview}
    />,
  );
  await act(async () => {});
  return result;
};

describe('mid-term upgrade PromotionsStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registeredOnNext = undefined;
    capturedRows = [];
  });

  it('renders the target line with its switched quantity and the prompt', async () => {
    const { getByText, getByTestId } = await renderStep();

    expect(getByTestId('row-65322651CA02A12')).toBeTruthy();
    expect(getByText('Promotions')).toBeTruthy();
    expect(getByText(/Select or type a discount code for the upgraded item/)).toBeTruthy();
    expect(capturedRows).toHaveLength(1);
    expect(capturedRows[0]).toMatchObject({ delta: 6, newQuantity: 6 });
  });

  it('shows the empty state when no target is selected', async () => {
    const { getByText, queryByTestId } = await renderStep({ target: null });

    expect(queryByTestId('grid')).toBeNull();
    expect(getByText('No item to discount')).toBeTruthy();
  });

  it('lists the shortlist and disables a code the customer already redeemed', async () => {
    const { getByTestId } = await renderStep();

    const select = getByTestId('discount-code-target') as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option')).filter((option) => option.value);
    expect(options.map((option) => [option.value, option.textContent, option.disabled])).toEqual([
      ['UPGRADE25', 'UPGRADE25 (Upgrade promo)', false],
      ['USED10', 'USED10 (already redeemed)', true],
    ]);
  });

  it('re-prices the target line live from the selected code', async () => {
    await renderStep({ discountCode: 'upgrade25' });

    expect(capturedRows[0]).toMatchObject({
      discountCode: 'UPGRADE25',
      unitSP: '75.00',
      spxM: '37.50',
      spxY: '450.00',
    });
  });

  it('keeps the list price and notices a code the shortlist does not know', async () => {
    const { getByTestId } = await renderStep({ discountCode: 'MYSTERY' });

    expect(capturedRows[0]).toMatchObject({ unitSP: '100.00', spxY: '600.00' });
    expect(getByTestId('promotions-step-unknown-code').textContent).toContain('MYSTERY');
  });

  it('reports a pick and a clear to the parent', async () => {
    const onDiscountChange = jest.fn();
    const { getByTestId } = await renderStep({ discountCode: 'UPGRADE25', onDiscountChange });

    fireEvent.change(getByTestId('discount-code-target'), { target: { value: 'USED10' } });
    fireEvent.click(getByTestId('undo-target'));

    expect(onDiscountChange).toHaveBeenNthCalledWith(1, 'USED10');
    expect(onDiscountChange).toHaveBeenNthCalledWith(2, '');
  });

  it('shows the error when the shortlist cannot be loaded', async () => {
    const { getByTestId } = await renderStep({
      discounts: page({ status: 'error', error: 'Boom', data: [] }),
    });

    expect(getByTestId('promotions-step-error').textContent).toContain('Boom');
  });

  describe('Next', () => {
    it('previews the switch with the code on the target and publishes the quote', async () => {
      const quote = { lineItems: [{ offerId: '65322651CA02A12', pricing: { partnerPrice: 50 } }] };
      mockPost.mockResolvedValue({ data: { preview: quote } });
      const onPreview = jest.fn();
      await renderStep({ discountCode: 'UPGRADE25', onPreview });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v2/agreements/AGR-1/subscriptions/SUB-1/upgrade-order/preview',
        {
          targetOfferId: '65322651CA02A12',
          quantity: 6,
          recommendationTrackerId: 'TRACKER-1',
          flexDiscountCodes: ['UPGRADE25'],
        },
        expect.objectContaining({ signal: expect.anything() }),
      );
      expect(onPreview).toHaveBeenLastCalledWith(quote);
    });

    it('previews without a code when the customer cleared it', async () => {
      mockPost.mockResolvedValue({ data: { preview: null } });
      await renderStep({ discountCode: '' });

      await act(async () => {
        await registeredOnNext!(NAVIGATION);
      });

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ flexDiscountCodes: [] }),
        expect.anything(),
      );
    });

    it('lets the wizard advance when no target is selected', async () => {
      await renderStep({ target: null });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('stays on the step and names the refused code against the target', async () => {
      mockPost.mockRejectedValue({
        response: {
          data: {
            detail: 'Adobe rejected one or more discount codes',
            errors: [{ pointer: '65322651CA02A12', detail: 'NEW_TO_PRODUCT_NOT_MET' }],
          },
        },
      });
      const { findByTestId } = await renderStep({ discountCode: 'UPGRADE25' });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      const rejected = await findByTestId('promotions-step-rejected-codes');
      expect(Array.from(rejected.querySelectorAll('li')).map((line) => line.textContent)).toEqual([
        'UPGRADE25 on Acrobat Studio: This discount applies only to products the customer does not already own.',
      ]);
    });

    it('stays on the step and shows any other preview failure', async () => {
      mockPost.mockRejectedValue({
        response: { data: { detail: 'Switch path validity check failed.' } },
      });
      const { findByTestId } = await renderStep({ discountCode: 'UPGRADE25' });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect((await findByTestId('promotions-step-validation-error')).textContent).toContain(
        'Switch path validity check failed.',
      );
    });
  });
});
