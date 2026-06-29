import { ReactNode, cloneElement, isValidElement, useCallback, useEffect, useState } from 'react';

import { Popover } from '@softwareone-platform/sdk-react-ui-v0/popover';

import './InfoCardPopover.scss';

export interface InfoCardPopoverProps {
  card: ReactNode;
  children: ReactNode;
}

let activeClose: (() => void) | null = null;

export function InfoCardPopover({ card, children }: InfoCardPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => {
    if (activeClose && activeClose !== close) {
      activeClose();
    }
    activeClose = close;
    setIsOpen(true);
  }, [close]);

  useEffect(() => {
    if (!isOpen && activeClose === close) {
      activeClose = null;
    }
  }, [isOpen, close]);

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, [close]);

  const content = isValidElement<{ onClose?: () => void }>(card)
    ? cloneElement(card, { onClose: close })
    : card;

  return (
    <Popover
      trigger='manual'
      isOpen={isOpen}
      isOpenChange={setIsOpen}
      cssPosition='fixed'
      isToSetMinWidth={false}
      portalElement={document.body}
      flickColor='var(--brand-white)'
      positions={[{ position: 'right' }, { position: 'left' }, { position: 'top' }, { position: 'bottom' }]}
    >
      <Popover.Target>
        <div className="info-card-popover__target" onMouseEnter={open} onTouchStart={open}>
          {children}
        </div>
      </Popover.Target>
      <Popover.Content>{content}</Popover.Content>
    </Popover>
  );
}
