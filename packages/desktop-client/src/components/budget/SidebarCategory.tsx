// @ts-strict-ignore
import React, { useContext, useRef } from 'react';
import type { CSSProperties, Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheveronDown } from '@actual-app/components/icons/v1';
import { SvgTrendingUp } from '@actual-app/components/icons/v2';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { TextOneLine } from '@actual-app/components/text-one-line';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import type {
  CategoryEntity,
  CategoryGroupEntity,
  CSPCategoryEntity,
} from '@actual-app/core/types/models';
import { useQueryClient } from '@tanstack/react-query';

import {
  useMoveCategoryMutation,
  useMoveCspCategoryMutation,
} from '#budget';
import { useCategoriesOverride } from '#components/budget/CategoriesOverrideContext';
import { MonthsContext } from '#components/budget/MonthsContext';
import { CspTargetsContext } from '#components/csp/index';
import { InputCell } from '#components/table';
import { useContextMenu } from '#hooks/useContextMenu';
import { useGlobalPref } from '#hooks/useGlobalPref';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import { SidebarCategoryButtons } from './SidebarCategoryButtons';

type SidebarCategoryProps = {
  innerRef: Ref<HTMLDivElement>;
  category: CategoryEntity;
  categoryGroup?: CategoryGroupEntity;
  dragPreview?: boolean;
  dragging?: boolean;
  goalsShown?: boolean;
  style?: CSSProperties;
  borderColor?: string;
  isLast?: boolean;
  onEditName: (id: CategoryEntity['id']) => void;
  onSave: (category: CategoryEntity) => void;
  onHideNewCategory?: () => void;
} & (
  | {
      editing: true;
      onDelete?: never;
    }
  | {
      editing: boolean;
      onDelete: (id: CategoryEntity['id']) => void;
    }
);

export function SidebarCategory({
  innerRef,
  category,
  categoryGroup,
  dragPreview,
  dragging,
  editing,
  goalsShown = false,
  style,
  isLast,
  onEditName,
  onSave,
  onDelete,
  onHideNewCategory,
}: SidebarCategoryProps) {
  const { t } = useTranslation();
  const [categoryExpandedStatePref] = useGlobalPref('categoryExpandedState');
  const categoryExpandedState = categoryExpandedStatePref ?? 0;
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const moveCategory = useMoveCategoryMutation();
  const moveCspCategory = useMoveCspCategoryMutation();
  const categoriesOverride = useCategoriesOverride();
  const isCsp = categoriesOverride !== null;
  const { months } = useContext(MonthsContext);
  const targets = useContext(CspTargetsContext);
  const auditWindowMonths =
    (category as unknown as CSPCategoryEntity).moving_average_months ?? null;
  const isMovingAverage =
    isCsp && auditWindowMonths != null && auditWindowMonths > 0;

  const temporary = category.id === 'new';
  const { setMenuOpen, menuOpen, handleContextMenu, resetPosition, position } =
    useContextMenu();
  const triggerRef = useRef(null);

  const displayed = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        opacity: category.hidden || categoryGroup?.hidden ? 0.33 : undefined,
        backgroundColor: 'transparent',
        height: 20,
      }}
      ref={triggerRef}
      onContextMenu={handleContextMenu}
    >
      <TextOneLine data-testid="category-name">{category.name}</TextOneLine>
      {isMovingAverage && (
        <Tooltip
          content={t('Spent amount is a {{months}}-month moving average', {
            months: auditWindowMonths,
          })}
        >
          <View style={{ marginLeft: 5, justifyContent: 'center' }}>
            <SvgTrendingUp
              style={{ width: 12, height: 12, color: theme.pageTextSubdued }}
            />
          </View>
        </Tooltip>
      )}
      <View style={{ flexShrink: 0, marginLeft: 5 }}>
        <Button
          variant="bare"
          className="hover-visible"
          style={{ color: 'currentColor', padding: 3 }}
          onPress={() => {
            resetPosition();
            setMenuOpen(true);
          }}
        >
          <SvgCheveronDown
            width={14}
            height={14}
            style={{ color: 'currentColor' }}
          />
        </Button>

        <Popover
          triggerRef={triggerRef}
          placement="bottom start"
          isOpen={menuOpen}
          onOpenChange={() => setMenuOpen(false)}
          style={{ width: 200, margin: 1 }}
          isNonModal
          {...position}
        >
          <Menu
            onMenuSelect={type => {
              if (type === 'rename') {
                onEditName(category.id);
              } else if (type === 'delete') {
                onDelete(category.id);
              } else if (type === 'csp-settings') {
                dispatch(
                  pushModal({
                    modal: {
                      name: 'csp-category-settings',
                      options: {
                        category: {
                          ...category,
                          planned_amount: targets?.[category.id] ?? null,
                          moving_average_months: auditWindowMonths,
                        } as unknown as CSPCategoryEntity,
                        month: months[0],
                        onSave: async updatedFields => {
                          onSave({
                            ...category,
                            moving_average_months:
                              updatedFields.moving_average_months,
                          });
                          void queryClient.invalidateQueries({
                            queryKey: ['csp-targets'],
                          });
                          void queryClient.invalidateQueries({
                            queryKey: ['categories'],
                          });
                        },
                      },
                    },
                  }),
                );
              } else if (type === 'toggle-visibility') {
                onSave({ ...category, hidden: !category.hidden });
              } else if (type === 'move-group') {
                dispatch(
                  pushModal({
                    modal: {
                      name: 'category-group-autocomplete',
                      options: {
                        title: t('Move to group'),
                        categoryGroups: categoriesOverride ?? undefined,
                        onSelect: async groupId => {
                          if (categoriesOverride) {
                            await moveCspCategory.mutateAsync({
                              id: category.id,
                              groupId,
                              targetId: null,
                            });
                          } else {
                            await moveCategory.mutateAsync({
                              id: category.id,
                              groupId,
                              targetId: null,
                            });
                          }
                        },
                      },
                    },
                  }),
                );
              }
              setMenuOpen(false);
            }}
            items={[
              { name: 'rename', text: t('Rename') },
              isCsp && {
                name: 'csp-settings',
                text: t('Amortize & Audit...'),
              },
              !categoryGroup?.hidden && {
                name: 'toggle-visibility',
                text: category.hidden ? t('Show') : t('Hide'),
              },
              { name: 'move-group', text: t('Move to group...') },
              { name: 'delete', text: t('Delete') },
            ].filter(Boolean)}
          />
        </Popover>
      </View>
      <SidebarCategoryButtons
        category={category}
        dragging={dragging}
        goalsShown={goalsShown}
      />
    </View>
  );

  return (
    <View
      innerRef={innerRef}
      style={{
        width: 200 + 100 * categoryExpandedState,
        overflow: 'hidden',
        '& .hover-visible': {
          display: 'none',
        },
        ...(!dragging &&
          !dragPreview && {
            '&:hover .hover-visible': {
              display: 'flex',
            },
          }),
        ...(dragging && { color: theme.pageTextSubdued }), //always visible color
        // The zIndex here forces the the view on top of a row below
        // it that may be "collapsed" and show a border on top
        ...(dragPreview && {
          backgroundColor: theme.budgetCurrentMonth,
          zIndex: 10000,
          borderRadius: 6,
          overflow: 'hidden',
        }),
        ...style,
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          onEditName(null);
          e.stopPropagation();
        }
      }}
    >
      <InputCell
        value={category.name}
        formatter={() => displayed}
        width="flex"
        exposed={editing || temporary}
        onUpdate={value => {
          if (temporary) {
            if (value === '') {
              onHideNewCategory();
            } else if (value !== '') {
              onSave({ ...category, name: value });
            }
          } else {
            if (value !== category.name) {
              onSave({ ...category, name: value });
            }
          }
        }}
        onBlur={() => onEditName(null)}
        style={{ paddingLeft: 13, ...(isLast && { borderBottomWidth: 0 }) }}
        inputProps={{
          placeholder: temporary ? t('New category name') : '',
        }}
      />
    </View>
  );
}
