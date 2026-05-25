import * as db from '#server/db';

/**
 * Retrieves the Gemini API key from the user's synced preferences.
 */
export async function getGeminiApiKey(): Promise<string | null> {
  const row = await db.first<{ value: string }>(
    'SELECT value FROM preferences WHERE id = ?',
    ['geminiApiKey'],
  );
  return row ? row.value : null;
}

/**
 * Validates that an API key exists, throwing an error if not.
 */
export async function requireGeminiApiKey(): Promise<string> {
  const key = await getGeminiApiKey();
  if (!key) {
    throw new Error('Gemini API key is required but not found in settings.');
  }
  return key;
}
