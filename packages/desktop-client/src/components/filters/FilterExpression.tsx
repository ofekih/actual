import React, { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgDelete } from '@actual-app/components/icons/v0';
import {
  SvgCheveronLeft,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Popover } from '@actual-app/components/popover';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import {
  addDays,
  addYears,
  nextMonth,
  prevMonth,
  subDays,
  subYears,
} from '@actual-app/core/shared/months';
import type { RuleConditionEntity } from '@actual-app/core/types/models';

import { Value } from '#components/rules/Value';
import { friendlyOp, mapField } from '#util/rule';

import { FilterEditor } from './FiltersMenu';
import { subfieldFromFilter } from './subfieldFromFilter';

let isDatepickerClick = false;

function getSteppedDateValue(
  subfield: string,
  currentValue: string,
  direction: -1 | 1,
): string | null {
  if (subfield === 'month') {
    return direction === 1 ? nextMonth(currentValue) : prevMonth(currentValue);
  }
  if (subfield === 'year') {
    return direction === 1
      ? addYears(currentValue, 1)
      : subYears(currentValue, 1);
  }
  if (subfield === 'date') {
    return direction === 1
      ? addDays(currentValue, 1)
      : subDays(currentValue, 1);
  }
  return null;
}

type FilterExpressionProps<T extends RuleConditionEntity> = {
  field: T['field'];
  customName: T['customName'];
  op: T['op'];
  value: T['value'];
  options: T['options'];
  style?: CSSProperties;
  onChange: (cond: T) => void;
  onDelete: () => void;
};

export function FilterExpression<T extends RuleConditionEntity>({
  field: originalField,
  customName,
  op,
  value,
  options,
  style,
  onChange,
  onDelete,
}: FilterExpressionProps<T>) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const triggerRef = useRef(null);

  const field = subfieldFromFilter({ field: originalField, value });

  const canStep =
    !customName &&
    originalField === 'date' &&
    op === 'is' &&
    typeof value === 'string' &&
    ((field === 'month' && /^\d{4}-\d{2}$/.test(value)) ||
      (field === 'year' && /^\d{4}$/.test(value)) ||
      (field === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)));

  const handleStep = (direction: -1 | 1) => {
    if (typeof value !== 'string') return;
    const nextValue = getSteppedDateValue(field, value, direction);
    if (nextValue) {
      onChange({
        field: originalField,
        op,
        value: nextValue,
        options,
        customName,
      } as T);
    }
  };

  const getStepLabels = () => {
    if (field === 'year') {
      return { prev: t('Previous year'), next: t('Next year') };
    }
    if (field === 'date') {
      return { prev: t('Previous day'), next: t('Next day') };
    }
    return { prev: t('Previous month'), next: t('Next month') };
  };

  const { prev: prevLabel, next: nextLabel } = getStepLabels();

  return (
    <View
      style={{
        backgroundColor: theme.pillBackground,
        borderRadius: 4,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 10,
        marginTop: 10,
        ...style,
      }}
    >
      <Button
        ref={triggerRef}
        variant="bare"
        isDisabled={customName != null}
        onPress={() => setEditing(true)}
        style={{
          maxWidth: canStep ? 'calc(100% - 62px)' : 'calc(100% - 26px)',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
      >
        <div
          style={{
            paddingBlock: 1,
            paddingLeft: 5,
            paddingRight: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {customName ? (
            <Text style={{ color: theme.pageTextPositive }}>{customName}</Text>
          ) : (
            <>
              <Text style={{ color: theme.pageTextPositive }}>
                {mapField(field, options)}
              </Text>{' '}
              <Text>{friendlyOp(op, null)}</Text>{' '}
              {!['onbudget', 'offbudget'].includes(op?.toLocaleLowerCase()) && (
                <Value
                  value={value}
                  field={field}
                  inline
                  valueIsRaw={
                    op === 'contains' ||
                    op === 'matches' ||
                    op === 'doesNotContain' ||
                    op === 'hasTags' ||
                    op === 'hasAnyTag'
                  }
                />
              )}
            </>
          )}
        </div>
      </Button>
      {canStep && (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Button
            variant="bare"
            aria-label={prevLabel}
            onPress={() => handleStep(-1)}
          >
            <SvgCheveronLeft
              style={{
                width: 9,
                height: 9,
                margin: 4,
              }}
            />
          </Button>
          <Button
            variant="bare"
            aria-label={nextLabel}
            onPress={() => handleStep(1)}
          >
            <SvgCheveronRight
              style={{
                width: 9,
                height: 9,
                margin: 4,
              }}
            />
          </Button>
        </View>
      )}
      <Button variant="bare" onPress={onDelete} aria-label={t('Delete filter')}>
        <SvgDelete
          style={{
            width: 8,
            height: 8,
            margin: 4,
          }}
        />
      </Button>

      <Popover
        triggerRef={triggerRef}
        placement="bottom start"
        isOpen={editing}
        onOpenChange={() => setEditing(false)}
        shouldCloseOnInteractOutside={element => {
          // Datepicker selections for some reason register 2x clicks
          // We want to keep the popover open after selecting a date.
          // So we ignore the "close" event on selection + the subsequent event.
          if (element instanceof HTMLElement && element.dataset.pikaYear) {
            isDatepickerClick = true;
            return false;
          }
          if (isDatepickerClick) {
            isDatepickerClick = false;
            return false;
          }

          if (
            element instanceof HTMLElement &&
            (element.closest('[data-testid="account-autocomplete-modal"]') ||
              element.closest('[data-testid="payee-autocomplete-modal"]') ||
              element.closest('[data-testid="category-autocomplete-modal"]'))
          ) {
            return false;
          }

          return true;
        }}
        style={{
          width: 275,
          padding: 15,
          color: theme.menuItemText,
          zIndex: '2500 !important',
        }}
        data-testid="filters-menu-tooltip"
      >
        <FilterEditor
          field={originalField}
          op={op}
          value={value}
          options={options}
          onSave={onChange}
          onClose={() => setEditing(false)}
        />
      </Popover>
    </View>
  );
}
