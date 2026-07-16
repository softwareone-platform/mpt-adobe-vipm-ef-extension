import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { LinkReference } from './LinkReference';

jest.mock('@softwareone-platform/sdk-react-ui-v0/link-popover', () => ({
  LinkPopover: ({ title, target, children }: { title: string; target: ReactNode; children: ReactNode }) => (
    <div data-testid="link-popover">
      <div data-testid="link-popover-title">{title}</div>
      <div>{target}</div>
      {children}
    </div>
  ),
}));

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

  it('wraps the reference in a link popover when a card is provided', () => {
    const { getByTestId } = renderWithRouter(
      <LinkReference text="My Agreement" cardTitle="Agreement" card={<div>card</div>} />
    );

    expect(getByTestId('link-popover')).toBeTruthy();
    expect(getByTestId('link-popover-title').textContent).toBe('Agreement');
  });

  it('renders without a popover when no card is provided', () => {
    const { queryByTestId } = renderWithRouter(<LinkReference text="My Agreement" />);

    expect(queryByTestId('link-popover')).toBeNull();
  });
});
