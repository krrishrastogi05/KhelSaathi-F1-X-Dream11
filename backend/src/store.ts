// Session persistence: one JSON file, written at most once a second. Enough for a prototype on one instance; a
// restart keeps every session's clock, profile, cards and gate history. Swap for Redis if this runs on many instances.
import fs from 'node:fs';
import path from 'node:path';
import type { SessionData } from './sessions';

export interface Store { load(): SessionData[]; save(all: SessionData[]): void }

export function fileStore(dir: string): Store {
  const file = path.join(dir, '.sessions.json');
  let timer: NodeJS.Timeout | null = null, pending: SessionData[] | null = null;
  const flush = () => {
    timer = null;
    if (!pending) return;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(pending));
    fs.renameSync(tmp, file);                                  // atomic replace: a crash never leaves half a file
    pending = null;
  };
  return {
    load: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as SessionData[]; } catch { return []; } },
    save: (all) => { pending = all; timer ??= setTimeout(flush, 1000); },
  };
}

export const memoryStore = (): Store => ({ load: () => [], save: () => {} });
