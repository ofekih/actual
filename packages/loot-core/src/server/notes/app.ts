import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { undoable } from '#server/undo';
import type { NoteEntity } from '#types/models';

export type NotesHandlers = {
  'notes-save': typeof updateNotes;
  'notes-save-undoable': typeof updateNotes;
  'notes-get': (arg: Pick<NoteEntity, 'id'>) => Promise<NoteEntity | null>;
};

export const app = createApp<NotesHandlers>();
app.method('notes-save', updateNotes);
app.method('notes-save-undoable', mutator(undoable(updateNotes)));
app.method('notes-get', getNote);

const MONTHLY_NOTE_REGEX = /^(.*)-(\d{4}-\d{2})$/;

async function updateNotes({ id, note }: NoteEntity) {
  if (note === null) {
    await db.delete_('notes', id);
  } else {
    await db.update('notes', { id, note });
  }
}

async function getNote({
  id,
}: Pick<NoteEntity, 'id'>): Promise<NoteEntity | null> {
  const match = id ? id.match(MONTHLY_NOTE_REGEX) : null;
  if (match && match[1] !== 'budget') {
    const prefix = match[1];
    const targetMonth = match[2];
    const rows = await db.all<NoteEntity>(
      'SELECT id, note FROM notes WHERE id LIKE ? AND (tombstone IS NULL OR tombstone = 0)',
      [`${prefix}-%`],
    );
    const matching = rows
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

    if (matching.length > 0) {
      return { id, note: matching[0].note };
    }
    return null;
  }
  return db.first<NoteEntity>(
    'SELECT id, note FROM notes WHERE id = ? AND (tombstone IS NULL OR tombstone = 0)',
    [id],
  );
}
