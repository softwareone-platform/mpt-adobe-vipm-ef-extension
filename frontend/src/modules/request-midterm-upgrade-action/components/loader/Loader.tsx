import { LoadingSpinner } from '@softwareone-platform/sdk-react-ui-v0/loading-spinner';

import './Loader.scss';

export function Loader() {
  return (
    <div className="loader" data-testid="loader">
      <div className="loader__panel">
        <LoadingSpinner size="small" />
      </div>
    </div>
  );
}
