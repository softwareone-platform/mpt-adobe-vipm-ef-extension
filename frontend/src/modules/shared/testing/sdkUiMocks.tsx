import type { ReactNode } from 'react';

// Shared jest.mock factories for @softwareone-platform/sdk-react-ui-v0 modules.
// Use from a test via jest.requireActual so the factory stays hoist-safe:
//   jest.mock('@softwareone-platform/sdk-react-ui-v0/chip', () =>
//     jest.requireActual<typeof import('../../shared/testing/sdkUiMocks')>(
//       '../../shared/testing/sdkUiMocks',
//     ).createChipMock());

type MockGridColumn = {
  name: string;
  title?: string;
  cell?: (item: object) => ReactNode;
};

export type MockGridConfig = Record<string, unknown>;

export function createChipMock() {
  return {
    Chip: ({ label }: { label?: string }) => <span>{label}</span>,
  };
}

// Renders rows through the real column cell definitions. Pass onUseGridAsync
// to capture each grid config so tests can drive grid events (paging).
export function createGridMock(onUseGridAsync?: (config: MockGridConfig) => void) {
  return {
    GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    useGridAsync: (config: MockGridConfig) => {
      onUseGridAsync?.(config);
      return {
        id: config.id,
        data: config.isLoading ? [] : config.data,
        configuration: { columns: config.columns, paging: config.paging },
        onEvent: jest.fn(),
      };
    },
    Grid: ({
      data,
      configuration,
    }: {
      data: object[];
      configuration: { columns: MockGridColumn[] };
    }) => (
      <div data-testid="grid">
        {configuration.columns.map((column) => (
          <div key={column.name}>{column.title}</div>
        ))}
        {data.map((item, index) => (
          <div key={index}>
            {configuration.columns.map((column) => (
              <div key={column.name}>{column.cell?.(item)}</div>
            ))}
          </div>
        ))}
      </div>
    ),
  };
}
