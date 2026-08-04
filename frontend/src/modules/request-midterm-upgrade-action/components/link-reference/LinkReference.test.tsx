import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { render } from '@testing-library/react';

import { LinkReference } from './LinkReference';

jest.mock('@softwareone-platform/sdk-react-ui-v0/avatar', () => ({
  Avatar: ({
    jdenticonValue,
    imageSrc,
    isToUseJdenticon,
  }: {
    jdenticonValue?: string;
    imageSrc?: string;
    isToUseJdenticon?: boolean;
  }) => (
    <span
      data-testid="avatar"
      data-jdenticon-value={jdenticonValue}
      data-image-src={imageSrc}
      data-use-jdenticon={String(isToUseJdenticon)}
    />
  ),
}));

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

  it('renders an avatar keyed on the id when a string secondary content is provided', () => {
    const { getByTestId } = renderWithRouter(
      <LinkReference text="Licensee Name" secondaryContent="LIC-1234" />
    );

    expect(getByTestId('avatar')).toHaveAttribute('data-jdenticon-value', 'LIC-1234');
  });

  it('does not render an avatar when no secondary content is provided', () => {
    const { queryByTestId } = renderWithRouter(<LinkReference text="Licensee Name" />);

    expect(queryByTestId('avatar')).toBeNull();
  });

  it('renders the entity icon of the payload when there is one', () => {
    const iconUrl = 'https://api.dummy.test/public/v1/accounts/accounts/ACC-1/icon';
    const { getByTestId } = renderWithRouter(
      <LinkReference text="Vendor Name" secondaryContent="ACC-1" iconUrl={iconUrl} />
    );

    expect(getByTestId('avatar')).toHaveAttribute('data-image-src', iconUrl);
  });

  it('falls back to the generated avatar without an entity icon', () => {
    const { getByTestId } = renderWithRouter(
      <LinkReference text="Vendor Name" secondaryContent="ACC-1" />
    );

    const avatar = getByTestId('avatar');
    expect(avatar).toHaveAttribute('data-image-src', '');
    expect(avatar).toHaveAttribute('data-use-jdenticon', 'true');
  });

  it('prefers an explicit icon over the generated avatar', () => {
    const { getByTestId, queryByTestId } = renderWithRouter(
      <LinkReference text="Licensee Name" secondaryContent="LIC-1234" icon={<span data-testid="custom-icon" />} />
    );

    expect(getByTestId('custom-icon')).toBeTruthy();
    expect(queryByTestId('avatar')).toBeNull();
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
