import { render } from '@testing-library/react';

import { Highlights } from './Highlights';

describe('Highlights', () => {
  it('renders its children', () => {
    const { getByText } = render(
      <Highlights>
        <span>content</span>
      </Highlights>
    );

    expect(getByText('content')).toBeTruthy();
  });

  describe('Highlights.Item', () => {
    it('renders the label and content', () => {
      const { getByText } = render(<Highlights.Item label="Customer">Acme</Highlights.Item>);

      expect(getByText('Customer')).toBeTruthy();
      expect(getByText('Acme')).toBeTruthy();
    });

    it('applies an extra class name when provided', () => {
      const { getByText } = render(
        <Highlights.Item label="Seller" className="extra">
          Reseller
        </Highlights.Item>
      );

      const item = getByText('Reseller').closest('.highlights__item');
      expect(item).toHaveClass('highlights__item', 'extra');
    });

    it('uses only the base class name when none is provided', () => {
      const { getByText } = render(<Highlights.Item label="Seller">Reseller</Highlights.Item>);

      const item = getByText('Reseller').closest('.highlights__item');
      expect(item?.className).toBe('highlights__item');
    });
  });
});
