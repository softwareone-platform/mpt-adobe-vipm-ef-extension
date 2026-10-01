import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Select } from '@softwareone-platform/sdk-react-ui-v0/select';
import type { SelectItem } from '@softwareone-platform/sdk-react-ui-v0/select';

/** The SDK popover's own gap between a field and its list. */
const LIST_GAP = 4;

/**
 * Open below the field, or above it when the frame has no room below.
 *
 * The list is fixed to the frame rather than placed inside the modal's
 * scrolling content: there, a list opening near the bottom made the content
 * scroll and the list closed again at once.
 *
 * The SDK anchors the list to the whole control, label included, so a list
 * opening above would sit over the label. ``labelHeight`` moves it down onto
 * the field, flush like the list below.
 */
function listPositions(labelHeight: number) {
  return [
    { position: 'bottom-start' as const },
    { position: 'top-start' as const, offset: { x: 0, y: LIST_GAP - labelHeight } },
  ];
}

/** How far the field's top sits below the top of the whole control. */
function measureLabelHeight(control: HTMLElement | null): number {
  const field = control?.querySelector('input');
  if (!control || !field) return 0;
  return field.getBoundingClientRect().top - control.getBoundingClientRect().top;
}

interface QuantitySelectProps {
  controlLabel: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectItem[];
}

/**
 * A quantity Select that never takes a disabled option.
 *
 * The SDK Select refuses a click on a disabled option, but its keyboard path
 * (arrow keys, then Enter) still reports and shows one. Such a value is ignored
 * here, and the Select is remounted when its list closes, so the field shows
 * the value actually held. When Enter closed the list, focus returns to the
 * field after the remount, unless something else has taken it.
 */
export function QuantitySelect({
  controlLabel,
  placeholder,
  value,
  onChange,
  options,
}: QuantitySelectProps) {
  const [resetKey, setResetKey] = useState(0);
  const [labelHeight, setLabelHeight] = useState(0);
  const refusedDisabled = useRef(false);
  const closedByEnter = useRef(false);
  const restoreFocus = useRef(false);
  const controlRef = useRef<HTMLDivElement>(null);
  // The popover recalculates whenever its positions change, so keep them stable.
  const positions = useMemo(() => listPositions(labelHeight), [labelHeight]);

  function handleChange(next: string) {
    if (options.find((option) => option.value === next)?.isDisabled) {
      refusedDisabled.current = true;
      return;
    }
    refusedDisabled.current = false;
    onChange(next);
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      // The SDK reports the chosen value once more after it closes the list.
      refusedDisabled.current = false;
      setLabelHeight(measureLabelHeight(controlRef.current));
      return;
    }
    if (refusedDisabled.current) {
      refusedDisabled.current = false;
      restoreFocus.current = closedByEnter.current;
      setResetKey((key) => key + 1);
    }
  }

  // The SDK closes the list inside its own keydown handler, after this one.
  function handleKeyDownCapture(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    closedByEnter.current = true;
    setTimeout(() => {
      closedByEnter.current = false;
    });
  }

  useEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    controlRef.current?.querySelector('input')?.focus();
  }, [resetKey]);

  return (
    <div ref={controlRef} onKeyDownCapture={handleKeyDownCapture}>
      <Select
        key={resetKey}
        cssPosition="fixed"
        positions={positions}
        controlLabel={controlLabel}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onOpenChange={handleOpenChange}
        options={options}
      />
    </div>
  );
}
