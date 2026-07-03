import { getLocalDb } from '../../local/db';

export function sanitizeBindings(params: unknown[]): (string | number | null)[] {
  return params.map(p => {
    if (p === undefined) return null;
    if (p === null) return null;
    if (typeof p === 'string') return p;
    if (typeof p === 'number') return p;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'object') return JSON.stringify(p);
    return null;
  });
}

export async function getDatabase() {
  return getLocalDb();
}

export async function runQuery<T>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T[]> {
  const db = await getLocalDb();
  const sanitizedParams = sanitizeBindings(params);
  try {
    const result = await db.getAllAsync<T>(sql, sanitizedParams);
    return result;
  } catch (err) {
    throw err;
  }
}

export async function runStatement(
  sql: string,
  params: (string | number | null)[] = []
): Promise<{ changes: number; lastInsertRowId: number }> {
  const db = await getLocalDb();
  const sanitizedParams = sanitizeBindings(params);
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await db.runAsync(sql, sanitizedParams);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
    } catch (err: unknown) {
      const isNPE =
        err instanceof Error &&
        (err.message.includes('NullPointerException') ||
          err.message.includes('prepareAsync'));

      if (isNPE && attempt < MAX_RETRIES) {
        const delay = 100 * (attempt + 1);
        console.warn(
          `[DB] NullPointerException on runStatement attempt ${attempt + 1}/${MAX_RETRIES + 1}, ` +
          `retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error('[DB] Unexpected: runStatement exhausted retries without throwing');
}

export async function execSQL(sql: string): Promise<void> {
  const db = await getLocalDb();
  await db.execAsync(sql);
}

export async function closeDatabase(): Promise<void> {
}
