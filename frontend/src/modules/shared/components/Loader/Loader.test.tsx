import { render } from '@testing-library/react';

import { Loader } from './Loader';

describe('Loader', () => {
  it('renders the loader container', () => {
    const { getByTestId } = render(<Loader />);

    expect(getByTestId('loader')).toBeTruthy();
  });

  it('renders a loading spinner', () => {
    const { getByTestId } = render(<Loader />);

    expect(getByTestId('loading-spinner')).toBeTruthy();
  });
});
