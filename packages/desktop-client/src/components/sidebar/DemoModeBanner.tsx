import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { DEMO_BUDGET_ID } from '@actual-app/core/shared/constants';

import { exitDemoMode } from '#budgetfiles/budgetfilesSlice';
import { useMetadataPref } from '#hooks/useMetadataPref';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

export function DemoModeBanner() {
  const dispatch = useDispatch();
  const [budgetId] = useMetadataPref('id');
  const [sourceBudgetId] = useMetadataPref('demoSourceBudgetId');

  if (budgetId !== DEMO_BUDGET_ID || !sourceBudgetId) {
    return null;
  }

  return (
    <View
      data-testid="demo-mode-banner"
      style={{
        margin: '0 12px 10px 12px',
        padding: '6px 10px',
        borderRadius: 6,
        backgroundColor: theme.warningBackground,
        border: `1px solid ${theme.warningBorder}`,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.warningTextDark,
        }}
      >
        <Trans>Demo Mode</Trans>
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Button
          variant="bare"
          style={{
            padding: '2px 6px',
            fontSize: 11,
            color: theme.warningTextDark,
          }}
          onPress={() => dispatch(pushModal({ modal: { name: 'demo-mode' } }))}
        >
          <Trans>Customize</Trans>
        </Button>
        <Button
          variant="bare"
          style={{
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: theme.warningTextDark,
          }}
          onPress={() => void dispatch(exitDemoMode())}
        >
          <Trans>Exit</Trans>
        </Button>
      </View>
    </View>
  );
}
