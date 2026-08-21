import { ReactNode } from 'react';

import { act, fireEvent, render, waitFor } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { PromotionsStep } from './PromotionsStep';
import type { Agreement, Discount, Subscription } from '../../shared/model';
import type { DiscountSelections, NetNewItem, RenewalPath } from '../model';

jest.mock('@mpt-extension/sdk', () => ({
  http: {
    get: jest.fn(),
    post: jest.fn(),
  },
}), { virtual: true });

const mockGet = jest.mocked(http.get);
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

let capturedRows: { id: string; spxM: number | null; spxY: number | null }[] = [];

interface TestRow {
  id: string;
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
        <div key={row.id} data-testid={`row-${row.id}`}>
          {config.columns.map((column) => (
            <div key={column.name}>{column.cell?.(row)}</div>
          ))}
        </div>
      ))}
    </div>
  ),
  GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useGridInMemory: (data: TestRow[], config: GridConfig) => {
    capturedRows = data as unknown as { id: string; spxM: number | null; spxY: number | null }[];
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

interface MockSelectProps {
  value?: string;
  options: { label: string; value: string; isDisabled?: boolean }[];
  placeholder?: string;
  testId?: string;
  onChange?: (value: string) => void;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/select', () => ({
  Select: ({ value, options, placeholder, testId, onChange }: MockSelectProps) => (
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

const AGREEMENT: Agreement = {
  id: 'AGR-1',
  name: 'Agreement Name',
};

const SUBSCRIPTIONS: Subscription[] = [
  {
    id: 'SUB-1',
    name: 'Subscription One',
    autoRenew: true,
    terms: { model: 'quantity', period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-1',
        quantity: 10,
        item: { id: 'ITM-1', name: 'Item One', externalIds: { vendor: 'OFFER-1' } },
        price: { unitSP: 100 },
      },
    ],
  },
  {
    id: 'SUB-2',
    name: 'Subscription Two',
    autoRenew: false,
    terms: { model: 'quantity', period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-2',
        quantity: 4,
        item: { id: 'ITM-2', name: 'Item Two', externalIds: { vendor: 'OFFER-2' } },
        price: { unitSP: 60 },
      },
    ],
  },
];

const NET_NEW_ITEM: NetNewItem = {
  itemId: 'ITM-3',
  itemName: 'Item Three',
  sku: 'OFFER-3',
  terms: { model: 'quantity', period: '1y', commitment: '1y' },
  unitSP: 240,
  quantity: 2,
  recommended: false,
};

const DISCOUNTS: Discount[] = [
  {
    id: 'DSC-1',
    code: 'CODE-ONE',
    discountType: 'PERCENTAGE',
    applicableOrderTypes: ['RENEWAL'],
    values: [{ country: 'US', currency: 'USD', value: 25 }],
  },
  {
    id: 'DSC-2',
    code: 'CODE-TWO',
    discountType: 'PERCENTAGE',
    applicableOrderTypes: ['RENEWAL'],
    values: [{ country: 'US', currency: 'USD', value: 10 }],
    redeemedAt: '2026-03-04T10:00:00+00:00',
  },
  {
    id: 'DSC-3',
    code: 'CODE-THREE',
    discountType: 'PERCENTAGE',
    applicableOrderTypes: ['NEW'],
    values: [{ country: 'US', currency: 'USD', value: 5 }],
  },
];

const renderStep = ({
  selections = {},
  quantities = {},
  netNewItems = [] as NetNewItem[],
  discountSelections = {} as DiscountSelections,
  path = 'anniversary' as RenewalPath,
  onDiscountChange = jest.fn(),
} = {}) =>
  render(
    <PromotionsStep
      agreement={AGREEMENT}
      subscriptions={SUBSCRIPTIONS}
      selections={selections}
      quantities={quantities}
      netNewItems={netNewItems}
      discountSelections={discountSelections}
      path={path}
      onDiscountChange={onDiscountChange}
    />,
  );

describe('PromotionsStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: DISCOUNTS } });
    registeredOnNext = undefined;
  });

  it('renders the heading, the highlights and the prompt', async () => {
    const { getByText, getByTestId } = renderStep();

    await waitFor(() => expect(getByTestId('grid')).toBeTruthy());
    expect(getByText('Promotions')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByText(/Apply any discount codes as desired/)).toBeTruthy();
  });

  it('reads the discounts a renewal can still apply', async () => {
    const { getByTestId } = renderStep();

    await waitFor(() => expect(getByTestId('grid')).toBeTruthy());
    expect(mockGet).toHaveBeenCalledWith(
      '/api/v2/discount-codes',
      expect.objectContaining({
        params: expect.objectContaining({ agreement: 'AGR-1', orderType: 'RENEWAL' }),
      }),
    );
  });

  it('lists the renewing subscriptions with their billing model, terms and prices', async () => {
    const { findByTestId } = renderStep();

    const row = await findByTestId('row-SUB-1');
    expect(row.textContent).toContain('Item One');
    expect(row.textContent).toContain('Quantity');
    expect(row.textContent).toContain('Yearly billing');
    expect(row.textContent).toContain('100.00');
    expect(row.textContent).toContain('1,000.00');
  });

  it('leaves out a subscription that is not being renewed', async () => {
    const { findByTestId, queryByTestId } = renderStep();

    await findByTestId('row-SUB-1');
    expect(queryByTestId('row-SUB-2')).toBeNull();
  });

  it('lists a net-new product as a new line', async () => {
    const { findByTestId } = renderStep({ netNewItems: [NET_NEW_ITEM] });

    const row = await findByTestId('row-ITM-3');
    expect(row.textContent).toContain('Item Three');
    expect(row.textContent).toContain('New');
  });

  it('offers the renewal codes and blocks a redeemed one', async () => {
    const { findByTestId } = renderStep();

    const select = (await findByTestId('discount-code-SUB-1')) as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option')).filter((option) => option.value);
    expect(options.map((option) => option.value)).toEqual(['CODE-ONE', 'CODE-TWO']);
    expect(options[1].hasAttribute('disabled')).toBe(true);
    expect(select.getAttribute('data-placeholder')).toBe('Select or type code');
  });

  it('keeps a redeemed reusable code selectable', async () => {
    mockGet.mockResolvedValue({
      data: { data: [{ ...DISCOUNTS[1], reusable: true }] },
    });

    const { findByTestId } = renderStep();

    const select = (await findByTestId('discount-code-SUB-1')) as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option')).filter((option) => option.value);
    expect(options.map((option) => option.value)).toEqual(['CODE-TWO']);
    expect(options[0].hasAttribute('disabled')).toBe(false);
  });

  it('stores the code picked for a line', async () => {
    const onDiscountChange = jest.fn();
    const { findByTestId } = renderStep({ onDiscountChange });

    fireEvent.change(await findByTestId('discount-code-SUB-1'), {
      target: { value: 'CODE-ONE' },
    });

    expect(onDiscountChange).toHaveBeenCalledWith('SUB-1', 'CODE-ONE');
  });

  it('reprices the line from the applied code and keeps the undiscounted price', async () => {
    const { findByTestId } = renderStep({ discountSelections: { 'SUB-1': 'CODE-ONE' } });

    const row = await findByTestId('row-SUB-1');
    expect(row.textContent).toContain('750.00');
    expect(row.textContent).toContain('1,000.00');
  });

  it('sorts on the discounted totals the row shows', async () => {
    const { findByTestId } = renderStep({ discountSelections: { 'SUB-1': 'CODE-ONE' } });

    await findByTestId('row-SUB-1');
    const row = capturedRows.find((entry) => entry.id === 'SUB-1');
    expect(row?.spxY).toBe(750);
    expect(row?.spxM).toBe(62.5);
  });

  it('undoes the applied code', async () => {
    const onDiscountChange = jest.fn();
    const { findByTestId } = renderStep({
      discountSelections: { 'SUB-1': 'CODE-ONE' },
      onDiscountChange,
    });

    fireEvent.click(await findByTestId('undo-SUB-1'));

    expect(onDiscountChange).toHaveBeenCalledWith('SUB-1', '');
  });

  it('disables undo on a line without a code', async () => {
    const { findByTestId } = renderStep();

    expect((await findByTestId('undo-SUB-1')).getAttribute('disabled')).not.toBeNull();
  });

  it('reports a failed discounts read', async () => {
    mockGet.mockRejectedValue(new Error('Discounts are down'));
    const { findByTestId } = renderStep();

    expect((await findByTestId('promotions-step-error')).textContent).toContain(
      'Discounts are down',
    );
  });

  describe('next-step gate', () => {
    const NAVIGATION = { currentStepIndex: 3, targetStepIndex: 4 };

    it('registers the gate on the wizard next action', async () => {
      const { findByTestId } = renderStep();

      await findByTestId('grid');
      expect(registerOnNextCallback).toHaveBeenCalled();
      expect(registeredOnNext).toBeDefined();
    });

    it('advances without validating the discount codes against Adobe at the anniversary', async () => {
      const { findByTestId } = renderStep({ discountSelections: { 'SUB-1': 'code-one' } });
      await findByTestId('grid');

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('previews the early-renewal basket with the selected codes, then advances', async () => {
      mockPost.mockResolvedValue({ data: { data: {} } });
      const { findByTestId } = renderStep({
        path: 'now',
        netNewItems: [NET_NEW_ITEM],
        discountSelections: { 'SUB-1': 'code-one' },
      });
      await findByTestId('grid');

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v2/agreements/AGR-1/renewal-order/preview',
        {
          renewalPath: 'now',
          subscriptions: [
            { id: 'SUB-1', offerId: 'OFFER-1', renew: true, renewalQuantity: 10 },
            { id: 'SUB-2', offerId: 'OFFER-2', renew: false, renewalQuantity: 0 },
          ],
          netNewItems: [{ offerId: 'OFFER-3', quantity: 2 }],
          flexDiscountCodes: ['CODE-ONE'],
        },
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    it('stays on the step and shows the message when Adobe rejects a code', async () => {
      mockPost.mockRejectedValue({
        response: { data: { detail: '3132 - Ineligible product for orderType' } },
      });
      const { findByTestId } = renderStep({
        path: 'now',
        discountSelections: { 'SUB-1': 'code-one' },
      });
      await findByTestId('grid');

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect((await findByTestId('promotions-step-validation-error')).textContent).toContain(
        '3132 - Ineligible product for orderType',
      );
    });
  });
});
