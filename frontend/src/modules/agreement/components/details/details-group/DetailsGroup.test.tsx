import { render } from '@testing-library/react';

import { DetailsGroup } from './DetailsGroup';

describe('DetailsGroup', () => {
  it('should render with a title', () => {
    const { getByText } = render(<DetailsGroup title={'Additional information'} />);
    expect(getByText('Additional information')).toBeTruthy();
  });

  it('should render children with id', () => {
    const { getByTestId } = render(
      <DetailsGroup title={'Timestamps'}>
        <p data-testid={'test'}>title</p>
      </DetailsGroup>
    );
    expect(getByTestId('test')).toBeTruthy();
  });
});
