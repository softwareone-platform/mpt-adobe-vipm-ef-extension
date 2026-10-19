import { render } from '@testing-library/react';

import { CurrentQuantityCell, describeRenewedQuantity } from './CurrentQuantityCell';

describe('describeRenewedQuantity', () => {
  it('names the renewed seats and the ones a further renewal can still carry', () => {
    expect(describeRenewedQuantity(15, 10)).toBe('(15 renewed, 10 left)');
  });

  it('names only the renewed total once every seat is renewed', () => {
    expect(describeRenewedQuantity(25, 0)).toBe('(25 renewed)');
  });

  it('says nothing about a line that has not been early-renewed', () => {
    expect(describeRenewedQuantity(null, null)).toBeUndefined();
    expect(describeRenewedQuantity(0, 25)).toBeUndefined();
  });
});

describe('CurrentQuantityCell', () => {
  it.each([
    { renewed: 4, remaining: 1, expected: '5 (4 renewed, 1 left)' },
    { renewed: 5, remaining: 0, expected: '5 (5 renewed)' },
    { renewed: 7, remaining: 0, expected: '5 (7 renewed)' },
    { renewed: 0, remaining: 5, expected: '5' },
    { renewed: null, remaining: null, expected: '5' },
  ])(
    'reads $expected for $renewed renewed and $remaining left, as the truncation tooltip shows it',
    ({ renewed, remaining, expected }) => {
      const { container } = render(
        <CurrentQuantityCell quantity={5} renewedQuantity={renewed} remainingQuantity={remaining} />,
      );

      expect(container.textContent).toBe(expected);
    },
  );

  it('shows the renewed note on its own line beneath the held quantity', () => {
    const { container } = render(
      <CurrentQuantityCell quantity={5} renewedQuantity={4} remainingQuantity={1} />,
    );

    const lines = Array.from(container.querySelectorAll('p'), (line) => line.textContent);
    expect(lines).toEqual(['5', '(4 renewed, 1 left)']);
  });

  it('shows a placeholder without a quantity', () => {
    const { container } = render(
      <CurrentQuantityCell quantity={null} renewedQuantity={null} remainingQuantity={null} />,
    );

    expect(container.textContent).toBe('—');
  });
});
