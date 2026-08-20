import { ReactNode } from 'react';

import { act, fireEvent, render } from '@testing-library/react';

import { http } from '@mpt-extension/sdk';

import { RenewalStep } from './RenewalStep';
import type { Agreement, Subscription } from '../../shared/model';
import type { NetNewItem, RenewalPath, RenewalQuantities, RenewalSelections } from '../model';

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

const NAVIGATION: NavProps = { currentStepIndex: 1, targetStepIndex: 2 };

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
  cell?: (row: TestRow) => ReactNode;
}

interface GridConfig {
  id: string;
  columns: GridColumn[];
  paging: { page: number; pageSize: number; total: number };
}

let capturedConfig: GridConfig;

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
    capturedConfig = config;
    return { data, config };
  },
}));

interface MockToggleProps {
  isChecked?: boolean;
  onChange?: (isChecked: boolean) => void;
  testId?: string;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/toggle', () => ({
  Toggle: ({ isChecked, onChange, testId }: MockToggleProps) => (
    <button
      data-testid={testId}
      data-checked={isChecked}
      onClick={() => onChange?.(!isChecked)}
    />
  ),
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

const agreement: Agreement = { id: 'AGR-1111-1111', name: 'Agreement Name' };

const subscriptions: Subscription[] = [
  {
    id: 'SUB-1',
    name: 'Subscription for Acrobat',
    autoRenew: true,
    terms: { period: '1y', commitment: '1y' },
    lines: [
      {
        id: 'ALI-1',
        quantity: 1715,
        item: {
          id: 'ITM-1',
          name: 'Acrobat Pro for Enterprise',
          externalIds: { vendor: '65322587CA01A12' },
        },
        price: { unitSP: 239.87, SPxM: 34281.42, SPxY: 411377.05 },
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

const renderStep = ({
  selections = {},
  onRenewChange = jest.fn(),
  subscriptionList = subscriptions,
  quantities = {},
  netNewItems = [],
  path = 'anniversary',
}: {
  selections?: RenewalSelections;
  onRenewChange?: (subscriptionId: string, renew: boolean) => void;
  subscriptionList?: Subscription[];
  quantities?: RenewalQuantities;
  netNewItems?: NetNewItem[];
  path?: RenewalPath;
} = {}) =>
  render(
    <RenewalStep
      agreement={agreement}
      subscriptions={subscriptionList}
      selections={selections}
      quantities={quantities}
      netNewItems={netNewItems}
      path={path}
      onRenewChange={onRenewChange}
    />,
  );

describe('RenewalStep', () => {
  it('renders the heading, the highlights, the prompt and the price disclaimer', () => {
    const { getByText, getByTestId } = renderStep();

    expect(getByText('Renewal')).toBeTruthy();
    expect(getByTestId('wizard-highlights')).toBeTruthy();
    expect(getByText(/Select the existing subscriptions to be renewed/)).toBeTruthy();
    expect(getByText(/These estimated prices include estimates/)).toBeTruthy();
  });

  it('lists every subscription with its item, SKU details and current quantity', () => {
    const { getByTestId, getByText, getAllByText } = renderStep();

    expect(getByTestId('row-SUB-1')).toBeTruthy();
    expect(getByTestId('row-SUB-2')).toBeTruthy();
    expect(getByText('Acrobat Pro for Enterprise')).toBeTruthy();
    expect(getByText('ITM-1 | 65322587CA01A12')).toBeTruthy();
    expect(getByText('Subscription for Acrobat')).toBeTruthy();
    expect(getByText('1715')).toBeTruthy();
    expect(getAllByText('Yearly billing')).toHaveLength(2);
    expect(getAllByText('1 year commitment')).toHaveLength(2);
  });

  it('seeds each Renew toggle from the standing autoRenewal preference', () => {
    const { getByTestId } = renderStep();

    expect(getByTestId('renew-SUB-1').getAttribute('data-checked')).toBe('true');
    expect(getByTestId('renew-SUB-2').getAttribute('data-checked')).toBe('false');
  });

  it('prefers the customer selection over the standing preference', () => {
    const { getByTestId } = renderStep({ selections: { 'SUB-1': false, 'SUB-2': true } });

    expect(getByTestId('renew-SUB-1').getAttribute('data-checked')).toBe('false');
    expect(getByTestId('renew-SUB-2').getAttribute('data-checked')).toBe('true');
  });

  it('reports the renew choice when a toggle changes', () => {
    const onRenewChange = jest.fn();
    const { getByTestId } = renderStep({ onRenewChange });

    fireEvent.click(getByTestId('renew-SUB-1'));

    expect(onRenewChange).toHaveBeenCalledWith('SUB-1', false);
  });

  it('prices a renewing subscription and blanks out a lapsing one', () => {
    const { getByTestId } = renderStep();

    expect(getByTestId('row-SUB-1').textContent).toContain('34,281.42');
    expect(getByTestId('row-SUB-1').textContent).toContain('411,377.05');
    expect(getByTestId('row-SUB-2').textContent).toContain('234.00');
    expect(getByTestId('row-SUB-2').textContent).not.toContain('409.50');
    expect(getByTestId('row-SUB-2').textContent).not.toContain('4,914.00');
  });

  it('keeps the undo action idle until the customer changes a toggle', () => {
    const { getByTestId } = renderStep();

    expect((getByTestId('undo-SUB-1') as HTMLButtonElement).disabled).toBe(true);
    expect((getByTestId('undo-SUB-2') as HTMLButtonElement).disabled).toBe(true);
  });

  it('restores the standing preference on undo', () => {
    const onRenewChange = jest.fn();
    const { getByTestId } = renderStep({ selections: { 'SUB-1': false }, onRenewChange });

    const undo = getByTestId('undo-SUB-1') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);

    fireEvent.click(undo);

    expect(onRenewChange).toHaveBeenCalledWith('SUB-1', true);
  });

  it('renders placeholders for a subscription without line data', () => {
    const { getByTestId } = renderStep({
      subscriptionList: [{ id: 'SUB-3', name: 'Lineless Subscription', autoRenew: true }],
    });

    expect(getByTestId('row-SUB-3').textContent).toContain('—');
  });

  describe('validation gate', () => {
    beforeEach(() => {
      mockPost.mockReset();
      registeredOnNext = undefined;
      mockPost.mockResolvedValue({ data: { data: {} } });
    });

    it('checks the 3YC floor before advancing and leaves the Adobe quote to the Items step', async () => {
      renderStep({ path: 'now', selections: { 'SUB-1': true } });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.targetStepIndex);
      expect(mockPost.mock.calls.map(([url]) => url)).toEqual([
        '/api/v2/agreements/AGR-1111-1111/renewal-order/3yc-check',
      ]);
    });

    it('keeps the customer on the step and shows what the pre-check rejected', async () => {
      mockPost.mockRejectedValue({
        response: { data: { detail: '3121 - Subscription Not allowed for Renewal.' } },
      });
      const { findByTestId } = renderStep({ path: 'now', selections: { 'SUB-1': true } });

      let nextIndex: number | undefined;
      await act(async () => {
        nextIndex = await registeredOnNext!(NAVIGATION);
      });

      expect(nextIndex).toBe(NAVIGATION.currentStepIndex);
      const error = await findByTestId('renewal-step-error');
      expect(error.textContent).toContain('Subscription Not allowed for Renewal');
    });

    it('leaves Adobe out of an at-anniversary plan', async () => {
      renderStep({ selections: { 'SUB-1': true } });

      await act(async () => {
        await registeredOnNext!(NAVIGATION);
      });

      expect(mockPost.mock.calls.map(([url]) => url)).toEqual([
        '/api/v2/agreements/AGR-1111-1111/renewal-order/3yc-check',
      ]);
    });
  });

  it('pages the grid ten subscriptions at a time', () => {
    renderStep();

    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 10, total: 2 });
    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'item',
      'subscription',
      'terms',
      'quantity',
      'renew',
      'unitSP',
      'spxM',
      'spxY',
      'actions',
    ]);
  });
});
