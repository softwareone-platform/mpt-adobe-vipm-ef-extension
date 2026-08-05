import { render } from '@testing-library/react';

import { Timestamp } from './Timestamp';

describe('Timestamp', () => {
  it('renders the date and the time of the event', () => {
    const { container } = render(<Timestamp at="2026-06-02T13:06:04.124Z" />);

    expect(container.textContent).toContain('2026');
    expect(container.textContent).toMatch(/\d{2}:\d{2}/);
  });

  it('renders a dash without an event', () => {
    const { container } = render(<Timestamp />);

    expect(container.textContent).toBe('—');
  });
});
