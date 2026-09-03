import { toRejectedFields } from './apiError';

const rejection = (errors: unknown) => ({ response: { data: { errors } } });

describe('toRejectedFields', () => {
  it('reads the rows a validation failure names', () => {
    const fields = toRejectedFields(
      rejection([
        { pointer: 'adobe-sub-1', detail: 'NOT_FOUND' },
        { pointer: 'adobe-sub-2', detail: 'INELIGIBLE_COMMITMENT_STATUS' },
      ]),
    );

    expect(fields).toEqual([
      { pointer: 'adobe-sub-1', detail: 'NOT_FOUND' },
      { pointer: 'adobe-sub-2', detail: 'INELIGIBLE_COMMITMENT_STATUS' },
    ]);
  });

  it('drops an entry that names no row', () => {
    expect(toRejectedFields(rejection([{ detail: 'NOT_FOUND' }]))).toEqual([]);
  });

  it.each([rejection(undefined), rejection('not a list'), {}, null])(
    'reads no rejections from %p',
    (error) => {
      expect(toRejectedFields(error)).toEqual([]);
    },
  );
});
