import React, { useMemo } from 'react';
import type { ComponentProps, CSSProperties } from 'react';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { TextOneLine } from '@actual-app/components/text-one-line';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css, cx } from '@emotion/css';

import { useCspCategories } from '#hooks/useCspCategories';
import type { CspCategoryGroupWithCategories } from '#hooks/useCspCategories';

import { Autocomplete } from './Autocomplete';

type CspCategoryGroupAutocompleteItem = CspCategoryGroupWithCategories;

type CspCategoryGroupListProps = {
  items: CspCategoryGroupAutocompleteItem[];
  getItemProps?: (arg: {
    item: CspCategoryGroupAutocompleteItem;
  }) => Partial<ComponentProps<typeof View>>;
  highlightedIndex: number;
  embedded?: boolean;
};

function CspCategoryGroupList({
  items,
  getItemProps,
  highlightedIndex,
  embedded,
}: CspCategoryGroupListProps) {
  const itemsWithIndex = useMemo(
    () => items.map((item, index) => ({ ...item, highlightedIndex: index })),
    [items],
  );

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
        {itemsWithIndex.map(item => (
          <CspCategoryGroupItem
            key={item.id}
            item={item}
            highlighted={highlightedIndex === item.highlightedIndex}
            embedded={embedded}
            {...(getItemProps ? getItemProps({ item }) : {})}
          />
        ))}
      </View>
    </View>
  );
}

type CspCategoryGroupItemProps = {
  item: CspCategoryGroupAutocompleteItem;
  className?: string;
  style?: CSSProperties;
  highlighted?: boolean;
  embedded?: boolean;
};

function CspCategoryGroupItem({
  item,
  className,
  style,
  highlighted,
  embedded,
  ...props
}: CspCategoryGroupItemProps) {
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
      data-testid={`${item.name}-csp-category-group-item`}
      data-highlighted={highlighted || undefined}
      {...props}
    >
      <TextOneLine>{item.name}</TextOneLine>
    </button>
  );
}

type CspCategoryGroupAutocompleteProps = ComponentProps<
  typeof Autocomplete<CspCategoryGroupAutocompleteItem>
> & {
  categoryGroups?: CspCategoryGroupWithCategories[];
};

export function CspCategoryGroupAutocomplete({
  categoryGroups,
  embedded,
  closeOnBlur,
  ...props
}: CspCategoryGroupAutocompleteProps) {
  const { data: { grouped: defaultGroups } = { grouped: [] } } =
    useCspCategories();

  const suggestions = useMemo<CspCategoryGroupAutocompleteItem[]>(
    () => categoryGroups ?? defaultGroups,
    [categoryGroups, defaultGroups],
  );

  return (
    <Autocomplete
      strict
      highlightFirst
      embedded={embedded}
      closeOnBlur={closeOnBlur}
      suggestions={suggestions}
      renderItems={(items, getItemProps, highlightedIndex) => (
        <CspCategoryGroupList
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
