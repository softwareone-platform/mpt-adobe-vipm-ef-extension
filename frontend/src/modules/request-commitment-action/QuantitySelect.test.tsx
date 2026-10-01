import { useState } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { QuantitySelect } from './QuantitySelect';

// The real SDK Select renders here: the defects it covers come from that component.

const OPTIONS = [
  { label: 'Keep current (50)', value: '' },
  { label: 'Level 12 (10 licenses)', value: '10', isDisabled: true },
  { label: 'Level 13 (50 licenses) (current)', value: '50' },
  { label: 'Level 14 (100 licenses)', value: '100' },
];

function Harness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <QuantitySelect
      controlLabel="Discount level"
      placeholder="Select a level"
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      options={OPTIONS}
    />
  );
}

const field = () =>
  screen.getByTestId('select__input').querySelector('input') as HTMLInputElement;

const listbox = () => screen.queryByRole('listbox');

function openList() {
  fireEvent.click(field());
  act(() => jest.advanceTimersByTime(20));
}

// Keys go to the focused element, as from a keyboard: the list's search box once it is open.
function pressKey(key: string) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key });
}

describe('QuantitySelect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows an option below the floor as disabled and refuses a click on it', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    openList();

    const levelTwelve = screen.getByRole('option', { name: 'Level 12 (10 licenses)' });
    fireEvent.click(levelTwelve);

    expect(levelTwelve).toHaveAttribute('aria-disabled', 'true');
    expect(onChange).not.toHaveBeenCalled();
    expect(field().value).toBe('Keep current (50)');
  });

  it('refuses a disabled option chosen from the keyboard and shows the value held', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    openList();

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('Enter');
    act(() => jest.runOnlyPendingTimers());

    expect(onChange).not.toHaveBeenCalledWith('10');
    expect(listbox()).toBeNull();
    expect(field().value).toBe('Keep current (50)');
  });

  it('returns focus to the field when Enter refuses a disabled option', () => {
    render(<Harness onChange={jest.fn()} />);
    openList();

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('Enter');
    act(() => jest.runOnlyPendingTimers());

    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(field());
  });

  it('leaves focus where an outside click put it after a disabled option was refused', () => {
    render(
      <>
        <Harness onChange={jest.fn()} />
        <button type="button">Elsewhere</button>
      </>,
    );
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    openList();
    pressKey('ArrowDown');
    pressKey('ArrowDown');

    fireEvent.mouseDown(elsewhere);
    elsewhere.focus();
    act(() => jest.runOnlyPendingTimers());

    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('takes an enabled option from the keyboard', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    openList();

    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('ArrowDown');
    pressKey('Enter');
    act(() => jest.runOnlyPendingTimers());

    expect(onChange).toHaveBeenLastCalledWith('50');
    expect(field().value).toBe('Level 13 (50 licenses) (current)');
  });

  it('opens the list above the field, flush against it, when there is no room below', () => {
    const labelHeight = 30;
    const controlTop = window.innerHeight - 90;
    const rect = (top: number, height: number) => ({
      top,
      left: 20,
      height,
      width: 400,
      bottom: top + height,
      right: 420,
      x: 20,
      y: top,
      toJSON: () => ({}),
    });
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.tagName === 'INPUT'
          ? rect(controlTop + labelHeight, 40)
          : rect(controlTop, labelHeight + 40);
      });
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    render(<Harness onChange={jest.fn()} />);

    openList();

    // The list's bottom edge sits the SDK's 4 px above the field, not above its label.
    const list = screen.getByTestId('select__dropdown__popover__content');
    expect(list.style.transform).toContain('translateY(-100%)');
    expect(list.style.top).toBe(`${controlTop + labelHeight - 4}px`);
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length);
  });
});
