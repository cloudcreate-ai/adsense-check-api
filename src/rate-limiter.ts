interface RateEntry {
  count: number;
  minute: string;
}

const store = new Map<string, RateEntry>();

function getCurrentMinute(): string {
  return new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
}

export function checkRateLimit(apiKey: string, maxPerMinute: number): boolean {
  const minute = getCurrentMinute();
  const key = `rl:${apiKey}:${minute}`;
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, minute });
    return true;
  }

  if (entry.count >= maxPerMinute) {
    return false;
  }

  entry.count++;
  return true;
}

export function cleanupOldEntries() {
  const currentMinute = getCurrentMinute();
  for (const [key, entry] of store) {
    if (entry.minute < currentMinute) {
      store.delete(key);
    }
  }
}
