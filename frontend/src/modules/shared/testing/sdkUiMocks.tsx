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

type MockActionOption = {
  label?: string;
  type?: 'divider' | 'group';
};

export type MockGridConfig = Record<string, unknown>;

export function createChipMock() {
  return {
    Chip: ({ label }: { label?: string }) => <span>{label}</span>,
  };
}

export function createButtonMock() {
  return {
    Button: ({
      children,
      isBusy,
      isDisabled,
      onClick,
    }: {
      children?: ReactNode;
      isBusy?: boolean;
      isDisabled?: boolean;
      onClick?: () => void;
    }) => (
      <button disabled={isDisabled || isBusy} onClick={onClick}>
        {children}
      </button>
    ),
  };
}

// The real DatePicker lazy-loads its calendar and parses typed text through
// date-fns; the mock takes an ISO string straight from the input so date
// assertions stay about the step, not about the picker.
export function createDatePickerMock() {
  return {
    DatePicker: ({
      isDisabled,
      onChange,
      placeholder,
      testId,
      value,
    }: {
      isDisabled?: boolean;
      onChange?: (value: string) => void;
      placeholder?: string;
      testId?: string;
      value?: string;
    }) => (
      <input
        data-testid={testId}
        disabled={isDisabled}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        value={value ?? ''}
      />
    ),
  };
}

export function createCheckboxMock() {
  return {
    Checkbox: ({
      isChecked,
      isDisabled,
      label,
      onChange,
      testId,
    }: {
      isChecked?: boolean;
      isDisabled?: boolean;
      label?: ReactNode;
      onChange?: (event: { target: { checked: boolean } }) => void;
      testId?: string;
    }) => (
      <label>
        <input
          checked={isChecked ?? false}
          data-testid={testId}
          disabled={isDisabled}
          onChange={onChange}
          type="checkbox"
        />
        {label}
      </label>
    ),
  };
}

function GridActionsMock({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
GridActionsMock.DisplayName = 'Grid.Actions';

type MockWizardStep = { title: string };

type MockStepContentChildren = (context: { activeStepIndex: number }) => ReactNode;

// Mirrors the real Wizard closely enough to assert the chrome: the banner
// title, the step rail, the active step's body and the close wiring. Pass
// activeStepIndex to render a step other than the first.
export function createWizardMock(activeStepIndex: number = 0) {
  const Content = Object.assign(
    ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    {
      Steps: () => null,
      StepContent: ({ children }: { children?: MockStepContentChildren }) => (
        <div data-testid="wizard-step-content">{children?.({ activeStepIndex })}</div>
      ),
    },
  );

  return {
    Wizard: Object.assign(
      ({
        children,
        stepsProps,
        onClose,
      }: {
        children?: ReactNode;
        stepsProps: MockWizardStep[];
        onClose?: () => void;
      }) => (
        <div data-testid="wizard">
          <ul data-testid="wizard-steps">
            {stepsProps.map((step) => (
              <li key={step.title}>{step.title}</li>
            ))}
          </ul>
          <button data-testid="wizard-close" onClick={onClose}>
            close
          </button>
          {children}
        </div>
      ),
      {
        Header: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
        Content,
        Actions: () => null,
      },
    ),
  };
}

// Renders rows through the real column cell definitions. Pass onUseGridAsync
// to capture each grid config so tests can drive grid events (paging).
export function createGridMock(onUseGridAsync?: (config: MockGridConfig) => void) {
  const GridMock = ({
    data,
    configuration,
    children,
  }: {
    data: object[];
    configuration: { columns: MockGridColumn[] };
    children?: ReactNode;
  }) => (
    <div data-testid="grid">
      {children}
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
  );

  GridMock.Actions = ({ children: actionsChildren }: { children?: ReactNode }) => (
    <div data-testid="grid-actions">{actionsChildren}</div>
  );

  return {
    GridCellSimple: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    GridCellActions: ({ actions }: { actions: MockActionOption[] }) => (
      <div>
        {actions
          .filter((action) => action.type !== 'divider' && action.type !== 'group')
          .map((action, index) => (
            <span key={index}>{action.label}</span>
          ))}
      </div>
    ),
    useGridAsync: (config: MockGridConfig) => {
      onUseGridAsync?.(config);
      return {
        id: config.id,
        data: config.isLoading ? [] : config.data,
        configuration: { columns: config.columns, paging: config.paging },
        onEvent: jest.fn(),
      };
    },
    useGridInMemory: (data: object[], config: MockGridConfig) => {
      onUseGridAsync?.({ ...config, data });
      return {
        id: config.id,
        data,
        configuration: { columns: config.columns, paging: config.paging },
        onEvent: jest.fn(),
      };
    },
    // Mirrors the real Grid: a direct <Grid.Actions> child is lifted into the
    // toolbar row next to the built-in view/sort/filter/columns/refresh buttons.
    Grid: Object.assign(
      ({
        children,
        data,
        configuration,
      }: {
        children?: ReactNode;
        data: object[];
        configuration: { columns: MockGridColumn[] };
      }) => (
        <div data-testid="grid">
          <div data-testid="grid__toolbar">{children}</div>
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
      { Actions: GridActionsMock },
    ),
  };
}
