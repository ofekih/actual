import { useMemo } from 'react';

import { q } from '@actual-app/core/shared/query';
import type { NoteEntity } from '@actual-app/core/types/models';

import { useQuery } from './useQuery';

const MONTHLY_NOTE_REGEX = /^(.*)-(\d{4}-\d{2})$/;

export type NoteInfo = {
  note: string | null;
  isInherited: boolean;
  sourceMonth: string | null;
};

export function useNoteInfo(id: string): NoteInfo {
  const match = id ? id.match(MONTHLY_NOTE_REGEX) : null;
  // Apply carry-forward for monthly category notes (exclude budget- summary notes)
  const isMonthlyCategory = !!match && match[1] !== 'budget';
  const prefix = match ? match[1] : id;
  const targetMonth = match ? match[2] : null;

  const { data } = useQuery<NoteEntity>(() => {
    if (!id) return null;
    if (isMonthlyCategory) {
      return q('notes')
        .filter({ id: { $like: `${prefix}-%` } })
        .select('*');
    }
    return q('notes').filter({ id }).select('*');
  }, [id, isMonthlyCategory, prefix]);

  return useMemo(() => {
    if (!data || data.length === 0) {
      return { note: null, isInherited: false, sourceMonth: null };
    }

    if (!isMonthlyCategory || !targetMonth) {
      const note = data[0]?.note ?? null;
      return { note, isInherited: false, sourceMonth: null };
    }

    const matching = data
      .map(item => {
        const itemMatch = item.id.match(MONTHLY_NOTE_REGEX);
        if (!itemMatch || itemMatch[1] !== prefix) return null;
        return { id: item.id, month: itemMatch[2], note: item.note };
      })
      .filter(
        (item): item is { id: string; month: string; note: string } =>
          item !== null && item.month <= targetMonth,
      )
      .sort((a, b) => b.month.localeCompare(a.month));

    if (matching.length === 0) {
      return { note: null, isInherited: false, sourceMonth: null };
    }

    const latest = matching[0];
    const isInherited = latest.month !== targetMonth;
    return {
      note: latest.note ?? null,
      isInherited,
      sourceMonth: latest.month,
    };
  }, [data, isMonthlyCategory, prefix, targetMonth]);
}

export function useNotes(id: string): string | null {
  const { note } = useNoteInfo(id);
  return note;
}
