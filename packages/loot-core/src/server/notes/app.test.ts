import { loadMappings } from '#server/db/mappings';
import { app } from '#server/notes/app';

beforeEach(async () => {
  await global.emptyDatabase()();
  await loadMappings();
});

describe('notes app', () => {
  it('saves and gets non-monthly notes directly', async () => {
    await app.handlers['notes-save']({
      id: 'account-123',
      note: 'Savings note',
    });
    const result = await app.handlers['notes-get']({ id: 'account-123' });
    expect(result?.note).toBe('Savings note');

    const empty = await app.handlers['notes-get']({ id: 'account-456' });
    expect(empty).toBeNull();
  });

  it('propagates monthly category notes forward into future months', async () => {
    const catId = 'category-abc';

    // Set note in Jan 2026
    await app.handlers['notes-save']({
      id: `${catId}-2026-01`,
      note: 'Rent increased to $1500',
    });

    // Past month has no note
    const dec2025 = await app.handlers['notes-get']({ id: `${catId}-2025-12` });
    expect(dec2025).toBeNull();

    // Jan 2026 has explicit note
    const jan2026 = await app.handlers['notes-get']({ id: `${catId}-2026-01` });
    expect(jan2026?.note).toBe('Rent increased to $1500');

    // Feb and Mar 2026 inherit the Jan note
    const feb2026 = await app.handlers['notes-get']({ id: `${catId}-2026-02` });
    expect(feb2026?.note).toBe('Rent increased to $1500');

    const mar2026 = await app.handlers['notes-get']({ id: `${catId}-2026-03` });
    expect(mar2026?.note).toBe('Rent increased to $1500');

    // Modify note in Mar 2026
    await app.handlers['notes-save']({
      id: `${catId}-2026-03`,
      note: 'Rent increased to $1600',
    });

    // Historical months remain intact
    const janAfter = await app.handlers['notes-get']({
      id: `${catId}-2026-01`,
    });
    expect(janAfter?.note).toBe('Rent increased to $1500');

    const febAfter = await app.handlers['notes-get']({
      id: `${catId}-2026-02`,
    });
    expect(febAfter?.note).toBe('Rent increased to $1500');

    // March and April reflect the new note
    const marAfter = await app.handlers['notes-get']({
      id: `${catId}-2026-03`,
    });
    expect(marAfter?.note).toBe('Rent increased to $1600');

    const apr2026 = await app.handlers['notes-get']({ id: `${catId}-2026-04` });
    expect(apr2026?.note).toBe('Rent increased to $1600');
  });

  it('supports empty overrides and deleting overrides', async () => {
    const catId = 'category-xyz';

    await app.handlers['notes-save']({
      id: `${catId}-2026-01`,
      note: 'Gym promotion $30',
    });

    // Clear note in April 2026 with empty string
    await app.handlers['notes-save']({
      id: `${catId}-2026-04`,
      note: '',
    });

    // Jan-Mar still have the note
    expect(
      (await app.handlers['notes-get']({ id: `${catId}-2026-03` }))?.note,
    ).toBe('Gym promotion $30');

    // Apr and May reflect the empty override
    expect(
      (await app.handlers['notes-get']({ id: `${catId}-2026-04` }))?.note,
    ).toBe('');
    expect(
      (await app.handlers['notes-get']({ id: `${catId}-2026-05` }))?.note,
    ).toBe('');

    // Delete the April override (note: null) -> resumes inheriting from Jan
    await app.handlers['notes-save']({
      id: `${catId}-2026-04`,
      note: null,
    });

    expect(
      (await app.handlers['notes-get']({ id: `${catId}-2026-04` }))?.note,
    ).toBe('Gym promotion $30');
    expect(
      (await app.handlers['notes-get']({ id: `${catId}-2026-05` }))?.note,
    ).toBe('Gym promotion $30');
  });

  it('keeps budget summary notes isolated to their specific month', async () => {
    await app.handlers['notes-save']({
      id: 'budget-2026-01',
      note: 'Transferred $50 on Jan 15',
    });

    const jan = await app.handlers['notes-get']({ id: 'budget-2026-01' });
    expect(jan?.note).toBe('Transferred $50 on Jan 15');

    const feb = await app.handlers['notes-get']({ id: 'budget-2026-02' });
    expect(feb).toBeNull();
  });
});
