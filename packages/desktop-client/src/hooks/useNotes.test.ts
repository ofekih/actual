import { renderHook } from '@testing-library/react';

import { useNoteInfo, useNotes } from './useNotes';
import * as useQueryModule from './useQuery';

vi.mock('./useQuery', () => ({
  useQuery: vi.fn(),
}));

describe('useNotes & useNoteInfo', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handles non-monthly direct note IDs', () => {
    vi.mocked(useQueryModule.useQuery).mockReturnValue({
      data: [{ id: 'account-1', note: 'Account Note' }],
      isLoading: false,
    });

    const { result } = renderHook(() => useNotes('account-1'));
    expect(result.current).toBe('Account Note');

    const infoResult = renderHook(() => useNoteInfo('account-1'));
    expect(infoResult.result.current).toEqual({
      note: 'Account Note',
      isInherited: false,
      sourceMonth: null,
    });
  });

  it('handles monthly category notes with forward propagation', () => {
    const mockNotesData = [
      { id: 'cat-1-2026-01', note: 'Jan Note' },
      { id: 'cat-1-2026-03', note: 'Mar Note' },
    ];

    vi.mocked(useQueryModule.useQuery).mockReturnValue({
      data: mockNotesData,
      isLoading: false,
    });

    // Month before any note
    const dec2025 = renderHook(() => useNoteInfo('cat-1-2025-12'));
    expect(dec2025.result.current).toEqual({
      note: null,
      isInherited: false,
      sourceMonth: null,
    });

    // Exact match for Jan 2026
    const jan2026 = renderHook(() => useNoteInfo('cat-1-2026-01'));
    expect(jan2026.result.current).toEqual({
      note: 'Jan Note',
      isInherited: false,
      sourceMonth: '2026-01',
    });

    // Inherited in Feb 2026
    const feb2026 = renderHook(() => useNoteInfo('cat-1-2026-02'));
    expect(feb2026.result.current).toEqual({
      note: 'Jan Note',
      isInherited: true,
      sourceMonth: '2026-01',
    });

    // Exact match for Mar 2026
    const mar2026 = renderHook(() => useNoteInfo('cat-1-2026-03'));
    expect(mar2026.result.current).toEqual({
      note: 'Mar Note',
      isInherited: false,
      sourceMonth: '2026-03',
    });

    // Inherited in Apr 2026
    const apr2026 = renderHook(() => useNoteInfo('cat-1-2026-04'));
    expect(apr2026.result.current).toEqual({
      note: 'Mar Note',
      isInherited: true,
      sourceMonth: '2026-03',
    });

    // useNotes shorthand returns note string
    const aprNotes = renderHook(() => useNotes('cat-1-2026-04'));
    expect(aprNotes.result.current).toBe('Mar Note');
  });

  it('handles empty overrides for future months', () => {
    const mockNotesData = [
      { id: 'cat-1-2026-01', note: 'Jan Note' },
      { id: 'cat-1-2026-04', note: '' },
    ];

    vi.mocked(useQueryModule.useQuery).mockReturnValue({
      data: mockNotesData,
      isLoading: false,
    });

    const mar2026 = renderHook(() => useNoteInfo('cat-1-2026-03'));
    expect(mar2026.result.current.note).toBe('Jan Note');

    const apr2026 = renderHook(() => useNoteInfo('cat-1-2026-04'));
    expect(apr2026.result.current.note).toBe('');
    expect(apr2026.result.current.isInherited).toBe(false);

    const may2026 = renderHook(() => useNoteInfo('cat-1-2026-05'));
    expect(may2026.result.current.note).toBe('');
    expect(may2026.result.current.isInherited).toBe(true);
  });

  it('keeps budget summary notes isolated to exact month', () => {
    vi.mocked(useQueryModule.useQuery).mockReturnValue({
      data: [{ id: 'budget-2026-01', note: 'Budget Jan Log' }],
      isLoading: false,
    });

    const jan = renderHook(() => useNoteInfo('budget-2026-01'));
    expect(jan.result.current).toEqual({
      note: 'Budget Jan Log',
      isInherited: false,
      sourceMonth: null,
    });
  });
});
