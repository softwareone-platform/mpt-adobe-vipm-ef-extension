import { RegularText } from '@softwareone-platform/sdk-react-ui-v0/text';

import { formatDate, formatTime } from '../../../utils/date';

export function Timestamp({ at }: { at?: string }) {
  if (!at) {
    return <>—</>;
  }

  return (
    <>
      <RegularText as="div" size={2}>{formatDate(at)}</RegularText>
      <RegularText as="div" size={1} color="grey-4">{formatTime(at)}</RegularText>
    </>
  );
}
