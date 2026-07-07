import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { LinkReference } from './LinkReference';

const renderWithRouter = (ui: ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('LinkReference', () => {
  it('renders the text as a link to the portal origin when a url is provided', () => {
    const { getByRole } = renderWithRouter(<LinkReference text="My Agreement" url="/agreements/1" />);

    const link = getByRole('link', { name: 'My Agreement' });
    expect(link).toHaveAttribute('href', `${window.location.origin}/agreements/1`);
  });

  it('renders plain text without a link when no url is provided', () => {
    const { getByText, queryByRole } = renderWithRouter(<LinkReference text="My Agreement" />);

    expect(getByText('My Agreement')).toBeTruthy();
    expect(queryByRole('link')).toBeNull();
  });

  it('renders the secondary content', () => {
    const { getByText } = renderWithRouter(
      <LinkReference text="My Agreement" secondaryContent="AGR-1234" />
    );

    expect(getByText('AGR-1234')).toBeTruthy();
  });

  it('wraps the reference in a popover when an info card is provided', () => {
    const { container } = renderWithRouter(
      <LinkReference text="My Agreement" infoCard={<div>card</div>} />
    );

    expect(container.querySelector('[data-testid="popover"]')).toBeTruthy();
  });

  it('renders without a popover when no info card is provided', () => {
    const { container } = renderWithRouter(<LinkReference text="My Agreement" />);

    expect(container.querySelector('[data-testid="popover"]')).toBeNull();
  });
});
