import { render } from '@testing-library/react';

import { CurrentQuantityCell, describeRenewedQuantity } from './CurrentQuantityCell';

describe('describeRenewedQuantity', () => {
  it('names the renewed seats and the ones a further renewal can still carry', () => {
    expect(describeRenewedQuantity(15, 10)).toBe('15 renewed · 10 left');
  });

  it('names only the renewed total once every seat is renewed', () => {
    expect(describeRenewedQuantity(25, 0)).toBe('25 renewed');
  });

  it('says nothing about a line that has not been early-renewed', () => {
    expect(describeRenewedQuantity(null, null)).toBeUndefined();
    expect(describeRenewedQuantity(0, 25)).toBeUndefined();
  });
});

describe('CurrentQuantityCell', () => {
  it('shows the held quantity with the renewed seats beneath it', () => {
    const { container } = render(
      <CurrentQuantityCell quantity={25} renewedQuantity={15} remainingQuantity={10} />,
    );

    expect(container.textContent).toBe('2515 renewed · 10 left');
  });

  it('shows a placeholder without a quantity', () => {
    const { container } = render(
      <CurrentQuantityCell quantity={null} renewedQuantity={null} remainingQuantity={null} />,
    );

    expect(container.textContent).toBe('—');
  });
});
