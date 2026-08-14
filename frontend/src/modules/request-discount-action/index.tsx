import '../../i18n/translations';

import { setup } from '@mpt-extension/sdk';
import { createRoot } from 'react-dom/client';

import { DesignSystemOptionsProvider } from '@softwareone-platform/sdk-react-ui-v0/utils';

import App from './App';
import { DESIGN_SYSTEM_OPTIONS } from '../shared/constants';
import '../../style.scss';

setup((element: Element) => {
  const root = createRoot(element);

  root.render(
    <DesignSystemOptionsProvider value={DESIGN_SYSTEM_OPTIONS}>
      <App />
    </DesignSystemOptionsProvider>,
  );
});
