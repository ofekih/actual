import type { CSSProperties, ReactNode } from 'react';

import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';

type ClickableCellProps = {
  onClick: () => void;
  style?: CSSProperties;
  children: ReactNode;
  'data-testid'?: string;
};

export function ClickableCell({
  onClick,
  style,
  children,
  'data-testid': testId,
}: ClickableCellProps) {
  return (
    <View
      data-testid={testId}
      onClick={onClick}
      className={css({
        cursor: 'pointer',
        ':hover': {
          textDecoration: 'underline',
        },
      })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </View>
  );
}
