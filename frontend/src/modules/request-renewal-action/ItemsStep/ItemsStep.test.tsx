import { ReactNode } from 'react';

import { act, fireEvent, render, within } from '@testing-library/react';

import type { GenericAbortSignal } from 'axios';

import { http } from '@mpt-extension/sdk';

import { ItemsStep } from './ItemsStep';
import type { Agreement, Subscription } from '../../shared/model';
import type {
  NetNewItem,
  RenewalPath,
  RenewalQuantities,
  RenewalSelections,
  RenewalStates,
} from '../model';

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

interface TestRow {
  id: string;
}

interface GridColumn {
  name: string;
  title?: string;
  fields?: string[];
  cell?: (row: TestRow) => ReactNode;
}

interface GridConfig {
  id: string;
  columns: GridColumn[];
  fields: { name: string; title: string }[];
  sort: { field: string; direction: string }[];
  paging: { page: number; pageSize: number; total: number };
}

let capturedConfig: GridConfig;
const onGridEvent = jest.fn();

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () => ({
  Grid: Object.assign(
    ({ children, data, config }: { children?: ReactNode; data: TestRow[]; config: GridConfig }) => (
      <div data-testid="grid">
        <div data-testid="grid__toolbar">{children}</div>
        {data.map((row) => (
          <div key={row.id} data-testid={`row-${row.id}`}>
            {config.columns.map((column) => (
              <div key={column.name}>{column.cell?.(row)}</div>
            ))}
          </div>
        ))}
      </div>
    ),
    { Actions: ({ children }: { children?: ReactNode }) => <>{children}</> },
  ),
  GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  useGridInMemory: (data: TestRow[], config: GridConfig) => {
    capturedConfig = config;
    return { data, config, onEvent: onGridEvent };
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

interface MockTextInputCellProps {
  value: string;
  errorMessage?: string;
  onChange?: (value: string) => void;
}

jest.mock('../../shared/components/GridCell/TextInputCell/TextInputCell', () => ({
  TextInputCell: ({ value, errorMessage, onChange }: MockTextInputCellProps) => (
    <div>
      <input value={value} onChange={(event) => onChange?.(event.target.value)} />
      {errorMessage && <span>{errorMessage}</span>}
    </div>
  ),
}));

interface MockLinkReferenceProps {
  text?: string;
  secondaryContent?: ReactNode;
  url?: string | null;
}

jest.mock('../../shared/components/LinkReference/LinkReference', () => ({
  LinkReference: ({ text, secondaryContent, url }: MockLinkReferenceProps) => (
    <div data-url={url}>
      <span>{text}</span>
      <span>{secondaryContent}</span>
    </div>
  ),
}));

jest.mock('../../shared/components/WizardHighlights/WizardHighlights', () => ({
  WizardHighlights: () => <div data-testid="wizard-highlights" />,
}));

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  excludedSkus: Set<string>;
  recommendedSkus: Set<string>;
  currency: string;
  onAdd: (items: NetNewItem[]) => void;
}
let dialogProps: DialogProps;

interface ProgressProps {
  isOpen: boolean;
  label: string;
  onCancel: () => void;
}
let progressProps: ProgressProps;

jest.mock('../../shared/components/ProgressModal/ProgressModal', () => ({
  ProgressModal: (props: ProgressProps) => {
    progressProps = props;
    return props.isOpen ? <div data-testid="progress-modal">{props.label}</div> : null;
  },
}));

jest.mock('../components/select-items-dialog/SelectItemsDialog', () => ({
  SelectItemsDialog: (props: DialogProps) => {
    dialogProps = props;
    return <div data-testid="select-items-dialog" data-open={props.isOpen} />;
  },
}));

const agreement: Agreement = {
  id: 'AGR-1111-1111',
  name: 'Agreement Name',
  listing: { id: 'LST-2993-3317' },
  price: { billingCurrency: 'USD' },
};

const ADOBE_SUBSCRIPTION_ID = 'a1b2c3d4e5NA';

const subscriptions: Subscription[] = [
  {
    id: 'SUB-1',
    name: 'Subscription for Creative Cloud',
    autoRenew: true,
    externalIds: { vendor: ADOBE_SUBSCRIPTION_ID },
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-1',
        quantity: 37,
        item: {
          id: 'ITM-1',
          name: 'Creative Cloud All Apps',
          externalIds: { vendor: '65322587CA01A12' },
        },
        price: { unitSP: 457.2, SPxM: 1409.7, SPxY: 16916.4 },
      },
    ],
  },
  {
    id: 'SUB-2',
    name: 'Subscription for Audition',
    autoRenew: false,
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-2',
        quantity: 21,
        item: {
          id: 'ITM-2',
          name: 'Audition for Enterprise',
          externalIds: { vendor: '65322588CA01A12' },
        },
        price: { unitSP: 234, SPxM: 409.5, SPxY: 4914 },
      },
    ],
  },
];

const NET_NEW_ITEM: NetNewItem = {
  itemId: 'ITM-9',
  itemName: 'Premiere Pro for Enterprise',
  sku: '65304578CA',
  terms: { period: '1y', commitment: '1y' },
  unitSP: 234,
  quantity: 5,
  recommended: true,
};

const renderStep = ({
  selections = {},
  quantities = {},
  netNewItems = [],
  recommendedSkus = new Set<string>(),
  onQuantityChange = jest.fn(),
  onNetNewItemsChange = jest.fn(),
  subscriptionList = subscriptions,
  agreementOverride = agreement,
  path = 'anniversary',
  renewalStates = {},
}: {
  selections?: RenewalSelections;
  quantities?: RenewalQuantities;
  netNewItems?: NetNewItem[];
  recommendedSkus?: Set<string>;
  onQuantityChange?: (subscriptionId: string, quantity: number | null) => void;
  onNetNewItemsChange?: (items: NetNewItem[]) => void;
  subscriptionList?: Subscription[];
  agreementOverride?: Agreement;
  path?: RenewalPath;
  renewalStates?: RenewalStates;
} = {}) =>
  render(
    <ItemsStep
      agreement={agreementOverride}
      subscriptions={subscriptionList}
      selections={selections}
      quantities={quantities}
      netNewItems={netNewItems}
      recommendedSkus={recommendedSkus}
      path={path}
      renewalStates={renewalStates}
      onQuantityChange={onQuantityChange}
      onNetNewItemsChange={onNetNewItemsChange}
      onPreview={jest.fn()}
    />,
  );

describe('ItemsStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registeredOnNext = undefined;
  });

  it('renders the heading, the highlights, the prompt and the price disclaimer', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Items')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByText(/Modify the renewal quantities of your existing subscriptions/)).toBeTruthy();
    expect(getByText(/These estimated prices include estimates/)).toBeTruthy();
  });

  it('lists only the subscriptions being renewed', () => {
    const { getByTestId, queryByTestId } = renderStep();

    expect(getByTestId('row-SUB-1')).toBeTruthy();
    expect(queryByTestId('row-SUB-2')).toBeNull();
  });

  it('honours the customer renew selections over the standing preference', () => {
    const { getByTestId, queryByTestId } = renderStep({
      selections: { 'SUB-1': false, 'SUB-2': true },
    });

    expect(queryByTestId('row-SUB-1')).toBeNull();
    expect(getByTestId('row-SUB-2')).toBeTruthy();
  });

  it('seeds the renewal quantity from the standing quantity and prices it', () => {
    const { getByTestId } = renderStep();

    const row = getByTestId('row-SUB-1');
    expect(within(row).getByRole('textbox').getAttribute('value')).toBe('37');
    expect(row.textContent).toContain('457.20');
    expect(row.textContent).toContain('1,409.70');
    expect(row.textContent).toContain('16,916.40');
  });

  it('reprices the subscription from the typed renewal quantity', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 53 } });

    const row = getByTestId('row-SUB-1');
    expect(within(row).getByRole('textbox').getAttribute('value')).toBe('53');
    expect(row.textContent).toContain('2,019.30');
    expect(row.textContent).toContain('24,231.60');
  });

  it('reports the typed quantity as a number', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ onQuantityChange });

    fireEvent.change(within(getByTestId('row-SUB-1')).getByRole('textbox'), {
      target: { value: '53' },
    });

    expect(onQuantityChange).toHaveBeenCalledWith('SUB-1', 53);
  });

  it('reports a cleared input as a pending quantity', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ onQuantityChange });

    fireEvent.change(within(getByTestId('row-SUB-1')).getByRole('textbox'), {
      target: { value: '' },
    });

    expect(onQuantityChange).toHaveBeenCalledWith('SUB-1', null);
  });

  it('ignores non-numeric input', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ onQuantityChange });

    fireEvent.change(within(getByTestId('row-SUB-1')).getByRole('textbox'), {
      target: { value: '3a' },
    });

    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it('flags an empty quantity and blanks its prices', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': null } });

    const row = getByTestId('row-SUB-1');
    expect(within(row).getByText('Quantity is required')).toBeTruthy();
    expect(row.textContent).not.toContain('1,409.70');
    expect(row.textContent).not.toContain('16,916.40');
  });

  it('flags a zero quantity', () => {
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 0 } });

    expect(
      within(getByTestId('row-SUB-1')).getByText('Quantity must be at least 1'),
    ).toBeTruthy();
  });

  it('flags a renewal quantity above the current one when renewing now', () => {
    const { getByTestId } = renderStep({ path: 'now', quantities: { 'SUB-1': 38 } });

    const notice = getByTestId('items-step-increase-error');
    expect(notice.textContent).toContain('cannot go above the quantity you hold');
    expect(notice.textContent).toContain(
      'Creative Cloud All Apps — renewing 38 of a current quantity of 37',
    );
  });

  it('leaves the increase to the conflict notice, which already names it as an addition', () => {
    const { getByTestId, queryByTestId } = renderStep({
      path: 'now',
      quantities: { 'SUB-1': 38, 'SUB-2': 20 },
      selections: { 'SUB-2': true },
    });

    expect(getByTestId('items-step-conflict')).toBeTruthy();
    expect(queryByTestId('items-step-increase-error')).toBeNull();
  });

  it('allows the increase once every existing seat is early-renewed', () => {
    const { queryByTestId } = renderStep({
      path: 'now',
      quantities: { 'SUB-1': 38 },
      renewalStates: {
        [ADOBE_SUBSCRIPTION_ID]: {
          currentQuantity: 37,
          renewedQuantity: 37,
          state: 'fullyRenewed',
          remainingQuantity: 0,
          earlyRenewable: true,
          increaseAllowed: true,
        },
      },
    });

    expect(queryByTestId('items-step-increase-error')).toBeNull();
  });

  it('leaves a renewal quantity above the current one alone at the anniversary', () => {
    const { queryByTestId } = renderStep({ quantities: { 'SUB-1': 38 } });

    expect(queryByTestId('items-step-increase-error')).toBeNull();
  });

  it('keeps the undo action idle until the quantity changes', () => {
    const { getByTestId } = renderStep();

    expect((getByTestId('undo-SUB-1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores the standing quantity on undo', () => {
    const onQuantityChange = jest.fn();
    const { getByTestId } = renderStep({ quantities: { 'SUB-1': 53 }, onQuantityChange });

    const undo = getByTestId('undo-SUB-1') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    fireEvent.click(undo);

    expect(onQuantityChange).toHaveBeenCalledWith('SUB-1', 37);
  });

  it('lists added net-new items as new rows and prices them by quantity', () => {
    const { getByTestId } = renderStep({ netNewItems: [NET_NEW_ITEM] });

    const row = getByTestId('row-ITM-9');
    expect(row.textContent).toContain('Premiere Pro for Enterprise');
    expect(row.textContent).toContain('New');
    expect(within(row).getByRole('textbox').getAttribute('value')).toBe('5');
    expect(row.textContent).toContain('97.50');
    expect(row.textContent).toContain('1,170.00');
  });

  it('updates the net-new quantity in the added items', () => {
    const onNetNewItemsChange = jest.fn();
    const { getByTestId } = renderStep({
      netNewItems: [NET_NEW_ITEM],
      onNetNewItemsChange,
    });

    fireEvent.change(within(getByTestId('row-ITM-9')).getByRole('textbox'), {
      target: { value: '7' },
    });

    expect(onNetNewItemsChange).toHaveBeenCalledWith([{ ...NET_NEW_ITEM, quantity: 7 }]);
  });

  it('removes a net-new item from the plan', () => {
    const onNetNewItemsChange = jest.fn();
    const { getByTestId } = renderStep({
      netNewItems: [NET_NEW_ITEM],
      onNetNewItemsChange,
    });

    fireEvent.click(getByTestId('remove-ITM-9'));

    expect(onNetNewItemsChange).toHaveBeenCalledWith([]);
  });

  it('opens the add-items dialog and merges the picked items', () => {
    const onNetNewItemsChange = jest.fn();
    const { getByTestId } = renderStep({
      netNewItems: [NET_NEW_ITEM],
      onNetNewItemsChange,
    });

    expect(getByTestId('select-items-dialog').getAttribute('data-open')).toBe('false');

    fireEvent.click(getByTestId('add-items'));

    expect(getByTestId('select-items-dialog').getAttribute('data-open')).toBe('true');
    expect(dialogProps.agreementId).toBe('AGR-1111-1111');
    expect(dialogProps.currency).toBe('USD');

    const added: NetNewItem = { ...NET_NEW_ITEM, itemId: 'ITM-10', sku: '65322600CA' };
    dialogProps.onAdd([NET_NEW_ITEM, added]);

    expect(onNetNewItemsChange).toHaveBeenCalledWith([NET_NEW_ITEM, added]);
  });

  it('clears the grid sort as items are added, so an addition lands at the bottom', () => {
    const { getByTestId } = renderStep();

    fireEvent.click(getByTestId('add-items'));
    dialogProps.onAdd([NET_NEW_ITEM]);

    expect(onGridEvent).toHaveBeenCalledWith({ type: 'SortChange', data: [] });
  });

  it('offers each value of a multi-value column as its own field', () => {
    renderStep();

    const fieldsByColumn = Object.fromEntries(
      capturedConfig.columns.map((column) => [column.name, column.fields]),
    );
    expect(fieldsByColumn.item).toEqual(['itemName', 'itemId', 'sku']);
    expect(fieldsByColumn.subscription).toEqual(['subscriptionName', 'subscriptionId']);
    expect(fieldsByColumn.terms).toEqual(['terms', 'commitment']);
    expect(capturedConfig.fields.map((field) => field.name)).toEqual([
      'itemName',
      'itemId',
      'sku',
      'subscriptionName',
      'subscriptionId',
      'terms',
      'commitment',
      'currentQuantity',
      'renewalQuantity',
      'unitSP',
      'spxM',
      'spxY',
    ]);
    expect(capturedConfig.sort).toEqual([]);
  });

  it('keeps held and already added SKUs out of the picker', () => {
    renderStep({ netNewItems: [NET_NEW_ITEM] });

    expect(dialogProps.excludedSkus).toEqual(
      new Set(['65322587CA', '65322588CA', '65304578CA']),
    );
  });

  it('disables adding items when the agreement has no listing', () => {
    renderStep({ agreementOverride: { id: 'AGR-1111-1111' } });

    expect((document.querySelector('[data-testid="add-items"]') as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('tells the customer when nothing renews but still offers adding items', () => {
    const { getByText, getByTestId, queryByTestId } = renderStep({
      selections: { 'SUB-1': false, 'SUB-2': false },
    });

    expect(getByText('No subscriptions to renew')).toBeTruthy();
    expect(queryByTestId('grid')).toBeNull();
    expect((getByTestId('add-items') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('renew-and-add conflict', () => {
    const conflictingPlan = {
      path: 'now' as const,
      quantities: { 'SUB-1': 53, 'SUB-2': 6 },
      selections: { 'SUB-1': true, 'SUB-2': true },
    };

    it('names the lines to undo and remove on each side, numbered as the grid shows them', () => {
      const { getByTestId } = renderStep({ ...conflictingPlan, netNewItems: [NET_NEW_ITEM] });

      const notice = getByTestId('items-step-conflict').textContent;
      expect(notice).toContain('this order cannot include both');
      expect(notice).toContain('undo the changes to line 1 (ITM-1) and remove line 3 (ITM-9)');
      expect(notice).toContain('undo the changes to line 2 (ITM-2)');
    });

    it('stays quiet when the basket only renews', () => {
      const { queryByTestId } = renderStep({ path: 'now', quantities: { 'SUB-1': 30 } });

      expect(queryByTestId('items-step-conflict')).toBeNull();
    });

    it('stays quiet at the anniversary', () => {
      const { queryByTestId } = renderStep({
        ...conflictingPlan,
        path: 'anniversary',
        netNewItems: [NET_NEW_ITEM],
      });

      expect(queryByTestId('items-step-conflict')).toBeNull();
    });
  });

  it('pages the grid ten rows at a time', () => {
    renderStep({ netNewItems: [NET_NEW_ITEM] });

    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 10, total: 2 });
    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'item',
      'subscription',
      'terms',
      'currentQuantity',
      'renewalQuantity',
      'unitSP',
      'spxM',
      'spxY',
      'actions',
    ]);
  });

  describe('next-step gate', () => {
    const NAVIGATION = { currentStepIndex: 2, targetStepIndex: 3 };

    it('registers the gate on the wizard next action', () => {
      renderStep();

      expect(registerOnNextCallback).toHaveBeenCalled();
      expect(registeredOnNext).toBeDefined();
    });

    it('holds the customer with the validating modal while the plan is in flight', async () => {
      let releasePost: (() => void) | undefined;
      mockPost.mockImplementation(
        () => new Promise((resolve) => {
          releasePost = () => resolve({ data: { data: {} } });
        }),
      );
      const { getByTestId, queryByTestId } = renderStep();

      expect(queryByTestId('progress-modal')).toBeNull();

      let pending: Promise<number> | undefined;
      await act(async () => {
        pending = registeredOnNext!(NAVIGATION) as Promise<number>;
      });

      expect(getByTestId('progress-modal').textContent).toBe('Validating');

      await act(async () => {
        releasePost?.();
        await pending;
      });

      expect(queryByTestId('progress-modal')).toBeNull();
    });

    it('cancels the plan validation from the modal', async () => {
      mockPost.mockImplementation(
        (_url: string, _body?: unknown, config?: { signal?: GenericAbortSignal }) =>
          new Promise((_resolve, reject) => {
            config?.signal?.addEventListener?.('abort', () => reject(new Error('canceled')));
          }),
      );
      const { getByTestId, queryByTestId } = renderStep();

      let pending: Promise<number> | undefined;
      await act(async () => {
        pending = registeredOnNext!(NAVIGATION) as Promise<number>;
      });

      expect(getByTestId('progress-modal')).toBeTruthy();

      let nextIndex: number | undefined;
      await act(async () => {
        progressProps.onCancel();
        nextIndex = await pending;
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect(queryByTestId('progress-modal')).toBeNull();
      expect(queryByTestId('items-step-error')).toBeNull();
    });

    it('blocks the step while a renewal quantity is invalid, without calling the backend', async () => {
      const { getByTestId } = renderStep({ quantities: { 'SUB-1': null } });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect(mockPost).not.toHaveBeenCalled();
      expect(getByTestId('items-step-error').textContent).toContain(
        'Enter a valid renewal quantity for every item before continuing.',
      );
    });

    it('blocks the step while renewing now asks for more than the held quantity', async () => {
      const { getByTestId } = renderStep({ path: 'now', quantities: { 'SUB-1': 38 } });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect(mockPost).not.toHaveBeenCalled();
      expect(getByTestId('items-step-increase-error')).toBeTruthy();
    });

    const PLAN_SUBSCRIPTIONS = [
      {
        id: 'SUB-1',
        offerId: '65322587CA01A12',
        renew: true,
        renewalQuantity: 37,
        flexDiscountCodes: [],
      },
      {
        id: 'SUB-2',
        offerId: '65322588CA01A12',
        renew: false,
        renewalQuantity: 0,
        flexDiscountCodes: [],
      },
    ];

    it('checks the 3YC floor with the whole plan and does not preview against Adobe, then advances', async () => {
      mockPost.mockResolvedValue({ data: { data: {} } });
      renderStep({ netNewItems: [NET_NEW_ITEM] });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v2/agreements/AGR-1111-1111/renewal-order/3yc-check',
        {
          renewalPath: 'anniversary',
          subscriptions: PLAN_SUBSCRIPTIONS,
          netNewItems: [{ offerId: '65304578CA', quantity: 5, flexDiscountCodes: [] }],
        },
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    it('previews the early-renewal items against Adobe after the 3YC floor check', async () => {
      mockPost.mockResolvedValue({ data: { data: {} } });
      renderStep({ path: 'now' });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      const plan = {
        renewalPath: 'now',
        subscriptions: PLAN_SUBSCRIPTIONS,
        netNewItems: [],
      };
      expect(mockPost.mock.calls.map(([url, body]) => [url, body])).toEqual([
        ['/api/v2/agreements/AGR-1111-1111/renewal-order/3yc-check', plan],
        ['/api/v2/agreements/AGR-1111-1111/renewal-order/preview', plan],
      ]);
    });

    it('stays on the step when Adobe rejects the early-renewal items', async () => {
      mockPost.mockResolvedValueOnce({ data: { data: {} } }).mockRejectedValueOnce({
        response: { data: { detail: 'Place the renewal first, then add in a new order.' } },
      });
      const { getByTestId } = renderStep({ path: 'now' });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect(getByTestId('items-step-error').textContent).toContain(
        'Place the renewal first, then add in a new order.',
      );
    });

    it('stays on the step and shows the backend message when the validation fails', async () => {
      mockPost.mockRejectedValue({
        response: { data: { detail: 'The renewal plan would break the commitment.' } },
      });
      const { getByTestId } = renderStep();

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      expect(getByTestId('items-step-error').textContent).toContain(
        'The renewal plan would break the commitment.',
      );
    });

    it('clears the validation outcome when the plan changes', async () => {
      mockPost.mockRejectedValue({
        response: { data: { detail: 'The renewal plan would break the commitment.' } },
      });
      const onQuantityChange = jest.fn();
      const { getByTestId, queryByTestId, rerender } = renderStep({ onQuantityChange });

      await act(async () => {
        await registeredOnNext!(NAVIGATION);
      });
      expect(getByTestId('items-step-error')).toBeTruthy();

      rerender(
        <ItemsStep
          agreement={agreement}
          subscriptions={subscriptions}
          selections={{}}
          quantities={{ 'SUB-1': 53 }}
          netNewItems={[]}
          recommendedSkus={new Set<string>()}
          path="anniversary"
          renewalStates={{}}
          onQuantityChange={onQuantityChange}
          onNetNewItemsChange={jest.fn()}
          onPreview={jest.fn()}
        />,
      );

      expect(queryByTestId('items-step-error')).toBeNull();
    });
  });
});
