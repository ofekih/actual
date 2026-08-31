import type { ComponentProps } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TestProviders } from '#mocks';

import { FilterExpression } from './FilterExpression';

describe('FilterExpression stepper', () => {
  const renderFilter = (
    props: Partial<ComponentProps<typeof FilterExpression>> = {},
  ) => {
    const onChange = vi.fn();
    const onDelete = vi.fn();

    render(
      <FilterExpression
        field="date"
        op="is"
        value="2024-05"
        options={{ month: true }}
        customName={undefined}
        onChange={onChange}
        onDelete={onDelete}
        {...props}
      />,
      { wrapper: TestProviders },
    );

    return { onChange, onDelete };
  };

  it('renders previous and next month buttons for month filters', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({
      field: 'date',
      op: 'is',
      value: '2024-05',
      options: { month: true },
    });

    const prevButton = screen.getByRole('button', { name: 'Previous month' });
    const nextButton = screen.getByRole('button', { name: 'Next month' });

    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();

    await user.click(nextButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2024-06',
        options: { month: true },
      }),
    );

    await user.click(prevButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2024-04',
        options: { month: true },
      }),
    );
  });

  it('steps correctly across year boundaries for month filters', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({
      field: 'date',
      op: 'is',
      value: '2024-01',
      options: { month: true },
    });

    const prevButton = screen.getByRole('button', { name: 'Previous month' });
    await user.click(prevButton);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2023-12',
        options: { month: true },
      }),
    );
  });

  it('renders previous and next year buttons for year filters', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({
      field: 'date',
      op: 'is',
      value: '2024',
      options: { year: true },
    });

    const prevButton = screen.getByRole('button', { name: 'Previous year' });
    const nextButton = screen.getByRole('button', { name: 'Next year' });

    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();

    await user.click(nextButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2025',
        options: { year: true },
      }),
    );

    await user.click(prevButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2023',
        options: { year: true },
      }),
    );
  });

  it('renders previous and next day buttons for date filters', async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({
      field: 'date',
      op: 'is',
      value: '2024-02-28',
      options: undefined,
    });

    const prevButton = screen.getByRole('button', { name: 'Previous day' });
    const nextButton = screen.getByRole('button', { name: 'Next day' });

    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();

    await user.click(nextButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2024-02-29',
      }),
    );

    await user.click(prevButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'date',
        op: 'is',
        value: '2024-02-27',
      }),
    );
  });

  it('does not render stepper buttons for non-date fields', () => {
    renderFilter({
      field: 'category',
      op: 'is',
      value: 'cat-1',
      options: undefined,
    });

    expect(
      screen.queryByRole('button', { name: /Previous|Next/ }),
    ).not.toBeInTheDocument();
  });

  it('does not render stepper buttons for non-is operators', () => {
    renderFilter({
      field: 'date',
      op: 'gt',
      value: '2024-05',
      options: { month: true },
    });

    expect(
      screen.queryByRole('button', { name: /Previous|Next/ }),
    ).not.toBeInTheDocument();
  });

  it('does not render stepper buttons when customName is set', () => {
    renderFilter({
      field: 'date',
      op: 'is',
      value: '2024-05',
      options: { month: true },
      customName: 'Custom Filter',
    });

    expect(
      screen.queryByRole('button', { name: /Previous|Next/ }),
    ).not.toBeInTheDocument();
  });
});
