import { Icon } from '@softwareone-platform/sdk-react-ui-v0/icon';
import { BoldText, RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { MemoryRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { ThreeYearCommitment } from './ThreeYearCommitment';
import { LinkedMembership } from './LinkedMembership';
import { GlobalCustomer } from './GlobalCustomer';

const DEFAULT_PATH = '/3-year-commitment';

const NAV_ITEMS: Array<{ label: string; path: string }> = [
  { label: 'Sync account', path: '/sync-account' },
  { label: '3-year commitment', path: DEFAULT_PATH },
  { label: 'Linked membership', path: '/linked-membership' },
  { label: 'Global customer', path: '/global-customer' },
];

function SectionPlaceholder({ title }: { title: string }) {
  return (
    <header className="extension__content-header">
      <BoldText as="h2" size={4} className="extension__content-title">
        {title}
      </BoldText>
      <RegularText as="p" size={2} color="grey-5">
        This section is not available yet.
      </RegularText>
    </header>
  );
}

export default function App() {
  return (
    <MemoryRouter initialEntries={[DEFAULT_PATH]}>
      <div className="extension">
        {/*
          Custom sidebar instead of the SDK's `Navigation.SideNav`.
          `Navigation.SideNav` only registers itself into a parent `<Navigation>`
          context and is rendered by that full-page platform shell (which forces
          `height: 100vh` and adds a collapse button). Our extension renders inside
          the platform's own shell, so we can't mount a second one. This sidebar
          reuses design-system pieces (the `person` icon and the `brand-primary`
          active color) to match the design-system "Side navigation" look.
        */}
        <aside className="extension__sidebar" aria-label="Manage account">
          <div className="extension__sidebar-heading">
            <Icon name="person" />
            <BoldText as="h3" size={2}>
              Manage account
            </BoldText>
          </div>
          <nav>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `extension__sidebar-item${isActive ? ' extension__sidebar-item--active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <section className="extension__content">
          <Routes>
            <Route path="/3-year-commitment" element={<ThreeYearCommitment />} />
            <Route path="/sync-account" element={<SectionPlaceholder title="Sync account" />} />
            <Route path="/linked-membership" element={<LinkedMembership />} />
            <Route path="/global-customer" element={<GlobalCustomer />} />
            <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
          </Routes>
        </section>
      </div>
    </MemoryRouter>
  );
}
