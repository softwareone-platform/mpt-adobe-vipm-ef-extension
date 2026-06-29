import { ReactNode } from 'react';

import { fireEvent, render } from '@testing-library/react';

import { InfoCardPopover } from './InfoCardPopover';

interface MockPopoverProps {
  children?: ReactNode;
  isOpen?: boolean;
}

jest.mock('@softwareone-platform/sdk-react-ui-v0/popover', () => {
  const Popover = ({ children, isOpen }: MockPopoverProps) => (
    <div data-testid="popover" data-open={String(!!isOpen)}>
      {children}
    </div>
  );
  Popover.Target = ({ children }: MockPopoverProps) => <div>{children}</div>;
  Popover.Content = ({ children }: MockPopoverProps) => <div>{children}</div>;
  return { Popover };
});

const isOpen = (node: HTMLElement) =>
  node.closest('[data-testid="popover"]')?.getAttribute('data-open');

describe('InfoCardPopover', () => {
  it('renders the trigger children', () => {
    const { getByText } = render(<InfoCardPopover card={<div>card</div>}>trigger</InfoCardPopover>);

    expect(getByText('trigger')).toBeTruthy();
  });

  it('is closed initially and opens on mouse enter', () => {
    const { getByText } = render(<InfoCardPopover card={<div>card</div>}>trigger</InfoCardPopover>);

    expect(isOpen(getByText('trigger'))).toBe('false');

    fireEvent.mouseEnter(getByText('trigger'));

    expect(isOpen(getByText('trigger'))).toBe('true');
  });

  it('clones the card with an onClose handler that closes the popover', () => {
    const Card = ({ onClose }: { onClose?: () => void }) => (
      <button onClick={onClose}>close-card</button>
    );
    const { getByText } = render(<InfoCardPopover card={<Card />}>trigger</InfoCardPopover>);

    fireEvent.mouseEnter(getByText('trigger'));
    expect(isOpen(getByText('trigger'))).toBe('true');

    fireEvent.click(getByText('close-card'));

    expect(isOpen(getByText('trigger'))).toBe('false');
  });

  it('closes when the Escape key is pressed', () => {
    const { getByText } = render(<InfoCardPopover card={<div>card</div>}>trigger</InfoCardPopover>);

    fireEvent.mouseEnter(getByText('trigger'));
    expect(isOpen(getByText('trigger'))).toBe('true');

    fireEvent.keyUp(window, { key: 'Escape' });

    expect(isOpen(getByText('trigger'))).toBe('false');
  });

  it('closes a previously open popover when another one opens', () => {
    const { getByText } = render(
      <>
        <InfoCardPopover card={<div>card</div>}>first</InfoCardPopover>
        <InfoCardPopover card={<div>card</div>}>second</InfoCardPopover>
      </>
    );

    fireEvent.mouseEnter(getByText('first'));
    expect(isOpen(getByText('first'))).toBe('true');

    fireEvent.mouseEnter(getByText('second'));

    expect(isOpen(getByText('second'))).toBe('true');
    expect(isOpen(getByText('first'))).toBe('false');
  });
});
