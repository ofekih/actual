import { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FormField, FormLabel } from '#components/forms';
import { useSyncedPref } from '#hooks/useSyncedPref';

import { Column, Setting } from './UI';

function calculateAge(birthDateStr: string): number | null {
  if (!birthDateStr) return null;
  const parts = birthDateStr.split('-');
  if (parts.length < 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const birthDate = new Date(year, month, day);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= 0 && age <= 130 ? age : null;
}

export function CspSettings() {
  const { t } = useTranslation();

  const [userBirthDate = '1999-07-10', setUserBirthDate] = useSyncedPref(
    'csp-user-birth-date',
  );
  const [spouseName = 'Nicole', setSpouseName] =
    useSyncedPref('csp-spouse-name');
  const [spouseBirthDate = '2001-10-12', setSpouseBirthDate] = useSyncedPref(
    'csp-spouse-birth-date',
  );
  const [, setUserBirthYear] = useSyncedPref('csp-user-birth-year');
  const [, setSpouseBirthYear] = useSyncedPref('csp-spouse-birth-year');

  const userAge = useMemo(() => calculateAge(userBirthDate), [userBirthDate]);
  const spouseAge = useMemo(
    () => calculateAge(spouseBirthDate),
    [spouseBirthDate],
  );

  function handleUserBirthDateChange(val: string) {
    setUserBirthDate(val);
    const year = val.slice(0, 4);
    if (year && !isNaN(Number(year))) {
      setUserBirthYear(year);
    }
  }

  function handleSpouseBirthDateChange(val: string) {
    setSpouseBirthDate(val);
    const year = val.slice(0, 4);
    if (year && !isNaN(Number(year))) {
      setSpouseBirthYear(year);
    }
  }

  return (
    <Setting
      primaryAction={
        <View
          style={{
            flexDirection: 'column',
            gap: 12,
            width: '100%',
          }}
        >
          <Column title={t('Household birthdays & milestones')}>
            <View
              style={{
                flexDirection: 'row',
                gap: 16,
                flexWrap: 'wrap',
                width: '100%',
              }}
            >
              <FormField style={{ width: 170 }}>
                <FormLabel title={t('Your birthday')} />
                <Input
                  type="date"
                  value={userBirthDate}
                  onChange={e =>
                    handleUserBirthDateChange(e.currentTarget.value)
                  }
                />
              </FormField>

              <FormField style={{ width: 150 }}>
                <FormLabel title={t("Spouse / partner's name")} />
                <Input
                  type="text"
                  placeholder={t('Nicole')}
                  value={spouseName}
                  onChange={e => setSpouseName(e.currentTarget.value)}
                />
              </FormField>

              <FormField style={{ width: 170 }}>
                <FormLabel title={t("Spouse / partner's birthday")} />
                <Input
                  type="date"
                  value={spouseBirthDate}
                  onChange={e =>
                    handleSpouseBirthDateChange(e.currentTarget.value)
                  }
                />
              </FormField>
            </View>

            {(userAge != null || spouseAge != null) && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  padding: '6px 12px',
                  backgroundColor: theme.pillBackground,
                  borderRadius: 6,
                  width: 'fit-content',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.pillText,
                    fontWeight: 500,
                  }}
                >
                  <Trans>
                    Current ages: You ({{ userAge }} yrs) · {{ spouseName }} (
                    {{ spouseAge }} yrs)
                  </Trans>
                </Text>
              </View>
            )}
          </Column>
        </View>
      }
    >
      <Text>
        <Trans>
          <strong>Conscious Spending Plan &amp; Forecasting</strong>
        </Trans>
      </Text>
      <Text>
        <Trans>
          Configure birthdays for you and your spouse to display personalized
          age milestone hints on calendar-year Monte Carlo projections and
          retirement timelines.
        </Trans>
      </Text>
    </Setting>
  );
}
