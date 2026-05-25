import { GoogleGenAI } from '@google/genai';

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

/**
 * Tests the Gemini API connection.
 */
export async function testGeminiConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const apiKey = await requireGeminiApiKey();
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: 'Respond with exactly one word: "Success".',
    });
    
    return {
      success: true,
      message: response.text || 'Connection successful, but no text was returned.',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
