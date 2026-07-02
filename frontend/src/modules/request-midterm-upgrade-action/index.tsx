import { setup } from '@mpt-extension/sdk';
import { createRoot } from 'react-dom/client';

import App from './App';
import '../../style.scss';

setup((element: Element) => {
  const root = createRoot(element);

  root.render(<App />);
});
