import { render } from '@testing-library/react';

import { DetailsSection } from './DetailsSection';

describe('DetailsSection', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<DetailsSection label={'label'} content={'content'} />);
    expect(baseElement).toBeTruthy();
  });

  it('should render label and content', () => {
    const { getByText } = render(<DetailsSection label={'label'} content={'content'} />);
    expect(getByText('label')).toBeTruthy();
    expect(getByText('content')).toBeTruthy();
  });

  it('should render an em dash when content is undefined', () => {
    const { getByText } = render(<DetailsSection label={'label'} content={undefined} />);
    expect(getByText('—')).toBeTruthy();
  });
});
