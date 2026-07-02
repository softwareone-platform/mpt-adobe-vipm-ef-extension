import { MediumText } from '@softwareone-platform/sdk-react-ui-v0/text';
import { MemoryRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { ThreeYearCommitment } from './ThreeYearCommitment';
import { LinkedMembership } from './LinkedMembership';
import { GlobalCustomer } from './GlobalCustomer';

const DEFAULT_PATH = '/3-year-commitment';

const NAV_ITEMS: Array<{ label: string; path: string }> = [
  { label: '3-year commitment', path: DEFAULT_PATH },
  { label: 'Linked membership', path: '/linked-membership' },
  { label: 'Global customer', path: '/global-customer' },
];

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
            <svg
              width="1em"
              height="1em"
              viewBox="0 -960 960 960"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                transform="scale(1 -1)"
                d="M400 480Q334 480 287 527Q240 574 240 640Q240 706 287 753Q334 800 400 800Q466 800 513 753Q560 706 560 640Q560 574 513 527Q466 480 400 480ZM80 160V272Q80 305 97 334Q114 363 144 378Q195 404 259 422Q323 440 400 440Q408 440 414 440Q420 440 426 438Q418 420 412.5 400.5Q407 381 404 360H400Q329 360 272.5 342Q216 324 180 306Q171 301 165.5 292Q160 283 160 272V240H412Q418 219 428 198.5Q438 178 450 160ZM640 120 628 180Q616 185 605.5 190.5Q595 196 584 204L526 186L486 254L532 294Q530 308 530 320Q530 332 532 346L486 386L526 454L584 436Q595 444 605.5 449.5Q616 455 628 460L640 520H720L732 460Q744 455 754.5 449Q765 443 776 434L834 454L874 384L828 344Q830 332 830 319Q830 306 828 294L874 254L834 186L776 204Q765 196 754.5 190.5Q744 185 732 180L720 120ZM680 240Q713 240 736.5 263.5Q760 287 760 320Q760 353 736.5 376.5Q713 400 680 400Q647 400 623.5 376.5Q600 353 600 320Q600 287 623.5 263.5Q647 240 680 240ZM400 560Q433 560 456.5 583.5Q480 607 480 640Q480 673 456.5 696.5Q433 720 400 720Q367 720 343.5 696.5Q320 673 320 640Q320 607 343.5 583.5Q367 560 400 560Z"
              />
            </svg>
            <MediumText as="h3" size={2}>
              Manage account
            </MediumText>
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
            <Route path="/linked-membership" element={<LinkedMembership />} />
            <Route path="/global-customer" element={<GlobalCustomer />} />
            <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
          </Routes>
        </section>
      </div>
    </MemoryRouter>
  );
}
