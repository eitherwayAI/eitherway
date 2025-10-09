export interface ThemeLock {
  colors: Record<string, string>;
  updatedAt: number;
}

const LOCK_PATH = '/.eitherway/theme-lock.json';

export async function loadThemeLock(fs: any): Promise<ThemeLock> {
  try {
    const raw = await fs.readFile(LOCK_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { colors: {}, updatedAt: 0 };
  }
}

export async function saveThemeLock(fs: any, lock: ThemeLock): Promise<void> {
  try {
    await fs.mkdir('/.eitherway', { recursive: true });
  } catch {}
  await fs.writeFile(LOCK_PATH, JSON.stringify(lock), 'utf8');
}
