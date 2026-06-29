import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { ReferenceWithChip } from './ReferenceWithChip';

const renderWithRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ReferenceWithChip', () => {
  it('renders the status chip', () => {
    const { getByText, getByTestId } = renderWithRouter(<ReferenceWithChip statusLabel="Active" />);

    expect(getByTestId('chip')).toBeTruthy();
    expect(getByText('Active')).toBeTruthy();
  });

  it('renders the text as a link when a url is provided', () => {
    const { getByRole } = renderWithRouter(
      <ReferenceWithChip text="Acme" url="/customers/1" statusLabel="Active" />
    );

    expect(getByRole('link', { name: 'Acme' })).toHaveAttribute('href', '/customers/1');
  });

  it('renders the text without a link when no url is provided', () => {
    const { getByText, queryByRole } = renderWithRouter(
      <ReferenceWithChip text="Acme" statusLabel="Active" />
    );

    expect(getByText('Acme')).toBeTruthy();
    expect(queryByRole('link')).toBeNull();
  });

  it('renders only the chip when no text is provided', () => {
    const { queryByRole, getByText } = renderWithRouter(<ReferenceWithChip statusLabel="Active" />);

    expect(getByText('Active')).toBeTruthy();
    expect(queryByRole('link')).toBeNull();
  });

  it('wraps the reference in a popover with the info-card modifier when an info card is provided', () => {
    const { container } = renderWithRouter(
      <ReferenceWithChip text="Acme" statusLabel="Active" infoCard={<div>card</div>} />
    );

    expect(container.querySelector('[data-testid="popover"]')).toBeTruthy();
    expect(container.querySelector('.entity-reference-with-chip--with-info-card')).toBeTruthy();
  });

  it('renders without a popover when no info card is provided', () => {
    const { container } = renderWithRouter(<ReferenceWithChip text="Acme" statusLabel="Active" />);

    expect(container.querySelector('[data-testid="popover"]')).toBeNull();
    expect(container.querySelector('.entity-reference-with-chip--with-info-card')).toBeNull();
  });
});
