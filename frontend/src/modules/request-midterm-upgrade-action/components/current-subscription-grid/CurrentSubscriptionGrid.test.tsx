import { ReactNode } from 'react';

import { render } from '@testing-library/react';

import { CurrentSubscriptionGrid } from './CurrentSubscriptionGrid';
import type { Subscription } from '../../../shared/model';

const subscription: Subscription = {
  id: 'SUB-1',
  name: 'Sub Name',
  status: 'Active',
  lines: [
    {
      id: 'ALI-1',
      status: 'Active',
      quantity: 7,
      item: { id: 'ITM-1', name: 'Item', externalIds: { vendor: 'EXT' } },
      price: { unitSP: 100, SPxM: 8.33, SPxY: 100 },
    },
  ],
};

interface CapturedConfig {
  id: string;
  columns: { name: string; title?: string }[];
  fields: { name: string; title: string; type?: string }[];
  sort: { field: string; direction: string }[];
  paging: { page: number; pageSize: number; total: number };
  plugins: unknown[];
}

let capturedData: { id: string; quantity: number; status: string }[];
let capturedConfig: CapturedConfig;
const radioPlugin = { id: 'radio' };
const setSelectedItem = jest.fn();

jest.mock('@softwareone-platform/sdk-react-ui-v0/grid', () => ({
  Grid: () => <div data-testid="grid" />,
  GridCellHeader: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  GridCellRadio: () => <input type="radio" />,
  useGridInMemory: (data: typeof capturedData, config: CapturedConfig) => {
    capturedData = data;
    capturedConfig = config;
    return { data, config };
  },
  useRadioPlugin: () => ({ plugin: radioPlugin, selectedItem: null, setSelectedItem }),
}));

describe('CurrentSubscriptionGrid', () => {
  beforeEach(() => {
    setSelectedItem.mockClear();
  });

  it('renders the grid', () => {
    const { getByTestId } = render(<CurrentSubscriptionGrid subscription={subscription} />);

    expect(getByTestId('grid')).toBeTruthy();
  });

  it('preselects the first row', () => {
    render(<CurrentSubscriptionGrid subscription={subscription} />);

    expect(setSelectedItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'ALI-1' }));
  });

  it('feeds the grid the current subscription data', () => {
    render(<CurrentSubscriptionGrid subscription={subscription} />);

    expect(capturedData).toHaveLength(1);
    expect(capturedData[0]).toMatchObject({
      id: 'ALI-1',
      quantity: 7,
      status: 'Active',
    });
  });

  it('configures the expected columns', () => {
    render(<CurrentSubscriptionGrid subscription={subscription} />);

    expect(capturedConfig.columns.map((column) => column.name)).toEqual([
      'select',
      'name',
      'subscription',
      'quantity',
      'unitSP',
      'spxM',
      'spxY',
      'status',
    ]);
  });

  it('configures the expected fields and default sort', () => {
    render(<CurrentSubscriptionGrid subscription={subscription} />);

    expect(capturedConfig.fields.map((field) => field.name)).toEqual([
      'name',
      'subscription',
      'quantity',
      'unitSP',
      'spxM',
      'spxY',
      'status',
    ]);
    expect(capturedConfig.sort).toEqual([{ field: 'name', direction: 'asc' }]);
  });

  it('pages all rows on a single page and registers the radio plugin', () => {
    render(<CurrentSubscriptionGrid subscription={subscription} />);

    expect(capturedConfig.paging).toEqual({ page: 1, pageSize: 1, total: 1 });
    expect(capturedConfig.plugins).toEqual([radioPlugin]);
  });
});
