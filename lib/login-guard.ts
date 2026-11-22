const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 8;

const attempts = new Map<string, { count: number; reset: number }>();

export function loginBlocked(key: string) {
  const entry = attempts.get(key);
  if (!entry || entry.reset < Date.now()) return false;
  return entry.count >= LIMIT;
}

export function recordLoginFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
