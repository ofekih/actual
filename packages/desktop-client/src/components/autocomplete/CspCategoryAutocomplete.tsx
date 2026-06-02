import React, { Fragment, useMemo } from 'react';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { TextOneLine } from '@actual-app/components/text-one-line';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { CSPCategoryEntity } from '@actual-app/core/types/models';
import { css, cx } from '@emotion/css';

import { useCspCategories } from '#hooks/useCspCategories';
import type { CspCategoryGroupWithCategories } from '#hooks/useCspCategories';

import { Autocomplete } from './Autocomplete';
import { ItemHeader } from './ItemHeader';

type CspCategoryAutocompleteItem = CSPCategoryEntity & {
  groupName: string;
};

type CspCategoryListProps = {
  items: CspCategoryAutocompleteItem[];
  getItemProps?: (arg: {
    item: CspCategoryAutocompleteItem;
  }) => Partial<ComponentProps<typeof View>>;
  highlightedIndex: number;
  embedded?: boolean;
  footer?: ReactNode;
};

function CspCategoryList({
  items,
  getItemProps,
  highlightedIndex,
  embedded,
  footer,
}: CspCategoryListProps) {
  const grouped = useMemo(() => {
    return items.reduce<
      {
        groupName: string;
        categories: (CspCategoryAutocompleteItem & {
          highlightedIndex: number;
        })[];
      }[]
    >((acc, item, index) => {
      const existing = acc.find(g => g.groupName === item.groupName);
      const itemWithIndex = { ...item, highlightedIndex: index };
      if (!existing) {
        acc.push({ groupName: item.groupName, categories: [itemWithIndex] });
      } else {
        existing.categories.push(itemWithIndex);
      }
      return acc;
    }, []);
  }, [items]);

  return (
    <View>
      <View
        style={{
          overflowY: 'auto',
          willChange: 'transform',
          padding: '5px 0',
          ...(!embedded && { maxHeight: 175 }),
        }}
      >
        {grouped.map(group => (
          <Fragment key={group.groupName}>
            <ItemHeader title={group.groupName} type="csp-category" />
            {group.categories.map(item => (
              <CspCategoryItem
                key={item.id}
                item={item}
                highlighted={highlightedIndex === item.highlightedIndex}
                embedded={embedded}
                {...(getItemProps ? getItemProps({ item }) : {})}
              />
            ))}
          </Fragment>
        ))}
      </View>
      {footer}
    </View>
  );
}

type CspCategoryItemProps = {
  item: CspCategoryAutocompleteItem;
  className?: string;
  style?: CSSProperties;
  highlighted?: boolean;
  embedded?: boolean;
};

function CspCategoryItem({
  item,
  className,
  style,
  highlighted,
  embedded,
  ...props
}: CspCategoryItemProps) {
  const { isNarrowWidth } = useResponsive();
  const narrowStyle = isNarrowWidth
    ? {
        ...styles.mobileMenuItem,
        borderRadius: 0,
        borderTop: `1px solid ${theme.pillBorder}`,
      }
    : {};

  return (
    <button
      type="button"
      style={style}
      className={cx(
        className,
        css({
          backgroundColor: highlighted
            ? theme.menuAutoCompleteBackgroundHover
            : 'transparent',
          color: highlighted
            ? theme.menuAutoCompleteItemTextHover
            : theme.menuAutoCompleteItemText,
          padding: 4,
          paddingLeft: 20,
          borderRadius: embedded ? 4 : 0,
          border: 'none',
          font: 'inherit',
          textAlign: 'left',
          width: '100%',
          ...narrowStyle,
        }),
      )}
      data-testid={`${item.name}-csp-category-item`}
      data-highlighted={highlighted || undefined}
      {...props}
    >
      <TextOneLine>{item.name}</TextOneLine>
    </button>
  );
}

type CspCategoryAutocompleteProps = ComponentProps<
  typeof Autocomplete<CspCategoryAutocompleteItem>
> & {
  categoryGroups?: CspCategoryGroupWithCategories[];
};

export function CspCategoryAutocomplete({
  categoryGroups,
  embedded,
  closeOnBlur,
  ...props
}: CspCategoryAutocompleteProps) {
  const { t } = useTranslation();
  const { data: { grouped: defaultGroups } = { grouped: [] } } =
    useCspCategories();

  const suggestions = useMemo<CspCategoryAutocompleteItem[]>(() => {
    const groups = categoryGroups ?? defaultGroups;
    return groups.flatMap(g =>
      g.categories.map(c => ({ ...c, groupName: g.name })),
    );
  }, [categoryGroups, defaultGroups]);

  return (
    <Autocomplete
      strict
      highlightFirst
      embedded={embedded}
      closeOnBlur={closeOnBlur}
      suggestions={suggestions}
      renderItems={(items, getItemProps, highlightedIndex) => (
        <CspCategoryList
          items={items}
          embedded={embedded}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
        />
      )}
      itemToString={item => item?.name ?? ''}
      {...props}
    />
  );
}
